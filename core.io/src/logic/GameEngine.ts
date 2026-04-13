import { emitGameEvent, GameEvents, onGameEvent } from '../shared/EventBus';
import type { CardSelectedPayload, EnemyType, EntityStats, GameState, InputState, ProjectileFaction } from '../shared/Types';
import { Player } from './entities/player/Player';
import { Enemy } from './entities/enemies/Enemy';
import { RangedEnemy, type RangedShootRequest } from './entities/enemies/RangedEnemy';
import { Entity } from './Entity';
import { ARENA } from '../client/constants/GameConstants';
import { calculatePlayerShotCooldownSeconds } from '../shared/CombatMath';
import { UpgradeManager } from './UpgradeManager';
import {
    ENEMY_BASE_STATS,
    ENEMY_STAT_MULTIPLIER_PER_WAVE,
    ENEMY_XP_DROP,
    WAVE_SPAWN_INTERVAL_SECONDS,
    WAVE_UPGRADE_PHASE_DURATION_MS,
    getEnemyFirstWave,
    getWaveMilestone
} from './constants/WaveConfig';

class Projectile {
    id: string;
    ownerId: string;
    faction: ProjectileFaction;
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    damage: number;
    health: number;
    lifespan: number;
    radius: number;

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
        radius: number,
        lifespan: number = 2.0
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
        this.lifespan = lifespan;
        this.radius = radius;
    }
}

enum EngineState {
    WAVE_ACTIVE = 'WAVE_ACTIVE',
    UPGRADE_PHASE = 'UPGRADE_PHASE'
}

type HostileEnemy = Enemy | RangedEnemy;

export class GameEngine {
    private player: Player;
    private enemies: HostileEnemy[];
    private projectiles: Projectile[];
    private readonly arenaSize: { width: number; height: number };
    private readonly playerBaseStats: EntityStats;
    private readonly upgradeManager: UpgradeManager;
    private readonly playerRadius = 24;
    private readonly enemyRadius = 24;
    private readonly projectileRadius = 9;
    private readonly projectileSpawnOffset = 10;
    private readonly enemySpawnRadius = 300;
    private readonly collisionMicroCooldownMs = 100;
    private readonly collisionKnockbackImpulse = 240;
    private readonly collisionKnockbackOverlapBonus = 6;
    private readonly knockbackDampingPerTick = 0.85;
    private readonly knockbackStopThreshold = 5;
    private readonly projectileBaseHealth = 10;
    private readonly outOfCombatRegenDelayMs = 10000;
    private readonly outOfCombatBonusRegenPerSecond = 5;

    private currentInput: InputState;
    private lastTick: number;
    private lastShotTime = 0;
    private lastSpawnTime = 0;
    private projectileIdCounter = 0;
    private enemyIdCounter = 0;
    private isRunning = false;
    private isPaused = false;

    private engineState: EngineState = EngineState.WAVE_ACTIVE;
    private currentWave = 1;
    private enemiesSpawnedThisWave = 0;
    private enemiesKilledThisWave = 0;
    private upgradePhaseEndsAtMs = 0;
    private readonly processedEnemyDeathIds = new Set<string>();

    constructor() {
        this.playerBaseStats = {
            maxHealth: 100,
            healthRegen: 1,
            bodyDamage: 10,
            bulletSpeed: 500,
            bulletPenetration: 1,
            bulletDamage: 15,
            reload: 0,
            movementSpeed: 150
        };

        this.upgradeManager = new UpgradeManager();

        this.arenaSize = { width: ARENA.width, height: ARENA.height };
        this.player = this.createPlayer('Player');
        this.enemies = [];
        this.projectiles = [];
        this.currentInput = {
            up: false,
            down: false,
            left: false,
            right: false,
            targetX: 0,
            targetY: 0,
            isShooting: false
        };

        const now = performance.now();
        this.lastTick = now;
        this.lastShotTime = now;
        this.lastSpawnTime = now;

        this.setupListeners();
    }

    private setupListeners(): void {
        onGameEvent(GameEvents.PLAYER_INPUT, (input: InputState) => {
            this.currentInput = input;
        });

        onGameEvent(GameEvents.SHOW_UPGRADE_MODAL, () => {
            this.handleUpgradeModalRequested();
        });

        onGameEvent(GameEvents.CARD_SELECTED, (selection) => {
            this.handleCardSelected(selection);
        });

        onGameEvent(GameEvents.ENTITY_DESTROYED, (data: { id: string }) => {
            if (data.id === this.player.id) {
                this.stop();
                this.player.isUpgrading = false;
                emitGameEvent(GameEvents.HIDE_UPGRADE_MODAL, undefined);
                emitGameEvent(GameEvents.GAME_OVER, undefined);
                return;
            }

            const enemy = this.enemies.find((candidate) => candidate.id === data.id);
            if (!enemy) {
                return;
            }

            if (this.processedEnemyDeathIds.has(enemy.id)) {
                return;
            }

            this.processedEnemyDeathIds.add(enemy.id);
            emitGameEvent(GameEvents.ENEMY_DESTROYED, {
                id: enemy.id,
                xpDropped: ENEMY_XP_DROP,
                x: enemy.x,
                y: enemy.y,
                radius: this.enemyRadius
            });

            if (this.engineState === EngineState.WAVE_ACTIVE) {
                this.enemiesKilledThisWave += 1;
            }
        });
    }

    private createPlayer(name: string): Player {
        const centerX = this.arenaSize.width / 2;
        const centerY = this.arenaSize.height / 2;

        return new Player(
            'player_1',
            centerX,
            centerY,
            name,
            this.playerBaseStats
        );
    }

    private getPlayerStateStats(): EntityStats {
        return this.player.currentStats;
    }

    private syncPlayerCoreStats(): EntityStats {
        const stats = this.player.currentStats;
        this.player.maxHealth = stats.maxHealth;
        this.player.speed = stats.movementSpeed;
        this.player.health = Math.min(this.player.health, this.player.maxHealth);
        return stats;
    }

    public start(): void {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;
        this.isPaused = false;
        this.lastTick = performance.now();
        this.tick();
    }

    public stop(): void {
        this.isRunning = false;
        this.isPaused = false;
    }

    public togglePause(): boolean {
        if (!this.isRunning) {
            return this.isPaused;
        }

        this.isPaused = !this.isPaused;

        if (!this.isPaused) {
            this.lastTick = performance.now();
        }

        return this.isPaused;
    }

    public reset(playerName: string = 'Player'): void {
        this.player.destroy();
        this.player = this.createPlayer(playerName);

        this.enemies = [];
        this.projectiles = [];
        this.processedEnemyDeathIds.clear();

        const now = performance.now();
        this.lastTick = now;
        this.lastShotTime = now;
        this.lastSpawnTime = now;
        this.projectileIdCounter = 0;
        this.enemyIdCounter = 0;
        this.isPaused = false;

        this.engineState = EngineState.WAVE_ACTIVE;
        this.currentWave = 1;
        this.enemiesSpawnedThisWave = 0;
        this.enemiesKilledThisWave = 0;
        this.upgradePhaseEndsAtMs = 0;
        this.player.isUpgrading = false;
        emitGameEvent(GameEvents.HIDE_UPGRADE_MODAL, undefined);
    }

    private tick(): void {
        if (!this.isRunning) {
            return;
        }

        if (this.isPaused) {
            this.lastTick = performance.now();
            this.emitStateUpdate();
            setTimeout(() => this.tick(), 1000 / 60);
            return;
        }

        const now = performance.now();
        const dt = (now - this.lastTick) / 1000;
        this.lastTick = now;

        this.update(dt, now);
        this.emitStateUpdate();

        setTimeout(() => this.tick(), 1000 / 60);
    }

    private update(dt: number, currentTime: number): void {
        const playerStats = this.syncPlayerCoreStats();

        if (this.player.isUpgrading) {
            if (this.engineState === EngineState.UPGRADE_PHASE) {
                this.tryResumeWave(currentTime);
            }

            return;
        }

        this.updatePlayerMovement(dt);
        this.tryPlayerShoot(currentTime, playerStats);

        this.updateEnemies(dt, currentTime);

        this.applyEntityRegeneration(this.player, playerStats, dt, currentTime);
        for (const enemy of this.enemies) {
            this.applyEntityRegeneration(enemy, enemy.stats, dt, currentTime);
        }

        this.updateProjectiles(dt);

        if (this.engineState === EngineState.WAVE_ACTIVE) {
            this.trySpawnEnemies(currentTime);
        }

        this.checkCollisions(currentTime);

        if (this.engineState === EngineState.WAVE_ACTIVE) {
            this.tryEnterUpgradePhase(currentTime);
            return;
        }

        this.tryResumeWave(currentTime);
    }

    private emitStateUpdate(): void {
        const playerStats = this.getPlayerStateStats();

        const exportState: GameState = {
            player: {
                id: this.player.id,
                x: this.player.x,
                y: this.player.y,
                health: this.player.health,
                isDead: this.player.health <= 0,
                radius: this.playerRadius,
                color: this.player.color,
                name: this.player.name,
                stats: playerStats
            },
            enemies: this.enemies.map((enemy) => ({
                id: enemy.id,
                x: enemy.x,
                y: enemy.y,
                health: enemy.health,
                isDead: enemy.health <= 0,
                radius: this.enemyRadius,
                stats: enemy.stats,
                enemyType: enemy.enemyType,
                aimAngle: enemy instanceof RangedEnemy ? enemy.aimAngle : undefined
            })),
            projectiles: this.projectiles.map((projectile) => ({
                id: projectile.id,
                ownerId: projectile.ownerId,
                faction: projectile.faction,
                x: projectile.x,
                y: projectile.y,
                radius: projectile.radius
            })),
            arena: this.arenaSize,
            remainingEnemies: this.getRemainingEnemiesInWave(),
            isPaused: this.isPaused
        };

        emitGameEvent(GameEvents.STATE_UPDATE, exportState);
    }

    private updatePlayerMovement(dt: number): void {
        let movementX = 0;
        let movementY = 0;

        if (this.currentInput.up) {
            movementY -= 1;
        }

        if (this.currentInput.down) {
            movementY += 1;
        }

        if (this.currentInput.left) {
            movementX -= 1;
        }

        if (this.currentInput.right) {
            movementX += 1;
        }

        if (movementX !== 0 || movementY !== 0) {
            const magnitude = Math.hypot(movementX, movementY);
            const normalizedX = movementX / magnitude;
            const normalizedY = movementY / magnitude;
            const speedPerFrame = this.player.speed * dt;

            this.player.x += normalizedX * speedPerFrame;
            this.player.y += normalizedY * speedPerFrame;
        }

        this.applyKnockbackMotion(this.player, dt);
        this.clampToArena(this.player);
    }

    private tryPlayerShoot(currentTime: number, playerStats: EntityStats): void {
        if (!this.currentInput.isShooting) {
            return;
        }

        const timeSinceLastShot = (currentTime - this.lastShotTime) / 1000;
        const actualCooldown = calculatePlayerShotCooldownSeconds(playerStats.reload);

        if (timeSinceLastShot < actualCooldown) {
            return;
        }

        const dx = this.currentInput.targetX - this.player.x;
        const dy = this.currentInput.targetY - this.player.y;
        const distance = Math.hypot(dx, dy);

        if (distance <= 0.0001) {
            return;
        }

        this.createProjectile(
            this.player.id,
            'player',
            this.player.x,
            this.player.y,
            dx / distance,
            dy / distance,
            playerStats,
            this.playerRadius
        );

        this.lastShotTime = currentTime;
    }

    private updateEnemies(dt: number, currentTime: number): void {
        for (const enemy of this.enemies) {
            if (enemy instanceof RangedEnemy) {
                enemy.update(this.player.x, this.player.y, dt, currentTime, (request) => {
                    this.spawnEnemyProjectile(request);
                });
            } else {
                enemy.update(this.player.x, this.player.y, dt);
            }

            this.applyKnockbackMotion(enemy, dt);
            this.clampToArena(enemy);
        }
    }

    private updateProjectiles(dt: number): void {
        for (let projectileIndex = this.projectiles.length - 1; projectileIndex >= 0; projectileIndex--) {
            const projectile = this.projectiles[projectileIndex];
            projectile.x += projectile.velocityX * dt;
            projectile.y += projectile.velocityY * dt;
            projectile.lifespan -= dt;

            if (projectile.lifespan <= 0) {
                this.destroyProjectile(projectileIndex);
                continue;
            }

            const outsideArena =
                projectile.x < 0 ||
                projectile.x > this.arenaSize.width ||
                projectile.y < 0 ||
                projectile.y > this.arenaSize.height;

            if (outsideArena) {
                this.destroyProjectile(projectileIndex);
            }
        }
    }

    private trySpawnEnemies(currentTime: number): void {
        const waveMilestone = getWaveMilestone(this.currentWave);
        const totalToSpawn = this.getCurrentWaveTotalToSpawn();

        if (this.enemiesSpawnedThisWave >= totalToSpawn) {
            return;
        }

        if (this.enemies.length >= waveMilestone.maxActiveEnemies) {
            return;
        }

        const timeSinceLastSpawn = (currentTime - this.lastSpawnTime) / 1000;
        if (timeSinceLastSpawn < WAVE_SPAWN_INTERVAL_SECONDS) {
            return;
        }

        this.spawnEnemyForWave(waveMilestone.enemyWeights);
        this.enemiesSpawnedThisWave += 1;
        this.lastSpawnTime = currentTime;
    }

    private spawnEnemyForWave(weights: Partial<Record<EnemyType, number>>): void {
        const enemyType = this.rollEnemyType(weights);
        const enemyStats = this.buildScaledEnemyStats(enemyType);

        const angle = Math.random() * Math.PI * 2;
        const x = this.player.x + Math.cos(angle) * this.enemySpawnRadius;
        const y = this.player.y + Math.sin(angle) * this.enemySpawnRadius;

        const safeX = Math.max(0, Math.min(x, this.arenaSize.width));
        const safeY = Math.max(0, Math.min(y, this.arenaSize.height));
        const enemyId = `enemy_${this.enemyIdCounter++}`;

        const enemy = enemyType === 'RANGED'
            ? new RangedEnemy(enemyId, safeX, safeY, enemyStats)
            : new Enemy(enemyId, safeX, safeY, enemyStats);

        this.enemies.push(enemy);
    }

    private buildScaledEnemyStats(enemyType: EnemyType): EntityStats {
        const baseStats = ENEMY_BASE_STATS[enemyType];
        const enemyStartWave = getEnemyFirstWave(enemyType);
        const waveOffset = Math.max(0, this.currentWave - enemyStartWave);
        const multiplier = 1 + (waveOffset * ENEMY_STAT_MULTIPLIER_PER_WAVE);

        return {
            maxHealth: baseStats.maxHealth * multiplier,
            healthRegen: baseStats.healthRegen,
            bodyDamage: baseStats.bodyDamage * multiplier,
            bulletSpeed: baseStats.bulletSpeed * multiplier,
            bulletPenetration: baseStats.bulletPenetration * multiplier,
            bulletDamage: baseStats.bulletDamage * multiplier,
            reload: baseStats.reload,
            movementSpeed: baseStats.movementSpeed * multiplier
        };
    }

    private rollEnemyType(weights: Partial<Record<EnemyType, number>>): EnemyType {
        const weightedEntries = (Object.entries(weights) as Array<[EnemyType, number]>)
            .filter(([, weight]) => weight > 0);

        if (weightedEntries.length === 0) {
            return 'KAMIKAZE';
        }

        const totalWeight = weightedEntries.reduce((acc, [, weight]) => acc + weight, 0);
        let roll = Math.random() * totalWeight;

        for (const [enemyType, weight] of weightedEntries) {
            roll -= weight;
            if (roll <= 0) {
                return enemyType;
            }
        }

        return weightedEntries[weightedEntries.length - 1][0];
    }

    private spawnEnemyProjectile(request: RangedShootRequest): void {
        this.createProjectile(
            request.ownerId,
            'enemy',
            request.spawnX,
            request.spawnY,
            request.dirX,
            request.dirY,
            request.stats,
            0,
            0
        );
    }

    private createProjectile(
        ownerId: string,
        faction: ProjectileFaction,
        originX: number,
        originY: number,
        dirX: number,
        dirY: number,
        stats: EntityStats,
        sourceRadius: number,
        spawnOffset: number = this.projectileSpawnOffset
    ): void {
        const spawnDistance = sourceRadius + spawnOffset;
        const spawnX = originX + (dirX * spawnDistance);
        const spawnY = originY + (dirY * spawnDistance);
        const velocityX = dirX * stats.bulletSpeed;
        const velocityY = dirY * stats.bulletSpeed;

        const projectile = new Projectile(
            `proj_${this.projectileIdCounter++}`,
            ownerId,
            faction,
            spawnX,
            spawnY,
            velocityX,
            velocityY,
            stats.bulletDamage,
            stats.bulletPenetration * this.projectileBaseHealth,
            this.projectileRadius
        );

        this.projectiles.push(projectile);
    }

    private checkCollisions(currentTime: number): void {
        for (const enemy of this.enemies) {
            this.resolveEntityCollision(this.player, enemy, true, currentTime);
        }

        for (let i = 0; i < this.enemies.length; i++) {
            for (let j = i + 1; j < this.enemies.length; j++) {
                this.resolveEntityCollision(this.enemies[i], this.enemies[j], false, currentTime);
            }
        }

        this.resolveProjectileVsProjectileCollisions();
        this.resolveProjectileEntityCollisions(currentTime);
        this.enemies = this.enemies.filter((enemy) => enemy.health > 0);
    }

    private resolveProjectileVsProjectileCollisions(): void {
        const destroyedIndices = new Set<number>();

        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            if (destroyedIndices.has(i)) {
                continue;
            }

            const projectileA = this.projectiles[i];

            for (let j = i - 1; j >= 0; j--) {
                if (destroyedIndices.has(j)) {
                    continue;
                }

                const projectileB = this.projectiles[j];

                if (projectileA.faction === projectileB.faction) {
                    continue;
                }

                if (!this.checkCircularCollision(projectileA.x, projectileA.y, projectileA.radius, projectileB.x, projectileB.y, projectileB.radius)) {
                    continue;
                }

                const effectiveDamageA = Math.min(projectileA.damage, projectileA.health);
                const effectiveDamageB = Math.min(projectileB.damage, projectileB.health);

                projectileA.health -= effectiveDamageB;
                projectileB.health -= effectiveDamageA;

                if (projectileA.health <= 0) {
                    destroyedIndices.add(i);
                }

                if (projectileB.health <= 0) {
                    destroyedIndices.add(j);
                }

                if (destroyedIndices.has(i)) {
                    break;
                }
            }
        }

        const indicesToDestroy = Array.from(destroyedIndices).sort((a, b) => b - a);
        for (const projectileIndex of indicesToDestroy) {
            this.destroyProjectile(projectileIndex);
        }
    }

    private resolveProjectileEntityCollisions(currentTime: number): void {
        for (let projectileIndex = this.projectiles.length - 1; projectileIndex >= 0; projectileIndex--) {
            const projectile = this.projectiles[projectileIndex];

            if (projectile.faction === 'enemy') {
                if (
                    this.checkCircularCollision(
                        projectile.x,
                        projectile.y,
                        projectile.radius,
                        this.player.x,
                        this.player.y,
                        this.playerRadius
                    )
                ) {
                    const shouldDestroyProjectile = this.resolveProjectileHit(
                        projectile,
                        this.player,
                        this.player.currentStats.bodyDamage,
                        currentTime
                    );

                    if (shouldDestroyProjectile) {
                        this.destroyProjectile(projectileIndex);
                    }
                }

                continue;
            }

            for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
                const enemy = this.enemies[enemyIndex];

                if (!this.checkCircularCollision(projectile.x, projectile.y, projectile.radius, enemy.x, enemy.y, this.enemyRadius)) {
                    continue;
                }

                const shouldDestroyProjectile = this.resolveProjectileHit(
                    projectile,
                    enemy,
                    enemy.damage,
                    currentTime
                );

                if (shouldDestroyProjectile) {
                    this.destroyProjectile(projectileIndex);
                    break;
                }
            }
        }
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

        const normalX = distance === 0 ? 1 : dx / distance;
        const normalY = distance === 0 ? 0 : dy / distance;
        const overlap = minDistance - distance;

        this.applyPositionalCorrection(entityA, entityB, normalX, normalY, overlap);

        if (this.isSameFaction(entityA, entityB) || !applyDamage) {
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

    private isEnemyEntity(entity: Entity): entity is HostileEnemy {
        return entity instanceof Enemy || entity instanceof RangedEnemy;
    }

    private isSameFaction(entityA: Entity, entityB: Entity): boolean {
        const bothPlayers = entityA instanceof Player && entityB instanceof Player;
        const bothEnemies = this.isEnemyEntity(entityA) && this.isEnemyEntity(entityB);

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

    private applyEntityRegeneration(entity: Entity, stats: EntityStats, dt: number, currentTime: number): void {
        if (entity.health <= 0) {
            return;
        }

        let totalRegen = stats.healthRegen * dt;

        if (entity.getTimeSinceLastDamage(currentTime) > this.outOfCombatRegenDelayMs) {
            totalRegen += this.outOfCombatBonusRegenPerSecond * dt;
        }

        if (totalRegen <= 0) {
            return;
        }

        entity.health = Math.min(entity.maxHealth, entity.health + totalRegen);
    }

    private destroyProjectile(projectileIndex: number): void {
        const projectile = this.projectiles[projectileIndex];
        if (!projectile) {
            return;
        }

        emitGameEvent(GameEvents.PROJECTILE_DESTROYED, {
            faction: projectile.faction,
            x: projectile.x,
            y: projectile.y,
            radius: projectile.radius
        });

        this.projectiles.splice(projectileIndex, 1);
    }

    private resolveProjectileHit(
        projectile: Projectile,
        target: Entity,
        targetBodyDamage: number,
        currentTime: number
    ): boolean {
        const effectiveDamage = Math.min(projectile.damage, projectile.health);
        if (effectiveDamage <= 0) {
            return true;
        }

        target.takeDamage(effectiveDamage);
        target.registerCollisionDamageFrom(`projectile:${projectile.ownerId}`, currentTime);
        projectile.health -= targetBodyDamage;

        if (target.health > 0) {
            return true;
        }

        return projectile.health <= 0;
    }

    private tryEnterUpgradePhase(currentTime: number): void {
        const totalToSpawn = this.getCurrentWaveTotalToSpawn();

        if (this.enemiesKilledThisWave < totalToSpawn) {
            return;
        }

        this.engineState = EngineState.UPGRADE_PHASE;
        this.upgradePhaseEndsAtMs = currentTime + WAVE_UPGRADE_PHASE_DURATION_MS;

        const waveCleared = this.currentWave;
        this.currentWave += 1;
        this.enemiesSpawnedThisWave = 0;
        this.enemiesKilledThisWave = 0;

        emitGameEvent(GameEvents.WAVE_CLEARED, {
            waveCleared,
            nextWave: this.currentWave
        });

        if (this.player.pendingUpgrades > 0) {
            this.player.isUpgrading = true;
            emitGameEvent(GameEvents.SHOW_UPGRADE_MODAL, {
                upgradesRemaining: this.player.pendingUpgrades
            });
            return;
        }

        this.player.isUpgrading = false;
    }

    private tryResumeWave(currentTime: number): void {
        if (currentTime < this.upgradePhaseEndsAtMs) {
            return;
        }

        if (this.player.isUpgrading) {
            return;
        }

        this.engineState = EngineState.WAVE_ACTIVE;
        this.lastSpawnTime = currentTime;
    }

    private getEntityRadius(entity: Entity): number {
        if (entity instanceof Player) {
            return this.playerRadius;
        }

        return this.enemyRadius;
    }

    private getEntityContactDamage(entity: Entity): number {
        if (entity instanceof Player) {
            return this.player.currentStats.bodyDamage;
        }

        if (this.isEnemyEntity(entity)) {
            return entity.damage;
        }

        return 0;
    }

    private checkCircularCollision(
        ax: number,
        ay: number,
        aRadius: number,
        bx: number,
        by: number,
        bRadius: number
    ): boolean {
        const dx = ax - bx;
        const dy = ay - by;
        return Math.hypot(dx, dy) < (aRadius + bRadius);
    }

    private handleUpgradeModalRequested(): void {
        // Wait until the current XP burst processing completes to read the final queue size.
        queueMicrotask(() => {
            if (!this.player.isUpgrading || this.player.pendingUpgrades <= 0) {
                return;
            }

            this.emitUpgradeOptions(this.player.pendingUpgrades);
        });
    }

    private handleCardSelected(selection: CardSelectedPayload): void {
        if (this.player.pendingUpgrades <= 0) {
            return;
        }

        const selectedCard = this.upgradeManager.getCardById(selection.cardId);
        if (!selectedCard) {
            return;
        }

        this.player.applyStatModifiers(selectedCard.modifiers);
        this.player.applyUpgradeColor(selection.colorHex);
        this.player.consumePendingUpgrade();
        this.syncPlayerCoreStats();

        if (this.player.pendingUpgrades > 0) {
            this.emitUpgradeOptions(this.player.pendingUpgrades);
            return;
        }

        this.player.isUpgrading = false;
        emitGameEvent(GameEvents.HIDE_UPGRADE_MODAL, undefined);
    }

    private emitUpgradeOptions(upgradesRemaining: number): void {
        const options = this.upgradeManager.rollUpgradeOptions(this.player.level);
        emitGameEvent(GameEvents.UPDATE_UPGRADE_MODAL, {
            upgradesRemaining,
            options
        });
    }

    private getCurrentWaveTotalToSpawn(): number {
        const waveRule = getWaveMilestone(this.currentWave);
        const waveOffset = Math.max(0, this.currentWave - waveRule.startWave);
        const scaledTotal = waveRule.totalEnemiesToSpawn * (1 + (waveOffset * waveRule.sizeMultiplier));

        return Math.max(1, Math.round(scaledTotal));
    }

    private getRemainingEnemiesInWave(): number {
        return Math.max(0, this.getCurrentWaveTotalToSpawn() - this.enemiesKilledThisWave);
    }
}
