import { HostileEntity, type EnemyUpdateContext } from './HostileEntity';
import type { EnemyType, EntityData, EntityStats } from '../../../shared/Types';
import { calculateCooldown } from '../../../shared/CombatMath';

export class SkirmisherEnemy extends HostileEntity {
    public readonly enemyType: EnemyType = 'SKIRMISHER';
    public readonly stats: EntityStats;
    public aimAngle = 0;
    public damage: number;

    static readonly BASE_XP_DROP = 46;

    static readonly BASE_STATS: EntityStats = {
        maxHealth: 34,
        healthRegen: 0,
        bodyDamage: 4,
        bulletSpeed: 390,
        bulletPenetration: 0.9,
        bulletDamage: 5,
        reloadPoints: 1,
        movementSpeed: 128
    };

    private readonly preferredDistance = 340;
    private readonly distanceTolerance = 74;
    private readonly baseShootCooldownSeconds = 1.35;
    private strafeDirection: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    private lastShotAtMs = 0;
    private lastStrafeFlipAtMs = 0;

    constructor(id: string, x: number, y: number, multiplier = 1) {
        const stats: EntityStats = {
            maxHealth: SkirmisherEnemy.BASE_STATS.maxHealth * multiplier,
            healthRegen: 0,
            bodyDamage: SkirmisherEnemy.BASE_STATS.bodyDamage * multiplier,
            bulletSpeed: SkirmisherEnemy.BASE_STATS.bulletSpeed * multiplier,
            bulletPenetration: SkirmisherEnemy.BASE_STATS.bulletPenetration * multiplier,
            bulletDamage: SkirmisherEnemy.BASE_STATS.bulletDamage * multiplier,
            reloadPoints: SkirmisherEnemy.BASE_STATS.reloadPoints * multiplier,
            movementSpeed: SkirmisherEnemy.BASE_STATS.movementSpeed * multiplier
        };

        super(id, x, y, stats.maxHealth, stats.maxHealth, stats.movementSpeed);
        this.stats = stats;
        this.damage = stats.bodyDamage;
        this.xpDrop = Math.round(SkirmisherEnemy.BASE_XP_DROP * multiplier);

        this.setBarrels([
            {
                id: 'skirmisher_left_barrel',
                offsetX: 22,
                offsetY: -5,
                angleOffset: -0.18,
                recoilForce: 12,
                damageMultiplier: 0.84,
                speedMultiplier: 1,
                lifespanMultiplier: 1
            },
            {
                id: 'skirmisher_center_barrel',
                offsetX: 24,
                offsetY: 0,
                angleOffset: 0,
                recoilForce: 14,
                damageMultiplier: 1,
                speedMultiplier: 1.02,
                lifespanMultiplier: 1
            },
            {
                id: 'skirmisher_right_barrel',
                offsetX: 22,
                offsetY: 5,
                angleOffset: 0.18,
                recoilForce: 12,
                damageMultiplier: 0.84,
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
            this.updateMovement(dx, dy, distance, dt, currentTime);
        }

        const shootCooldownMs = calculateCooldown(this.baseShootCooldownSeconds, this.stats.reloadPoints) * 1000;
        if (distance <= 0.0001 || currentTime - this.lastShotAtMs < shootCooldownMs) {
            return;
        }

        this.lastShotAtMs = currentTime;
        onShoot(this.aimAngle);
    }

    private updateMovement(dx: number, dy: number, distance: number, dt: number, currentTime: number): void {
        if (currentTime - this.lastStrafeFlipAtMs >= 2400) {
            this.lastStrafeFlipAtMs = currentTime;
            if (Math.random() < 0.42) {
                this.strafeDirection = this.strafeDirection === 1 ? -1 : 1;
            }
        }

        const nx = dx / distance;
        const ny = dy / distance;
        const tangentX = -ny * this.strafeDirection;
        const tangentY = nx * this.strafeDirection;

        let moveX = tangentX;
        let moveY = tangentY;

        if (distance > this.preferredDistance + this.distanceTolerance) {
            moveX += nx * 0.9;
            moveY += ny * 0.9;
        } else if (distance < this.preferredDistance - this.distanceTolerance) {
            moveX -= nx * 1.15;
            moveY -= ny * 1.15;
        }

        const magnitude = Math.hypot(moveX, moveY);
        if (magnitude <= 0.0001) {
            return;
        }

        this.x += (moveX / magnitude) * this.speed * dt;
        this.y += (moveY / magnitude) * this.speed * dt;
    }
}
