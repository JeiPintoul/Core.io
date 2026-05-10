import { Entity } from '../Entity';
import type { EnemyType, EntityData, EntityStats, TriangleCollidable } from '../../../shared/Types';
import type { Player } from '../player/Player';

export interface EnemyUpdateContext {
    readonly playerX: number;
    readonly playerY: number;
    readonly player: Player;
    readonly dt: number;
    readonly currentTime: number;
    readonly onShoot: (aimAngle: number) => void;
}

export abstract class HostileEntity extends Entity {
    public abstract readonly enemyType: EnemyType;
    public abstract readonly stats: EntityStats;
    public abstract damage: number;

    public override get contactDamage(): number {
        return this.damage;
    }

    protected override get healthRegen(): number {
        return this.stats.healthRegen;
    }

    public abstract tick(context: EnemyUpdateContext): void;

    public drainPendingSpawns(): Array<{ x: number; y: number }> {
        return [];
    }

    public resolveSpecialCollisions(
        _player: Entity,
        _projectiles: TriangleCollidable[],
        _currentTime: number,
        _onPlayerDamaged: () => void,
        _clampToArena: (entity: Entity) => void,
        _onProjectileDestroyed: (id: string) => void
    ): void {}

    public toData(): EntityData {
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            health: this.health,
            isDead: this.health <= 0,
            radius: this.radius,
            stats: this.stats,
            enemyType: this.enemyType,
        };
    }
}
