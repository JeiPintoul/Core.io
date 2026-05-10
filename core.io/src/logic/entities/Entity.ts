
import { emitGameEvent, GameEvents } from '../../shared/EventBus';
import type { BarrelConfig, EntityStats, ProjectileSpawnRequest } from '../../shared/Types';

export class Entity {
    public id: string;
    public x: number;
    public y: number;
    public health: number;
    public maxHealth: number;
    public speed: number;
    public xpDrop = 0;
    public knockbackVelocity: { x: number; y: number };
    public damageTimers: Map<string, number>;
    public barrels: BarrelConfig[];
    public readonly radius: number;

    private static readonly KNOCKBACK_DAMPING = 0.93;
    private static readonly KNOCKBACK_STOP_THRESHOLD = 1.25;
    private static readonly RECOIL_FORCE_MULTIPLIER = 1.85;

    public static readonly COLLISION_KNOCKBACK_IMPULSE = 240;
    public static readonly COLLISION_KNOCKBACK_OVERLAP_BONUS = 6;

    private static readonly DEFAULT_BARREL: BarrelConfig = {
        id: 'default_barrel',
        offsetX: 24,
        offsetY: 0,
        angleOffset: 0,
        recoilForce: 16,
        damageMultiplier: 1,
        speedMultiplier: 1,
        lifespanMultiplier: 1
    };

    constructor(id: string, x: number, y: number, health: number, maxHealth: number, speed: number, radius = 24) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.health = health;
        this.maxHealth = maxHealth;
        this.speed = speed;
        this.radius = radius;
        this.knockbackVelocity = { x: 0, y: 0 };
        this.damageTimers = new Map<string, number>();
        this.barrels = [];
    }

    public get contactDamage(): number {
        return 0;
    }

    protected get healthRegen(): number {
        return 0;
    }

    public getProjectileSpawns(aimAngle: number, sourceStats: EntityStats): ProjectileSpawnRequest[] {
        const equippedBarrels = this.barrels.length > 0 ? this.barrels : [Entity.DEFAULT_BARREL];

        const baseForwardX = Math.cos(aimAngle);
        const baseForwardY = Math.sin(aimAngle);
        const baseRightX = -baseForwardY;
        const baseRightY = baseForwardX;

        const spawns: ProjectileSpawnRequest[] = [];

        for (const barrel of equippedBarrels) {
            const shotAngle = aimAngle + barrel.angleOffset;
            const dirX = Math.cos(shotAngle);
            const dirY = Math.sin(shotAngle);
            const spawnX = this.x + (baseForwardX * barrel.offsetX) + (baseRightX * barrel.offsetY);
            const spawnY = this.y + (baseForwardY * barrel.offsetX) + (baseRightY * barrel.offsetY);

            const recoilImpulse = Math.max(0, barrel.recoilForce) * Entity.RECOIL_FORCE_MULTIPLIER;
            this.applyImpulse(-dirX * recoilImpulse, -dirY * recoilImpulse);

            spawns.push({
                spawnX,
                spawnY,
                dirX,
                dirY,
                damage: sourceStats.bulletDamage * barrel.damageMultiplier,
                penetration: Math.max(0.1, sourceStats.bulletPenetration),
                speed: Math.max(1, sourceStats.bulletSpeed * barrel.speedMultiplier),
                lifespan: Math.max(0.2, 2.0 * barrel.lifespanMultiplier),
                shotAngle,
                recoilStrength: Math.max(2, barrel.recoilForce * 0.45)
            });
        }

        return spawns;
    }

    public updatePhysics(dt: number): void {
        this.x += this.knockbackVelocity.x * dt;
        this.y += this.knockbackVelocity.y * dt;

        const frameScale = Math.max(0.25, dt * 60);
        const damping = Math.pow(Entity.KNOCKBACK_DAMPING, frameScale);

        this.knockbackVelocity.x *= damping;
        this.knockbackVelocity.y *= damping;

        const speed = Math.hypot(this.knockbackVelocity.x, this.knockbackVelocity.y);
        if (speed < Entity.KNOCKBACK_STOP_THRESHOLD) {
            this.knockbackVelocity.x = 0;
            this.knockbackVelocity.y = 0;
        }
    }

    public updateRegeneration(dt: number, _currentTime: number): void {
        if (this.health <= 0) return;
        const regen = this.healthRegen * dt;
        if (regen <= 0) return;
        this.health = Math.min(this.maxHealth, this.health + regen);
    }

    public setBarrels(barrels: BarrelConfig[]): void {
        this.barrels = barrels.map((barrel) => ({ ...barrel }));
    }

    public applyImpulse(impulseX: number, impulseY: number): void {
        this.knockbackVelocity.x += impulseX;
        this.knockbackVelocity.y += impulseY;
    }

    public canReceiveCollisionDamageFrom(attackerId: string, currentTime: number, cooldownMs: number): boolean {
        const lastDamageTime = this.damageTimers.get(attackerId);
        if (lastDamageTime === undefined) return true;
        return (currentTime - lastDamageTime) >= cooldownMs;
    }

    public registerCollisionDamageFrom(attackerId: string, currentTime: number): void {
        this.damageTimers.set(attackerId, currentTime);
    }

    public getTimeSinceLastDamage(currentTime: number): number {
        if (this.damageTimers.size === 0) return Infinity;

        let mostRecentDamageTime = -Infinity;
        for (const damageTime of this.damageTimers.values()) {
            if (damageTime > mostRecentDamageTime) mostRecentDamageTime = damageTime;
        }
        return currentTime - mostRecentDamageTime;
    }

    public takeDamage(amount: number): void {
        this.health -= amount;
        emitGameEvent(GameEvents.ENTITY_DAMAGE, { id: this.id, currentHealth: this.health });
        if (this.health <= 0) this.die();
    }

    public tomarDano(amount: number): void {
        this.takeDamage(amount);
    }

    protected die(): void {
        emitGameEvent(GameEvents.ENTITY_DESTROYED, { id: this.id });
    }
}
