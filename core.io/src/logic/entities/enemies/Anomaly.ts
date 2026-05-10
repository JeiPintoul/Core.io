import { Entity } from '../Entity';
import type { EntityStats, EnemyType } from '../../../shared/Types';
import { calculateCooldown, PLAYER_BASE_SHOT_COOLDOWN_SECONDS } from '../../../shared/CombatMath';
import type { Player } from '../player/Player';
import type { AnomalyAbility } from './anomaly_abilities/AnomalyAbility';
import { TeleportAbility } from './anomaly_abilities/TeleportAbility';
import { DashAbility } from './anomaly_abilities/DashAbility';
import { SwarmAbility } from './anomaly_abilities/SwarmAbility';
import { InversionAbility } from './anomaly_abilities/InversionAbility';

export interface AnomalyShootRequest {
    ownerId: string;
    aimAngle: number;
    stats: EntityStats;
}

type AbilityEntry = { ctor: new () => AnomalyAbility; weight: number };

const ABILITY_POOL: AbilityEntry[] = [
    { ctor: TeleportAbility, weight: 100 },
    { ctor: DashAbility,     weight: 100 },
    { ctor: SwarmAbility,    weight: 100 },
    { ctor: InversionAbility, weight: 100 },
];

export class Anomaly extends Entity {
    public readonly enemyType: EnemyType = 'ANOMALY';
    public readonly stats: EntityStats;
    public aimAngle = 0;
    public damage: number;
    public readonly spawnCount: number;
    public isInverted = false;
    public readonly pendingSpawns: Array<{ type: EnemyType; x: number; y: number }> = [];
    public readonly activeAbilities: AnomalyAbility[];

    static readonly BASE_XP_DROP = 300;

    private readonly preferredDistance = 380;
    private lastShotAtMs = 0;

    constructor(id: string, x: number, y: number, playerStats: EntityStats, spawnCount: number) {
        super(id, x, y, playerStats.maxHealth, playerStats.maxHealth, playerStats.movementSpeed);
        this.stats = {
            ...playerStats,
            reloadPoints: Math.max(0, playerStats.reloadPoints - 3)
        };
        this.damage = playerStats.bodyDamage;
        this.xpDrop = Anomaly.BASE_XP_DROP;
        this.spawnCount = spawnCount;
        this.activeAbilities = Anomaly.selectAbilities(spawnCount);
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

    private static selectAbilities(count: number): AnomalyAbility[] {
        const selected: AnomalyAbility[] = [];
        const selectedCtors = new Set<new () => AnomalyAbility>();
        const available = ABILITY_POOL.map(e => ({ ...e }));
        const n = Math.min(count, ABILITY_POOL.length);

        for (let i = 0; i < n; i++) {
            const total = available.reduce((sum, e) => sum + e.weight, 0);
            let roll = Math.random() * total;

            for (let j = 0; j < available.length; j++) {
                roll -= available[j].weight;
                if (roll <= 0) {
                    selected.push(new available[j].ctor());
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

    public update(
        targetX: number,
        targetY: number,
        player: Player,
        deltaTime: number,
        currentTimeMs: number,
        shootProjectile: (request: AnomalyShootRequest) => void
    ): void {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 0.0001) {
            this.aimAngle = Math.atan2(dy, dx);
        }

        if (distance > 0.0001) {
            const nx = dx / distance;
            const ny = dy / distance;

            if (distance > this.preferredDistance) {
                this.x += nx * this.speed * deltaTime;
                this.y += ny * this.speed * deltaTime;
            } else if (distance < this.preferredDistance * 0.6) {
                this.x -= nx * this.speed * 0.7 * deltaTime;
                this.y -= ny * this.speed * 0.7 * deltaTime;
            }
        }

        const reloadMs = calculateCooldown(PLAYER_BASE_SHOT_COOLDOWN_SECONDS, this.stats.reloadPoints) * 1000;
        if (currentTimeMs - this.lastShotAtMs >= reloadMs && distance > 0.0001) {
            this.lastShotAtMs = currentTimeMs;
            shootProjectile({ ownerId: this.id, aimAngle: this.aimAngle, stats: this.stats });
        }

        this.isInverted = false;
        for (const ability of this.activeAbilities) {
            ability.execute(this, player, deltaTime, currentTimeMs);
        }
    }
}
