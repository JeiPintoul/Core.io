import { emitGameEvent, GameEvents, onGameEvent } from '../shared/EventBus';
import type { GameState, InputState, EntityStats } from '../shared/Types';
import { Player } from './Player';
import { Enemy } from './Enemy';
import { Entity } from './Entity';
import { ARENA } from '../client/constants/GameConstants';

// Classe interna para projéteis
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

// Configuração de spawning de inimigos
interface SpawnConfig {
    maxEnemies: number;
    spawnRadius: number;
    spawnInterval: number;
    enemyStats: EntityStats;
    xpDrop: number;
}

export class GameEngine {
    private player: Player;
    private enemies: Enemy[];
    private projectiles: Projectile[];
    private readonly arenaSize: { width: number; height: number };
    private readonly playerStats: EntityStats;
    private readonly playerRadius = 15;
    private readonly enemyRadius = 12;
    private readonly projectileRadius = 5;
    private readonly projectileSpawnOffset = 10;
    private readonly collisionMicroCooldownMs = 100;
    private readonly collisionKnockbackImpulse = 240;
    private readonly collisionKnockbackOverlapBonus = 6;
    private readonly knockbackDampingPerTick = 0.85;
    private readonly knockbackStopThreshold = 5;
    
    private currentInput: InputState;
    private lastTick: number;
    private lastShotTime: number = 0;
    private lastSpawnTime: number = 0;
    private projectileIdCounter: number = 0;
    private enemyIdCounter: number = 0;
    private isRunning: boolean = false;

    private spawnConfig: SpawnConfig;

    constructor() {
        this.playerStats = {
            maxHealth: 100, healthRegen: 1, bodyDamage: 10,
            bulletSpeed: 500, bulletPenetration: 1, bulletDamage: 15,
            reload: 0.5, movementSpeed: 150
        };

        this.arenaSize = { width: ARENA.width, height: ARENA.height };
        this.player = this.createPlayer();
        this.enemies = [];
        this.projectiles = [];

        // Configuração padrão de spawn
        this.spawnConfig = {
            maxEnemies: 10,
            spawnRadius: 300,
            spawnInterval: 2, // segundos entre spawns
            enemyStats: {
                maxHealth: 30,
                healthRegen: 0,
                bodyDamage: 5,
                bulletSpeed: 0,
                bulletPenetration: 0,
                bulletDamage: 0,
                reload: 0,
                movementSpeed: 100
            },
            xpDrop: 25
        };

        this.currentInput = { up: false, down: false, left: false, right: false, targetX: 0, targetY: 0, isShooting: false };
        this.lastTick = performance.now();
        this.lastSpawnTime = performance.now();

        this.setupListeners();
    }

    private setupListeners() {
        onGameEvent(GameEvents.PLAYER_INPUT, (input: InputState) => {
            this.currentInput = input;
        });

        onGameEvent(GameEvents.ENTITY_DESTROYED, (data: { id: string }) => {
            // SE QUEM MORREU FOI O PLAYER
            if (data.id === this.player.id) {
                this.stop();
                emitGameEvent(GameEvents.GAME_OVER, undefined);
                return;
            }

            // SE FOI INIMIGO (código que você já tinha)
            const enemyIndex = this.enemies.findIndex(e => e.id === data.id);
            if (enemyIndex !== -1) {
                const enemy = this.enemies[enemyIndex];
                emitGameEvent(GameEvents.ENEMY_DESTROYED, {
                    id: enemy.id,
                    xpDropped: this.spawnConfig.xpDrop
                });
            }
        });
    }

    private createPlayer(): Player {
        const centerX = this.arenaSize.width / 2;
        const centerY = this.arenaSize.height / 2;

        return new Player(
            'player_1',
            centerX,
            centerY,
            this.playerStats.maxHealth,
            this.playerStats.maxHealth,
            this.playerStats.movementSpeed
        );
    }

    private getPlayerStateStats(): EntityStats {
        return {
            ...this.playerStats,
            maxHealth: this.player.maxHealth,
            movementSpeed: this.player.speed
        };
    }

    public start() {
        if (this.isRunning) return; // Evita rodar dois loops ao mesmo tempo
        this.isRunning = true;
        this.lastTick = performance.now();
        this.tick();
    }

    public stop() {
        this.isRunning = false;
    }

    public reset() {
        this.player.destroy();

        // Recria o player com a vida cheia e no centro
        this.player = this.createPlayer();
        // Zera os arrays
        this.enemies = [];
        this.projectiles = [];
        // Reseta os tempos
        this.lastTick = performance.now();
        this.lastShotTime = performance.now();
        this.lastSpawnTime = performance.now();
    }

    private tick() {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = (now - this.lastTick) / 1000;
        this.lastTick = now;

        this.update(dt, now);

        const playerStats = this.getPlayerStateStats();

        const exportState: GameState = {
            player: {
                id: this.player.id,
                x: this.player.x,
                y: this.player.y,
                health: this.player.health,
                isDead: this.player.health <= 0,
                radius: this.playerRadius,
                stats: playerStats
            },
            enemies: this.enemies.map(e => ({
                id: e.id,
                x: e.x,
                y: e.y,
                health: e.health,
                isDead: e.health <= 0,
                radius: this.enemyRadius,
                stats: this.spawnConfig.enemyStats
            })),
            projectiles: this.projectiles.map(p => ({
                id: p.id,
                ownerId: p.ownerId,
                x: p.x,
                y: p.y,
                radius: p.radius
            })),
            arena: this.arenaSize
        };

        emitGameEvent(GameEvents.STATE_UPDATE, exportState);

        setTimeout(() => this.tick(), 1000 / 60);
    }

    private update(dt: number, currentTime: number) {
        // ─── Movimento do Player ───
        let movementX = 0;
        let movementY = 0;

        if (this.currentInput.up) movementY -= 1;
        if (this.currentInput.down) movementY += 1;
        if (this.currentInput.left) movementX -= 1;
        if (this.currentInput.right) movementX += 1;

        if (movementX !== 0 || movementY !== 0) {
            const magnitude = Math.hypot(movementX, movementY);
            const normalizedX = movementX / magnitude;
            const normalizedY = movementY / magnitude;
            const speedPerFrame = this.player.speed * dt;

            this.player.x += normalizedX * speedPerFrame;
            this.player.y += normalizedY * speedPerFrame;
        }

        this.applyKnockbackMotion(this.player, dt);

        this.player.x = Math.max(0, Math.min(this.player.x, this.arenaSize.width));
        this.player.y = Math.max(0, Math.min(this.player.y, this.arenaSize.height));

        // ─── Tiro do Player ───
        if (this.currentInput.isShooting) {
            const timeSinceLastShot = (currentTime - this.lastShotTime) / 1000;
            if (timeSinceLastShot >= this.playerStats.reload) {
                this.shootProjectile();
                this.lastShotTime = currentTime;
            }
        }

        // ─── Atualizar inimigos (IA + colisão com arena) ───
        for (const enemy of this.enemies) {
            enemy.update(this.player.x, this.player.y, dt);

            this.applyKnockbackMotion(enemy, dt);

            // Verificar limites da arena
            enemy.x = Math.max(0, Math.min(enemy.x, this.arenaSize.width));
            enemy.y = Math.max(0, Math.min(enemy.y, this.arenaSize.height));
        }

        // ─── Atualizar projéteis ───
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.x += p.velocityX * dt;
            p.y += p.velocityY * dt;

            if (p.x < 0 || p.x > this.arenaSize.width || p.y < 0 || p.y > this.arenaSize.height) {
                this.projectiles.splice(i, 1);
            }
        }

        // ─── Spawn de inimigos ───
        this.trySpawnEnemies(currentTime);

        // ─── Verificar colisões ───
        this.checkCollisions(currentTime);
    }

    private trySpawnEnemies(currentTime: number) {
        const timeSinceLastSpawn = (currentTime - this.lastSpawnTime) / 1000;

        if (timeSinceLastSpawn >= this.spawnConfig.spawnInterval && 
            this.enemies.length < this.spawnConfig.maxEnemies) {
            
            this.spawnEnemy();
            this.lastSpawnTime = currentTime;
        }
    }

    private spawnEnemy() {
        // Gerar posição aleatória ao redor do player
        const angle = Math.random() * Math.PI * 2;
        const x = this.player.x + Math.cos(angle) * this.spawnConfig.spawnRadius;
        const y = this.player.y + Math.sin(angle) * this.spawnConfig.spawnRadius;

        // Limitar ao mapa
        const safeX = Math.max(0, Math.min(x, this.arenaSize.width));
        const safeY = Math.max(0, Math.min(y, this.arenaSize.height));

        const enemy = new Enemy(
            `enemy_${this.enemyIdCounter++}`,
            safeX,
            safeY,
            this.spawnConfig.enemyStats.maxHealth,
            this.spawnConfig.enemyStats.maxHealth,
            this.spawnConfig.enemyStats.movementSpeed,
            this.spawnConfig.enemyStats.bodyDamage
        );

        this.enemies.push(enemy);
    }

    private shootProjectile() {
        const dx = this.currentInput.targetX - this.player.x;
        const dy = this.currentInput.targetY - this.player.y;
        const angle = Math.atan2(dy, dx);

        const spawnDistance = this.playerRadius + this.projectileSpawnOffset;
        const spawnX = this.player.x + Math.cos(angle) * spawnDistance;
        const spawnY = this.player.y + Math.sin(angle) * spawnDistance;

        const velocityX = Math.cos(angle) * this.playerStats.bulletSpeed;
        const velocityY = Math.sin(angle) * this.playerStats.bulletSpeed;

        const newProj = new Projectile(
            `proj_${this.projectileIdCounter++}`,
            this.player.id,
            spawnX,
            spawnY,
            velocityX,
            velocityY,
            this.playerStats.bulletDamage,
            this.playerStats.bulletPenetration,
            this.projectileRadius
        );

        this.projectiles.push(newProj);
    }

    private checkCollisions(currentTime: number) {
        // ─── Colisão Player x Enemy ───
        for (const enemy of this.enemies) {
            this.resolveEntityCollision(this.player, enemy, true, currentTime);
        }

        // ─── Colisão Enemy x Enemy (otimizado: sem checks duplicados) ───
        for (let i = 0; i < this.enemies.length; i++) {
            for (let j = i + 1; j < this.enemies.length; j++) {
                this.resolveEntityCollision(this.enemies[i], this.enemies[j], false, currentTime);
            }
        }

        this.resolveProjectileCollisions();

        // ─── Remover inimigos mortos ───
        this.enemies = this.enemies.filter(e => e.health > 0);
    }

    private resolveEntityCollision(entityA: Entity, entityB: Entity, applyDamage: boolean, currentTime: number): boolean {
        const radiusA = this.getEntityRadius(entityA);
        const radiusB = this.getEntityRadius(entityB);
        const dx = entityB.x - entityA.x;
        const dy = entityB.y - entityA.y;
        const distance = Math.hypot(dx, dy);
        const minDistance = radiusA + radiusB;

        if (distance >= minDistance) {
            return false;
        }

        // Fallback para evitar divisao por zero quando as entidades estao na mesma posicao.
        const normalX = distance === 0 ? 1 : dx / distance;
        const normalY = distance === 0 ? 0 : dy / distance;

        const overlap = minDistance - distance;
        this.applyPositionalCorrection(entityA, entityB, normalX, normalY, overlap);

        const isSameFaction = this.isSameFaction(entityA, entityB);
        if (isSameFaction || !applyDamage) {
            return true;
        }

        this.applyCollisionImpulse(entityA, entityB, normalX, normalY, overlap);
        this.tryApplyBurstCollisionDamage(entityA, entityB, currentTime);
        this.tryApplyBurstCollisionDamage(entityB, entityA, currentTime);

        return true;
    }

    private applyPositionalCorrection(
        entityA: Entity,
        entityB: Entity,
        normalX: number,
        normalY: number,
        overlap: number
    ): void {
        const gentlePushDistance = overlap / 2;

        entityA.x -= normalX * gentlePushDistance;
        entityA.y -= normalY * gentlePushDistance;
        entityB.x += normalX * gentlePushDistance;
        entityB.y += normalY * gentlePushDistance;

        this.clampToArena(entityA);
        this.clampToArena(entityB);
    }

    private applyCollisionImpulse(
        entityA: Entity,
        entityB: Entity,
        normalX: number,
        normalY: number,
        overlap: number
    ): void {
        const impulseStrength = this.collisionKnockbackImpulse + (overlap * this.collisionKnockbackOverlapBonus);

        entityA.knockbackVelocity.x -= normalX * impulseStrength;
        entityA.knockbackVelocity.y -= normalY * impulseStrength;
        entityB.knockbackVelocity.x += normalX * impulseStrength;
        entityB.knockbackVelocity.y += normalY * impulseStrength;
    }

    private tryApplyBurstCollisionDamage(target: Entity, attacker: Entity, currentTime: number): void {
        if (!target.canReceiveCollisionDamageFrom(attacker.id, currentTime, this.collisionMicroCooldownMs)) {
            return;
        }

        const flatDamage = this.getEntityContactDamage(attacker);
        if (flatDamage <= 0) {
            return;
        }

        target.takeDamage(flatDamage);
        target.registerCollisionDamageFrom(attacker.id, currentTime);
    }

    private isSameFaction(entityA: Entity, entityB: Entity): boolean {
        const bothPlayers = entityA instanceof Player && entityB instanceof Player;
        const bothEnemies = entityA instanceof Enemy && entityB instanceof Enemy;

        return bothPlayers || bothEnemies;
    }

    private clampToArena(entity: Entity): void {
        entity.x = Math.max(0, Math.min(entity.x, this.arenaSize.width));
        entity.y = Math.max(0, Math.min(entity.y, this.arenaSize.height));
    }

    private applyKnockbackMotion(entity: Entity, dt: number): void {
        entity.x += entity.knockbackVelocity.x * dt;
        entity.y += entity.knockbackVelocity.y * dt;

        entity.knockbackVelocity.x *= this.knockbackDampingPerTick;
        entity.knockbackVelocity.y *= this.knockbackDampingPerTick;

        if (Math.abs(entity.knockbackVelocity.x) < this.knockbackStopThreshold) {
            entity.knockbackVelocity.x = 0;
        }

        if (Math.abs(entity.knockbackVelocity.y) < this.knockbackStopThreshold) {
            entity.knockbackVelocity.y = 0;
        }
    }

    private resolveProjectileCollisions(): void {
        for (let pIndex = this.projectiles.length - 1; pIndex >= 0; pIndex--) {
            const proj = this.projectiles[pIndex];

            if (
                proj.ownerId !== this.player.id &&
                this.checkCircularCollision(proj.x, proj.y, proj.radius, this.player.x, this.player.y, this.playerRadius)
            ) {
                this.player.takeDamage(proj.damage);

                if (this.consumeProjectilePenetration(proj, pIndex)) {
                    continue;
                }
            }

            for (let eIndex = this.enemies.length - 1; eIndex >= 0; eIndex--) {
                const enemy = this.enemies[eIndex];

                if (proj.ownerId === enemy.id) {
                    continue;
                }

                if (this.checkCircularCollision(proj.x, proj.y, proj.radius, enemy.x, enemy.y, this.enemyRadius)) {
                    enemy.takeDamage(proj.damage);

                    if (this.consumeProjectilePenetration(proj, pIndex)) {
                        break;
                    }
                }
            }
        }
    }

    private consumeProjectilePenetration(projectile: Projectile, projectileIndex: number): boolean {
        projectile.penetration -= 1;

        if (projectile.penetration > 0) {
            return false;
        }

        this.projectiles.splice(projectileIndex, 1);
        return true;
    }

    private getEntityRadius(entity: Entity): number {
        if (entity instanceof Player) {
            return this.playerRadius;
        }

        return this.enemyRadius;
    }

    private getEntityContactDamage(entity: Entity): number {
        if (entity instanceof Player) {
            return this.playerStats.bodyDamage;
        }

        if (entity instanceof Enemy) {
            return entity.damage;
        }

        return 0;
    }

    private checkCircularCollision(
        ax: number, ay: number, aRadius: number,
        bx: number, by: number, bRadius: number
    ): boolean {
        const dx = ax - bx;
        const dy = ay - by;
        return Math.sqrt(dx * dx + dy * dy) < (aRadius + bRadius);
    }
}
