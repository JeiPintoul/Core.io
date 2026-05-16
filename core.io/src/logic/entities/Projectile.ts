import type { ProjectileFaction, TriangleCollidable } from '../../shared/Types';
import { Entity } from './Entity';

export class Projectile implements TriangleCollidable {
    static readonly RADIUS = 9;
    static readonly BASE_HEALTH = 10;

    static readonly KNOCKBACK_BASE = 22;
    static readonly KNOCKBACK_SPEED_FACTOR = 0.035;
    static readonly KNOCKBACK_PENETRATION_FACTOR = 14;

    static readonly GLANCING_ALIGNMENT_THRESHOLD = 0.58;
    static readonly GLANCING_EDGE_THRESHOLD_FACTOR = 0.78;
    static readonly GLANCING_MAX_PENETRATION_DEPTH = 5.5;
    static readonly GLANCING_DAMAGE_FACTOR = 0.35;
    static readonly GLANCING_HEALTH_COST_FACTOR = 0.35;
    static readonly GLANCING_DEFLECTION_SCALE = 1.2;

    readonly id: string;
    readonly ownerId: string;
    readonly faction: ProjectileFaction;
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    readonly damage: number;
    health: number;
    readonly penetrationPower: number;
    lifespan: number;
    readonly radius: number;

    constructor(
        id: string,
        ownerId: string,
        faction: ProjectileFaction,
        x: number,
        y: number,
        velocityX: number,
        velocityY: number,
        damage: number,
        health: number,
        penetrationPower: number,
        radius: number,
        lifespan: number
    ) {
        this.id = id;
        this.ownerId = ownerId;
        this.faction = faction;
        this.x = x;
        this.y = y;
        this.velocityX = velocityX;
        this.velocityY = velocityY;
        this.damage = damage;
        this.health = health;
        this.penetrationPower = penetrationPower;
        this.radius = radius;
        this.lifespan = lifespan;
    }

    update(dt: number): void {
        this.x += this.velocityX * dt;
        this.y += this.velocityY * dt;
        this.lifespan -= dt;
    }

    get isExpired(): boolean {
        return this.lifespan <= 0;
    }

    public exchangeDamageWith(other: Projectile): void {
        const damageToThis = Math.min(other.damage, other.health);
        const damageToOther = Math.min(this.damage, this.health);
        this.health -= damageToThis;
        other.health -= damageToOther;
    }

    /**
     * Resolves a hit against an entity. Returns true if this projectile should
     * be destroyed after the collision (health depleted or target killed).
     * onPlayerDamaged is called whenever the target is the player.
     */
    public handleCollisionWith(
        target: Entity,
        targetBodyDamage: number,
        currentTime: number,
        onPlayerDamaged: () => void
    ): boolean {
        const effectiveDamage = Math.min(this.damage, this.health);
        if (effectiveDamage <= 0) {
            return true;
        }

        const dx = this.x - target.x;
        const dy = this.y - target.y;
        const distanceToTargetCenter = Math.hypot(dx, dy);
        const speed = Math.hypot(this.velocityX, this.velocityY);
        const safeDistance = Math.max(distanceToTargetCenter, 0.0001);

        let normalX = dx / safeDistance;
        let normalY = dy / safeDistance;

        if (distanceToTargetCenter <= 0.0001) {
            if (speed > 0.0001) {
                normalX = -this.velocityX / speed;
                normalY = -this.velocityY / speed;
            } else {
                normalX = 1;
                normalY = 0;
            }
        }

        const dirX = speed <= 0.0001 ? normalX : this.velocityX / speed;
        const dirY = speed <= 0.0001 ? normalY : this.velocityY / speed;

        const alignmentToCenter = Math.max(0, (-dirX * normalX) + (-dirY * normalY));
        const impactNearEdge = distanceToTargetCenter >= (target.radius * Projectile.GLANCING_EDGE_THRESHOLD_FACTOR);
        const penetrationDepth = Math.max(0, (target.radius + this.radius) - distanceToTargetCenter);
        const isShallowPenetration = penetrationDepth <= Projectile.GLANCING_MAX_PENETRATION_DEPTH;
        const isGlancingHit = impactNearEdge && isShallowPenetration && alignmentToCenter < Projectile.GLANCING_ALIGNMENT_THRESHOLD;

        if (isGlancingHit) {
            const glancingDamage = effectiveDamage * Projectile.GLANCING_DAMAGE_FACTOR;
            if (glancingDamage > 0) {
                target.takeDamage(glancingDamage);
                target.registerCollisionDamageFrom(`projectile:${this.id}`, currentTime);
                onPlayerDamaged();
            }

            this.applyImpactImpulse(target, true);
            this.applyGlancingDeflection(normalX, normalY);
            this.health -= Math.max(1, targetBodyDamage * Projectile.GLANCING_HEALTH_COST_FACTOR);

            return this.health <= 0;
        }

        target.takeDamage(effectiveDamage);
        target.registerCollisionDamageFrom(`projectile:${this.id}`, currentTime);
        onPlayerDamaged();

        this.applyImpactImpulse(target, false);
        this.health -= targetBodyDamage;

        if (target.health > 0) {
            return true;
        }

        return this.health <= 0;
    }

    private applyImpactImpulse(target: Entity, isGlancing: boolean): void {
        const speed = Math.hypot(this.velocityX, this.velocityY);
        if (speed <= 0.0001) {
            return;
        }

        const dirX = this.velocityX / speed;
        const dirY = this.velocityY / speed;
        let impulse = Projectile.KNOCKBACK_BASE
            + (speed * Projectile.KNOCKBACK_SPEED_FACTOR)
            + (this.penetrationPower * Projectile.KNOCKBACK_PENETRATION_FACTOR);

        if (isGlancing) {
            impulse *= 0.45;
        }

        target.applyImpulse(dirX * impulse, dirY * impulse);
    }

    private applyGlancingDeflection(normalX: number, normalY: number): void {
        const originalSpeed = Math.hypot(this.velocityX, this.velocityY);
        if (originalSpeed <= 0.0001) {
            return;
        }

        const dotProduct = (this.velocityX * normalX) + (this.velocityY * normalY);
        let reflectedX = this.velocityX - (2 * dotProduct * normalX * Projectile.GLANCING_DEFLECTION_SCALE);
        let reflectedY = this.velocityY - (2 * dotProduct * normalY * Projectile.GLANCING_DEFLECTION_SCALE);

        if (!Number.isFinite(reflectedX) || !Number.isFinite(reflectedY)) {
            reflectedX = normalX;
            reflectedY = normalY;
        }

        let reflectedDot = (reflectedX * normalX) + (reflectedY * normalY);

        if (reflectedDot <= 0) {
            const tangentX = -normalY;
            const tangentY = normalX;
            const tangentDot = (this.velocityX * tangentX) + (this.velocityY * tangentY);
            const tangentSign = tangentDot >= 0 ? 1 : -1;
            const outwardSpeed = Math.max(18, originalSpeed * 0.4);
            const tangentSpeed = Math.max(originalSpeed * 0.25, Math.abs(tangentDot) * 0.6);

            reflectedX = (normalX * outwardSpeed) + (tangentX * tangentSpeed * tangentSign);
            reflectedY = (normalY * outwardSpeed) + (tangentY * tangentSpeed * tangentSign);
            reflectedDot = (reflectedX * normalX) + (reflectedY * normalY);

            if (reflectedDot <= 0) {
                reflectedX = normalX * outwardSpeed;
                reflectedY = normalY * outwardSpeed;
            }
        }

        const reflectedSpeed = Math.hypot(reflectedX, reflectedY);
        if (reflectedSpeed <= 0.0001) {
            this.velocityX = normalX * (originalSpeed * 0.75);
            this.velocityY = normalY * (originalSpeed * 0.75);
            return;
        }

        const preservedSpeed = originalSpeed * 0.88;
        this.velocityX = (reflectedX / reflectedSpeed) * preservedSpeed;
        this.velocityY = (reflectedY / reflectedSpeed) * preservedSpeed;
    }
}
