import { Entity } from '../../Entity';
import type { EntityStats, EnemyType } from '../../../shared/Types';
import { calculatePlayerShotCooldownSeconds } from '../../../shared/CombatMath';

export interface MirrorShootRequest {
    ownerId: string;
    aimAngle: number;
    stats: EntityStats;
}

export class MirrorBoss extends Entity {
    public readonly enemyType: EnemyType = 'MIRROR_BOSS';
    public readonly stats: EntityStats;
    public aimAngle = 0;
    public damage: number;

    private readonly preferredDistance = 380;
    private lastShotAtMs = 0;

    constructor(id: string, x: number, y: number, playerStats: EntityStats) {
        super(id, x, y, playerStats.maxHealth, playerStats.maxHealth, playerStats.movementSpeed);
        this.stats = { ...playerStats };
        this.damage = playerStats.bodyDamage;
        // Mesmo barrel do jogador
        this.setBarrels([{
            id: 'mirror_front_barrel',
            offsetX: 34,
            offsetY: 0,
            angleOffset: 0,
            recoilForce: 20,
            damageMultiplier: 1,
            speedMultiplier: 1,
            lifespanMultiplier: 1
        }]);
    }

    public update(
        targetX: number,
        targetY: number,
        deltaTime: number,
        currentTimeMs: number,
        shootProjectile: (request: MirrorShootRequest) => void
    ): void {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 0.0001) {
            this.aimAngle = Math.atan2(dy, dx);
        }

        // Movimentação tática: mantém distância preferida
        if (distance > 0.0001) {
            const normalizedX = dx / distance;
            const normalizedY = dy / distance;

            if (distance > this.preferredDistance) {
                this.x += normalizedX * this.speed * deltaTime;
                this.y += normalizedY * this.speed * deltaTime;
            } else if (distance < this.preferredDistance * 0.6) {
                this.x -= normalizedX * this.speed * 0.7 * deltaTime;
                this.y -= normalizedY * this.speed * 0.7 * deltaTime;
            }
        }

        // Atira com o mesmo timing do jogador
        const reloadMs = calculatePlayerShotCooldownSeconds(this.stats.reload) * 1000;

        if (currentTimeMs - this.lastShotAtMs >= reloadMs && distance > 0.0001) {
            this.lastShotAtMs = currentTimeMs;
            shootProjectile({ ownerId: this.id, aimAngle: this.aimAngle, stats: this.stats });
        }
    }
}