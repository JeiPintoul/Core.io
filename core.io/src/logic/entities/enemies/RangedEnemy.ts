import { Entity } from '../../Entity';
import type { EntityStats, EnemyType } from '../../../shared/Types';

export interface RangedShootRequest {
    ownerId: string;
    spawnX: number;
    spawnY: number;
    dirX: number;
    dirY: number;
    stats: EntityStats;
}

export class RangedEnemy extends Entity {
    public readonly enemyType: EnemyType = 'RANGED';
    public readonly stats: EntityStats;
    public aimAngle = 0;
    public damage: number;
    private readonly preferredDistance = 400;
    private readonly barrelLength = 20;
    private lastShotAtMs = 0;

    constructor(id: string, x: number, y: number, stats: EntityStats) {
        super(id, x, y, stats.maxHealth, stats.maxHealth, stats.movementSpeed);
        this.stats = { ...stats };
        this.damage = stats.bodyDamage;
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

        const reloadMs = this.stats.reload * 1000;
        if (currentTimeMs - this.lastShotAtMs < reloadMs || distance <= 0.0001) {
            return;
        }

        this.lastShotAtMs = currentTimeMs;
        const dirX = Math.cos(this.aimAngle);
        const dirY = Math.sin(this.aimAngle);

        shootProjectile({
            ownerId: this.id,
            spawnX: this.x + (dirX * this.barrelLength),
            spawnY: this.y + (dirY * this.barrelLength),
            dirX,
            dirY,
            stats: this.stats
        });
    }
}
