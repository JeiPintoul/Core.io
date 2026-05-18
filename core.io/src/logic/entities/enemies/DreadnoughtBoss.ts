import { HostileEntity, type EnemyUpdateContext } from './HostileEntity';
import type { EnemyType, EntityData, EntityStats } from '../../../shared/Types';
import { calculateCooldown } from '../../../shared/CombatMath';

type BossPhase = 1 | 2 | 3;

export class DreadnoughtBoss extends HostileEntity {
    public readonly enemyType: EnemyType = 'DREADNOUGHT';
    public readonly stats: EntityStats;
    public aimAngle = 0;
    public damage: number;
    public readonly pendingSpawns: Array<{ enemyType?: EnemyType; x: number; y: number; multiplier?: number }> = [];

    static readonly BASE_XP_DROP = 780;

    private readonly preferredDistance = 450;
    private readonly strafeSpeedFactor = 0.6;
    private readonly summonRadius = 170;

    private currentPhase: BossPhase = 1;
    private lastShotAtMs = 0;
    private lastSummonAtMs = -Infinity;
    private lastDashAtMs = -Infinity;
    private strafeDirection: 1 | -1 = Math.random() < 0.5 ? 1 : -1;

    constructor(id: string, x: number, y: number, playerStats: EntityStats, bossCount: number) {
        const waveScale = 1 + Math.max(0, bossCount - 1) * 0.14;

        const stats: EntityStats = {
            maxHealth: Math.max(1800, playerStats.maxHealth * 6.4 * waveScale),
            healthRegen: Math.max(2, playerStats.healthRegen * 0.9 + bossCount * 0.35),
            bodyDamage: Math.max(22, playerStats.bodyDamage * 2.2),
            bulletSpeed: Math.max(380, playerStats.bulletSpeed * 0.92),
            bulletPenetration: Math.max(2.2, playerStats.bulletPenetration * 0.82 + 1),
            bulletDamage: Math.max(20, playerStats.bulletDamage * 1.9),
            reloadPoints: Math.max(2, Math.floor(playerStats.reloadPoints * 0.75) + 2),
            movementSpeed: Math.max(100, playerStats.movementSpeed * 0.74)
        };

        super(id, x, y, stats.maxHealth, stats.maxHealth, stats.movementSpeed, 52);
        this.stats = stats;
        this.damage = stats.bodyDamage;
        this.xpDrop = DreadnoughtBoss.BASE_XP_DROP + Math.round((bossCount - 1) * 80);
        this.applyPhaseLoadout(1);
    }

    public override toData(): EntityData {
        return { ...super.toData(), aimAngle: this.aimAngle };
    }

    public override drainPendingSpawns(): Array<{ enemyType?: EnemyType; x: number; y: number; multiplier?: number }> {
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
        this.trySummon(currentTime);
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

    private trySummon(currentTime: number): void {
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

        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + Math.random() * 0.25;
            const type = this.rollSummonType(this.currentPhase);
            const minionMultiplier = this.currentPhase === 3 ? 0.64 : 0.54;

            this.pendingSpawns.push({
                enemyType: type,
                x: this.x + Math.cos(angle) * this.summonRadius,
                y: this.y + Math.sin(angle) * this.summonRadius,
                multiplier: minionMultiplier
            });
        }
    }

    private rollSummonType(phase: BossPhase): EnemyType {
        const table = phase === 1
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
