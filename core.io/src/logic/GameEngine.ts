import { emitGameEvent, GameEvents, onGameEvent } from '../shared/EventBus';
import type { CardSelectedPayload, EnemyType, EntityStats, GameState, InputState, ProjectileFaction, WaveType } from '../shared/Types';
import { Entity } from './entities/Entity';
import { HostileEntity, type EnemyUpdateContext } from './entities/enemies/HostileEntity';
import { Projectile } from './entities/Projectile';
import { Player } from './entities/player/Player';
import { Enemy } from './entities/enemies/Enemy';
import { RangedEnemy } from './entities/enemies/RangedEnemy';
import { SentinelEnemy } from './entities/enemies/SentinelEnemy';
import { Anomaly } from './entities/enemies/Anomaly';
import { ARENA } from '../client/constants/GameConstants';
import { calculateCooldown, PLAYER_BASE_SHOT_COOLDOWN_SECONDS } from '../shared/CombatMath';
import { UpgradeManager } from './UpgradeManager';
import { MissionManager } from './MissionManager';
import {
    ANOMALY_BASE_CHANCE,
    ANOMALY_CHANCE_INCREMENT,
    ANOMALY_COOLDOWN_WAVES,
    ANOMALY_START_WAVE,
    ENEMY_STAT_MULTIPLIER_PER_WAVE,
    WAVE_SPAWN_INTERVAL_SECONDS,
    getEnemyFirstWave,
    getRandomWaveType,
    getWaveMilestone
} from './constants/WaveConfig';

enum EngineState {
    COLOR_SELECTION = 'COLOR_SELECTION',
    WAVE_ACTIVE = 'WAVE_ACTIVE',
    WAVE_CLEAR_ANIMATION = 'WAVE_CLEAR_ANIMATION',
    UPGRADE_PHASE = 'UPGRADE_PHASE',
    WAVE_STARTING_ANIMATION = 'WAVE_STARTING_ANIMATION',
    BOSS_FIGHT = 'BOSS_FIGHT',
}

export class GameEngine {
    private static readonly ENEMY_REGISTRY: Partial<Record<EnemyType, new (id: string, x: number, y: number, multiplier: number) => HostileEntity>> = {
        RANGED: RangedEnemy,
        SENTINEL: SentinelEnemy,
    };

    private player: Player;
    private enemies: HostileEntity[];
    private projectiles: Projectile[];
    private readonly arenaSize: { width: number; height: number };
    private readonly upgradeManager: UpgradeManager;
    private readonly missionManager: MissionManager;

    private readonly collisionMicroCooldownMs = 100;

    private readonly waveTransitionAnimationDurationMs = 1500;
    private readonly viewportSafeSpawnRadius = Math.max(1100, Math.hypot(1920 / 2, 1080 / 2) + 120);
    private readonly minimumSpawnDistance = 1100;

    private currentInput: InputState;
    private lastTick: number;
    private lastShotTime = 0;
    private lastSpawnTime = 0;
    private projectileIdCounter = 0;
    private enemyIdCounter = 0;
    private isRunning = false;
    private isPaused = false;
    private animationFrameRequestId: number | null = null;
    private readonly maxFrameDeltaSeconds = 0.05;
    private readonly eventUnsubscribers: Array<() => void> = [];

    private engineState: EngineState = EngineState.COLOR_SELECTION;
    private currentWave = 1;
    private currentWaveType: WaveType = 'CLEAR';
    private spawnQueue: EnemyType[] = [];
    private surviveWaveEndsAtMs = 0;
    private enemiesSpawnedThisWave = 0;
    private enemiesKilledThisWave = 0;
    private waveClearAnimationEndsAtMs = 0;
    private waveStartingAnimationEndsAtMs = 0;

    private readonly processedEnemyDeathIds = new Set<string>();

    private isBossFightActive = false;
    private currentArena: { x: number; y: number; width: number; height: number };
    private readonly BOSS_ARENA = { x: 1500, y: 1500, width: 2000, height: 2000 };

    private anomalySpawnCount = 0;
    private anomalyCurrentChance = ANOMALY_BASE_CHANCE;
    private anomalyCooldownWaves = 0;

    private totalEnemiesKilledInRun = 0;
    private totalAnomaliesMetInRun = 0;

    constructor() {
        this.upgradeManager = new UpgradeManager();
        this.missionManager = new MissionManager((rewardUpgrades) => {
            this.player.pendingUpgrades += rewardUpgrades;
        });

        this.arenaSize = { width: ARENA.width, height: ARENA.height };
        this.currentArena = { x: 0, y: 0, width: this.arenaSize.width, height: this.arenaSize.height };
        this.player = this.createPlayer('Jogador');
        this.enemies = [];
        this.projectiles = [];
        this.currentInput = {
            up: false,
            down: false,
            left: false,
            right: false,
            targetX: 0,
            targetY: 0,
            isShooting: false,
            autoFire: false,
            autoSpin: false,
        };

        const now = performance.now();
        this.lastTick = now;
        this.lastShotTime = now;
        this.lastSpawnTime = now;
        this.currentWaveType = 'CLEAR';
        const wave1Milestone = getWaveMilestone(1);
        this.initSpawnQueue(wave1Milestone, this.getCurrentWaveTotalToSpawn());

        this.setupListeners();
    }

    private setupListeners(): void {
        this.eventUnsubscribers.push(
            onGameEvent(GameEvents.PLAYER_INPUT, (input: InputState) => {
                this.currentInput = input;
            })
        );

        this.eventUnsubscribers.push(
            onGameEvent(GameEvents.SHOW_UPGRADE_MODAL, () => {
                this.handleUpgradeModalRequested();
            })
        );

        this.eventUnsubscribers.push(
            onGameEvent(GameEvents.CARD_SELECTED, (selection) => {
                this.handleCardSelected(selection);
            })
        );

        this.eventUnsubscribers.push(
            onGameEvent(GameEvents.START_RUN_WITH_COLOR, ({ colorHex }) => {
                this.player.applyColorBuff(colorHex);
                this.startGameWithColor(colorHex);
            })
        );

        this.eventUnsubscribers.push(
            onGameEvent(GameEvents.ENTITY_DESTROYED, (data: { id: string }) => {
                if (data.id === this.player.id) {
                    this.stop();
                    this.player.isUpgrading = false;
                    emitGameEvent(GameEvents.HIDE_UPGRADE_MODAL, undefined);
                    emitGameEvent(GameEvents.GAME_OVER, {
                        waveReached: this.currentWave,
                        enemiesKilled: this.totalEnemiesKilledInRun,
                        anomaliesMet: this.totalAnomaliesMetInRun,
                    });
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
                    xpDropped: enemy.xpDrop,
                    x: enemy.x,
                    y: enemy.y,
                    radius: enemy.radius
                });
                this.missionManager.onEnemyKilled(enemy.enemyType);
                this.totalEnemiesKilledInRun += 1;

                if (this.engineState === EngineState.WAVE_ACTIVE) {
                    this.enemiesKilledThisWave += 1;
                }
            })
        );
    }

    private createPlayer(name: string): Player {
        const centerX = this.arenaSize.width / 2;
        const centerY = this.arenaSize.height / 2;

        return new Player(
            'player_1',
            centerX,
            centerY,
            name
        );
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
        this.scheduleNextTick();
    }

    public stop(): void {
        this.isRunning = false;
        this.isPaused = false;

        if (this.animationFrameRequestId !== null) {
            cancelAnimationFrame(this.animationFrameRequestId);
            this.animationFrameRequestId = null;
        }
    }

    public destroy(): void {
        this.stop();
        this.player.destroy();

        for (const unsubscribe of this.eventUnsubscribers) {
            unsubscribe();
        }

        this.eventUnsubscribers.length = 0;
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

    public reset(playerName: string = 'Jogador'): void {
        this.player.destroy();
        this.player = this.createPlayer(playerName);

        this.enemies = [];
        this.projectiles = [];
        this.processedEnemyDeathIds.clear();
        this.arenaSize.width = ARENA.width;
        this.arenaSize.height = ARENA.height;
        emitGameEvent(GameEvents.ARENA_RESIZED, { width: this.arenaSize.width, height: this.arenaSize.height });

        const now = performance.now();
        this.lastTick = now;
        this.lastShotTime = now;
        this.lastSpawnTime = now;
        this.projectileIdCounter = 0;
        this.enemyIdCounter = 0;
        this.isPaused = false;

        this.engineState = EngineState.COLOR_SELECTION;
        this.currentWave = 1;
        this.currentWaveType = 'CLEAR';
        this.spawnQueue = [];
        this.surviveWaveEndsAtMs = 0;
        this.enemiesSpawnedThisWave = 0;
        this.enemiesKilledThisWave = 0;
        this.waveClearAnimationEndsAtMs = 0;
        this.waveStartingAnimationEndsAtMs = 0;
        const wave1Milestone = getWaveMilestone(1);
        this.initSpawnQueue(wave1Milestone, this.getCurrentWaveTotalToSpawn());
        this.missionManager.reset();
        this.player.isUpgrading = false;

        this.isBossFightActive = false;
        this.currentArena = { x: 0, y: 0, width: this.arenaSize.width, height: this.arenaSize.height };
        this.anomalySpawnCount = 0;
        this.anomalyCurrentChance = ANOMALY_BASE_CHANCE;
        this.anomalyCooldownWaves = 0;
        this.totalEnemiesKilledInRun = 0;
        this.totalAnomaliesMetInRun = 0;

        emitGameEvent(GameEvents.HIDE_UPGRADE_MODAL, undefined);
    }

    private scheduleNextTick(): void {
        this.animationFrameRequestId = requestAnimationFrame(this.tick);
    }

    private tick = (currentTimeMs: number): void => {
        if (!this.isRunning) {
            this.animationFrameRequestId = null;
            return;
        }

        if (this.isPaused) {
            this.lastTick = currentTimeMs;
            this.emitStateUpdate();
            this.scheduleNextTick();
            return;
        }

        const rawDt = (currentTimeMs - this.lastTick) / 1000;
        const dt = Math.min(this.maxFrameDeltaSeconds, Math.max(0, rawDt));
        this.lastTick = currentTimeMs;

        this.update(dt, currentTimeMs);
        this.emitStateUpdate();

        this.scheduleNextTick();
    };

    public startGameWithColor(colorHex: string): void {
        const now = performance.now();
        this.player.applyUpgradeColor(colorHex);
        this.engineState = EngineState.WAVE_ACTIVE;
        this.lastSpawnTime = now;
        this.lastTick = now;
        const milestone = getWaveMilestone(this.currentWave);
        if (this.currentWaveType === 'SURVIVE') {
            this.surviveWaveEndsAtMs = now + milestone.surviveDurationSeconds * 1000;
        }
        this.missionManager.roll(this.spawnQueue, this.currentWaveType, milestone, now);
    }

    private update(dt: number, currentTime: number): void {
        const playerStats = this.syncPlayerCoreStats();

        if (this.engineState === EngineState.COLOR_SELECTION) {
            this.player.updateRegeneration(dt, currentTime);
            this.updateProjectiles(dt);
            return;
        }

        const playerLockedForUpgrade = this.engineState === EngineState.UPGRADE_PHASE && this.player.isUpgrading;

        if (!playerLockedForUpgrade) {
            this.updatePlayerMovement(dt);
            this.tryPlayerShoot(currentTime, playerStats);
        }

        this.updateEnemies(dt, currentTime);

        this.player.updateRegeneration(dt, currentTime);
        for (const enemy of this.enemies) {
            enemy.updateRegeneration(dt, currentTime);
        }

        this.updateProjectiles(dt);

        if (this.engineState === EngineState.WAVE_ACTIVE) {
            this.trySpawnEnemies(currentTime);
        }

        this.missionManager.update(currentTime);
        this.checkCollisions(currentTime);
        this.advanceWaveState(currentTime);
    }

    private emitStateUpdate(): void {
        const exportState: GameState = {
            player: {
                id: this.player.id,
                x: this.player.x,
                y: this.player.y,
                health: this.player.health,
                isDead: this.player.health <= 0,
                radius: this.player.radius,
                color: this.player.color,
                name: this.player.name,
                stats: this.player.currentStats,
                aimAngle: this.player.spinAngle,
            },
            enemies: this.enemies.map((enemy) => enemy.toData()),
            projectiles: this.projectiles.map((projectile) => ({
                id: projectile.id,
                ownerId: projectile.ownerId,
                faction: projectile.faction,
                x: projectile.x,
                y: projectile.y,
                radius: projectile.radius
            })),
            arena: this.arenaSize,
            arenaOffset: { x: this.currentArena.x, y: this.currentArena.y },
            isBossFight: this.isBossFightActive,
            currentWave: this.currentWave,
            waveType: this.currentWaveType,
            remainingToKill: this.getRemainingToKill(),
            activeEnemyCount: this.enemies.length,
            surviveTimeRemainingSeconds: this.getSurviveTimeRemaining(this.lastTick),
            isPaused: this.isPaused,
            objective: this.missionManager.getObjectiveState(),
            isColorSelection: this.engineState === EngineState.COLOR_SELECTION,
            autoSpin: this.currentInput.autoSpin,
        };

        emitGameEvent(GameEvents.STATE_UPDATE, exportState);
    }

    private updatePlayerMovement(dt: number): void {
        const isInverted = this.isBossFightActive && (this.getActiveAnomaly()?.isInverted ?? false);
        this.player.update(this.currentInput, dt, isInverted);
        this.player.updatePhysics(dt);
        this.clampToArena(this.player);
    }

    private tryPlayerShoot(currentTime: number, playerStats: EntityStats): void {
        if (!this.currentInput.isShooting && !this.currentInput.autoFire) {
            return;
        }

        const timeSinceLastShot = (currentTime - this.lastShotTime) / 1000;
        const actualCooldown = calculateCooldown(PLAYER_BASE_SHOT_COOLDOWN_SECONDS, playerStats.reloadPoints);

        if (timeSinceLastShot < actualCooldown) {
            return;
        }

        let aimAngle: number;

        if (this.currentInput.autoSpin) {
            aimAngle = this.player.spinAngle;
        } else {
            const isInvertedShoot = this.isBossFightActive && (this.getActiveAnomaly()?.isInverted ?? false);
            const targetX = isInvertedShoot
                ? 2 * this.player.x - this.currentInput.targetX
                : this.currentInput.targetX;
            const targetY = isInvertedShoot
                ? 2 * this.player.y - this.currentInput.targetY
                : this.currentInput.targetY;

            const dx = targetX - this.player.x;
            const dy = targetY - this.player.y;
            const distance = Math.hypot(dx, dy);

            if (distance <= 0.0001) return;
            aimAngle = Math.atan2(dy, dx);
        }

        this.spawnProjectiles(this.player, 'player', aimAngle, playerStats);
        this.lastShotTime = currentTime;
    }

    private updateEnemies(dt: number, currentTime: number): void {
        for (const enemy of this.enemies) {
            const context: EnemyUpdateContext = {
                playerX: this.player.x,
                playerY: this.player.y,
                player: this.player,
                dt,
                currentTime,
                onShoot: (aimAngle) => this.spawnProjectiles(enemy, 'enemy', aimAngle, enemy.stats)
            };

            enemy.tick(context);

            for (const spawn of enemy.drainPendingSpawns()) {
                this.enemies.push(new Enemy(`enemy_${this.enemyIdCounter++}`, spawn.x, spawn.y, 0.25));
            }

            enemy.updatePhysics(dt);
            this.clampToArena(enemy);
        }
    }

    private getActiveAnomaly(): Anomaly | null {
        for (const e of this.enemies) {
            if (e instanceof Anomaly) return e;
        }
        return null;
    }

    private spawnProjectiles(
        shooter: Entity,
        faction: ProjectileFaction,
        aimAngle: number,
        sourceStats: EntityStats
    ): void {
        const spawns = shooter.getProjectileSpawns(aimAngle, sourceStats);
        for (const spawn of spawns) {
            this.createProjectile(
                shooter.id, faction,
                spawn.spawnX, spawn.spawnY,
                spawn.dirX, spawn.dirY,
                spawn.damage, spawn.penetration,
                spawn.speed, spawn.lifespan
            );
            emitGameEvent(GameEvents.PROJECTILE_FIRED, {
                shooterId: shooter.id,
                faction,
                x: spawn.spawnX,
                y: spawn.spawnY,
                angle: spawn.shotAngle,
                recoilStrength: spawn.recoilStrength
            });
        }
    }

    private updateProjectiles(dt: number): void {
        for (let projectileIndex = this.projectiles.length - 1; projectileIndex >= 0; projectileIndex--) {
            const projectile = this.projectiles[projectileIndex];
            projectile.update(dt);

            if (projectile.isExpired) {
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

    private initSpawnQueue(milestone: ReturnType<typeof getWaveMilestone>, total: number): void {
        this.spawnQueue = [];
        for (let i = 0; i < total; i++) {
            this.spawnQueue.push(this.rollEnemyType(milestone.enemyWeights));
        }
        for (let i = this.spawnQueue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.spawnQueue[i], this.spawnQueue[j]] = [this.spawnQueue[j], this.spawnQueue[i]];
        }
    }

    private trySpawnEnemies(currentTime: number): void {
        const milestone = getWaveMilestone(this.currentWave);
        const maxActive = this.currentWaveType === 'SURVIVE'
            ? milestone.maxActiveEnemiesSurvive
            : milestone.maxActiveEnemies;

        if (this.enemies.length >= maxActive) return;

        const timeSinceLastSpawn = (currentTime - this.lastSpawnTime) / 1000;
        if (timeSinceLastSpawn < WAVE_SPAWN_INTERVAL_SECONDS) return;

        if (this.currentWaveType === 'SURVIVE' && this.spawnQueue.length === 0) {
            this.initSpawnQueue(milestone, milestone.maxActiveEnemiesSurvive * 2);
        }

        if (this.spawnQueue.length === 0) return;

        const enemyType = this.spawnQueue.pop()!;
        this.spawnEnemy(enemyType);
        this.enemiesSpawnedThisWave += 1;
        this.lastSpawnTime = currentTime;
    }

    private spawnEnemy(enemyType: EnemyType): void {
        const multiplier = this.buildScaledMultiplier(enemyType);
        const spawnPoint = this.rollOffscreenSpawnPoint();
        const enemyId = `enemy_${this.enemyIdCounter++}`;

        const Constructor = GameEngine.ENEMY_REGISTRY[enemyType] ?? Enemy;
        this.enemies.push(new Constructor(enemyId, spawnPoint.x, spawnPoint.y, multiplier));
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

    private buildScaledMultiplier(enemyType: EnemyType): number {
        const enemyStartWave = getEnemyFirstWave(enemyType);
        const waveOffset = Math.max(0, this.currentWave - enemyStartWave);
        return 1 + (waveOffset * ENEMY_STAT_MULTIPLIER_PER_WAVE);
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
            projectilePenetration * Projectile.BASE_HEALTH,
            projectilePenetration,
            Projectile.RADIUS,
            projectileLifespan
        );

        this.projectiles.push(projectile);
    }

    private checkCollisions(currentTime: number): void {
        const onPlayerDamaged = () => this.missionManager.onPlayerDamaged();

        for (const enemy of this.enemies) {
            this.resolveEntityCollision(this.player, enemy, true, currentTime, onPlayerDamaged);
        }

        for (let i = 0; i < this.enemies.length; i++) {
            for (let j = i + 1; j < this.enemies.length; j++) {
                this.resolveEntityCollision(this.enemies[i], this.enemies[j], false, currentTime);
            }
        }

        this.resolveProjectileVsProjectileCollisions();
        this.resolveProjectileEntityCollisions(currentTime);

        for (const enemy of this.enemies) {
            enemy.resolveSpecialCollisions(
                this.player,
                this.projectiles,
                currentTime,
                () => this.missionManager.onPlayerDamaged(),
                (e) => this.clampToArena(e),
                (id) => {
                    const idx = this.projectiles.findIndex((p) => p.id === id);
                    if (idx >= 0) this.destroyProjectile(idx);
                }
            );
        }

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

                projectileA.exchangeDamageWith(projectileB);

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
                if (this.checkCircularCollision(projectile.x, projectile.y, projectile.radius, this.player.x, this.player.y, this.player.radius)) {
                    const shouldDestroy = projectile.handleCollisionWith(
                        this.player,
                        this.player.contactDamage,
                        currentTime,
                        () => this.missionManager.onPlayerDamaged()
                    );
                    if (shouldDestroy) {
                        this.destroyProjectile(projectileIndex);
                    }
                }
                continue;
            }

            for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
                const enemy = this.enemies[enemyIndex];
                if (!this.checkCircularCollision(projectile.x, projectile.y, projectile.radius, enemy.x, enemy.y, enemy.radius)) {
                    continue;
                }

                const shouldDestroy = projectile.handleCollisionWith(
                    enemy,
                    enemy.contactDamage,
                    currentTime,
                    () => {}
                );

                if (shouldDestroy) {
                    this.destroyProjectile(projectileIndex);
                    break;
                }
            }
        }
    }

    private resolveEntityCollision(entityA: Entity, entityB: Entity, applyDamage: boolean, currentTime: number, onEntityADamaged: () => void = () => {}): boolean {
        const radiusA = entityA.radius;
        const radiusB = entityB.radius;
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
        this.tryApplyBurstCollisionDamage(entityA, entityB, currentTime, onEntityADamaged);
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
        const impulseStrength = Entity.COLLISION_KNOCKBACK_IMPULSE + (overlap * Entity.COLLISION_KNOCKBACK_OVERLAP_BONUS);

        entityA.applyImpulse(-normalX * impulseStrength, -normalY * impulseStrength);
        entityB.applyImpulse(normalX * impulseStrength, normalY * impulseStrength);
    }

    private tryApplyBurstCollisionDamage(target: Entity, attacker: Entity, currentTime: number, onDamageTaken: () => void = () => {}): void {
        if (!target.canReceiveCollisionDamageFrom(attacker.id, currentTime, this.collisionMicroCooldownMs)) {
            return;
        }

        const flatDamage = attacker.contactDamage;
        if (flatDamage <= 0) {
            return;
        }

        target.takeDamage(flatDamage);
        target.registerCollisionDamageFrom(attacker.id, currentTime);
        onDamageTaken();
    }

    private isEnemyEntity(entity: Entity): entity is HostileEntity {
        return entity instanceof HostileEntity;
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


    private destroyProjectile(projectileIndex: number): void {
        const projectile = this.projectiles[projectileIndex];
        if (!projectile) {
            return;
        }

        emitGameEvent(GameEvents.PROJECTILE_DESTROYED, {
            faction: projectile.faction,
            x: projectile.x,
            y: projectile.y,
            radius: projectile.radius,
            color: projectile.faction === 'player' ? this.player.color : undefined,
        });

        this.projectiles.splice(projectileIndex, 1);
    }

    private advanceWaveState(currentTime: number): void {
        if (this.engineState === EngineState.BOSS_FIGHT) {
            const bossAlive = this.enemies.some(e => e instanceof Anomaly);
            if (!bossAlive) {
                this.endBossFight(currentTime);
            }
            return;
        }

        if (this.engineState === EngineState.WAVE_ACTIVE) {
            if (this.currentWaveType === 'SURVIVE') {
                this.tryEndSurviveWave(currentTime);
            } else {
                this.tryEnterWaveClearAnimation(currentTime);
            }
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

    private tryEnterWaveClearAnimation(currentTime: number): void {
        if (this.enemiesKilledThisWave < this.getCurrentWaveTotalToSpawn()) return;
        if (this.enemies.length > 0) return;
        this.triggerWaveClear(currentTime);
    }

    private tryEndSurviveWave(currentTime: number): void {
        if (currentTime < this.surviveWaveEndsAtMs) return;
        this.enemies = [];
        this.spawnQueue = [];
        this.triggerWaveClear(currentTime);
    }

    private triggerWaveClear(currentTime: number): void {
        const waveCleared = this.currentWave;
        const nextWave = waveCleared + 1;

        this.currentWave = nextWave;
        this.enemiesSpawnedThisWave = 0;
        this.enemiesKilledThisWave = 0;
        this.spawnQueue = [];

        emitGameEvent(GameEvents.WAVE_CLEARED, { waveCleared, nextWave });

        if (this.anomalyCooldownWaves > 0) {
            this.anomalyCooldownWaves -= 1;
        }

        if (waveCleared >= ANOMALY_START_WAVE && this.anomalyCooldownWaves === 0) {
            if (Math.random() < this.anomalyCurrentChance) {
                this.anomalyCurrentChance = ANOMALY_BASE_CHANCE;
                this.anomalyCooldownWaves = ANOMALY_COOLDOWN_WAVES;
                this.anomalySpawnCount += 1;
                this.enterBossFight();
                return;
            } else {
                this.anomalyCurrentChance += ANOMALY_CHANCE_INCREMENT;
            }
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

    private enterBossFight(): void {
        this.isBossFightActive = true;
        this.totalAnomaliesMetInRun += 1;
        this.currentArena = { ...this.BOSS_ARENA };

        this.player.x = this.BOSS_ARENA.x + this.BOSS_ARENA.width / 2;
        this.player.y = this.BOSS_ARENA.y + this.BOSS_ARENA.height / 2;
        this.player.knockbackVelocity = { x: 0, y: 0 };

        const boss = new Anomaly(
            'anomaly_boss',
            this.BOSS_ARENA.x + this.BOSS_ARENA.width / 2,
            this.BOSS_ARENA.y + 200,
            this.player.currentStats,
            this.anomalySpawnCount
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

        const milestone = getWaveMilestone(this.currentWave);
        this.currentWaveType = getRandomWaveType();

        if (this.currentWaveType === 'SURVIVE') {
            this.surviveWaveEndsAtMs = currentTime + milestone.surviveDurationSeconds * 1000;
            this.initSpawnQueue(milestone, milestone.maxActiveEnemiesSurvive * 2);
        } else {
            this.surviveWaveEndsAtMs = 0;
            this.initSpawnQueue(milestone, this.getCurrentWaveTotalToSpawn());
        }

        this.missionManager.roll(this.spawnQueue, this.currentWaveType, milestone, currentTime);

        emitGameEvent(GameEvents.WAVE_SPAWNING_RESUMED, {
            wave: this.currentWave
        });
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
        this.player.applyColorBuff(selection.colorHex);
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

    private getRemainingToKill(): number {
        if (this.currentWaveType === 'SURVIVE') return 0;
        return Math.max(0, this.getCurrentWaveTotalToSpawn() - this.enemiesKilledThisWave);
    }

    private getSurviveTimeRemaining(currentTimeMs: number): number {
        if (this.currentWaveType !== 'SURVIVE') return 0;
        return Math.max(0, (this.surviveWaveEndsAtMs - currentTimeMs) / 1000);
    }

    public getRunSummary(): { waveReached: number; enemiesKilled: number; anomaliesMet: number } {
        return {
            waveReached: this.currentWave,
            enemiesKilled: this.totalEnemiesKilledInRun,
            anomaliesMet: this.totalAnomaliesMetInRun,
        };
    }
}
