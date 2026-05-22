import { HostileEntity, type EnemyUpdateContext, type PendingEnemySpawn } from '../HostileEntity';
import type { EntityData, EntityStats, EnemyType, PlayerId, ProjectileSpawnRequest } from '../../../../shared/Types';
import { calculateCooldown, PLAYER_BASE_SHOT_COOLDOWN_SECONDS } from '../../../../shared/CombatMath';
import type { AnomalyAbility } from './abilities/AnomalyAbility';
import { TeleportAbility } from './abilities/TeleportAbility';
import { DashAbility } from './abilities/DashAbility';
import { SwarmAbility } from './abilities/SwarmAbility';
import { InversionAbility } from './abilities/InversionAbility';

export type AnomalyAbilityCtor = new () => AnomalyAbility;
type AbilityEntry = { ctor: AnomalyAbilityCtor; weight: number };

const ABILITY_POOL: AbilityEntry[] = [
    { ctor: TeleportAbility, weight: 100 },
    { ctor: DashAbility,     weight: 100 },
    { ctor: SwarmAbility,    weight: 100 },
    { ctor: InversionAbility, weight: 100 },
];

const DAMAGE_GRACE_MS = 1200;
const DAMAGE_RAMP_MS = 4800;
const DAMAGE_RAMP_START_MULTIPLIER = 0.35;

export interface AnomalyOptions {
    isFakeCopy?: boolean;
    assignedPlayerId?: PlayerId | null;
    abilityCtors?: AnomalyAbilityCtor[];
}

export class Anomaly extends HostileEntity {
    public readonly enemyType: EnemyType = 'ANOMALY';
    public readonly stats: EntityStats;
    public aimAngle = 0;
    public damage: number;
    public damageBoostMultiplier = 1;
    public readonly spawnCount: number;
    public readonly spawnWave: number;
    public isInverted = false;
    public readonly pendingSpawns: PendingEnemySpawn[] = [];
    public readonly activeAbilities: AnomalyAbility[];
    public readonly isFakeCopy: boolean;
    public assignedPlayerId: PlayerId | null;
    public hasBeenRevealed = false;
    public clearOwnedDecoysRequested = false;

    static readonly BASE_XP_DROP = 300;

    private readonly preferredDistance = 380;
    private lastShotAtMs = 0;
    private combatRampStartedAtMs: number | null = null;
    private combatRampMultiplier = 0;

    constructor(
        id: string,
        x: number,
        y: number,
        playerStats: EntityStats,
        spawnCount: number,
        spawnWave = 5,
        options: AnomalyOptions = {}
    ) {
        const isFake = options.isFakeCopy ?? false;
        const effectiveMaxHealth = isFake ? 1 : playerStats.maxHealth;
        super(id, x, y, effectiveMaxHealth, effectiveMaxHealth, playerStats.movementSpeed);

        this.stats = {
            ...playerStats,
            maxHealth: effectiveMaxHealth,
            healthRegen: isFake ? 0 : playerStats.healthRegen * 0.65,
            bulletPenetration: playerStats.bulletPenetration * 0.65,
            reloadPoints: Math.max(0, playerStats.reloadPoints - 5)
        };
        this.damage = playerStats.bodyDamage;
        this.xpDrop = isFake ? 0 : Anomaly.BASE_XP_DROP;
        this.spawnCount = spawnCount;
        this.spawnWave = spawnWave;
        this.isFakeCopy = isFake;
        this.assignedPlayerId = options.assignedPlayerId ?? null;

        const ctors = options.abilityCtors ?? Anomaly.selectAbilityConstructors(spawnCount);
        this.activeAbilities = ctors.map((Ctor) => new Ctor());

        this.setBarrels([{
            id: 'anomaly_front_barrel',
            offsetX: 34,
            offsetY: 0,
            angleOffset: 0,
            recoilForce: 20,
            damageMultiplier: 1,
            speedMultiplier: 1,
            lifespanMultiplier: 1
        }]);
    }

    public override get contactDamage(): number {
        return this.damage * this.damageBoostMultiplier * this.combatRampMultiplier;
    }

    public override getProjectileSpawns(aimAngle: number, sourceStats: EntityStats): ProjectileSpawnRequest[] {
        return super.getProjectileSpawns(aimAngle, {
            ...sourceStats,
            bulletDamage: sourceStats.bulletDamage * this.combatRampMultiplier
        });
    }

    public override takeDamage(amount: number): void {
        super.takeDamage(this.isFakeCopy ? amount : amount * this.combatRampMultiplier);
    }

    public override toData(): EntityData {
        return { ...super.toData(), aimAngle: this.aimAngle };
    }

    public override drainPendingSpawns(): PendingEnemySpawn[] {
        return this.pendingSpawns.splice(0);
    }

    public notifyRepositioned(): void {
        for (const ability of this.activeAbilities) {
            ability.onOwnerRepositioned?.();
        }
    }

    public isPhysicsSuppressed(): boolean {
        return this.activeAbilities.some((ability) => ability.suppressesPhysics?.() ?? false);
    }

    public tick(context: EnemyUpdateContext): void {
        const { playerX, playerY, player, dt, currentTime, onShoot } = context;
        this.isInverted = false;
        this.damageBoostMultiplier = 1;
        this.updateCombatRamp(currentTime);

        // Run every ability each tick. skipBaseBehavior accumulates but never short-circuits the loop,
        // so abilities (e.g. Inversion, Dash) keep working even while Swarm holds position.
        let skipBaseBehavior = false;
        const abilitiesByPriority = [...this.activeAbilities].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
        for (const ability of abilitiesByPriority) {
            const result = ability.execute(this, player, dt, currentTime);
            skipBaseBehavior ||= result?.skipBaseBehavior ?? false;
        }

        if (skipBaseBehavior) {
            this.tryShoot(currentTime, onShoot);
            return;
        }

        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 0.0001) {
            this.aimAngle = Math.atan2(dy, dx);
            const nx = dx / distance;
            const ny = dy / distance;

            if (distance > this.preferredDistance) {
                this.x += nx * this.speed * dt;
                this.y += ny * this.speed * dt;
            } else if (distance < this.preferredDistance * 0.6) {
                this.x -= nx * this.speed * 0.7 * dt;
                this.y -= ny * this.speed * 0.7 * dt;
            }
        }

        this.tryShoot(currentTime, onShoot);
    }

    public override updatePhysics(dt: number): void {
        if (this.isPhysicsSuppressed()) {
            this.knockbackVelocity = { x: 0, y: 0 };
            return;
        }

        super.updatePhysics(dt);
    }

    public override onProjectileHit(currentTimeMs: number): EnemyType[] {
        if (!this.isFakeCopy) {
            this.hasBeenRevealed = true;
        }
        for (const ability of this.activeAbilities) {
            ability.onOwnerHit?.(this, currentTimeMs);
        }
        return [];
    }

    private tryShoot(currentTimeMs: number, onShoot: (aimAngle: number) => void): void {
        if (this.combatRampMultiplier <= 0) return;

        const reloadMs = calculateCooldown(PLAYER_BASE_SHOT_COOLDOWN_SECONDS, this.stats.reloadPoints) * 1000;
        if (currentTimeMs - this.lastShotAtMs < reloadMs) return;

        this.lastShotAtMs = currentTimeMs;
        onShoot(this.aimAngle);
    }

    private updateCombatRamp(currentTimeMs: number): void {
        this.combatRampStartedAtMs ??= currentTimeMs;

        const elapsedMs = currentTimeMs - this.combatRampStartedAtMs;
        if (elapsedMs < DAMAGE_GRACE_MS) {
            this.combatRampMultiplier = 0;
            return;
        }

        const progress = Math.min(1, (elapsedMs - DAMAGE_GRACE_MS) / DAMAGE_RAMP_MS);
        this.combatRampMultiplier = DAMAGE_RAMP_START_MULTIPLIER + ((1 - DAMAGE_RAMP_START_MULTIPLIER) * progress);
    }

    public static selectAbilityConstructors(count: number): AnomalyAbilityCtor[] {
        if (count <= 0) return [];
        if (count === 1) return [DashAbility];

        const selected: AnomalyAbilityCtor[] = [];
        const selectedCtors = new Set<AnomalyAbilityCtor>();
        const available = ABILITY_POOL.map(e => ({ ...e }));
        const n = Math.min(count, ABILITY_POOL.length);

        for (let i = 0; i < n; i++) {
            const total = available.reduce((sum, e) => sum + e.weight, 0);
            let roll = Math.random() * total;

            for (let j = 0; j < available.length; j++) {
                roll -= available[j].weight;
                if (roll <= 0) {
                    selected.push(available[j].ctor);
                    selectedCtors.add(available[j].ctor);
                    available.splice(j, 1);
                    break;
                }
            }
        }

        for (const entry of ABILITY_POOL) {
            if (selectedCtors.has(entry.ctor)) {
                entry.weight = 10;
            } else {
                entry.weight = Math.min(200, entry.weight + 20);
            }
        }

        return selected;
    }
}
