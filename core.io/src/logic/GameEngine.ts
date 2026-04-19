import { emitGameEvent, GameEvents, onGameEvent } from '../shared/EventBus';
import type { CardSelectedPayload, EnemyType, EntityStats, GameState, InputState, ProjectileFaction } from '../shared/Types';
import { Player } from './entities/player/Player';
import { Enemy } from './entities/enemies/Enemy';
import { RangedEnemy, type RangedShootRequest } from './entities/enemies/RangedEnemy';
import { SentinelEnemy } from './entities/enemies/SentinelEnemy';
import { Entity } from './Entity';
import { ARENA } from '../client/constants/GameConstants';
import { calculatePlayerShotCooldownSeconds } from '../shared/CombatMath';
import { UpgradeManager } from './UpgradeManager';
import {
    ENEMY_BASE_STATS,
    ENEMY_STAT_MULTIPLIER_PER_WAVE,
    ENEMY_XP_DROP,
    WAVE_SPAWN_INTERVAL_SECONDS,
    getEnemyFirstWave,
    getWaveMilestone
} from './constants/WaveConfig';
import { MirrorBoss, type MirrorShootRequest } from './entities/enemies/MirrorBoss';

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
    penetrationPower: number;
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
        this.lifespan = lifespan;
        this.radius = radius;
    }
}

// FIX 1: vírgula faltando antes de BOSS_FIGHT
enum EngineState {
    WAVE_ACTIVE = 'WAVE_ACTIVE',
    WAVE_CLEAR_ANIMATION = 'WAVE_CLEAR_ANIMATION',
    UPGRADE_PHASE = 'UPGRADE_PHASE',
    WAVE_STARTING_ANIMATION = 'WAVE_STARTING_ANIMATION',
    BOSS_FIGHT = 'BOSS_FIGHT',
}

type HostileEnemy = Enemy | RangedEnemy | SentinelEnemy | MirrorBoss;

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
    private readonly projectileBaseHealth = 10;

    private readonly collisionMicroCooldownMs = 100;
    private readonly collisionKnockbackImpulse = 240;
    private readonly collisionKnockbackOverlapBonus = 6;
    private readonly knockbackDampingPerTick = 0.93;
    private readonly knockbackStopThreshold = 1.25;

    private readonly outOfCombatRegenDelayMs = 10000;
    private readonly outOfCombatBonusRegenPerSecond = 5;

    private readonly waveTransitionAnimationDurationMs = 1000;
    private readonly viewportSafeSpawnRadius = Math.max(1100, Math.hypot(1920 / 2, 1080 / 2) + 120);
    private readonly minimumSpawnDistance = 1100;

    private readonly projectileKnockbackBase = 22;
    private readonly projectileKnockbackSpeedFactor = 0.035;
    private readonly projectileKnockbackPenetrationFactor = 14;
    private readonly recoilForceMultiplier = 1.85;

    private readonly glancingAlignmentThreshold = 0.58;
    private readonly glancingEdgeThresholdFactor = 0.78;
    private readonly glancingMaxPenetrationDepth = 5.5;
    private readonly glancingDamageFactor = 0.35;
    private readonly glancingProjectileHealthCostFactor = 0.35;
    private readonly glancingDeflectionScale = 1.2;

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
    private waveClearAnimationEndsAtMs = 0;
    private waveStartingAnimationEndsAtMs = 0;

    private readonly processedEnemyDeathIds = new Set<string>();

    // Boss Mirror
    private isBossFightActive = false;
    private currentArena = { x: 0, y: 0, width: 5000, height: 5000 };
    private readonly BOSS_ARENA = { x: 1500, y: 1500, width: 2000, height: 2000 };

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

    private resolveSentinelTriangleCollisions(currentTime: number): void {
        const triangleRadius = 12;
        const triangleDamageCooldownMs = 200;

        for (const enemy of this.enemies) {
            if (!(enemy instanceof SentinelEnemy)) continue;

            for (let i = enemy.triangles.length - 1; i >= 0; i--) {
                const tri = enemy.triangles[i];

                if (tri.mode === 'HOMING') {
                    const hitPlayer = this.checkCircularCollision(
                        tri.x, tri.y, triangleRadius,
                        this.player.x, this.player.y, this.playerRadius
                    );

                    if (hitPlayer) {
                        const canDamage = this.player.canReceiveCollisionDamageFrom(tri.id, currentTime, triangleDamageCooldownMs);
                        if (canDamage) {
                            this.player.takeDamage(tri.damage);
                            this.player.registerCollisionDamageFrom(tri.id, currentTime);
                        }
                        enemy.triangles.splice(i, 1);
                        continue;
                    }
                }

                for (let projIndex = this.projectiles.length - 1; projIndex >= 0; projIndex--) {
                    const projectile = this.projectiles[projIndex];

                    if (projectile.faction !== 'player') continue;

                    const hitTriangle = this.checkCircularCollision(
                        projectile.x, projectile.y, projectile.radius,
                        tri.x, tri.y, triangleRadius
                    );

                    if (!hitTriangle) continue;

                    const damage = Math.min(projectile.damage, projectile.health);
                    tri.health -= damage;
                    projectile.health -= 15;

                    if (projectile.health <= 0) {
                        this.destroyProjectile(projIndex);
                    }

                    if (tri.health <= 0) {
                        enemy.triangles.splice(i, 1);
                    }

                    break;
                }
            }
        }
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
        this.waveClearAnimationEndsAtMs = 0;
        this.waveStartingAnimationEndsAtMs = 0;
        this.player.isUpgrading = false;

        // FIX: resetar estado do boss
        this.isBossFightActive = false;
        this.currentArena = { x: 0, y: 0, width: 5000, height: 5000 };

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
        const playerLockedForUpgrade = this.engineState === EngineState.UPGRADE_PHASE && this.player.isUpgrading;

        if (!playerLockedForUpgrade) {
            this.updatePlayerMovement(dt);
            this.tryPlayerShoot(currentTime, playerStats);
        }

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
        this.advanceWaveState(currentTime);
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
                aimAngle: (enemy instanceof RangedEnemy || enemy instanceof MirrorBoss)
                    ? enemy.aimAngle
                    : undefined,
                sentinelTriangles: enemy instanceof SentinelEnemy
                    ? enemy.triangles.map(t => ({
                        id: t.id,
                        x: t.x,
                        y: t.y,
                        rotation: t.rotation,
                        mode: t.mode,
                        health: t.health,
                        maxHealth: t.maxHealth
                    }))
                    : undefined
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
            // ADICIONADO: estado do boss para o renderer
            arenaOffset: { x: this.currentArena.x, y: this.currentArena.y },
            isBossFight: this.isBossFightActive,
            remainingEnemies: this.getRemainingEnemiesInWave(),
            isPaused: this.isPaused
        };

        emitGameEvent(GameEvents.STATE_UPDATE, exportState);
    }

    private updatePlayerMovement(dt: number): void {
        let movementX = 0;
        let movementY = 0;

        const up    = this.isBossFightActive ? this.currentInput.down  : this.currentInput.up;
        const down  = this.isBossFightActive ? this.currentInput.up    : this.currentInput.down;
        const left  = this.isBossFightActive ? this.currentInput.right : this.currentInput.left;
        const right = this.isBossFightActive ? this.currentInput.left  : this.currentInput.right;

        if (up)    movementY -= 1;
        if (down)  movementY += 1;
        if (left)  movementX -= 1;
        if (right) movementX += 1;

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

        const targetX = this.isBossFightActive
            ? 2 * this.player.x - this.currentInput.targetX
            : this.currentInput.targetX;
        const targetY = this.isBossFightActive
            ? 2 * this.player.y - this.currentInput.targetY
            : this.currentInput.targetY;

        const dx = targetX - this.player.x;
        const dy = targetY - this.player.y;
        const distance = Math.hypot(dx, dy);

        if (distance <= 0.0001) {
            return;
        }

        const aimAngle = Math.atan2(dy, dx);
        this.fireEntityBarrels(this.player, 'player', aimAngle, playerStats);
        this.lastShotTime = currentTime;
    }

    // FIX 2: else if do MirrorBoss estava depois do else — ordem corrigida
    private updateEnemies(dt: number, currentTime: number): void {
        for (const enemy of this.enemies) {
            if (enemy instanceof RangedEnemy) {
                enemy.update(this.player.x, this.player.y, dt, currentTime, (request) => {
                    this.handleRangedEnemyShootRequest(enemy, request);
                });
            } else if (enemy instanceof SentinelEnemy) {
                enemy.update(this.player.x, this.player.y, dt, currentTime);
            } else if (enemy instanceof MirrorBoss) {
                enemy.update(this.player.x, this.player.y, dt, currentTime, (request) => {
                    this.handleMirrorBossShootRequest(enemy, request);
                });
            } else {
                enemy.update(this.player.x, this.player.y, dt);
            }

            this.applyKnockbackMotion(enemy, dt);
            this.clampToArena(enemy);
        }
    }

    private handleRangedEnemyShootRequest(shooter: RangedEnemy, request: RangedShootRequest): void {
        this.fireEntityBarrels(shooter, 'enemy', request.aimAngle, request.stats);
    }

    // ADICIONADO
    private handleMirrorBossShootRequest(shooter: MirrorBoss, request: MirrorShootRequest): void {
        this.fireEntityBarrels(shooter, 'enemy', request.aimAngle, request.stats);
    }

    private fireEntityBarrels(
        shooter: Entity,
        faction: ProjectileFaction,
        baseAimAngle: number,
        sourceStats: EntityStats
    ): void {
        const equippedBarrels = shooter.barrels.length > 0
            ? shooter.barrels
            : [
                {
                    id: 'default_barrel',
                    offsetX: 24,
                    offsetY: 0,
                    angleOffset: 0,
                    recoilForce: 16,
                    damageMultiplier: 1,
                    speedMultiplier: 1,
                    lifespanMultiplier: 1
                }
            ];

        const baseForwardX = Math.cos(baseAimAngle);
        const baseForwardY = Math.sin(baseAimAngle);
        const baseRightX = -baseForwardY;
        const baseRightY = baseForwardX;

        for (const barrel of equippedBarrels) {
            const shotAngle = baseAimAngle + barrel.angleOffset;
            const dirX = Math.cos(shotAngle);
            const dirY = Math.sin(shotAngle);
            const spawnX = shooter.x + (baseForwardX * barrel.offsetX) + (baseRightX * barrel.offsetY);
            const spawnY = shooter.y + (baseForwardY * barrel.offsetX) + (baseRightY * barrel.offsetY);

            const projectileDamage = sourceStats.bulletDamage * barrel.damageMultiplier;
            const projectilePenetration = Math.max(0.1, sourceStats.bulletPenetration);
            const projectileSpeed = Math.max(1, sourceStats.bulletSpeed * barrel.speedMultiplier);
            const projectileLifespan = Math.max(0.2, 2.0 * barrel.lifespanMultiplier);

            this.createProjectile(
                shooter.id,
                faction,
                spawnX,
                spawnY,
                dirX,
                dirY,
                projectileDamage,
                projectilePenetration,
                projectileSpeed,
                projectileLifespan
            );

            this.applyShotRecoil(shooter, dirX, dirY, barrel.recoilForce);

            emitGameEvent(GameEvents.PROJECTILE_FIRED, {
                shooterId: shooter.id,
                faction,
                x: spawnX,
                y: spawnY,
                angle: shotAngle,
                recoilStrength: Math.max(2, barrel.recoilForce * 0.45)
            });
        }
    }

    private applyShotRecoil(
        shooter: Entity,
        shotDirX: number,
        shotDirY: number,
        recoilForce: number
    ): void {
        const recoilImpulse = Math.max(0, recoilForce) * this.recoilForceMultiplier;
        shooter.applyImpulse(-shotDirX * recoilImpulse, -shotDirY * recoilImpulse);
    }

    // FIX 3: outsideArena usa currentArena em vez de arenaSize fixo
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
                projectile.x < this.currentArena.x ||
                projectile.x > this.currentArena.x + this.currentArena.width ||
                projectile.y < this.currentArena.y ||
                projectile.y > this.currentArena.y + this.currentArena.height;

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
        const spawnPoint = this.rollOffscreenSpawnPoint();
        const enemyId = `enemy_${this.enemyIdCounter++}`;

        let enemy: HostileEnemy;
        if (enemyType === 'RANGED') {
            enemy = new RangedEnemy(enemyId, spawnPoint.x, spawnPoint.y, enemyStats);
        } else if (enemyType === 'SENTINEL') {
            enemy = new SentinelEnemy(enemyId, spawnPoint.x, spawnPoint.y, enemyStats);
        } else {
            enemy = new Enemy(enemyId, spawnPoint.x, spawnPoint.y, enemyStats);
        }

        this.enemies.push(enemy);
    }

    private rollOffscreenSpawnPoint(): { x: number; y: number } {
        let fallbackX = this.player.x;
        let fallbackY = this.player.y;

        for (let attempt = 0; attempt < 16; attempt++) {
            const angle = Math.random() * Math.PI * 2;
            const desiredX = this.player.x + Math.cos(angle) * this.viewportSafeSpawnRadius;
            const desiredY = this.player.y + Math.sin(angle) * this.viewportSafeSpawnRadius;
            const clampedX = Math.max(0, Math.min(desiredX, this.arenaSize.width));
            const clampedY = Math.max(0, Math.min(desiredY, this.arenaSize.height));
            const playerDistance = Math.hypot(clampedX - this.player.x, clampedY - this.player.y);

            fallbackX = clampedX;
            fallbackY = clampedY;

            if (playerDistance >= this.minimumSpawnDistance) {
                return { x: clampedX, y: clampedY };
            }
        }

        return { x: fallbackX, y: fallbackY };
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

    private createProjectile(
        ownerId: string,
        faction: ProjectileFaction,
        originX: number,
        originY: number,
        dirX: number,
        dirY: number,
        projectileDamage: number,
        projectilePenetration: number,
        projectileSpeed: number,
        projectileLifespan: number
    ): void {
        const velocityX = dirX * projectileSpeed;
        const velocityY = dirY * projectileSpeed;

        const projectile = new Projectile(
            `proj_${this.projectileIdCounter++}`,
            ownerId,
            faction,
            originX,
            originY,
            velocityX,
            velocityY,
            projectileDamage,
            projectilePenetration * this.projectileBaseHealth,
            projectilePenetration,
            this.projectileRadius,
            projectileLifespan
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
        this.resolveSentinelTriangleCollisions(currentTime);
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

        entityA.applyImpulse(-normalX * impulseStrength, -normalY * impulseStrength);
        entityB.applyImpulse(normalX * impulseStrength, normalY * impulseStrength);
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

    // FIX 4: MirrorBoss adicionado
    private isEnemyEntity(entity: Entity): entity is HostileEnemy {
        return entity instanceof Enemy
            || entity instanceof RangedEnemy
            || entity instanceof SentinelEnemy
            || entity instanceof MirrorBoss;
    }

    private isSameFaction(entityA: Entity, entityB: Entity): boolean {
        const bothPlayers = entityA instanceof Player && entityB instanceof Player;
        const bothEnemies = this.isEnemyEntity(entityA) && this.isEnemyEntity(entityB);

        return bothPlayers || bothEnemies;
    }

    private clampToArena(entity: Entity): void {
        entity.x = Math.max(this.currentArena.x, Math.min(entity.x, this.currentArena.x + this.currentArena.width));
        entity.y = Math.max(this.currentArena.y, Math.min(entity.y, this.currentArena.y + this.currentArena.height));
    }

    private applyKnockbackMotion(entity: Entity, dt: number): void {
        entity.x += entity.knockbackVelocity.x * dt;
        entity.y += entity.knockbackVelocity.y * dt;

        const frameScale = Math.max(0.25, dt * 60);
        const damping = Math.pow(this.knockbackDampingPerTick, frameScale);

        entity.knockbackVelocity.x *= damping;
        entity.knockbackVelocity.y *= damping;

        const speed = Math.hypot(entity.knockbackVelocity.x, entity.knockbackVelocity.y);
        if (speed < this.knockbackStopThreshold) {
            entity.knockbackVelocity.x = 0;
            entity.knockbackVelocity.y = 0;
        }
    }

    private applyEntityRegeneration(entity: Entity, stats: EntityStats, dt: number, currentTime: number): void {
        if (entity.health <= 0) {
            return;
        }

        let totalRegen = stats.healthRegen * dt;

        if (entity instanceof Player && entity.getTimeSinceLastDamage(currentTime) > this.outOfCombatRegenDelayMs) {
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

        const targetRadius = this.getEntityRadius(target);
        const dx = projectile.x - target.x;
        const dy = projectile.y - target.y;
        const distanceToTargetCenter = Math.hypot(dx, dy);
        const projectileSpeed = Math.hypot(projectile.velocityX, projectile.velocityY);
        const safeDistance = Math.max(distanceToTargetCenter, 0.0001);

        let normalX = dx / safeDistance;
        let normalY = dy / safeDistance;

        if (distanceToTargetCenter <= 0.0001) {
            if (projectileSpeed > 0.0001) {
                normalX = -projectile.velocityX / projectileSpeed;
                normalY = -projectile.velocityY / projectileSpeed;
            } else {
                normalX = 1;
                normalY = 0;
            }
        }

        const projectileDirX = projectileSpeed <= 0.0001 ? normalX : projectile.velocityX / projectileSpeed;
        const projectileDirY = projectileSpeed <= 0.0001 ? normalY : projectile.velocityY / projectileSpeed;

        const alignmentToCenter = Math.max(0, (-projectileDirX * normalX) + (-projectileDirY * normalY));
        const impactNearEdge = distanceToTargetCenter >= (targetRadius * this.glancingEdgeThresholdFactor);
        const penetrationDepth = Math.max(0, (targetRadius + projectile.radius) - distanceToTargetCenter);
        const isShallowPenetration = penetrationDepth <= this.glancingMaxPenetrationDepth;
        const isGlancingHit = impactNearEdge && isShallowPenetration && alignmentToCenter < this.glancingAlignmentThreshold;

        if (isGlancingHit) {
            const glancingDamage = effectiveDamage * this.glancingDamageFactor;

            if (glancingDamage > 0) {
                target.takeDamage(glancingDamage);
                target.registerCollisionDamageFrom(`projectile:${projectile.id}`, currentTime);
            }

            this.applyProjectileImpactImpulse(target, projectile, true);
            this.applyGlancingDeflection(projectile, normalX, normalY);
            projectile.health -= Math.max(1, targetBodyDamage * this.glancingProjectileHealthCostFactor);

            return projectile.health <= 0;
        }

        target.takeDamage(effectiveDamage);
        target.registerCollisionDamageFrom(`projectile:${projectile.id}`, currentTime);
        this.applyProjectileImpactImpulse(target, projectile, false);

        projectile.health -= targetBodyDamage;

        if (target.health > 0) {
            return true;
        }

        return projectile.health <= 0;
    }

    private applyProjectileImpactImpulse(target: Entity, projectile: Projectile, isGlancing: boolean): void {
        const speed = Math.hypot(projectile.velocityX, projectile.velocityY);
        if (speed <= 0.0001) {
            return;
        }

        const dirX = projectile.velocityX / speed;
        const dirY = projectile.velocityY / speed;
        let impulse = this.projectileKnockbackBase
            + (speed * this.projectileKnockbackSpeedFactor)
            + (projectile.penetrationPower * this.projectileKnockbackPenetrationFactor);

        if (isGlancing) {
            impulse *= 0.45;
        }

        target.applyImpulse(dirX * impulse, dirY * impulse);
    }

    private applyGlancingDeflection(projectile: Projectile, normalX: number, normalY: number): void {
        const originalSpeed = Math.hypot(projectile.velocityX, projectile.velocityY);
        if (originalSpeed <= 0.0001) {
            return;
        }

        const dotProduct = (projectile.velocityX * normalX) + (projectile.velocityY * normalY);
        let reflectedX = projectile.velocityX - (2 * dotProduct * normalX * this.glancingDeflectionScale);
        let reflectedY = projectile.velocityY - (2 * dotProduct * normalY * this.glancingDeflectionScale);

        if (!Number.isFinite(reflectedX) || !Number.isFinite(reflectedY)) {
            reflectedX = normalX;
            reflectedY = normalY;
        }

        let reflectedDot = (reflectedX * normalX) + (reflectedY * normalY);

        if (reflectedDot <= 0) {
            const tangentX = -normalY;
            const tangentY = normalX;
            const tangentDot = (projectile.velocityX * tangentX) + (projectile.velocityY * tangentY);
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
            projectile.velocityX = normalX * (originalSpeed * 0.75);
            projectile.velocityY = normalY * (originalSpeed * 0.75);
            return;
        }

        const preservedSpeed = originalSpeed * 0.88;
        projectile.velocityX = (reflectedX / reflectedSpeed) * preservedSpeed;
        projectile.velocityY = (reflectedY / reflectedSpeed) * preservedSpeed;
    }

    // ADICIONADO: checagem do boss + fluxo normal
    private advanceWaveState(currentTime: number): void {
        if (this.engineState === EngineState.BOSS_FIGHT) {
            const bossAlive = this.enemies.some(e => e instanceof MirrorBoss);
            if (!bossAlive) {
                this.endBossFight(currentTime);
            }
            return;
        }

        if (this.engineState === EngineState.WAVE_ACTIVE) {
            this.tryEnterWaveClearAnimation(currentTime);
            return;
        }

        if (this.engineState === EngineState.WAVE_CLEAR_ANIMATION) {
            if (currentTime >= this.waveClearAnimationEndsAtMs) {
                this.enterUpgradePhase(currentTime);
            }
            return;
        }

        if (this.engineState === EngineState.UPGRADE_PHASE) {
            if (!this.player.isUpgrading) {
                this.startWaveStartingAnimation(currentTime);
            }
            return;
        }

        if (this.engineState === EngineState.WAVE_STARTING_ANIMATION && currentTime >= this.waveStartingAnimationEndsAtMs) {
            this.resumeWaveSpawning(currentTime);
        }
    }

    // ADICIONADO: trigger do boss a cada 3 waves
    private tryEnterWaveClearAnimation(currentTime: number): void {
        const totalToSpawn = this.getCurrentWaveTotalToSpawn();

        if (this.enemiesKilledThisWave < totalToSpawn) {
            return;
        }

        if (this.enemies.length > 0) {
            return;
        }

        const waveCleared = this.currentWave;
        const nextWave = waveCleared + 1;

        this.currentWave = nextWave;
        this.enemiesSpawnedThisWave = 0;
        this.enemiesKilledThisWave = 0;

        emitGameEvent(GameEvents.WAVE_CLEARED, { waveCleared, nextWave });

        if (waveCleared % 3 === 0) { // Aqui determina quando o boss entra - a cada 3 waves, por exemplo
            this.enterBossFight();
            return;
        }

        this.engineState = EngineState.WAVE_CLEAR_ANIMATION;
        this.waveClearAnimationEndsAtMs = currentTime + this.waveTransitionAnimationDurationMs;

        emitGameEvent(GameEvents.WAVE_CLEAR_ANIMATION_START, {
            wave: waveCleared,
            waveCleared,
            nextWave,
            durationMs: this.waveTransitionAnimationDurationMs
        });
    }

    // ADICIONADO
    private enterBossFight(): void {
        this.isBossFightActive = true;
        this.currentArena = { ...this.BOSS_ARENA };

        this.player.x = this.BOSS_ARENA.x + this.BOSS_ARENA.width / 2;
        this.player.y = this.BOSS_ARENA.y + this.BOSS_ARENA.height / 2;
        this.player.knockbackVelocity = { x: 0, y: 0 };

        const boss = new MirrorBoss(
            'mirror_boss',
            this.BOSS_ARENA.x + this.BOSS_ARENA.width / 2,
            this.BOSS_ARENA.y + 200,
            this.player.currentStats
        );

        this.enemies = [boss];
        this.engineState = EngineState.BOSS_FIGHT;

        emitGameEvent(GameEvents.BOSS_FIGHT_START, {
            bossArenaX: this.BOSS_ARENA.x,
            bossArenaY: this.BOSS_ARENA.y,
            bossArenaWidth: this.BOSS_ARENA.width,
            bossArenaHeight: this.BOSS_ARENA.height
        });
    }

    // ADICIONADO
    private endBossFight(currentTime: number): void {
        this.isBossFightActive = false;
        this.currentArena = { x: 0, y: 0, width: this.arenaSize.width, height: this.arenaSize.height };

        this.player.x = this.arenaSize.width / 2;
        this.player.y = this.arenaSize.height / 2;
        this.player.knockbackVelocity = { x: 0, y: 0 };

        emitGameEvent(GameEvents.BOSS_DEFEATED, undefined);

        this.engineState = EngineState.WAVE_CLEAR_ANIMATION;
        this.waveClearAnimationEndsAtMs = currentTime + this.waveTransitionAnimationDurationMs;
    }

    private enterUpgradePhase(currentTime: number): void {
        this.engineState = EngineState.UPGRADE_PHASE;

        emitGameEvent(GameEvents.UPGRADE_PHASE_STARTED, {
            wave: this.currentWave,
            pendingUpgrades: this.player.pendingUpgrades
        });

        if (this.player.pendingUpgrades > 0) {
            this.player.isUpgrading = true;
            emitGameEvent(GameEvents.SHOW_UPGRADE_MODAL, {
                upgradesRemaining: this.player.pendingUpgrades
            });
            return;
        }

        this.player.isUpgrading = false;
        this.startWaveStartingAnimation(currentTime);
    }

    private startWaveStartingAnimation(currentTime: number): void {
        if (this.engineState === EngineState.WAVE_STARTING_ANIMATION) {
            return;
        }

        this.engineState = EngineState.WAVE_STARTING_ANIMATION;
        this.waveStartingAnimationEndsAtMs = currentTime + this.waveTransitionAnimationDurationMs;

        emitGameEvent(GameEvents.WAVE_STARTING_ANIMATION_START, {
            wave: this.currentWave,
            durationMs: this.waveTransitionAnimationDurationMs
        });
    }

    private resumeWaveSpawning(currentTime: number): void {
        this.engineState = EngineState.WAVE_ACTIVE;
        this.lastSpawnTime = currentTime;

        emitGameEvent(GameEvents.WAVE_SPAWNING_RESUMED, {
            wave: this.currentWave
        });
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