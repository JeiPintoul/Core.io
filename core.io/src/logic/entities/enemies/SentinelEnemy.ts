import { Entity } from '../../Entity';
import type { EntityStats, EnemyType } from '../../../shared/Types';

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

export class SentinelEnemy extends Entity {
    public readonly enemyType: EnemyType = 'SENTINEL';
    public readonly stats: EntityStats;
    public aimAngle = 0;
    public damage: number;
    public triangles: SentinelTriangle[];

    private readonly maxTriangles = 3;
    private readonly orbitRadius = 65;
    private readonly orbitAngularSpeed = 1.8; // rad/s
    private readonly triangleRadius = 12;
    private readonly triangleMaxHealth = 20;
    private readonly triangleDamage = 10;
    private readonly triangleHomingSpeed = 230;
    private readonly triangleHomingTurnRate = 4.0;

    private readonly shieldTriggerDistance = 280;
    private readonly homingMinDistance = 280;
    private readonly homingMaxDistance = 580;
    private readonly homingCooldownMs = 3200;
    private readonly respawnCooldownMs = 8000;
    private readonly preferredCombatDistance = 360;

    private lastHomingAtMs = 0;
    private triangleIdCounter = 0;
    private destroyedTriangleTimestamps: number[] = [];

    constructor(id: string, x: number, y: number, stats: EntityStats) {
        super(id, x, y, stats.maxHealth, stats.maxHealth, stats.movementSpeed);
        this.stats = { ...stats };
        this.damage = stats.bodyDamage;
        this.triangles = this.spawnInitialTriangles();
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

    public getTriangleRadius(): number {
        return this.triangleRadius;
    }

    public update(targetX: number, targetY: number, deltaTime: number, currentTimeMs: number): void {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 0.0001) {
            this.aimAngle = Math.atan2(dy, dx);
        }

        this.updateMovement(dx, dy, distance, deltaTime);
        this.tryRespawnTriangles(currentTimeMs);
        this.updateTriangleModes(distance, currentTimeMs);
        this.updateTrianglePositions(targetX, targetY, deltaTime);
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
        const cooldownReady = (currentTimeMs - this.lastHomingAtMs) >= this.homingCooldownMs;

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

    private updateTrianglePositions(targetX: number, targetY: number, deltaTime: number): void {
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
                this.destroyedTriangleTimestamps.push(Date.now());
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
        this.destroyedTriangleTimestamps = this.destroyedTriangleTimestamps.filter(
            ts => (currentTimeMs - ts) < this.respawnCooldownMs
        );

        if (this.triangles.length < this.maxTriangles && this.destroyedTriangleTimestamps.length === 0) {
            const existingAngles = this.triangles.map(t => t.orbitAngle);
            const newAngle = existingAngles.length > 0
                ? existingAngles[existingAngles.length - 1] + (Math.PI * 2 / this.maxTriangles)
                : 0;
            this.triangles.push(this.createTriangle(newAngle));
        }
    }
}