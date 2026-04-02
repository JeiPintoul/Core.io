import { eventBus, GameEvents } from '../shared/EventBus';
import type { GameState, InputState, EntityStats } from '../shared/Types';

// mock da entity com os stats do diep
class Entity {
    id: string;
    x: number;
    y: number;
    health: number;
    radius: number;
    stats: EntityStats;

    constructor(id: string, x: number, y: number, radius: number, stats: EntityStats) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.stats = stats;
        this.health = stats.maxHealth;
    }

    takeDamage(amount: number) {
        this.health -= amount;
    }
}

// nova classe interna ajustada sem parameter properties
class Projectile {
    id: string;
    ownerId: string;
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    damage: number;
    penetration: number;
    radius: number;

    constructor(
        id: string,
        ownerId: string,
        x: number,
        y: number,
        velocityX: number,
        velocityY: number,
        damage: number,
        penetration: number,
        radius: number
    ) {
        this.id = id;
        this.ownerId = ownerId;
        this.x = x;
        this.y = y;
        this.velocityX = velocityX;
        this.velocityY = velocityY;
        this.damage = damage;
        this.penetration = penetration;
        this.radius = radius;
    }
}

export class GameEngine {
    private player: Entity;
    private enemies: Entity[];
    private projectiles: Projectile[];
    private arenaSize: { width: number; height: number };
    
    private currentInput: InputState;
    private lastTick: number;
    private lastShotTime: number = 0;
    private projectileIdCounter: number = 0;

    constructor() {
        const basePlayerStats: EntityStats = {
            maxHealth: 100, healthRegen: 1, bodyDamage: 10,
            bulletSpeed: 500, bulletPenetration: 1, bulletDamage: 15,
            reload: 0.5, movementSpeed: 150
        };

        this.player = new Entity('player_1', 1000, 1000, 15, basePlayerStats);
        this.enemies = [];
        this.projectiles = [];
        this.arenaSize = { width: 2000, height: 2000 };

        this.currentInput = { up: false, down: false, left: false, right: false, targetX: 0, targetY: 0, isShooting: false };
        this.lastTick = performance.now();

        this.setupListeners();
    }

    private setupListeners() {
        eventBus.on(GameEvents.PLAYER_INPUT, (input: InputState) => {
            this.currentInput = input;
        });
    }

    public start() {
        this.lastTick = performance.now();
        this.tick();
    }

    private tick() {
        const now = performance.now();
        const dt = (now - this.lastTick) / 1000;
        this.lastTick = now;

        this.update(dt, now);

        const exportState: GameState = {
            player: {
                id: this.player.id, x: this.player.x, y: this.player.y,
                health: this.player.health, radius: this.player.radius, stats: this.player.stats
            },
            enemies: this.enemies.map(e => ({
                id: e.id, x: e.x, y: e.y, health: e.health, radius: e.radius, stats: e.stats
            })),
            projectiles: this.projectiles.map(p => ({
                id: p.id, ownerId: p.ownerId, x: p.x, y: p.y, radius: p.radius
            })),
            arena: this.arenaSize
        };

        eventBus.emit(GameEvents.STATE_UPDATE, exportState);

        setTimeout(() => this.tick(), 1000 / 60);
    }

    private update(dt: number, currentTime: number) {
        if (this.currentInput.up) this.player.y -= this.player.stats.movementSpeed * dt;
        if (this.currentInput.down) this.player.y += this.player.stats.movementSpeed * dt;
        if (this.currentInput.left) this.player.x -= this.player.stats.movementSpeed * dt;
        if (this.currentInput.right) this.player.x += this.player.stats.movementSpeed * dt;

        this.player.x = Math.max(0, Math.min(this.player.x, this.arenaSize.width));
        this.player.y = Math.max(0, Math.min(this.player.y, this.arenaSize.height));

        if (this.currentInput.isShooting) {
            const timeSinceLastShot = (currentTime - this.lastShotTime) / 1000;
            if (timeSinceLastShot >= this.player.stats.reload) {
                this.shootProjectile();
                this.lastShotTime = currentTime;
            }
        }

        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.x += p.velocityX * dt;
            p.y += p.velocityY * dt;

            if (p.x < 0 || p.x > this.arenaSize.width || p.y < 0 || p.y > this.arenaSize.height) {
                this.projectiles.splice(i, 1);
            }
        }

        this.checkCollisions();
    }

    private shootProjectile() {
        const dx = this.currentInput.targetX - this.player.x;
        const dy = this.currentInput.targetY - this.player.y;
        const angle = Math.atan2(dy, dx);

        const velocityX = Math.cos(angle) * this.player.stats.bulletSpeed;
        const velocityY = Math.sin(angle) * this.player.stats.bulletSpeed;

        const newProj = new Projectile(
            `proj_${this.projectileIdCounter++}`,
            this.player.id,
            this.player.x,
            this.player.y,
            velocityX,
            velocityY,
            this.player.stats.bulletDamage,
            this.player.stats.bulletPenetration,
            5 
        );

        this.projectiles.push(newProj);
    }

    private checkCollisions() {
        for (const enemy of this.enemies) {
            if (this.checkCircularCollision(this.player, enemy)) {
                this.player.takeDamage(enemy.stats.bodyDamage);
                enemy.takeDamage(this.player.stats.bodyDamage);
            }
        }

        for (let pIndex = this.projectiles.length - 1; pIndex >= 0; pIndex--) {
            const proj = this.projectiles[pIndex];

            for (let eIndex = this.enemies.length - 1; eIndex >= 0; eIndex--) {
                const enemy = this.enemies[eIndex];

                if (proj.ownerId !== enemy.id && this.checkCircularCollisionProjectiles(proj, enemy)) {
                    enemy.takeDamage(proj.damage);
                    proj.penetration -= 1;

                    if (proj.penetration <= 0) {
                        this.projectiles.splice(pIndex, 1);
                        break;
                    }
                }
            }
        }

        this.enemies = this.enemies.filter(e => e.health > 0);
    }

    private checkCircularCollision(a: Entity, b: Entity): boolean {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy) < (a.radius + b.radius);
    }

    private checkCircularCollisionProjectiles(a: Projectile, b: Entity): boolean {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy) < (a.radius + b.radius);
    }
}
