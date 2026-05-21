import { Entity } from '../Entity';
import type { EnemyType, EntityData, EntityStats, PlayerId, TriangleCollidable } from '../../../shared/Types';
import type { Player } from '../player/Player';

export interface PendingEnemySpawn {
    enemyType?: EnemyType;
    x: number;
    y: number;
    multiplier?: number;
    xpDrop?: number;
    orbitSlot?: number;
    orbitTotal?: number;
    orbitRadius?: number;
    ownerEnemyId?: string;
    assignedPlayerId?: PlayerId;
    mirrorStats?: EntityStats;
    spawnGraceMs?: number;
}

export interface EnemyUpdateContext {
    readonly playerX: number;
    readonly playerY: number;
    readonly player: Player;
    readonly dt: number;
    readonly currentTime: number;
    readonly onShoot: (aimAngle: number) => void;
    readonly countEnemiesByType: (enemyType: EnemyType, ownerEnemyId?: string) => number;
}

export abstract class HostileEntity extends Entity {
    public abstract readonly enemyType: EnemyType;
    public abstract readonly stats: EntityStats;
    public abstract damage: number;
    public ownerEnemyId: string | null = null;
    public spawnedAtMs = 0;
    public spawnCollisionGraceEndsAtMs = 0;

    public override get contactDamage(): number {
        return this.damage;
    }

    protected override get healthRegen(): number {
        return this.stats.healthRegen;
    }

    public abstract tick(context: EnemyUpdateContext): void;

    public drainPendingSpawns(): PendingEnemySpawn[] {
        return [];
    }

    public onProjectileHit(currentTimeMs: number): EnemyType[] {
        void currentTimeMs;
        return [];
    }

    public resolveSpecialCollisions(
        player: Entity,
        projectiles: TriangleCollidable[],
        currentTime: number,
        onPlayerDamaged: () => void,
        clampToArena: (entity: Entity) => void,
        onProjectileDestroyed: (id: string) => void
    ): void {
        void player;
        void projectiles;
        void currentTime;
        void onPlayerDamaged;
        void clampToArena;
        void onProjectileDestroyed;
    }

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
            ownerEnemyId: this.ownerEnemyId,
            spawnedAtMs: this.spawnedAtMs,
        };
    }
}
