import { HostileEntity, type EnemyUpdateContext } from './HostileEntity';
import { Entity } from '../Entity';
import type { EnemyType, EntityData, EntityStats, TriangleCollidable } from '../../../shared/Types';
import { calculateCooldown } from '../../../shared/CombatMath';

export interface SentinelTriangle {
    id: string;
    x: number;
    y: number;
    rotation: number;
    mode: 'ORBIT' | 'SHIELD' | 'HOMING';
    orbitAngle: number;
    health: number;
    maxHealth: number;
    damage: number;
    velocityX: number;
    velocityY: number;
}

export class SentinelEnemy extends HostileEntity {
    public readonly enemyType: EnemyType = 'SENTINEL';
    public readonly stats: EntityStats;
    public aimAngle = 0;
    public damage: number;
    public triangles: SentinelTriangle[];

    private readonly maxTriangles = 3;
    private readonly orbitRadius = 65;
    private readonly orbitAngularSpeed = 1.8;
    private readonly triangleRadius = 12;
    private readonly triangleMaxHealth = 20;
    private readonly triangleDamage = 10;
    private readonly triangleHomingSpeed = 320;
    private readonly triangleHomingTurnRate = 4.0;

    private readonly shieldTriggerDistance = 280;
    private readonly homingMinDistance = 290;
    private readonly homingMaxDistance = 580;
    private readonly baseHomingCooldownSeconds = 3.2;
    private readonly baseRespawnCooldownSeconds = 4.0;
    private readonly preferredCombatDistance = 360;

    private lastHomingAtMs = 0;
    private lastRespawnAtMs = -Infinity;
    private triangleIdCounter = 0;
    private destroyedTriangleTimestamps: number[] = [];

    static readonly BASE_XP_DROP = 50;

    static readonly BASE_STATS: EntityStats = {
        maxHealth: 55,
        healthRegen: 0,
        bodyDamage: 6,
        bulletSpeed: 1,
        bulletPenetration: 0,
        bulletDamage: 0,
        reloadPoints: 4,
        movementSpeed: 100
    };

    constructor(id: string, x: number, y: number, multiplier: number = 1) {
        const stats: EntityStats = {
            maxHealth: SentinelEnemy.BASE_STATS.maxHealth * multiplier,
            healthRegen: 0,
            bodyDamage: SentinelEnemy.BASE_STATS.bodyDamage * multiplier,
            bulletSpeed: 0,
            bulletPenetration: 0,
            bulletDamage: 0,
            reloadPoints: SentinelEnemy.BASE_STATS.reloadPoints * multiplier,
            movementSpeed: SentinelEnemy.BASE_STATS.movementSpeed * multiplier
        };
        super(id, x, y, stats.maxHealth, stats.maxHealth, stats.movementSpeed);
        this.stats = stats;
        this.damage = stats.bodyDamage;
        this.xpDrop = Math.round(SentinelEnemy.BASE_XP_DROP * multiplier);
        this.triangles = this.spawnInitialTriangles();
    }

    public override toData(): EntityData {
        return {
            ...super.toData(),
            sentinelTriangles: this.triangles.map(t => ({
                id: t.id,
                x: t.x,
                y: t.y,
                rotation: t.rotation,
                mode: t.mode,
                health: t.health,
                maxHealth: t.maxHealth
            }))
        };
    }

    public tick(context: EnemyUpdateContext): void {
        const { playerX, playerY, dt, currentTime } = context;
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 0.0001) {
            this.aimAngle = Math.atan2(dy, dx);
        }

        this.updateMovement(dx, dy, distance, dt);
        this.tryRespawnTriangles(currentTime);
        this.updateTriangleModes(distance, currentTime);
        this.updateTrianglePositions(playerX, playerY, dt, currentTime);
    }

    public override resolveSpecialCollisions(
        player: Entity,
        projectiles: TriangleCollidable[],
        currentTime: number,
        onPlayerDamaged: () => void,
        clampToArena: (entity: Entity) => void,
        onProjectileDestroyed: (id: string) => void
    ): void {
        const damageCooldownMs = 200;

        for (let i = this.triangles.length - 1; i >= 0; i--) {
            const tri = this.triangles[i];

            if (tri.mode === 'HOMING') {
                const dist = Math.hypot(player.x - tri.x, player.y - tri.y);
                if (dist < player.radius + this.triangleRadius) {
                    if (player.canReceiveCollisionDamageFrom(tri.id, currentTime, damageCooldownMs)) {
                        player.takeDamage(tri.damage);
                        player.registerCollisionDamageFrom(tri.id, currentTime);
                        onPlayerDamaged();
                    }
                    tri.health = 0;
                    continue;
                }
            }

            if (tri.mode === 'SHIELD' || tri.mode === 'ORBIT') {
                const dx = player.x - tri.x;
                const dy = player.y - tri.y;
                const dist = Math.hypot(dx, dy);
                const minDist = player.radius + this.triangleRadius;

                if (dist < minDist && dist > 0.0001) {
                    const nx = dx / dist;
                    const ny = dy / dist;
                    const overlap = minDist - dist;

                    player.x += nx * overlap;
                    player.y += ny * overlap;
                    clampToArena(player);

                    const impulse = Entity.COLLISION_KNOCKBACK_IMPULSE + (overlap * Entity.COLLISION_KNOCKBACK_OVERLAP_BONUS);
                    player.applyImpulse(nx * impulse, ny * impulse);

                    if (player.canReceiveCollisionDamageFrom(tri.id, currentTime, damageCooldownMs)) {
                        player.takeDamage(tri.damage);
                        player.registerCollisionDamageFrom(tri.id, currentTime);
                        onPlayerDamaged();
                        tri.health -= player.contactDamage;
                    }
                }
            }

            for (const projectile of projectiles) {
                if (projectile.faction !== 'player') continue;
                const dist = Math.hypot(projectile.x - tri.x, projectile.y - tri.y);
                if (dist >= projectile.radius + this.triangleRadius) continue;

                const damage = Math.min(projectile.damage, projectile.health);
                tri.health -= damage;
                projectile.health -= 15;

                if (projectile.health <= 0) {
                    onProjectileDestroyed(projectile.id);
                }
                break;
            }
        }
    }

    private updateMovement(dx: number, dy: number, distance: number, deltaTime: number): void {
        if (distance <= 0.0001) return;

        const normalizedX = dx / distance;
        const normalizedY = dy / distance;

        if (distance < this.preferredCombatDistance * 0.7) {
            this.x -= normalizedX * this.speed * deltaTime;
            this.y -= normalizedY * this.speed * deltaTime;
        } else if (distance > this.preferredCombatDistance) {
            this.x += normalizedX * this.speed * deltaTime;
            this.y += normalizedY * this.speed * deltaTime;
        }
    }

    private updateTriangleModes(distanceToPlayer: number, currentTimeMs: number): void {
        const playerIsClose = distanceToPlayer < this.shieldTriggerDistance;
        const playerInAttackRange =
            distanceToPlayer >= this.homingMinDistance &&
            distanceToPlayer <= this.homingMaxDistance;
        const cooldownReady = (currentTimeMs - this.lastHomingAtMs) >= calculateCooldown(this.baseHomingCooldownSeconds, this.stats.reloadPoints) * 1000;

        if (playerIsClose) {
            for (const tri of this.triangles) {
                if (tri.mode === 'ORBIT') tri.mode = 'SHIELD';
            }
        } else {
            for (const tri of this.triangles) {
                if (tri.mode === 'SHIELD') tri.mode = 'ORBIT';
            }
        }

        if (playerInAttackRange && cooldownReady) {
            const orbitingTriangles = this.triangles.filter(t => t.mode === 'ORBIT');
            if (orbitingTriangles.length > 0) {
                orbitingTriangles[0].mode = 'HOMING';
                orbitingTriangles[0].velocityX = Math.cos(this.aimAngle) * this.triangleHomingSpeed;
                orbitingTriangles[0].velocityY = Math.sin(this.aimAngle) * this.triangleHomingSpeed;
                this.lastHomingAtMs = currentTimeMs;
            }
        }
    }

    private updateTrianglePositions(targetX: number, targetY: number, deltaTime: number, currentTimeMs: number): void {
        const shieldTriangles = this.triangles.filter(t => t.mode === 'SHIELD');
        const shieldCount = shieldTriangles.length;

        for (let i = 0; i < shieldTriangles.length; i++) {
            const shieldSpread = (i - (shieldCount - 1) / 2) * 36;
            const perpendicularAngle = this.aimAngle + Math.PI / 2;
            const targetX_ = this.x + Math.cos(this.aimAngle) * 55 + Math.cos(perpendicularAngle) * shieldSpread;
            const targetY_ = this.y + Math.sin(this.aimAngle) * 55 + Math.sin(perpendicularAngle) * shieldSpread;

            shieldTriangles[i].x += (targetX_ - shieldTriangles[i].x) * 8 * deltaTime;
            shieldTriangles[i].y += (targetY_ - shieldTriangles[i].y) * 8 * deltaTime;
            shieldTriangles[i].rotation += 4 * deltaTime;
        }

        for (let i = this.triangles.length - 1; i >= 0; i--) {
            const tri = this.triangles[i];

            if (tri.health <= 0) {
                this.destroyedTriangleTimestamps.push(currentTimeMs);
                this.triangles.splice(i, 1);
                continue;
            }

            if (tri.mode === 'ORBIT') {
                tri.orbitAngle += this.orbitAngularSpeed * deltaTime;
                tri.x = this.x + Math.cos(tri.orbitAngle) * this.orbitRadius;
                tri.y = this.y + Math.sin(tri.orbitAngle) * this.orbitRadius;
                tri.rotation = tri.orbitAngle + Math.PI / 2;
            } else if (tri.mode === 'HOMING') {
                const tdx = targetX - tri.x;
                const tdy = targetY - tri.y;
                const tdist = Math.hypot(tdx, tdy);

                if (tdist > 0.0001) {
                    const desiredVelX = (tdx / tdist) * this.triangleHomingSpeed;
                    const desiredVelY = (tdy / tdist) * this.triangleHomingSpeed;
                    tri.velocityX += (desiredVelX - tri.velocityX) * this.triangleHomingTurnRate * deltaTime;
                    tri.velocityY += (desiredVelY - tri.velocityY) * this.triangleHomingTurnRate * deltaTime;
                }

                tri.x += tri.velocityX * deltaTime;
                tri.y += tri.velocityY * deltaTime;
                tri.rotation += 6 * deltaTime;
            }
        }
    }

    private tryRespawnTriangles(currentTimeMs: number): void {
        const respawnCooldownMs = calculateCooldown(this.baseRespawnCooldownSeconds, this.stats.reloadPoints) * 1000;

        this.destroyedTriangleTimestamps = this.destroyedTriangleTimestamps.filter(
            ts => (currentTimeMs - ts) < respawnCooldownMs
        );

        if (this.triangles.length >= this.maxTriangles) return;
        if (this.destroyedTriangleTimestamps.length > 0) return;
        if ((currentTimeMs - this.lastRespawnAtMs) < respawnCooldownMs) return;

        const existingAngles = this.triangles.map(t => t.orbitAngle);
        const newAngle = existingAngles.length > 0
            ? existingAngles[existingAngles.length - 1] + (Math.PI * 2 / this.maxTriangles)
            : 0;
        this.triangles.push(this.createTriangle(newAngle));
        this.lastRespawnAtMs = currentTimeMs;
    }

    private spawnInitialTriangles(): SentinelTriangle[] {
        const result: SentinelTriangle[] = [];
        for (let i = 0; i < this.maxTriangles; i++) {
            result.push(this.createTriangle((Math.PI * 2 / this.maxTriangles) * i));
        }
        return result;
    }

    private createTriangle(orbitAngle: number): SentinelTriangle {
        return {
            id: `${this.id}_tri_${this.triangleIdCounter++}`,
            x: this.x + Math.cos(orbitAngle) * this.orbitRadius,
            y: this.y + Math.sin(orbitAngle) * this.orbitRadius,
            rotation: orbitAngle,
            mode: 'ORBIT',
            orbitAngle,
            health: this.triangleMaxHealth,
            maxHealth: this.triangleMaxHealth,
            damage: this.triangleDamage,
            velocityX: 0,
            velocityY: 0,
        };
    }
}
