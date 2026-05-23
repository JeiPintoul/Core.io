import { emitGameEvent, GameEvents, onGameEvent } from '../shared/EventBus';
import { normalizeColorHex } from '../shared/ColorUtils';
import {
    ANOMALY_PROJECTILE_COLOR,
    PROJECTILE_VISUAL_IDS,
    type ProjectileVisualId
} from '../shared/ProjectileVisuals';
import {
    PLAYER_IDS,
    type CardSelectedPayload,
    type EntityStats,
    type GameState,
    type InputState,
    type PlayerId,
    type PlayerInputPayload,
    type ProjectileFaction,
    type RunConfiguration,
    type EnemyType
} from '../shared/Types';
import { Entity } from './entities/Entity';
import { HostileEntity, type EnemyUpdateContext } from './entities/enemies/HostileEntity';
import { Projectile } from './entities/Projectile';
import { Player } from './entities/player/Player';
import { Anomaly } from './entities/enemies/anomaly/Anomaly';
import { AnomalyDecoy } from './entities/enemies/anomaly/AnomalyDecoy';
import { DreadnoughtBoss } from './entities/boss/dreadnought/DreadnoughtBoss';
import { SentinelEnemy } from './entities/enemies/SentinelEnemy';
import { ARENA } from '../client/constants/GameConstants';
import { calculateCooldown, PLAYER_BASE_SHOT_COOLDOWN_SECONDS } from '../shared/CombatMath';
import { UpgradeManager } from './UpgradeManager';
import { MissionManager } from './MissionManager';
import {
    DEFAULT_RUN_CONFIGURATION,
    PLAYER_DEFAULT_COLOR_HEX,
    PLAYER_DEFAULT_COLORS,
    getDifficultyProfile,
    type DifficultyProfile
} from './constants/GameBalance';
import { EngineState } from './EngineState';
import { MathRng, type Rng } from './Rng';
import { EnemyFactory, type EnemyFactoryHost } from './spawn/EnemyFactory';
import { EncounterDirector, type EncounterDirectorHost } from './spawn/EncounterDirector';

export class GameEngine {
    private player: Player;
    private readonly additionalPlayers = new Map<PlayerId, Player>();
    private enemies: HostileEntity[] = [];
    private projectiles: Projectile[] = [];
    private readonly arenaSize: { width: number; height: number };
    private readonly upgradeManager: UpgradeManager;
    private readonly missionManager: MissionManager;
    private readonly factory: EnemyFactory;
    private readonly director: EncounterDirector;
    private readonly rng: Rng = new MathRng();

    private readonly collisionMicroCooldownMs = 100;

    private currentInputs: Record<PlayerId, InputState>;
    private lastTick: number;
    private lastShotTimes: Record<PlayerId, number> = { player_1: 0, player_2: 0, player_3: 0, player_4: 0 };
    private projectileIdCounter = 0;
    private isRunning = false;
    private isPaused = false;
    private pauseStartedAtMs = 0;
    private animationFrameRequestId: number | null = null;
    private readonly maxFrameDeltaSeconds = 0.05;
    private readonly eventUnsubscribers: Array<() => void> = [];

    private engineState: EngineState = EngineState.COLOR_SELECTION;
    private currentArena: { x: number; y: number; width: number; height: number };
    private debugGodModeInvincible = false;
    private debugGodModeEnabled = false;

    private readonly processedEnemyDeathIds = new Set<string>();

<<<<<<< HEAD
    private isBossFightActive = false;
    private currentArena: { x: number; y: number; width: number; height: number };
    private readonly BOSS_ARENA = { x: 1500, y: 1500, width: 2000, height: 2000 };
    private debugGodModeInvincible = false;
    private debugGodModeEnabled = false;

    private anomalySpawnCount = 0;
    private anomalyCurrentChance = ANOMALY_BASE_CHANCE;
    private anomalyCooldownWaves = 0;

=======
>>>>>>> main
    private totalEnemiesKilledInRun = 0;
    private totalAnomaliesMetInRun = 0;
    private runConfiguration: RunConfiguration = structuredClone(DEFAULT_RUN_CONFIGURATION);
    private upgradeSelectionQueue: PlayerId[] = [];
    private activeUpgradePlayerId: PlayerId | null = null;

    constructor() {
        this.upgradeManager = new UpgradeManager();
        this.missionManager = new MissionManager((rewardUpgrades) => {
            for (const player of this.getPlayers()) {
                player.pendingUpgrades += rewardUpgrades;
            }
        });

        this.arenaSize = { width: ARENA.width, height: ARENA.height };
        this.currentArena = { x: 0, y: 0, width: this.arenaSize.width, height: this.arenaSize.height };
        this.player = this.createPlayer('player_1', 'Jogador', 0, true, PLAYER_DEFAULT_COLORS.player_1);
        this.currentInputs = {
            player_1: this.createNeutralInputState(),
            player_2: this.createNeutralInputState(),
            player_3: this.createNeutralInputState(),
            player_4: this.createNeutralInputState(),
        };

        const factoryHost: EnemyFactoryHost = {
            getArenaSize: () => this.arenaSize,
            getPlayerAnchor: () => this.getPlayerAnchorPosition(),
            getPlayers: () => this.getPlayers(),
            getMainPlayer: () => this.player,
            getDifficultyProfile: () => this.getDifficultyProfile(),
            getCurrentWave: () => this.director.getCurrentWave(),
        };
        this.factory = new EnemyFactory(factoryHost, this.rng);
        this.director = new EncounterDirector(this.buildDirectorHost(), this.factory, this.rng);

        const now = performance.now();
        this.lastTick = now;
        this.lastShotTimes = { player_1: now, player_2: now, player_3: now, player_4: now };
        this.director.primeTimers(now);

        this.setupListeners();
    }

    private buildDirectorHost(): EncounterDirectorHost {
        return {
            getEnemies: () => this.enemies,
            setEnemies: (list) => { this.enemies = list; },
            addEnemy: (e) => { this.enemies.push(e); },

            setArena: (arena) => { this.currentArena = arena; },
            restoreMainArena: () => {
                this.currentArena = { x: 0, y: 0, width: this.arenaSize.width, height: this.arenaSize.height };
                const cx = this.arenaSize.width / 2;
                const cy = this.arenaSize.height / 2;
                this.positionPlayers(cx, cy);
            },

            getPlayers: () => this.getPlayers(),
            getPlayerById: (id) => this.getPlayerById(id),
            positionPlayers: (cx, cy) => this.positionPlayers(cx, cy),
            reviveDefeatedPlayers: () => this.reviveDefeatedPlayers(),
            reviveDefeatedPlayersForNextWave: () => this.reviveDefeatedPlayersForNextWave(),

            setEngineState: (s) => { this.engineState = s; },
            getEngineState: () => this.engineState,
            isUpgradeSelectionActive: () => this.activeUpgradePlayerId !== null,
            enterUpgradePhase: (now) => this.enterUpgradePhase(now),
            clearUpgradeSelectionState: () => this.clearUpgradeSelectionState(),

            missionStartBoss: (now) => this.missionManager.startBossMission(now),
            missionStartAnomaly: (now) => {
                this.totalAnomaliesMetInRun += 1;
                this.missionManager.startAnomalyMission(now);
            },
            missionBossDefeated: () => this.missionManager.onBossDefeated(),
            missionAnomalyDefeated: () => this.missionManager.onAnomalyDefeated(),
            missionRollWave: (queue, type, milestone, now) => this.missionManager.roll(queue, type, milestone, now),

            getDifficultySpawnScale: () => this.getDifficultyProfile().spawnScale,
            getDifficultyActiveEnemyScale: () => this.getDifficultyProfile().activeEnemyScale,
        };
    }

    private setupListeners(): void {
        this.eventUnsubscribers.push(
            onGameEvent(GameEvents.PLAYER_INPUT, ({ playerId, input }: PlayerInputPayload) => {
                this.currentInputs[playerId] = input;
            })
        );

        this.eventUnsubscribers.push(
            onGameEvent(GameEvents.RUN_CONFIG_CHANGED, (nextConfig: RunConfiguration) => {
                this.runConfiguration = structuredClone(nextConfig);
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
            onGameEvent(GameEvents.START_RUN_WITH_COLOR, ({ playerColors }) => {
                this.startGameWithColor(playerColors);
            })
        );

        this.eventUnsubscribers.push(
            onGameEvent(GameEvents.ENTITY_DESTROYED, (data: { id: string }) => {
                const destroyedPlayer = this.getPlayers().find((candidate) => candidate.id === data.id);
                if (destroyedPlayer) {
                    const hasAlivePlayer = this.getPlayers().some((candidate) => candidate.health > 0);
                    if (!hasAlivePlayer) {
                        this.stop();
                        this.clearUpgradeSelectionState();
                        emitGameEvent(GameEvents.HIDE_UPGRADE_MODAL, undefined);
                        emitGameEvent(GameEvents.GAME_OVER, {
                            waveReached: this.director.getCurrentWave(),
                            enemiesKilled: this.totalEnemiesKilledInRun,
                            anomaliesMet: this.totalAnomaliesMetInRun,
                        });
                    }
                    return;
                }

                const enemy = this.enemies.find((candidate) => candidate.id === data.id);
                if (!enemy) return;
                if (this.processedEnemyDeathIds.has(enemy.id)) return;

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
                this.director.notifyEnemyKilled();
            })
        );
    }

    private createNeutralInputState(): InputState {
        return {
            up: false, down: false, left: false, right: false,
            targetX: 0, targetY: 0,
            isShooting: false, autoFire: false, autoSpin: false,
        };
    }

    private createPlayer(playerId: PlayerId, name: string, spawnOffsetX: number, progressionEnabled: boolean, color: number): Player {
        const centerX = this.arenaSize.width / 2;
        const centerY = this.arenaSize.height / 2;
        return new Player(playerId, centerX + spawnOffsetX, centerY, name, color, progressionEnabled);
    }

    private getPlayers(): Player[] {
        const players: Player[] = [this.player];
        for (const playerId of PLAYER_IDS) {
            if (playerId === 'player_1') continue;
            const player = this.additionalPlayers.get(playerId);
            if (player) players.push(player);
        }
        return players;
    }

    private getPlayerById(playerId: PlayerId): Player | null {
        if (this.player.id === playerId) return this.player;
        return this.additionalPlayers.get(playerId) ?? null;
    }

    private getActivePlayerIds(): PlayerId[] {
        return PLAYER_IDS.slice(0, this.runConfiguration.playerCount) as PlayerId[];
    }

    private getPlayerSpawnOffset(index: number, totalPlayers: number): number {
        const spacing = 90;
        const centeredIndex = index - ((totalPlayers - 1) / 2);
        return centeredIndex * spacing;
    }

    private getDefaultPlayerColor(playerId: PlayerId): number {
        return PLAYER_DEFAULT_COLORS[playerId] ?? PLAYER_DEFAULT_COLORS.player_1;
    }

    private getDefaultPlayerColorHex(playerId: PlayerId): string {
        return PLAYER_DEFAULT_COLOR_HEX[playerId] ?? PLAYER_DEFAULT_COLOR_HEX.player_1;
    }

    private getNearestAlivePlayer(x: number, y: number): Player | null {
        const alivePlayers = this.getPlayers().filter((player) => player.health > 0);
        if (alivePlayers.length === 0) return null;

        let nearest = alivePlayers[0];
        let nearestDistance = Math.hypot(nearest.x - x, nearest.y - y);

        for (let i = 1; i < alivePlayers.length; i++) {
            const player = alivePlayers[i];
            const distance = Math.hypot(player.x - x, player.y - y);
            if (distance < nearestDistance) {
                nearest = player;
                nearestDistance = distance;
            }
        }
        return nearest;
    }

    private getPlayerAnchorPosition(): { x: number; y: number } {
        const alivePlayers = this.getPlayers().filter((player) => player.health > 0);
        if (alivePlayers.length === 0) return { x: this.player.x, y: this.player.y };
        if (alivePlayers.length === 1) return { x: alivePlayers[0].x, y: alivePlayers[0].y };

        const sum = alivePlayers.reduce(
            (acc, player) => { acc.x += player.x; acc.y += player.y; return acc; },
            { x: 0, y: 0 }
        );
        return { x: sum.x / alivePlayers.length, y: sum.y / alivePlayers.length };
    }

    private syncPlayerCoreStats(player: Player): EntityStats {
        const stats = player.currentStats;
        player.maxHealth = stats.maxHealth;
        player.speed = stats.movementSpeed;
        player.health = Math.min(player.health, player.maxHealth);
        return stats;
    }

    private setPlayersUpgradingState(isUpgrading: boolean): void {
        for (const player of this.getPlayers()) player.isUpgrading = isUpgrading;
    }

    private clearUpgradeSelectionState(): void {
        this.upgradeSelectionQueue = [];
        this.activeUpgradePlayerId = null;
        this.setPlayersUpgradingState(false);
    }

    public start(): void {
        if (this.isRunning) return;
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
        for (const player of this.getPlayers()) player.destroy();
        this.additionalPlayers.clear();
        for (const unsubscribe of this.eventUnsubscribers) unsubscribe();
        this.eventUnsubscribers.length = 0;
    }

    public toggleDebugGodMode(): boolean {
        this.debugGodModeEnabled = !this.debugGodModeEnabled;
        return this.debugGodModeEnabled;
    }
<<<<<<< HEAD

    public setDebugInvincibility(enabled: boolean): void {
        this.debugGodModeInvincible = enabled;
    }

    public debugIsInvincible(): boolean {
        return this.debugGodModeInvincible;
    }

    public debugHealPlayer(): void {
        this.player.health = this.player.maxHealth;
        this.emitStateUpdate();
    }

    public debugGrantRandomCard(): void {
        const options = this.upgradeManager.rollUpgradeOptions(this.player.level);
        const option = options[Math.floor(Math.random() * options.length)];
        this.player.applyStatModifiers(option.card.modifiers);
        this.player.applyColorBuff(option.colorHex);
        this.player.applyUpgradeColor(option.colorHex);
        this.syncPlayerCoreStats();
        this.emitStateUpdate();
    }

    public debugForceAdvanceWave(): void {
        const now = performance.now();

        if (this.engineState === EngineState.BOSS_FIGHT) {
            this.enemies = [];
            this.endBossFight(now);
            return;
        }

        this.enemies = [];
        this.spawnQueue = [];
        this.enemiesKilledThisWave = this.getCurrentWaveTotalToSpawn();
        this.triggerWaveClear(now);
    }

    public debugSpawnEnemy(): void {
        const milestone = getWaveMilestone(this.currentWave);
        const enemyType = this.rollEnemyType(milestone.enemyWeights);
        this.spawnEnemy(enemyType);
    }

    public debugSpawnBoss(): void {
        if (this.isBossFightActive) {
            return;
        }

        this.enterBossFight();
    }

    public debugLevelUpPlayer(): void {
        this.player.level += 1;
        this.player.pendingUpgrades += 1;
        this.player.xpToNextLevel = Math.floor(this.player.xpToNextLevel * 1.25);

        emitGameEvent(GameEvents.LEVEL_UP, { newLevel: this.player.level });
        emitGameEvent(GameEvents.XP_UPDATE, {
            currentXp: this.player.currentXp,
            requires: this.player.xpToNextLevel
        });
        this.emitStateUpdate();
    }

    public togglePause(): boolean {
        if (!this.isRunning) {
            return this.isPaused;
        }
=======
>>>>>>> main

    public setDebugInvincibility(enabled: boolean): void { this.debugGodModeInvincible = enabled; }
    public debugIsInvincible(): boolean { return this.debugGodModeInvincible; }

    public debugHealPlayer(): void {
        for (const player of this.getPlayers()) player.health = player.maxHealth;
        this.emitStateUpdate();
    }

    public debugGrantRandomCard(): void {
        for (const player of this.getPlayers()) {
            const options = this.upgradeManager.rollUpgradeOptions(player.level);
            const option = options[Math.floor(this.rng.random() * options.length)];
            player.applyStatModifiers(option.card.modifiers);
            player.applyUpgradeColorBuff(option.colorHex);
            player.applyUpgradeColor(option.colorHex);
            this.syncPlayerCoreStats(player);
        }
        this.emitStateUpdate();
    }

    public debugForceAdvanceWave(): void { this.director.debugForceAdvanceWave(performance.now()); }
    public debugSpawnEnemy(): void { this.director.debugSpawnEnemy(performance.now()); }
    public debugSpawnBoss(): void { this.director.debugSpawnBoss(performance.now()); }
    public debugSpawnAnomaly(): void { this.director.debugSpawnAnomaly(performance.now()); }

    public debugLevelUpPlayer(): void {
        for (const player of this.getPlayers()) {
            player.level += 1;
            player.pendingUpgrades += 1;
            player.xpToNextLevel = Math.floor(player.xpToNextLevel * 1.25);
        }
        emitGameEvent(GameEvents.LEVEL_UP, { newLevel: this.player.level });
        emitGameEvent(GameEvents.XP_UPDATE, {
            currentXp: this.player.currentXp,
            requires: this.player.xpToNextLevel
        });
        this.emitStateUpdate();
    }

    public togglePause(): boolean {
        if (!this.isRunning) return this.isPaused;
        this.isPaused = !this.isPaused;

        if (!this.isPaused) {
            const now = performance.now();
            const pausedDuration = now - this.pauseStartedAtMs;
            this.director.shiftPausedTimers(pausedDuration);
            this.missionManager.shiftActiveObjectiveTime(pausedDuration);
            this.pauseStartedAtMs = 0;
            this.lastTick = now;
        } else {
            this.pauseStartedAtMs = performance.now();
        }
        return this.isPaused;
    }

    public reset(playerName: string = 'Jogador', runConfiguration?: RunConfiguration): void {
        if (runConfiguration) this.runConfiguration = structuredClone(runConfiguration);
        this.runConfiguration.players.player_1.name = playerName;

        for (const player of this.getPlayers()) player.destroy();
        this.additionalPlayers.clear();

        const activePlayerIds = this.getActivePlayerIds();
        for (let index = 0; index < activePlayerIds.length; index++) {
            const playerId = activePlayerIds[index];
            const configuredName = this.runConfiguration.players[playerId]?.name ?? '';
            const fallbackName = playerId === 'player_1' ? playerName : `Jogador ${index + 1}`;
            const resolvedName = configuredName.trim() || fallbackName;
            const spawnOffset = this.getPlayerSpawnOffset(index, activePlayerIds.length);
            const player = this.createPlayer(playerId, resolvedName, spawnOffset, true, this.getDefaultPlayerColor(playerId));

            if (playerId === 'player_1') this.player = player;
            else this.additionalPlayers.set(playerId, player);
        }

        this.enemies = [];
        this.projectiles = [];
        this.processedEnemyDeathIds.clear();
        this.arenaSize.width = ARENA.width;
        this.arenaSize.height = ARENA.height;
        emitGameEvent(GameEvents.ARENA_RESIZED, { width: this.arenaSize.width, height: this.arenaSize.height });

        const now = performance.now();
        this.lastTick = now;
        this.lastShotTimes = { player_1: now, player_2: now, player_3: now, player_4: now };
        this.currentInputs = {
            player_1: this.createNeutralInputState(),
            player_2: this.createNeutralInputState(),
            player_3: this.createNeutralInputState(),
            player_4: this.createNeutralInputState(),
        };
        this.projectileIdCounter = 0;
        this.isPaused = false;
        this.pauseStartedAtMs = 0;

        this.engineState = EngineState.COLOR_SELECTION;
        this.currentArena = { x: 0, y: 0, width: this.arenaSize.width, height: this.arenaSize.height };
        this.director.reset();
        this.director.primeTimers(now);
        this.missionManager.reset();
        this.clearUpgradeSelectionState();

        this.totalEnemiesKilledInRun = 0;
        this.totalAnomaliesMetInRun = 0;

        emitGameEvent(GameEvents.HIDE_UPGRADE_MODAL, undefined);
    }

    private scheduleNextTick(): void {
        this.animationFrameRequestId = requestAnimationFrame(this.tick);
    }

    private tick = (currentTimeMs: number): void => {
        if (!this.isRunning) { this.animationFrameRequestId = null; return; }

        if (this.isPaused) {
            this.emitStateUpdate(this.pauseStartedAtMs);
            this.scheduleNextTick();
            return;
        }

        const rawDt = (currentTimeMs - this.lastTick) / 1000;
        const dt = Math.min(this.maxFrameDeltaSeconds, Math.max(0, rawDt));
        this.lastTick = currentTimeMs;

        this.update(dt, currentTimeMs);
        this.emitStateUpdate(currentTimeMs);
        this.scheduleNextTick();
    };

    public startGameWithColor(playerColors: Partial<Record<PlayerId, string>>): void {
        const now = performance.now();
        for (const player of this.getPlayers()) {
            const playerId = player.id as PlayerId;
            const fallbackColorHex = this.getDefaultPlayerColorHex(playerId);
            const selectedColorHex = normalizeColorHex(playerColors[playerId], fallbackColorHex);
            player.setPrimaryColorBuff(selectedColorHex);
            player.applyUpgradeColor(selectedColorHex);
        }
        this.lastTick = now;
        this.director.startRun(now);
    }

    private update(dt: number, currentTime: number): void {
        const playerStatsById = new Map<PlayerId, EntityStats>();
        for (const player of this.getPlayers()) {
            playerStatsById.set(player.id as PlayerId, this.syncPlayerCoreStats(player));
        }

        if (this.engineState === EngineState.COLOR_SELECTION) {
            for (const player of this.getPlayers()) player.updateRegeneration(dt, currentTime);
            this.updateProjectiles(dt);
            return;
        }

        const playerLockedForUpgrade = this.engineState === EngineState.UPGRADE_PHASE && this.activeUpgradePlayerId !== null;

        if (!playerLockedForUpgrade) {
            for (const player of this.getPlayers()) {
                if (player.health <= 0) continue;
                const playerId = player.id as PlayerId;
                const input = this.currentInputs[playerId];
                const playerStats = playerStatsById.get(playerId);
                if (!input || !playerStats) continue;
                this.updatePlayerMovement(player, input, dt);
                this.tryPlayerShoot(player, input, currentTime, playerStats);
            }
        }

        this.updateEnemies(dt, currentTime);

        for (const player of this.getPlayers()) player.updateRegeneration(dt, currentTime);
        for (const enemy of this.enemies) enemy.updateRegeneration(dt, currentTime);

        this.updateProjectiles(dt);

        this.director.tickSpawn(currentTime);

        this.missionManager.update(currentTime);
        this.checkCollisions(currentTime);
        this.director.tickBossExitPortal(currentTime);
        this.director.tickPhase(currentTime);
    }

    private emitStateUpdate(currentTimeMs: number = this.lastTick): void {
        const playersData = this.getPlayers().map((player) => ({
            id: player.id, x: player.x, y: player.y,
            health: player.health, isDead: player.health <= 0,
            radius: player.radius, color: player.color, name: player.name,
            stats: player.currentStats, aimAngle: player.aimAngle,
        }));

        const exportState: GameState = {
            player: playersData[0],
            players: playersData,
            enemies: this.enemies.map((enemy) => enemy.toData()),
            projectiles: this.projectiles.map((projectile) => ({
                id: projectile.id,
                ownerId: projectile.ownerId,
                faction: projectile.faction,
                x: projectile.x,
                y: projectile.y,
                radius: projectile.radius,
                color: this.getProjectileColor(projectile),
                visualId: projectile.visualId,
            })),
            arena: this.arenaSize,
            arenaOffset: { x: this.currentArena.x, y: this.currentArena.y },
            isBossFight: this.director.isBossFight(),
            isAnomalyEncounter: this.director.isAnomalyEncounter(),
            currentWave: this.director.getCurrentWave(),
            waveType: this.director.getCurrentWaveType(),
            remainingToKill: this.director.getRemainingToKill(),
            activeEnemyCount: this.enemies.length,
            surviveTimeRemainingSeconds: this.director.getSurviveTimeRemaining(currentTimeMs),
            isPaused: this.isPaused,
            objective: this.missionManager.getObjectiveState(),
            isColorSelection: this.engineState === EngineState.COLOR_SELECTION,
            autoSpin: this.currentInputs.player_1.autoSpin,
            isCoop: playersData.length > 1,
            bossExitPortal: this.director.isBossExitPortal() ? this.director.getBossExitPortal() : null,
        };

        emitGameEvent(GameEvents.STATE_UPDATE, exportState);
    }

    private updatePlayerMovement(player: Player, input: InputState, dt: number): void {
        const isInverted = this.director.isAnomalyEncounter() && (this.director.getActiveAnomalyFor(player)?.isInverted ?? false);
        player.update(input, dt, isInverted);
        player.updatePhysics(dt);
        this.clampToArena(player);
    }

    private tryPlayerShoot(player: Player, input: InputState, currentTime: number, playerStats: EntityStats): void {
        if (!input.isShooting && !input.autoFire) return;

        const playerId = player.id as PlayerId;
        const timeSinceLastShot = (currentTime - this.lastShotTimes[playerId]) / 1000;
        const actualCooldown = calculateCooldown(PLAYER_BASE_SHOT_COOLDOWN_SECONDS, playerStats.reloadPoints);
        if (timeSinceLastShot < actualCooldown) return;

        const aimAngle = Number.isFinite(player.aimAngle) ? player.aimAngle : 0;
        this.spawnProjectiles(player, 'player', aimAngle, playerStats);
        this.lastShotTimes[playerId] = currentTime;
    }

    private updateEnemies(dt: number, currentTime: number): void {
        const fallbackTarget = this.getNearestAlivePlayer(this.player.x, this.player.y) ?? this.getPlayers()[0] ?? this.player;

        for (const enemy of this.enemies) {
            const targetPlayer = this.resolveEnemyTarget(enemy, fallbackTarget);
            const context: EnemyUpdateContext = {
                playerX: targetPlayer.x,
                playerY: targetPlayer.y,
                player: targetPlayer,
                dt,
                currentTime,
                onShoot: (aimAngle) => this.spawnProjectiles(enemy, 'enemy', aimAngle, enemy.stats),
                countEnemiesByType: (enemyType, ownerEnemyId) => this.director.countEnemiesByType(enemyType, ownerEnemyId)
            };

            enemy.tick(context);

            for (const spawn of enemy.drainPendingSpawns()) {
                this.director.spawnEnemyAt(
                    spawn.enemyType ?? 'KAMIKAZE',
                    spawn.x,
                    spawn.y,
                    spawn.multiplier ?? 0.25,
                    {
                        orbitSlot: spawn.orbitSlot,
                        orbitTotal: spawn.orbitTotal,
                        orbitRadius: spawn.orbitRadius,
                        ownerEnemyId: spawn.ownerEnemyId,
                        assignedPlayerId: spawn.assignedPlayerId,
                        mirrorStats: spawn.mirrorStats,
                        xpDrop: spawn.xpDrop,
                        spawnGraceMs: spawn.spawnGraceMs,
                        spawnedAtMs: currentTime,
                    }
                );
            }

            enemy.updatePhysics(dt);
            this.clampToArena(enemy);
        }

        this.director.applyAnomalyCleanup();
    }

    private resolveEnemyTarget(enemy: HostileEntity, fallback: Player): Player {
        const assignedId =
            enemy instanceof Anomaly ? enemy.assignedPlayerId :
            enemy instanceof AnomalyDecoy ? enemy.assignedPlayerId : null;

        if (assignedId) {
            const assigned = this.getPlayerById(assignedId);
            if (assigned && assigned.health > 0) return assigned;
        }
        return this.getNearestAlivePlayer(enemy.x, enemy.y) ?? fallback;
    }

    private spawnProjectiles(shooter: Entity, faction: ProjectileFaction, aimAngle: number, sourceStats: EntityStats): void {
        const spawns = shooter.getProjectileSpawns(aimAngle, sourceStats);
        for (const spawn of spawns) {
            this.createProjectile(
                shooter.id, faction,
                spawn.spawnX, spawn.spawnY,
                spawn.dirX, spawn.dirY,
                spawn.damage, spawn.penetration,
                spawn.speed, spawn.lifespan,
                this.getProjectileColorForShooter(shooter, faction),
                this.getProjectileVisualForShooter(shooter, faction)
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

            if (projectile.isExpired) { this.destroyProjectile(projectileIndex); continue; }

            const outsideArena =
                projectile.x < this.currentArena.x ||
                projectile.x > this.currentArena.x + this.currentArena.width ||
                projectile.y < this.currentArena.y ||
                projectile.y > this.currentArena.y + this.currentArena.height;

            if (outsideArena) this.destroyProjectile(projectileIndex);
        }
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
        projectileLifespan: number,
        projectileColor?: number,
        projectileVisualId?: ProjectileVisualId
    ): void {
        const velocityX = dirX * projectileSpeed;
        const velocityY = dirY * projectileSpeed;

        const projectile = new Projectile(
            `proj_${this.projectileIdCounter++}`,
            ownerId, faction,
            originX, originY,
            velocityX, velocityY,
            projectileDamage,
            projectilePenetration * Projectile.BASE_HEALTH,
            projectilePenetration,
            Projectile.RADIUS,
            projectileLifespan,
            projectileColor,
            projectileVisualId
        );
        this.projectiles.push(projectile);
    }

    private checkCollisions(currentTime: number): void {
        const onPlayerDamaged = () => this.missionManager.onPlayerDamaged();
        const alivePlayers = this.getPlayers().filter((player) => player.health > 0);

        for (const player of alivePlayers) {
            for (const enemy of this.enemies) {
                this.resolveEntityCollision(player, enemy, true, currentTime, onPlayerDamaged);
            }
        }

        for (let i = 0; i < alivePlayers.length; i++) {
            for (let j = i + 1; j < alivePlayers.length; j++) {
                this.resolveEntityCollision(alivePlayers[i], alivePlayers[j], true, currentTime);
            }
        }

        for (let i = 0; i < this.enemies.length; i++) {
            for (let j = i + 1; j < this.enemies.length; j++) {
                this.resolveEntityCollision(this.enemies[i], this.enemies[j], false, currentTime);
            }
        }

        this.resolveProjectileVsProjectileCollisions();
        this.resolveProjectileEntityCollisions(currentTime);

        for (const enemy of this.enemies) {
            const targetPlayer = this.getNearestAlivePlayer(enemy.x, enemy.y) ?? this.player;
            enemy.resolveSpecialCollisions(
                targetPlayer,
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
            if (destroyedIndices.has(i)) continue;
            const projectileA = this.projectiles[i];

            for (let j = i - 1; j >= 0; j--) {
                if (destroyedIndices.has(j)) continue;
                const projectileB = this.projectiles[j];
                if (projectileA.faction === projectileB.faction) continue;

                if (!this.checkCircularCollision(projectileA.x, projectileA.y, projectileA.radius, projectileB.x, projectileB.y, projectileB.radius)) continue;

                projectileA.exchangeDamageWith(projectileB);
                if (projectileA.health <= 0) destroyedIndices.add(i);
                if (projectileB.health <= 0) destroyedIndices.add(j);
                if (destroyedIndices.has(i)) break;
            }
        }

        const indicesToDestroy = Array.from(destroyedIndices).sort((a, b) => b - a);
        for (const projectileIndex of indicesToDestroy) this.destroyProjectile(projectileIndex);
    }

    private resolveProjectileEntityCollisions(currentTime: number): void {
        for (let projectileIndex = this.projectiles.length - 1; projectileIndex >= 0; projectileIndex--) {
            const projectile = this.projectiles[projectileIndex];

            if (projectile.faction === 'enemy') {
<<<<<<< HEAD
                if (this.checkCircularCollision(projectile.x, projectile.y, projectile.radius, this.player.x, this.player.y, this.player.radius)) {
                    if (!this.debugGodModeInvincible) {
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
=======
                const alivePlayers = this.getPlayers().filter((player) => player.health > 0);
                for (const player of alivePlayers) {
                    if (!this.checkCircularCollision(projectile.x, projectile.y, projectile.radius, player.x, player.y, player.radius)) continue;

                    if (this.debugGodModeInvincible) {
                        this.destroyProjectile(projectileIndex);
                        break;
                    }

                    const shouldDestroy = projectile.handleCollisionWith(
                        player, player.contactDamage, currentTime,
                        () => this.missionManager.onPlayerDamaged()
                    );
                    if (shouldDestroy) { this.destroyProjectile(projectileIndex); break; }
>>>>>>> main
                }
                continue;
            }

            for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
                const enemy = this.enemies[enemyIndex];
                if (!this.checkCircularCollision(projectile.x, projectile.y, projectile.radius, enemy.x, enemy.y, enemy.radius)) continue;

                const shouldDestroy = projectile.handleCollisionWith(enemy, enemy.contactDamage, currentTime, () => {});
                this.removeEnemyTypes(enemy.onProjectileHit(currentTime));

                if (shouldDestroy) { this.destroyProjectile(projectileIndex); break; }
            }
        }
    }

    private removeEnemyTypes(enemyTypes: EnemyType[]): void {
        if (enemyTypes.length === 0) return;
        const typesToRemove = new Set(enemyTypes);
        this.enemies = this.enemies.filter((enemy) => !typesToRemove.has(enemy.enemyType));
    }

    private resolveEntityCollision(entityA: Entity, entityB: Entity, applyDamage: boolean, currentTime: number, onEntityADamaged: () => void = () => {}): boolean {
        if (this.isOwnerSpawnCollisionGraceActive(entityA, entityB, currentTime)) return false;

        const radiusA = entityA.radius;
        const radiusB = entityB.radius;
        const dx = entityB.x - entityA.x;
        const dy = entityB.y - entityA.y;
        const distance = Math.hypot(dx, dy);
        const minDistance = radiusA + radiusB;
        if (distance >= minDistance) return false;

        const normalX = distance === 0 ? 1 : dx / distance;
        const normalY = distance === 0 ? 0 : dy / distance;
        const overlap = minDistance - distance;

        this.applyPositionalCorrection(entityA, entityB, normalX, normalY, overlap);

        if (this.isSameFaction(entityA, entityB) || !applyDamage) return true;

        this.applyCollisionImpulse(entityA, entityB, normalX, normalY, overlap);
        this.tryApplyBurstCollisionDamage(entityA, entityB, currentTime, onEntityADamaged);
        this.tryApplyBurstCollisionDamage(entityB, entityA, currentTime);
        return true;
    }

    private isOwnerSpawnCollisionGraceActive(entityA: Entity, entityB: Entity, currentTime: number): boolean {
        if (entityA instanceof HostileEntity && entityA.ownerEnemyId === entityB.id && currentTime < entityA.spawnCollisionGraceEndsAtMs) return true;
        if (entityB instanceof HostileEntity && entityB.ownerEnemyId === entityA.id && currentTime < entityB.spawnCollisionGraceEndsAtMs) return true;
        return false;
    }

    private applyPositionalCorrection(entityA: Entity, entityB: Entity, normalX: number, normalY: number, overlap: number): void {
        const gentlePushDistance = overlap / 2;
        entityA.x -= normalX * gentlePushDistance;
        entityA.y -= normalY * gentlePushDistance;
        entityB.x += normalX * gentlePushDistance;
        entityB.y += normalY * gentlePushDistance;
        this.clampToArena(entityA);
        this.clampToArena(entityB);
    }

    private applyCollisionImpulse(entityA: Entity, entityB: Entity, normalX: number, normalY: number, overlap: number): void {
        const impulseStrength = Entity.COLLISION_KNOCKBACK_IMPULSE + (overlap * Entity.COLLISION_KNOCKBACK_OVERLAP_BONUS);
        entityA.applyImpulse(-normalX * impulseStrength, -normalY * impulseStrength);
        entityB.applyImpulse(normalX * impulseStrength, normalY * impulseStrength);
    }

    private tryApplyBurstCollisionDamage(target: Entity, attacker: Entity, currentTime: number, onDamageTaken: () => void = () => {}): void {
        if (!target.canReceiveCollisionDamageFrom(attacker.id, currentTime, this.collisionMicroCooldownMs)) return;
        if (this.debugGodModeInvincible && target instanceof Player) return;

        if (this.debugGodModeInvincible && target instanceof Player) {
            return;
        }

        const flatDamage = attacker.contactDamage;
        if (flatDamage <= 0) return;

        target.takeDamage(flatDamage);
        target.registerCollisionDamageFrom(attacker.id, currentTime);
        onDamageTaken();
    }

    private isSameFaction(entityA: Entity, entityB: Entity): boolean {
        const bothPlayers = entityA instanceof Player && entityB instanceof Player;
        const bothEnemies = entityA instanceof HostileEntity && entityB instanceof HostileEntity;
        return bothPlayers || bothEnemies;
    }

    private clampToArena(entity: Entity): void {
        entity.x = Math.max(this.currentArena.x, Math.min(entity.x, this.currentArena.x + this.currentArena.width));
        entity.y = Math.max(this.currentArena.y, Math.min(entity.y, this.currentArena.y + this.currentArena.height));
    }

    private getProjectileColor(projectile: Projectile): number | undefined {
        if (projectile.color !== undefined) return projectile.color;
        if (projectile.faction !== 'player') return undefined;
        const owner = this.getPlayers().find((player) => player.id === projectile.ownerId);
        return owner?.color ?? this.player.color;
    }

    private getProjectileColorForShooter(shooter: Entity, faction: ProjectileFaction): number | undefined {
        if (faction === 'enemy' && (shooter instanceof Anomaly || shooter instanceof AnomalyDecoy)) {
            return ANOMALY_PROJECTILE_COLOR;
        }

        if (faction === 'player' && shooter instanceof Player) {
            return shooter.color;
        }

        return undefined;
    }

    private destroyProjectile(projectileIndex: number): void {
        const projectile = this.projectiles[projectileIndex];
        if (!projectile) return;

        emitGameEvent(GameEvents.PROJECTILE_DESTROYED, {
            faction: projectile.faction,
            x: projectile.x,
            y: projectile.y,
            radius: projectile.radius,
            color: this.getProjectileColor(projectile),
            visualId: projectile.visualId,
        });
        this.projectiles.splice(projectileIndex, 1);
    }

    private getProjectileVisualForShooter(shooter: Entity, faction: ProjectileFaction): ProjectileVisualId | undefined {
        if (faction !== 'enemy') return undefined;
        if (shooter instanceof DreadnoughtBoss) return PROJECTILE_VISUAL_IDS.DREADNOUGHT;
        if (shooter instanceof Anomaly || shooter instanceof AnomalyDecoy) return PROJECTILE_VISUAL_IDS.ANOMALY;
        if (shooter instanceof SentinelEnemy) return PROJECTILE_VISUAL_IDS.SENTINEL;
        return undefined;
    }

    private checkCircularCollision(ax: number, ay: number, aRadius: number, bx: number, by: number, bRadius: number): boolean {
        return Math.hypot(ax - bx, ay - by) < (aRadius + bRadius);
    }

    private enterUpgradePhase(currentTime: number): void {
        this.engineState = EngineState.UPGRADE_PHASE;
        this.clearUpgradeSelectionState();

        const playersWithPendingUpgrades = this.getPlayers().filter((c) => c.pendingUpgrades > 0);
        const totalPendingUpgrades = playersWithPendingUpgrades.reduce((t, c) => t + c.pendingUpgrades, 0);

        emitGameEvent(GameEvents.UPGRADE_PHASE_STARTED, {
            wave: this.director.getCurrentWave(),
            pendingUpgrades: totalPendingUpgrades
        });

        if (playersWithPendingUpgrades.length === 0) {
            if (this.director.isBossExitPortal()) return;
            this.director.startWaveStartingAnimation(currentTime);
            return;
        }

        this.upgradeSelectionQueue = playersWithPendingUpgrades.map((c) => c.id as PlayerId);
        this.advanceUpgradeSelection();
    }

    private handleUpgradeModalRequested(): void {
        queueMicrotask(() => {
            if (this.engineState !== EngineState.UPGRADE_PHASE || !this.activeUpgradePlayerId) return;
            const activePlayer = this.getPlayerById(this.activeUpgradePlayerId);
            if (!activePlayer || activePlayer.pendingUpgrades <= 0) { this.advanceUpgradeSelection(); return; }
            this.emitUpgradeOptions(this.activeUpgradePlayerId, activePlayer.pendingUpgrades, activePlayer.level);
        });
    }

    private handleCardSelected(selection: CardSelectedPayload): void {
        if (!this.activeUpgradePlayerId || selection.playerId !== this.activeUpgradePlayerId) return;
        const activePlayer = this.getPlayerById(selection.playerId);
        if (!activePlayer || activePlayer.pendingUpgrades <= 0) { this.advanceUpgradeSelection(); return; }

        const selectedCard = this.upgradeManager.getCardById(selection.cardId);
        if (!selectedCard) return;

        const colorHex = normalizeColorHex(selection.colorHex, '#4488ff');

        activePlayer.applyStatModifiers(selectedCard.modifiers);
        activePlayer.applyUpgradeColorBuff(colorHex);
        activePlayer.applyUpgradeColor(colorHex);
        activePlayer.consumePendingUpgrade();
        this.syncPlayerCoreStats(activePlayer);

        if (activePlayer.pendingUpgrades > 0) {
            this.emitUpgradeOptions(selection.playerId, activePlayer.pendingUpgrades, activePlayer.level);
            return;
        }
        this.advanceUpgradeSelection();
    }

    private advanceUpgradeSelection(): void {
        while (this.upgradeSelectionQueue.length > 0) {
            const nextPlayerId = this.upgradeSelectionQueue.shift();
            if (!nextPlayerId) continue;
            const nextPlayer = this.getPlayerById(nextPlayerId);
            if (!nextPlayer || nextPlayer.pendingUpgrades <= 0) continue;

            this.activeUpgradePlayerId = nextPlayerId;
            this.setPlayersUpgradingState(true);
            emitGameEvent(GameEvents.SHOW_UPGRADE_MODAL, {
                playerId: nextPlayerId,
                upgradesRemaining: nextPlayer.pendingUpgrades
            });
            return;
        }

        this.clearUpgradeSelectionState();
        emitGameEvent(GameEvents.HIDE_UPGRADE_MODAL, undefined);
    }

    private emitUpgradeOptions(playerId: PlayerId, upgradesRemaining: number, playerLevel: number): void {
        const options = this.upgradeManager.rollUpgradeOptions(playerLevel);
        emitGameEvent(GameEvents.UPDATE_UPGRADE_MODAL, { playerId, upgradesRemaining, options });
    }

    private reviveDefeatedPlayers(): void {
        for (const player of this.getPlayers()) {
            if (player.health > 0) continue;
            this.syncPlayerCoreStats(player);
            player.health = player.maxHealth;
            player.knockbackVelocity = { x: 0, y: 0 };
            player.damageTimers.clear();
        }
    }

    private positionPlayers(centerX: number, centerY: number): void {
        const players = this.getPlayers();
        for (let i = 0; i < players.length; i++) {
            const player = players[i];
            player.x = centerX + this.getPlayerSpawnOffset(i, players.length);
            player.y = centerY;
            player.knockbackVelocity = { x: 0, y: 0 };
            this.clampToArena(player);
        }
    }

    private reviveDefeatedPlayersForNextWave(): void {
        const players = this.getPlayers();
        if (players.length <= 1) return;

        const alivePlayers = players.filter((player) => player.health > 0);
        const fallbackAnchor = players[0];
        const anchor = alivePlayers[0] ?? fallbackAnchor;
        const anchorX = anchor?.x ?? this.arenaSize.width / 2;
        const anchorY = anchor?.y ?? this.arenaSize.height / 2;

        for (let i = 0; i < players.length; i++) {
            const player = players[i];
            if (player.health > 0) continue;
            this.syncPlayerCoreStats(player);
            player.health = player.maxHealth;
            player.x = anchorX + this.getPlayerSpawnOffset(i, players.length);
            player.y = anchorY;
            this.clampToArena(player);
            player.knockbackVelocity = { x: 0, y: 0 };
            player.damageTimers.clear();
        }
    }

    private getDifficultyProfile(): DifficultyProfile {
        return getDifficultyProfile(this.getPlayers().length);
    }

    public getRunSummary(): { waveReached: number; enemiesKilled: number; anomaliesMet: number } {
        return {
            waveReached: this.director.getCurrentWave(),
            enemiesKilled: this.totalEnemiesKilledInRun,
            anomaliesMet: this.totalAnomaliesMetInRun,
        };
    }
}
