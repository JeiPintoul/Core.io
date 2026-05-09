import { Entity } from '../Entity';
import type { EntityStats, EnemyType } from '../../../shared/Types';

export class Enemy extends Entity {
    public readonly enemyType: EnemyType = 'KAMIKAZE';
    public readonly stats: EntityStats;
    public damage: number;

    static readonly BASE_XP_DROP = 25;

    static readonly BASE_STATS: EntityStats = {
        maxHealth: 30,
        healthRegen: 0,
        bodyDamage: 5,
        bulletSpeed: 0,
        bulletPenetration: 0,
        bulletDamage: 0,
        reloadPoints: 0,
        movementSpeed: 140
    };

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

    public update(targetX: number, targetY: number, deltaTime: number): void {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 1) return;

        const moveX = (dx / distance) * this.speed * deltaTime;
        const moveY = (dy / distance) * this.speed * deltaTime;

        this.x += moveX;
        this.y += moveY;
    }
}
