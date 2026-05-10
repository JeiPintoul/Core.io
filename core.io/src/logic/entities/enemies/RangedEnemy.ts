import { HostileEntity, type EnemyUpdateContext } from './HostileEntity';
import type { EntityData, EntityStats, EnemyType } from '../../../shared/Types';
import { calculateCooldown } from '../../../shared/CombatMath';

export class RangedEnemy extends HostileEntity {
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

    public override toData(): EntityData {
        return { ...super.toData(), aimAngle: this.aimAngle };
    }

    public tick(context: EnemyUpdateContext): void {
        const { playerX, playerY, dt, currentTime, onShoot } = context;
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 0.0001) {
            this.aimAngle = Math.atan2(dy, dx);
        }

        if (distance > this.preferredDistance && distance > 0.0001) {
            this.x += (dx / distance) * this.speed * dt;
            this.y += (dy / distance) * this.speed * dt;
            return;
        }

        const shootCooldownMs = calculateCooldown(RangedEnemy.BASE_SHOOT_COOLDOWN_SECONDS, this.stats.reloadPoints) * 1000;
        if (currentTime - this.lastShotAtMs < shootCooldownMs || distance <= 0.0001) return;

        this.lastShotAtMs = currentTime;
        onShoot(this.aimAngle);
    }
}
