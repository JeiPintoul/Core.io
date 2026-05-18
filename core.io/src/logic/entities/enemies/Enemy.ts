import { HostileEntity, type EnemyUpdateContext } from './HostileEntity';
import type { EnemyType, EntityData, EntityStats } from '../../../shared/Types';

export class Enemy extends HostileEntity {
    public readonly enemyType: EnemyType = 'KAMIKAZE';
    public readonly stats: EntityStats;
    public aimAngle = 0;
    public damage: number;

    static readonly BASE_XP_DROP = 25;

    static readonly BASE_STATS: EntityStats = {
        maxHealth: 38,
        healthRegen: 0,
        bodyDamage: 6,
        bulletSpeed: 0,
        bulletPenetration: 0,
        bulletDamage: 0,
        reloadPoints: 0,
        movementSpeed: 150
    };

    private readonly preferredDistance = 230;
    private readonly distanceTolerance = 80;
    private readonly strafeFactor = 0.92;
    private readonly burstSpeed = 390;
    private readonly burstDurationMs = 460;
    private readonly burstCooldownMs = 2600;
    private orbitDirection: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    private burstDirectionX = 0;
    private burstDirectionY = 0;
    private burstEndsAtMs = 0;
    private lastBurstAtMs = -Infinity;
    private lastDirectionSwapAtMs = 0;

    constructor(id: string, x: number, y: number, multiplier: number = 1) {
        const stats: EntityStats = {
            maxHealth: Enemy.BASE_STATS.maxHealth * multiplier,
            healthRegen: 0,
            bodyDamage: Enemy.BASE_STATS.bodyDamage * multiplier,
            bulletSpeed: 0,
            bulletPenetration: 0,
            bulletDamage: 0,
            reloadPoints: 0,
            movementSpeed: Enemy.BASE_STATS.movementSpeed * multiplier
        };
        super(id, x, y, stats.maxHealth, stats.maxHealth, stats.movementSpeed);
        this.stats = stats;
        this.damage = stats.bodyDamage;
        this.xpDrop = Math.round(Enemy.BASE_XP_DROP * multiplier);
    }

    public override toData(): EntityData {
        return { ...super.toData(), aimAngle: this.aimAngle };
    }

    public tick(context: EnemyUpdateContext): void {
        const { playerX, playerY, dt, currentTime } = context;
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const distance = Math.hypot(dx, dy);

        if (distance <= 0.0001) {
            return;
        }

        if (this.burstEndsAtMs > currentTime) {
            this.damage = this.stats.bodyDamage * 1.85;
            this.aimAngle = Math.atan2(this.burstDirectionY, this.burstDirectionX);
            this.x += this.burstDirectionX * this.burstSpeed * dt;
            this.y += this.burstDirectionY * this.burstSpeed * dt;
            return;
        }

        this.damage = this.stats.bodyDamage;
        this.updateOrbitDirection(currentTime);
        this.updateOrbitMovement(dx, dy, distance, dt);
        this.tryStartBurst(dx, dy, distance, currentTime);
    }

    private updateOrbitDirection(currentTime: number): void {
        const directionSwapWindowMs = 1900;
        if (currentTime - this.lastDirectionSwapAtMs < directionSwapWindowMs) {
            return;
        }

        this.lastDirectionSwapAtMs = currentTime;
        if (Math.random() < 0.4) {
            this.orbitDirection = this.orbitDirection === 1 ? -1 : 1;
        }
    }

    private updateOrbitMovement(dx: number, dy: number, distance: number, dt: number): void {
        const nx = dx / distance;
        const ny = dy / distance;
        const tangentX = -ny * this.orbitDirection;
        const tangentY = nx * this.orbitDirection;

        let moveX = tangentX * this.strafeFactor;
        let moveY = tangentY * this.strafeFactor;

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

        const moveDirX = moveX / magnitude;
        const moveDirY = moveY / magnitude;
        this.aimAngle = Math.atan2(moveDirY, moveDirX);
        this.x += moveDirX * this.speed * dt;
        this.y += moveDirY * this.speed * dt;
    }

    private tryStartBurst(dx: number, dy: number, distance: number, currentTime: number): void {
        const withinBurstRange = distance >= 150 && distance <= 640;
        if (!withinBurstRange) {
            return;
        }

        if (currentTime - this.lastBurstAtMs < this.burstCooldownMs) {
            return;
        }

        this.lastBurstAtMs = currentTime;
        this.burstEndsAtMs = currentTime + this.burstDurationMs;

        const baseAngle = Math.atan2(dy, dx);
        const spread = (Math.random() - 0.5) * 0.48;
        const burstAngle = baseAngle + spread;

        this.burstDirectionX = Math.cos(burstAngle);
        this.burstDirectionY = Math.sin(burstAngle);
        this.aimAngle = burstAngle;
    }
}
