import { HostileEntity, type EnemyUpdateContext, type PendingEnemySpawn } from '../../enemies/HostileEntity';
import type { EnemyType, EntityData, EntityStats } from '../../../../shared/Types';
import { calculateCooldown } from '../../../../shared/CombatMath';

type BossPhase = 1 | 2 | 3;

export interface BossCoopScaling {
    healthMultiplier: number;
    bodyDamageMultiplier: number;
    bulletSpeedMultiplier: number;
    bulletPenetrationMultiplier: number;
    bulletDamageMultiplier: number;
    movementSpeedMultiplier: number;
    reloadBonus: number;
    extraPlayers: number;
}

const NO_COOP_SCALING: BossCoopScaling = {
    healthMultiplier: 1,
    bodyDamageMultiplier: 1,
    bulletSpeedMultiplier: 1,
    bulletPenetrationMultiplier: 1,
    bulletDamageMultiplier: 1,
    movementSpeedMultiplier: 1,
    reloadBonus: 0,
    extraPlayers: 0,
};

const BASE_MINION_LIMITS: Record<EnemyType, number> = {
    KAMIKAZE: 4,
    RANGED: 3,
    SKIRMISHER: 2,
    BRUTE: 1,
    SENTINEL: 0,
    ANOMALY: 0,
    ANOMALY_DECOY: 0,
    DREADNOUGHT: 0,
};

export class DreadnoughtBoss extends HostileEntity {
    public readonly enemyType: EnemyType = 'DREADNOUGHT';
    public readonly stats: EntityStats;
    public aimAngle = 0;
    public damage: number;
    public readonly pendingSpawns: PendingEnemySpawn[] = [];

    static readonly BASE_XP_DROP = 780;

    private readonly preferredDistance = 450;
    private readonly strafeSpeedFactor = 0.6;
    private readonly summonRadius = 170;
    private readonly minionLimits: Record<EnemyType, number>;
    private readonly summonWindupMs = 650;
    private readonly minionSpawnGraceMs = 650;

    private currentPhase: BossPhase = 1;
    private lastShotAtMs = 0;
    private lastSummonAtMs = -Infinity;
    private summonStartedAtMs = -Infinity;
    private summonPendingCount = 0;
    private lastDashAtMs = -Infinity;
    private strafeDirection: 1 | -1 = Math.random() < 0.5 ? 1 : -1;

    constructor(id: string, x: number, y: number, bossCount: number, coopScaling: BossCoopScaling = NO_COOP_SCALING) {
        const encounterCount = Math.max(1, bossCount);
        const encounterScale = 1 + (encounterCount - 1) * 0.14;

        const stats: EntityStats = {
            maxHealth: 1800 * encounterScale * coopScaling.healthMultiplier,
            healthRegen: 0,
            bodyDamage: 22 * encounterScale * coopScaling.bodyDamageMultiplier,
            bulletSpeed: 380 * coopScaling.bulletSpeedMultiplier,
            bulletPenetration: (2.2 + (encounterCount - 1) * 0.12) * coopScaling.bulletPenetrationMultiplier,
            bulletDamage: 20 * encounterScale * coopScaling.bulletDamageMultiplier,
            reloadPoints: 2 + (encounterCount - 1) * 0.25 + coopScaling.reloadBonus,
            movementSpeed: 100 * coopScaling.movementSpeedMultiplier
        };

        super(id, x, y, stats.maxHealth, stats.maxHealth, stats.movementSpeed, 52);
        this.stats = stats;
        this.damage = stats.bodyDamage;
        this.minionLimits = this.buildMinionLimits(coopScaling.extraPlayers);
        this.xpDrop = DreadnoughtBoss.BASE_XP_DROP + Math.round((encounterCount - 1) * 80);
        this.applyPhaseLoadout(1);
    }

    public override toData(): EntityData {
        return {
            ...super.toData(),
            aimAngle: this.aimAngle,
            dreadnoughtSummonProgress: this.getSummonProgress(performance.now())
        };
    }

    public override drainPendingSpawns(): PendingEnemySpawn[] {
        return this.pendingSpawns.splice(0);
    }

    public tick(context: EnemyUpdateContext): void {
        const { playerX, playerY, dt, currentTime, onShoot } = context;
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 0.0001) {
            this.aimAngle = Math.atan2(dy, dx);
            this.updateMovement(dx, dy, distance, dt, currentTime);
        }

        const nextPhase = this.getPhaseByHealth();
        if (nextPhase !== this.currentPhase) {
            this.currentPhase = nextPhase;
            this.applyPhaseLoadout(nextPhase);
        }

        this.tryShoot(distance, currentTime, onShoot);
        this.updateSummon(currentTime, context.countEnemiesByType);
    }

    private updateMovement(dx: number, dy: number, distance: number, dt: number, currentTime: number): void {
        const nx = dx / distance;
        const ny = dy / distance;
        const tangentX = -ny * this.strafeDirection;
        const tangentY = nx * this.strafeDirection;

        let moveX = tangentX * this.strafeSpeedFactor;
        let moveY = tangentY * this.strafeSpeedFactor;

        if (distance > this.preferredDistance + 80) {
            moveX += nx;
            moveY += ny;
        } else if (distance < this.preferredDistance - 100) {
            moveX -= nx * 0.8;
            moveY -= ny * 0.8;
        }

        const magnitude = Math.hypot(moveX, moveY);
        if (magnitude > 0.0001) {
            this.x += (moveX / magnitude) * this.speed * dt;
            this.y += (moveY / magnitude) * this.speed * dt;
        }

        if (this.currentPhase === 3) {
            const dashCooldownMs = 4600;
            if (currentTime - this.lastDashAtMs >= dashCooldownMs && distance > 240) {
                this.lastDashAtMs = currentTime;
                const dashImpulse = 720;
                this.applyImpulse(nx * dashImpulse, ny * dashImpulse);
                this.strafeDirection = this.strafeDirection === 1 ? -1 : 1;
            }
        }
    }

    private tryShoot(distance: number, currentTime: number, onShoot: (aimAngle: number) => void): void {
        if (distance <= 0.0001) {
            return;
        }

        const baseCooldownByPhase: Record<BossPhase, number> = {
            1: 1.2,
            2: 0.95,
            3: 0.72
        };

        const shootCooldownMs = calculateCooldown(baseCooldownByPhase[this.currentPhase], this.stats.reloadPoints) * 1000;
        if (currentTime - this.lastShotAtMs < shootCooldownMs) {
            return;
        }

        this.lastShotAtMs = currentTime;
        onShoot(this.aimAngle);
    }

    private updateSummon(currentTime: number, countEnemiesByType: (enemyType: EnemyType, ownerEnemyId?: string) => number): void {
        if (this.summonPendingCount > 0) {
            if (currentTime - this.summonStartedAtMs >= this.summonWindupMs) {
                this.queueSummons(this.summonPendingCount, countEnemiesByType);
                this.summonPendingCount = 0;
            }
            return;
        }

        const summonCooldownByPhase: Record<BossPhase, number> = {
            1: 15000,
            2: 8200,
            3: 6000
        };

        if (currentTime - this.lastSummonAtMs < summonCooldownByPhase[this.currentPhase]) {
            return;
        }

        this.lastSummonAtMs = currentTime;

        const spawnCountByPhase: Record<BossPhase, number> = {
            1: 0,
            2: 3,
            3: 4
        };

        const count = spawnCountByPhase[this.currentPhase];
        if (count <= 0) {
            return;
        }

        this.summonStartedAtMs = currentTime;
        this.summonPendingCount = count;
    }

    private queueSummons(count: number, countEnemiesByType: (enemyType: EnemyType, ownerEnemyId?: string) => number): void {
        let spawned = 0;
        let attempts = 0;
        while (spawned < count && attempts < count * 4) {
            attempts += 1;
            const type = this.rollAvailableSummonType(countEnemiesByType);
            if (!type) {
                return;
            }

            const angle = (spawned / count) * Math.PI * 2 + Math.random() * 0.25;
            const minionMultiplier = this.currentPhase === 3 ? 0.64 : 0.54;

            this.pendingSpawns.push({
                enemyType: type,
                x: this.x + Math.cos(angle) * this.summonRadius,
                y: this.y + Math.sin(angle) * this.summonRadius,
                multiplier: minionMultiplier,
                ownerEnemyId: this.id,
                xpDrop: 0,
                spawnGraceMs: this.minionSpawnGraceMs
            });
            spawned += 1;
        }
    }

    private getSummonProgress(currentTimeMs: number): number {
        if (this.summonPendingCount <= 0) {
            return 0;
        }

        return Math.min(1, Math.max(0, (currentTimeMs - this.summonStartedAtMs) / this.summonWindupMs));
    }

    private rollAvailableSummonType(countEnemiesByType: (enemyType: EnemyType, ownerEnemyId?: string) => number): EnemyType | null {
        const available = this.getSummonTable(this.currentPhase).filter(({ type }) =>
            countEnemiesByType(type, this.id) + this.countPendingMinions(type) < this.minionLimits[type]
        );

        return this.rollFromTable(available);
    }

    private getSummonTable(phase: BossPhase): Array<{ type: EnemyType; weight: number }> {
        return phase === 1
            ? [
                { type: 'KAMIKAZE' as const, weight: 55 },
                { type: 'RANGED' as const, weight: 30 },
                { type: 'SKIRMISHER' as const, weight: 15 }
            ]
            : phase === 2
                ? [
                    { type: 'KAMIKAZE' as const, weight: 28 },
                    { type: 'RANGED' as const, weight: 26 },
                    { type: 'SKIRMISHER' as const, weight: 28 },
                    { type: 'BRUTE' as const, weight: 18 }
                ]
                : [
                    { type: 'RANGED' as const, weight: 18 },
                    { type: 'SKIRMISHER' as const, weight: 34 },
                    { type: 'BRUTE' as const, weight: 34 },
                    { type: 'KAMIKAZE' as const, weight: 14 }
                ];
    }

    private rollFromTable(table: Array<{ type: EnemyType; weight: number }>): EnemyType | null {
        if (table.length === 0) {
            return null;
        }

        const total = table.reduce((acc, item) => acc + item.weight, 0);
        let roll = Math.random() * total;
        for (const item of table) {
            roll -= item.weight;
            if (roll <= 0) {
                return item.type;
            }
        }

        return table[table.length - 1].type;
    }

    private countPendingMinions(type: EnemyType): number {
        return this.pendingSpawns.filter(spawn => spawn.enemyType === type).length;
    }

    private buildMinionLimits(extraPlayers: number): Record<EnemyType, number> {
        return {
            ...BASE_MINION_LIMITS,
            KAMIKAZE: BASE_MINION_LIMITS.KAMIKAZE + extraPlayers,
            RANGED: BASE_MINION_LIMITS.RANGED + extraPlayers,
            SKIRMISHER: BASE_MINION_LIMITS.SKIRMISHER + Math.ceil(extraPlayers * 0.67),
            BRUTE: BASE_MINION_LIMITS.BRUTE + Math.floor(extraPlayers / 2),
        };
    }

    private getPhaseByHealth(): BossPhase {
        const ratio = this.health / Math.max(1, this.maxHealth);
        if (ratio <= 0.34) return 3;
        if (ratio <= 0.7) return 2;
        return 1;
    }

    private applyPhaseLoadout(phase: BossPhase): void {
        if (phase === 1) {
            this.setBarrels([
                {
                    id: 'dreadnought_phase1',
                    offsetX: 48,
                    offsetY: 0,
                    angleOffset: 0,
                    recoilForce: 20,
                    damageMultiplier: 1,
                    speedMultiplier: 1,
                    lifespanMultiplier: 1
                }
            ]);
            return;
        }

        if (phase === 2) {
            this.setBarrels([
                {
                    id: 'dreadnought_phase2_left',
                    offsetX: 42,
                    offsetY: -8,
                    angleOffset: -0.2,
                    recoilForce: 16,
                    damageMultiplier: 0.95,
                    speedMultiplier: 1,
                    lifespanMultiplier: 1
                },
                {
                    id: 'dreadnought_phase2_center',
                    offsetX: 48,
                    offsetY: 0,
                    angleOffset: 0,
                    recoilForce: 18,
                    damageMultiplier: 1,
                    speedMultiplier: 1.04,
                    lifespanMultiplier: 1
                },
                {
                    id: 'dreadnought_phase2_right',
                    offsetX: 42,
                    offsetY: 8,
                    angleOffset: 0.2,
                    recoilForce: 16,
                    damageMultiplier: 0.95,
                    speedMultiplier: 1,
                    lifespanMultiplier: 1
                }
            ]);
            return;
        }

        this.setBarrels([
            {
                id: 'dreadnought_phase3_far_left',
                offsetX: 38,
                offsetY: -10,
                angleOffset: -0.34,
                recoilForce: 14,
                damageMultiplier: 0.82,
                speedMultiplier: 1,
                lifespanMultiplier: 1
            },
            {
                id: 'dreadnought_phase3_left',
                offsetX: 44,
                offsetY: -6,
                angleOffset: -0.18,
                recoilForce: 15,
                damageMultiplier: 0.92,
                speedMultiplier: 1.02,
                lifespanMultiplier: 1
            },
            {
                id: 'dreadnought_phase3_center',
                offsetX: 50,
                offsetY: 0,
                angleOffset: 0,
                recoilForce: 18,
                damageMultiplier: 1.1,
                speedMultiplier: 1.05,
                lifespanMultiplier: 1
            },
            {
                id: 'dreadnought_phase3_right',
                offsetX: 44,
                offsetY: 6,
                angleOffset: 0.18,
                recoilForce: 15,
                damageMultiplier: 0.92,
                speedMultiplier: 1.02,
                lifespanMultiplier: 1
            },
            {
                id: 'dreadnought_phase3_far_right',
                offsetX: 38,
                offsetY: 10,
                angleOffset: 0.34,
                recoilForce: 14,
                damageMultiplier: 0.82,
                speedMultiplier: 1,
                lifespanMultiplier: 1
            }
        ]);
    }
}
