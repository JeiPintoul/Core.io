import { eventBus, GameEvents } from '../shared/EventBus';
import type { GameState, InputState, EntityStats } from '../shared/Types';
import { Player } from './Player';
import { Enemy } from './Enemy';

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
    private arenaSize: { width: number; height: number };
    
    private currentInput: InputState;
    private lastTick: number;
    private lastShotTime: number = 0;
    private lastSpawnTime: number = 0;
    private projectileIdCounter: number = 0;
    private enemyIdCounter: number = 0;
    private isRunning: boolean = false;

    private spawnConfig: SpawnConfig;

    constructor() {
        const basePlayerStats: EntityStats = {
            maxHealth: 100, healthRegen: 1, bodyDamage: 10,
            bulletSpeed: 500, bulletPenetration: 1, bulletDamage: 15,
            reload: 0.5, movementSpeed: 150
        };

        this.player = new Player('player_1', 1000, 1000, 100, 100, 150);
        this.enemies = [];
        this.projectiles = [];
        this.arenaSize = { width: 2000, height: 2000 };

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
        eventBus.on(GameEvents.PLAYER_INPUT, (input: InputState) => {
            this.currentInput = input;
        });

        eventBus.on('entity_destroyed', (data: { id: string }) => {
            // SE QUEM MORREU FOI O PLAYER
            if (data.id === this.player.id) {
                eventBus.emit(GameEvents.GAME_OVER);
                return;
            }

            // SE FOI INIMIGO (código que você já tinha)
            const enemyIndex = this.enemies.findIndex(e => e.id === data.id);
            if (enemyIndex !== -1) {
                const enemy = this.enemies[enemyIndex];
                eventBus.emit('enemy_destroyed', {
                    id: enemy.id,
                    xpDropped: this.spawnConfig.xpDrop
                });
            }
        });
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
        // Recria o player com a vida cheia e no centro
        this.player = new Player('player_1', 1000, 1000, 100, 100, 150);
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

        const exportState: GameState = {
            player: {
                id: this.player.id,
                x: this.player.x,
                y: this.player.y,
                health: this.player.health,
                radius: 15,
                stats: {
                    maxHealth: this.player.maxHealth,
                    healthRegen: 1,
                    bodyDamage: 10,
                    bulletSpeed: 500,
                    bulletPenetration: 1,
                    bulletDamage: 15,
                    reload: 0.5,
                    movementSpeed: 150
                }
            },
            enemies: this.enemies.map(e => ({
                id: e.id,
                x: e.x,
                y: e.y,
                health: e.health,
                radius: 12,
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

        eventBus.emit(GameEvents.STATE_UPDATE, exportState);

        setTimeout(() => this.tick(), 1000 / 60);
    }

    private update(dt: number, currentTime: number) {
        // ─── Movimento do Player ───
        if (this.currentInput.up) this.player.y -= this.spawnConfig.enemyStats.movementSpeed * dt;
        if (this.currentInput.down) this.player.y += this.spawnConfig.enemyStats.movementSpeed * dt;
        if (this.currentInput.left) this.player.x -= this.spawnConfig.enemyStats.movementSpeed * dt;
        if (this.currentInput.right) this.player.x += this.spawnConfig.enemyStats.movementSpeed * dt;

        this.player.x = Math.max(0, Math.min(this.player.x, this.arenaSize.width));
        this.player.y = Math.max(0, Math.min(this.player.y, this.arenaSize.height));

        // ─── Tiro do Player ───
        if (this.currentInput.isShooting) {
            const timeSinceLastShot = (currentTime - this.lastShotTime) / 1000;
            if (timeSinceLastShot >= 0.5) {
                this.shootProjectile();
                this.lastShotTime = currentTime;
            }
        }

        // ─── Atualizar inimigos (IA + colisão com arena) ───
        for (const enemy of this.enemies) {
            enemy.update(this.player.x, this.player.y, dt);

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
        this.checkCollisions();
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

        const bulletSpeed = 500;
        const velocityX = Math.cos(angle) * bulletSpeed;
        const velocityY = Math.sin(angle) * bulletSpeed;

        const newProj = new Projectile(
            `proj_${this.projectileIdCounter++}`,
            this.player.id,
            this.player.x,
            this.player.y,
            velocityX,
            velocityY,
            15,
            1,
            5
        );

        this.projectiles.push(newProj);
    }

    private checkCollisions() {
        // ─── Colisão Player x Enemy ───
        for (const enemy of this.enemies) {
            if (this.checkCircularCollision(this.player.x, this.player.y, 15, enemy.x, enemy.y, 12)) {
                this.player.tomarDano(enemy.damage);
                enemy.tomarDano(this.spawnConfig.enemyStats.bodyDamage);
            }
        }

        // ─── Colisão Projétil x Enemy ───
        for (let pIndex = this.projectiles.length - 1; pIndex >= 0; pIndex--) {
            const proj = this.projectiles[pIndex];

            for (let eIndex = this.enemies.length - 1; eIndex >= 0; eIndex--) {
                const enemy = this.enemies[eIndex];

                if (proj.ownerId !== enemy.id && 
                    this.checkCircularCollision(proj.x, proj.y, proj.radius, enemy.x, enemy.y, 12)) {
                    
                    enemy.tomarDano(proj.damage);
                    proj.penetration -= 1;

                    if (proj.penetration <= 0) {
                        this.projectiles.splice(pIndex, 1);
                        break;
                    }
                }
            }
        }

        // ─── Remover inimigos mortos ───
        this.enemies = this.enemies.filter(e => e.health > 0);
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
