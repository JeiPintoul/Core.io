import { Entity } from '../Entity';
import type { EntityStats, EnemyType } from '../../../shared/Types';
import { calculateCooldown } from '../../../shared/CombatMath';

export interface RangedShootRequest {
    ownerId: string;
    aimAngle: number;
    stats: EntityStats;
}

export class RangedEnemy extends Entity {
    public readonly enemyType: EnemyType = 'RANGED';
    public readonly stats: EntityStats;
    public aimAngle = 0;
    public damage: number;

    private readonly preferredDistance = 400;
    private lastShotAtMs = 0;

    static readonly BASE_XP_DROP = 35;

    static readonly BASE_STATS: EntityStats = {
        maxHealth: 22,
        healthRegen: 0,
        bodyDamage: 3,
        bulletSpeed: 320,
        bulletPenetration: 1,
        bulletDamage: 8,
        reloadPoints: 0,
        movementSpeed: 105
    };

    static readonly BASE_SHOOT_COOLDOWN_SECONDS = 1.5;

    constructor(id: string, x: number, y: number, multiplier: number = 1) {
        const stats: EntityStats = {
            maxHealth: RangedEnemy.BASE_STATS.maxHealth * multiplier,
            healthRegen: 0,
            bodyDamage: RangedEnemy.BASE_STATS.bodyDamage * multiplier,
            bulletSpeed: RangedEnemy.BASE_STATS.bulletSpeed * multiplier,
            bulletPenetration: RangedEnemy.BASE_STATS.bulletPenetration * multiplier,
            bulletDamage: RangedEnemy.BASE_STATS.bulletDamage * multiplier,
            reloadPoints: 0,
            movementSpeed: RangedEnemy.BASE_STATS.movementSpeed * multiplier
        };
        super(id, x, y, stats.maxHealth, stats.maxHealth, stats.movementSpeed);
        this.stats = stats;
        this.damage = stats.bodyDamage;
        this.xpDrop = Math.round(RangedEnemy.BASE_XP_DROP * multiplier);
        this.setBarrels([
            {
                id: 'ranged_front_barrel',
                offsetX: 22,
                offsetY: 0,
                angleOffset: 0,
                recoilForce: 14,
                damageMultiplier: 1,
                speedMultiplier: 1,
                lifespanMultiplier: 1
            }
        ]);
    }

    public update(
        targetX: number,
        targetY: number,
        deltaTime: number,
        currentTimeMs: number,
        shootProjectile: (request: RangedShootRequest) => void
    ): void {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 0.0001) {
            this.aimAngle = Math.atan2(dy, dx);
        }

        if (distance > this.preferredDistance && distance > 0.0001) {
            const normalizedX = dx / distance;
            const normalizedY = dy / distance;
            const speedPerFrame = this.speed * deltaTime;

            this.x += normalizedX * speedPerFrame;
            this.y += normalizedY * speedPerFrame;
            return;
        }

        const shootCooldownMs = calculateCooldown(RangedEnemy.BASE_SHOOT_COOLDOWN_SECONDS, this.stats.reloadPoints) * 1000;
        if (currentTimeMs - this.lastShotAtMs < shootCooldownMs || distance <= 0.0001) {
            return;
        }

        this.lastShotAtMs = currentTimeMs;
        shootProjectile({
            ownerId: this.id,
            aimAngle: this.aimAngle,
            stats: this.stats
        });
    }
}
