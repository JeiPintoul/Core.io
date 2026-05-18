import { HostileEntity, type EnemyUpdateContext } from './HostileEntity';
import type { EnemyType, EntityData, EntityStats } from '../../../shared/Types';
import { calculateCooldown } from '../../../shared/CombatMath';

export class BruteEnemy extends HostileEntity {
    public readonly enemyType: EnemyType = 'BRUTE';
    public readonly stats: EntityStats;
    public aimAngle = 0;
    public damage: number;

    static readonly BASE_XP_DROP = 68;

    static readonly BASE_STATS: EntityStats = {
        maxHealth: 124,
        healthRegen: 0.15,
        bodyDamage: 14,
        bulletSpeed: 0,
        bulletPenetration: 0,
        bulletDamage: 0,
        reloadPoints: 0,
        movementSpeed: 76
    };

    private readonly preferredDistance = 190;
    private readonly chargeTriggerMin = 260;
    private readonly chargeTriggerMax = 720;
    private readonly chargeDurationMs = 850;
    private readonly chargeSpeed = 370;
    private readonly baseChargeCooldownSeconds = 5.8;

    private chargeEndsAtMs = 0;
    private lastChargeAtMs = -Infinity;
    private chargeDirectionX = 0;
    private chargeDirectionY = 0;

    constructor(id: string, x: number, y: number, multiplier = 1) {
        const stats: EntityStats = {
            maxHealth: BruteEnemy.BASE_STATS.maxHealth * multiplier,
            healthRegen: BruteEnemy.BASE_STATS.healthRegen * multiplier,
            bodyDamage: BruteEnemy.BASE_STATS.bodyDamage * multiplier,
            bulletSpeed: 0,
            bulletPenetration: 0,
            bulletDamage: 0,
            reloadPoints: BruteEnemy.BASE_STATS.reloadPoints,
            movementSpeed: BruteEnemy.BASE_STATS.movementSpeed * multiplier
        };

        super(id, x, y, stats.maxHealth, stats.maxHealth, stats.movementSpeed, 30);
        this.stats = stats;
        this.damage = stats.bodyDamage;
        this.xpDrop = Math.round(BruteEnemy.BASE_XP_DROP * multiplier);
    }

    public override toData(): EntityData {
        return { ...super.toData(), aimAngle: this.aimAngle };
    }

    public tick(context: EnemyUpdateContext): void {
        const { playerX, playerY, dt, currentTime } = context;
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 0.0001) {
            this.aimAngle = Math.atan2(dy, dx);
        }

        if (this.chargeEndsAtMs > currentTime) {
            this.x += this.chargeDirectionX * this.chargeSpeed * dt;
            this.y += this.chargeDirectionY * this.chargeSpeed * dt;
            return;
        }

        const chargeCooldownMs = calculateCooldown(this.baseChargeCooldownSeconds, this.stats.reloadPoints) * 1000;
        const canCharge = currentTime - this.lastChargeAtMs >= chargeCooldownMs;
        const inChargeRange = distance >= this.chargeTriggerMin && distance <= this.chargeTriggerMax;

        if (canCharge && inChargeRange && distance > 0.0001) {
            this.lastChargeAtMs = currentTime;
            this.chargeEndsAtMs = currentTime + this.chargeDurationMs;
            this.chargeDirectionX = dx / distance;
            this.chargeDirectionY = dy / distance;
            return;
        }

        if (distance <= 0.0001) {
            return;
        }

        const moveSign = distance < this.preferredDistance * 0.58 ? -0.65 : 1;
        this.x += (dx / distance) * this.speed * dt * moveSign;
        this.y += (dy / distance) * this.speed * dt * moveSign;
    }
}
