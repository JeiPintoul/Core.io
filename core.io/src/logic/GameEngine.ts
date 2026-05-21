import { emitGameEvent, GameEvents, onGameEvent } from '../shared/EventBus';
import { normalizeColorHex } from '../shared/ColorUtils';
import {
    PLAYER_IDS,
    type CardSelectedPayload,
    type EnemyType,
    type EntityStats,
    type GameState,
    type InputState,
    type PlayerId,
    type PlayerInputPayload,
    type ProjectileFaction,
    type RunConfiguration,
    type WaveType
} from '../shared/Types';
import { Entity } from './entities/Entity';
import { HostileEntity, type EnemyUpdateContext } from './entities/enemies/HostileEntity';
import { Projectile } from './entities/Projectile';
import { Player } from './entities/player/Player';
import { Enemy } from './entities/enemies/Enemy';
import { RangedEnemy } from './entities/enemies/RangedEnemy';
import { SentinelEnemy } from './entities/enemies/SentinelEnemy';
import { SkirmisherEnemy } from './entities/enemies/SkirmisherEnemy';
import { BruteEnemy } from './entities/enemies/BruteEnemy';
import { Anomaly, type AnomalyAbilityCtor } from './entities/enemies/anomaly/Anomaly';
import { AnomalyDecoy } from './entities/enemies/anomaly/AnomalyDecoy';
import { DreadnoughtBoss, type BossCoopScaling } from './entities/boss/dreadnought/DreadnoughtBoss';
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
    type BossKind,
    type BossWaveRule,
    getBossWaveRule,
    getEnemyFirstWave,
    getRandomWaveType,
    getWaveMilestone
} from './constants/WaveConfig';
import {
    DEFAULT_RUN_CONFIGURATION,
    PLAYER_DEFAULT_COLOR_HEX,
    PLAYER_DEFAULT_COLORS,
    getDifficultyProfile,
    type DifficultyProfile
} from './constants/GameBalance';

enum EngineState {
    COLOR_SELECTION = 'COLOR_SELECTION',
    WAVE_ACTIVE = 'WAVE_ACTIVE',
    WAVE_CLEAR_ANIMATION = 'WAVE_CLEAR_ANIMATION',
    UPGRADE_PHASE = 'UPGRADE_PHASE',
    WAVE_STARTING_ANIMATION = 'WAVE_STARTING_ANIMATION',
    BOSS_FIGHT = 'BOSS_FIGHT',
    ANOMALY_ENCOUNTER = 'ANOMALY_ENCOUNTER',
}

export class GameEngine {
    private player: Player;
    private readonly additionalPlayers = new Map<PlayerId, Player>();
    private enemies: HostileEntity[];
    private projectiles: Projectile[];
    private readonly arenaSize: { width: number; height: number };
    private readonly upgradeManager: UpgradeManager;
    private readonly missionManager: MissionManager;

    private readonly collisionMicroCooldownMs = 100;

    private readonly waveTransitionAnimationDurationMs = 1500;
    private readonly viewportSafeSpawnRadius = Math.max(1100, Math.hypot(1920 / 2, 1080 / 2) + 120);
    private readonly minimumSpawnDistance = 1100;

    private currentInputs: Record<PlayerId, InputState>;
    private lastTick: number;
    private lastShotTimes: Record<PlayerId, number> = { player_1: 0, player_2: 0, player_3: 0, player_4: 0 };
    private lastSpawnTime = 0;
    private projectileIdCounter = 0;
    private enemyIdCounter = 0;
    private isRunning = false;
    private isPaused = false;
    private pauseStartedAtMs = 0;
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
    private isAnomalyEncounterActive = false;
    private activeBossWaveRule: BossWaveRule | null = null;
    private currentArena: { x: number; y: number; width: number; height: number };
    // Shared compact arena used by both boss fights and anomaly encounters.
    private readonly ENCOUNTER_ARENA = { x: 1500, y: 1500, width: 2000, height: 2000 };
    private debugGodModeInvincible = false;
    private debugGodModeEnabled = false;

    private anomalySpawnCount = 0;
    private anomalyCurrentChance = ANOMALY_BASE_CHANCE;
    private anomalyCooldownWaves = 0;
    private bossEncounterCount = 0;

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
        this.enemies = [];
        this.projectiles = [];
        this.currentInputs = {
            player_1: this.createNeutralInputState(),
            player_2: this.createNeutralInputState(),
            player_3: this.createNeutralInputState(),
            player_4: this.createNeutralInputState(),
        };

        const now = performance.now();
        this.lastTick = now;
        this.lastShotTimes = { player_1: now, player_2: now, player_3: now, player_4: now };
        this.lastSpawnTime = now;
        this.currentWaveType = 'CLEAR';
        const wave1Milestone = getWaveMilestone(1);
        this.initSpawnQueue(wave1Milestone, this.getCurrentWaveTotalToSpawn());

        this.setupListeners();
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
                            waveReached: this.currentWave,
                            enemiesKilled: this.totalEnemiesKilledInRun,
                            anomaliesMet: this.totalAnomaliesMetInRun,
                        });
                    }
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

    private createNeutralInputState(): InputState {
        return {
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
    }

    private createPlayer(playerId: PlayerId, name: string, spawnOffsetX: number, progressionEnabled: boolean, color: number): Player {
        const centerX = this.arenaSize.width / 2;
        const centerY = this.arenaSize.height / 2;

        return new Player(
            playerId,
            centerX + spawnOffsetX,
            centerY,
            name,
            color,
            progressionEnabled
        );
    }

    private getPlayers(): Player[] {
        const players: Player[] = [this.player];
        for (const playerId of PLAYER_IDS) {
            if (playerId === 'player_1') {
                continue;
            }

            const player = this.additionalPlayers.get(playerId);
            if (player) {
                players.push(player);
            }
        }

        return players;
    }

    private getPlayerById(playerId: PlayerId): Player | null {
        if (this.player.id === playerId) {
            return this.player;
        }

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
        if (alivePlayers.length === 0) {
            return null;
        }

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
        if (alivePlayers.length === 0) {
            return { x: this.player.x, y: this.player.y };
        }

        if (alivePlayers.length === 1) {
            return { x: alivePlayers[0].x, y: alivePlayers[0].y };
        }

        const sum = alivePlayers.reduce(
            (acc, player) => {
                acc.x += player.x;
                acc.y += player.y;
                return acc;
            },
            { x: 0, y: 0 }
        );

        return {
            x: sum.x / alivePlayers.length,
            y: sum.y / alivePlayers.length,
        };
    }

    private syncPlayerCoreStats(player: Player): EntityStats {
        const stats = player.currentStats;
        player.maxHealth = stats.maxHealth;
        player.speed = stats.movementSpeed;
        player.health = Math.min(player.health, player.maxHealth);
        return stats;
    }

    private setPlayersUpgradingState(isUpgrading: boolean): void {
        for (const player of this.getPlayers()) {
            player.isUpgrading = isUpgrading;
        }
    }

    private clearUpgradeSelectionState(): void {
        this.upgradeSelectionQueue = [];
        this.activeUpgradePlayerId = null;
        this.setPlayersUpgradingState(false);
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
        for (const player of this.getPlayers()) {
            player.destroy();
        }
        this.additionalPlayers.clear();

        for (const unsubscribe of this.eventUnsubscribers) {
            unsubscribe();
        }

        this.eventUnsubscribers.length = 0;
    }

    public toggleDebugGodMode(): boolean {
        this.debugGodModeEnabled = !this.debugGodModeEnabled;
        return this.debugGodModeEnabled;
    }

    public setDebugInvincibility(enabled: boolean): void {
        this.debugGodModeInvincible = enabled;
    }

    public debugIsInvincible(): boolean {
        return this.debugGodModeInvincible;
    }

    public debugHealPlayer(): void {
        for (const player of this.getPlayers()) {
            player.health = player.maxHealth;
        }
        this.emitStateUpdate();
    }

    public debugGrantRandomCard(): void {
        for (const player of this.getPlayers()) {
            const options = this.upgradeManager.rollUpgradeOptions(player.level);
            const option = options[Math.floor(Math.random() * options.length)];
            player.applyStatModifiers(option.card.modifiers);
            player.applyUpgradeColorBuff(option.colorHex);
            player.applyUpgradeColor(option.colorHex);
            this.syncPlayerCoreStats(player);
        }
        this.emitStateUpdate();
    }

    public debugForceAdvanceWave(): void {
        const now = performance.now();

        if (this.engineState === EngineState.BOSS_FIGHT) {
            this.enemies = [];
            this.endBossFight(now);
            return;
        }

        if (this.engineState === EngineState.ANOMALY_ENCOUNTER) {
            this.enemies = [];
            this.endAnomalyEncounter(now);
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
        if (this.isBossFightActive || this.isAnomalyEncounterActive) {
            return;
        }

        this.enterBossFight('DREADNOUGHT', performance.now());
    }

    public debugSpawnAnomaly(): void {
        if (this.isBossFightActive || this.isAnomalyEncounterActive) {
            return;
        }

        this.anomalySpawnCount += 1;
        this.anomalyCurrentChance = ANOMALY_BASE_CHANCE;
        this.anomalyCooldownWaves = ANOMALY_COOLDOWN_WAVES;
        this.enterAnomalyEncounter(performance.now());
    }

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
        if (!this.isRunning) {
            return this.isPaused;
        }

        this.isPaused = !this.isPaused;

        if (!this.isPaused) {
            const now = performance.now();
            this.shiftPausedTimers(now - this.pauseStartedAtMs);
            this.pauseStartedAtMs = 0;
            this.lastTick = now;
        } else {
            this.pauseStartedAtMs = performance.now();
        }

        return this.isPaused;
    }

    private shiftPausedTimers(pausedDurationMs: number): void {
        if (pausedDurationMs <= 0) {
            return;
        }

        this.lastSpawnTime += pausedDurationMs;
        this.surviveWaveEndsAtMs = this.shiftFutureTimestamp(this.surviveWaveEndsAtMs, pausedDurationMs);
        this.waveClearAnimationEndsAtMs = this.shiftFutureTimestamp(this.waveClearAnimationEndsAtMs, pausedDurationMs);
        this.waveStartingAnimationEndsAtMs = this.shiftFutureTimestamp(this.waveStartingAnimationEndsAtMs, pausedDurationMs);
        this.missionManager.shiftActiveObjectiveTime(pausedDurationMs);
    }

    private shiftFutureTimestamp(timestampMs: number, offsetMs: number): number {
        return timestampMs > 0 ? timestampMs + offsetMs : timestampMs;
    }

    public reset(playerName: string = 'Jogador', runConfiguration?: RunConfiguration): void {
        if (runConfiguration) {
            this.runConfiguration = structuredClone(runConfiguration);
        }

        this.runConfiguration.players.player_1.name = playerName;

        for (const player of this.getPlayers()) {
            player.destroy();
        }
        this.additionalPlayers.clear();

        const activePlayerIds = this.getActivePlayerIds();
        for (let index = 0; index < activePlayerIds.length; index++) {
            const playerId = activePlayerIds[index];
            const configuredName = this.runConfiguration.players[playerId]?.name ?? '';
            const fallbackName = playerId === 'player_1'
                ? playerName
                : `Jogador ${index + 1}`;
            const resolvedName = configuredName.trim() || fallbackName;
            const spawnOffset = this.getPlayerSpawnOffset(index, activePlayerIds.length);
            const player = this.createPlayer(
                playerId,
                resolvedName,
                spawnOffset,
                true,
                this.getDefaultPlayerColor(playerId)
            );

            if (playerId === 'player_1') {
                this.player = player;
            } else {
                this.additionalPlayers.set(playerId, player);
            }
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
        this.lastSpawnTime = now;
        this.currentInputs = {
            player_1: this.createNeutralInputState(),
            player_2: this.createNeutralInputState(),
            player_3: this.createNeutralInputState(),
            player_4: this.createNeutralInputState(),
        };
        this.projectileIdCounter = 0;
        this.enemyIdCounter = 0;
        this.isPaused = false;
        this.pauseStartedAtMs = 0;

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
        this.clearUpgradeSelectionState();

        this.isBossFightActive = false;
        this.isAnomalyEncounterActive = false;
        this.activeBossWaveRule = null;
        this.currentArena = { x: 0, y: 0, width: this.arenaSize.width, height: this.arenaSize.height };
        this.anomalySpawnCount = 0;
        this.anomalyCurrentChance = ANOMALY_BASE_CHANCE;
        this.anomalyCooldownWaves = 0;
        this.bossEncounterCount = 0;
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

        this.lastSpawnTime = now;
        this.lastTick = now;

        const bossWaveRule = getBossWaveRule(this.currentWave);
        if (bossWaveRule) {
            this.startBossWaveAnimation(bossWaveRule, now);
            return;
        }

        if (this.tryStartAnomalyEncounter(now, this.currentWave)) {
            return;
        }

        this.engineState = EngineState.WAVE_ACTIVE;
        const milestone = getWaveMilestone(this.currentWave);
        if (this.currentWaveType === 'SURVIVE') {
            this.surviveWaveEndsAtMs = now + Math.min(60, milestone.surviveDurationSeconds) * 1000;
        }
        this.missionManager.roll(this.spawnQueue, this.currentWaveType, milestone, now);
    }

    private update(dt: number, currentTime: number): void {
        const playerStatsById = new Map<PlayerId, EntityStats>();
        for (const player of this.getPlayers()) {
            playerStatsById.set(player.id as PlayerId, this.syncPlayerCoreStats(player));
        }

        if (this.engineState === EngineState.COLOR_SELECTION) {
            for (const player of this.getPlayers()) {
                player.updateRegeneration(dt, currentTime);
            }
            this.updateProjectiles(dt);
            return;
        }

        const playerLockedForUpgrade = this.engineState === EngineState.UPGRADE_PHASE && this.activeUpgradePlayerId !== null;

        if (!playerLockedForUpgrade) {
            for (const player of this.getPlayers()) {
                if (player.health <= 0) {
                    continue;
                }

                const playerId = player.id as PlayerId;
                const input = this.currentInputs[playerId];
                const playerStats = playerStatsById.get(playerId);
                if (!input || !playerStats) {
                    continue;
                }

                this.updatePlayerMovement(player, input, dt);
                this.tryPlayerShoot(player, input, currentTime, playerStats);
            }
        }

        this.updateEnemies(dt, currentTime);

        for (const player of this.getPlayers()) {
            player.updateRegeneration(dt, currentTime);
        }

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

    private emitStateUpdate(currentTimeMs: number = this.lastTick): void {
        const playersData = this.getPlayers().map((player) => ({
            id: player.id,
            x: player.x,
            y: player.y,
            health: player.health,
            isDead: player.health <= 0,
            radius: player.radius,
            color: player.color,
            name: player.name,
            stats: player.currentStats,
            aimAngle: player.aimAngle,
        }));

        const primaryPlayerData = playersData[0];
        const exportState: GameState = {
            player: primaryPlayerData,
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
            })),
            arena: this.arenaSize,
            arenaOffset: { x: this.currentArena.x, y: this.currentArena.y },
            isBossFight: this.isBossFightActive,
            isAnomalyEncounter: this.isAnomalyEncounterActive,
            currentWave: this.currentWave,
            waveType: this.currentWaveType,
            remainingToKill: this.getRemainingToKill(),
            activeEnemyCount: this.enemies.length,
            surviveTimeRemainingSeconds: this.getSurviveTimeRemaining(currentTimeMs),
            isPaused: this.isPaused,
            objective: this.missionManager.getObjectiveState(),
            isColorSelection: this.engineState === EngineState.COLOR_SELECTION,
            autoSpin: this.currentInputs.player_1.autoSpin,
            isCoop: playersData.length > 1,
        };

        emitGameEvent(GameEvents.STATE_UPDATE, exportState);
    }

    private updatePlayerMovement(player: Player, input: InputState, dt: number): void {
        const isInverted = this.isAnomalyEncounterActive && (this.getActiveAnomalyFor(player)?.isInverted ?? false);
        player.update(input, dt, isInverted);
        player.updatePhysics(dt);
        this.clampToArena(player);
    }

    private tryPlayerShoot(player: Player, input: InputState, currentTime: number, playerStats: EntityStats): void {
        if (!input.isShooting && !input.autoFire) {
            return;
        }

        const playerId = player.id as PlayerId;
        const timeSinceLastShot = (currentTime - this.lastShotTimes[playerId]) / 1000;
        const actualCooldown = calculateCooldown(PLAYER_BASE_SHOT_COOLDOWN_SECONDS, playerStats.reloadPoints);

        if (timeSinceLastShot < actualCooldown) {
            return;
        }

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
                countEnemiesByType: (enemyType, ownerEnemyId) => this.countEnemiesByType(enemyType, ownerEnemyId)
            };

            enemy.tick(context);

            for (const spawn of enemy.drainPendingSpawns()) {
                this.spawnEnemyAt(
                    spawn.enemyType ?? 'KAMIKAZE',
                    spawn.x,
                    spawn.y,
                    spawn.multiplier ?? 0.25,
                    spawn.orbitSlot,
                    spawn.orbitTotal,
                    spawn.orbitRadius,
                    spawn.ownerEnemyId,
                    spawn.assignedPlayerId,
                    spawn.mirrorStats,
                    spawn.xpDrop
                );
            }

            enemy.updatePhysics(dt);
            this.clampToArena(enemy);
        }

        this.applyAnomalyCleanup();
    }

    private resolveEnemyTarget(enemy: HostileEntity, fallback: Player): Player {
        // Anomalies and their decoys lock onto their assigned player so coop groups
        // don't jitter based on who is currently closest.
        const assignedId =
            enemy instanceof Anomaly ? enemy.assignedPlayerId :
            enemy instanceof AnomalyDecoy ? enemy.assignedPlayerId : null;

        if (assignedId) {
            const assigned = this.getPlayerById(assignedId);
            if (assigned && assigned.health > 0) return assigned;
        }

        return this.getNearestAlivePlayer(enemy.x, enemy.y) ?? fallback;
    }

    /**
     * Handles per-anomaly cleanup that can't be expressed via the standard
     * "filter dead enemies" pass: reveal-driven fake culling, owner-scoped
     * decoy purges, and orphaned decoys whose anomaly already despawned.
     */
    private applyAnomalyCleanup(): void {
        this.reassignOrphanedAnomalies();

        const realRevealed = this.enemies.some(
            (e) => e instanceof Anomaly && !e.isFakeCopy && e.hasBeenRevealed
        );

        const ownersToPurgeDecoys = new Set<string>();
        for (const e of this.enemies) {
            if (e instanceof Anomaly && e.clearOwnedDecoysRequested) {
                e.clearOwnedDecoysRequested = false;
                ownersToPurgeDecoys.add(e.id);
            }
        }

        if (!realRevealed && ownersToPurgeDecoys.size === 0) return;

        const aliveAnomalyIds = new Set<string>();
        for (const e of this.enemies) {
            if (e instanceof Anomaly && (!realRevealed || !e.isFakeCopy)) {
                aliveAnomalyIds.add(e.id);
            }
        }

        this.enemies = this.enemies.filter((e) => {
            if (e instanceof Anomaly) {
                return !realRevealed || !e.isFakeCopy;
            }
            if (e instanceof AnomalyDecoy) {
                const owner = e.ownerAnomalyId;
                if (owner && ownersToPurgeDecoys.has(owner)) return false;
                if (owner && !aliveAnomalyIds.has(owner)) return false;
            }
            return true;
        });
    }

    /**
     * When the player a clone is assigned to dies, the clone (and its decoys) would
     * otherwise drift onto the corpse forever. Fakes are dropped outright; the real
     * anomaly migrates to a surviving player and that player's fake is collapsed so
     * we never end up with two anomalies on the same target.
     */
    private reassignOrphanedAnomalies(): void {
        const alivePlayers = this.getPlayers().filter((p) => p.health > 0);
        const alivePlayerIds = new Set(alivePlayers.map((p) => p.id));
        const droppedAnomalyIds = new Set<string>();

        for (const e of this.enemies) {
            if (!(e instanceof Anomaly)) continue;
            if (!e.assignedPlayerId || alivePlayerIds.has(e.assignedPlayerId)) continue;

            if (e.isFakeCopy) {
                droppedAnomalyIds.add(e.id);
                continue;
            }

            const heir = alivePlayers[0];
            if (!heir) continue; // no survivors → game-over path handles cleanup

            e.assignedPlayerId = heir.id as PlayerId;
            for (const other of this.enemies) {
                if (other === e) continue;
                if (other instanceof Anomaly && other.isFakeCopy && other.assignedPlayerId === heir.id) {
                    droppedAnomalyIds.add(other.id);
                }
            }
        }

        if (droppedAnomalyIds.size === 0) return;
        this.enemies = this.enemies.filter((e) => {
            if (droppedAnomalyIds.has(e.id)) return false;
            if (e instanceof AnomalyDecoy && e.ownerAnomalyId && droppedAnomalyIds.has(e.ownerAnomalyId)) return false;
            return true;
        });
    }

    private getActiveAnomalyFor(player: Player): Anomaly | null {
        for (const e of this.enemies) {
            if (!(e instanceof Anomaly)) continue;
            if (e.assignedPlayerId === player.id) return e;
        }
        // Single-player / unassigned fallback: any anomaly.
        for (const e of this.enemies) {
            if (e instanceof Anomaly && !e.isFakeCopy) return e;
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
        const baseMaxActive = this.currentWaveType === 'SURVIVE'
            ? milestone.maxActiveEnemiesSurvive
            : milestone.maxActiveEnemies;
        const maxActive = Math.max(1, Math.round(baseMaxActive * this.getDifficultyActiveEnemyScale()));

        if (this.enemies.length >= maxActive) return;

        const timeSinceLastSpawn = (currentTime - this.lastSpawnTime) / 1000;
        if (timeSinceLastSpawn < WAVE_SPAWN_INTERVAL_SECONDS) return;

        if (this.currentWaveType === 'SURVIVE' && this.spawnQueue.length === 0) {
            const refillTotal = Math.max(
                1,
                Math.round((milestone.maxActiveEnemiesSurvive * 2) * this.getDifficultySpawnScale())
            );
            this.initSpawnQueue(milestone, refillTotal);
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
        this.spawnEnemyAt(enemyType, spawnPoint.x, spawnPoint.y, multiplier);
    }

    private spawnEnemyAt(
        enemyType: EnemyType,
        x: number,
        y: number,
        multiplier: number,
        orbitSlot = 0,
        orbitTotal = 1,
        orbitRadius = 0,
        ownerEnemyId?: string,
        assignedPlayerId?: PlayerId,
        mirrorStats?: EntityStats,
        xpDrop?: number
    ): void {
        const enemyId = `enemy_${this.enemyIdCounter++}`;
        const enemy = this.createEnemyInstance(
            enemyType, enemyId, x, y, multiplier,
            orbitSlot, orbitTotal, orbitRadius,
            ownerEnemyId, assignedPlayerId, mirrorStats
        );
        if (xpDrop !== undefined) {
            enemy.xpDrop = xpDrop;
        }
        enemy.ownerEnemyId = ownerEnemyId ?? null;
        this.enemies.push(enemy);
    }

    private countEnemiesByType(enemyType: EnemyType, ownerEnemyId?: string): number {
        return this.enemies.filter(enemy =>
            enemy.enemyType === enemyType &&
            (!ownerEnemyId || enemy.ownerEnemyId === ownerEnemyId)
        ).length;
    }

    private createEnemyInstance(
        enemyType: EnemyType,
        id: string,
        x: number,
        y: number,
        multiplier: number,
        orbitSlot: number,
        orbitTotal: number,
        orbitRadius: number,
        ownerEnemyId?: string,
        assignedPlayerId?: PlayerId,
        mirrorStats?: EntityStats
    ): HostileEntity {
        switch (enemyType) {
            case 'KAMIKAZE':
                return new Enemy(id, x, y, multiplier);
            case 'RANGED':
                return new RangedEnemy(id, x, y, multiplier);
            case 'SENTINEL':
                return new SentinelEnemy(id, x, y, multiplier);
            case 'SKIRMISHER':
                return new SkirmisherEnemy(id, x, y, multiplier);
            case 'BRUTE':
                return new BruteEnemy(id, x, y, multiplier);
            case 'ANOMALY_DECOY':
                return new AnomalyDecoy(id, x, y, orbitSlot, orbitTotal, orbitRadius, ownerEnemyId ?? null, assignedPlayerId ?? null, mirrorStats ?? null);
            case 'ANOMALY':
                return new Anomaly(id, x, y, this.buildAnomalyReferenceStats(), Math.max(1, Math.round(multiplier)));
            case 'DREADNOUGHT':
                return new DreadnoughtBoss(id, x, y, Math.max(1, Math.round(multiplier)));
            default:
                return new Enemy(id, x, y, multiplier);
        }
    }

    private rollOffscreenSpawnPoint(): { x: number; y: number } {
        const anchor = this.getPlayerAnchorPosition();
        let fallbackX = anchor.x;
        let fallbackY = anchor.y;

        for (let attempt = 0; attempt < 16; attempt++) {
            const angle = Math.random() * Math.PI * 2;
            const desiredX = anchor.x + Math.cos(angle) * this.viewportSafeSpawnRadius;
            const desiredY = anchor.y + Math.sin(angle) * this.viewportSafeSpawnRadius;
            const clampedX = Math.max(0, Math.min(desiredX, this.arenaSize.width));
            const clampedY = Math.max(0, Math.min(desiredY, this.arenaSize.height));
            const playerDistance = Math.hypot(clampedX - anchor.x, clampedY - anchor.y);

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
        return (1 + (waveOffset * ENEMY_STAT_MULTIPLIER_PER_WAVE)) * this.getDifficultyEnemyStatScale();
    }

    private getDifficultyProfile(): DifficultyProfile {
        return getDifficultyProfile(this.getPlayers().length);
    }

    private getDifficultyEnemyStatScale(): number {
        return this.getDifficultyProfile().enemyStatScale;
    }

    private getDifficultySpawnScale(): number {
        return this.getDifficultyProfile().spawnScale;
    }

    private getDifficultyActiveEnemyScale(): number {
        return this.getDifficultyProfile().activeEnemyScale;
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
                const alivePlayers = this.getPlayers().filter((player) => player.health > 0);

                for (const player of alivePlayers) {
                    if (!this.checkCircularCollision(projectile.x, projectile.y, projectile.radius, player.x, player.y, player.radius)) {
                        continue;
                    }

                    if (this.debugGodModeInvincible) {
                        this.destroyProjectile(projectileIndex);
                        break;
                    }

                    const shouldDestroy = projectile.handleCollisionWith(
                        player,
                        player.contactDamage,
                        currentTime,
                        () => this.missionManager.onPlayerDamaged()
                    );
                    if (shouldDestroy) {
                        this.destroyProjectile(projectileIndex);
                        break;
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

                this.removeEnemyTypes(enemy.onProjectileHit(currentTime));

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

        if (this.debugGodModeInvincible && target instanceof Player) {
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

    private getProjectileColor(projectile: Projectile): number | undefined {
        if (projectile.faction !== 'player') {
            return undefined;
        }

        const owner = this.getPlayers().find((player) => player.id === projectile.ownerId);
        return owner?.color ?? this.player.color;
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
            color: this.getProjectileColor(projectile),
        });

        this.projectiles.splice(projectileIndex, 1);
    }

    private advanceWaveState(currentTime: number): void {
        switch (this.engineState) {
            case EngineState.BOSS_FIGHT: {
                const bossAlive = this.enemies.some((enemy) => enemy.enemyType === 'DREADNOUGHT');
                if (!bossAlive) {
                    this.endBossFight(currentTime);
                }
                return;
            }
            case EngineState.ANOMALY_ENCOUNTER: {
                const realAnomalyAlive = this.enemies.some(
                    (enemy) => enemy instanceof Anomaly && !enemy.isFakeCopy
                );
                if (!realAnomalyAlive) {
                    this.endAnomalyEncounter(currentTime);
                }
                return;
            }
            case EngineState.WAVE_ACTIVE:
                if (this.currentWaveType === 'SURVIVE') {
                    this.tryEndSurviveWave(currentTime);
                } else {
                    this.tryEnterWaveClearAnimation(currentTime);
                }
                return;
            case EngineState.WAVE_CLEAR_ANIMATION:
                if (currentTime >= this.waveClearAnimationEndsAtMs) {
                    this.enterUpgradePhase(currentTime);
                }
                return;
            case EngineState.UPGRADE_PHASE:
                if (this.activeUpgradePlayerId === null) {
                    this.startWaveStartingAnimation(currentTime);
                }
                return;
            case EngineState.WAVE_STARTING_ANIMATION:
                if (currentTime >= this.waveStartingAnimationEndsAtMs) {
                    this.resumeWaveSpawning(currentTime);
                }
                return;
            case EngineState.COLOR_SELECTION:
            default:
                return;
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

        const bossWaveRule = getBossWaveRule(nextWave);
        if (bossWaveRule) {
            this.startBossWaveAnimation(bossWaveRule, currentTime);
            return;
        }

        if (this.tryStartAnomalyEncounter(currentTime, nextWave)) {
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

    private tryStartAnomalyEncounter(currentTime: number, wave: number): boolean {
        if (wave < ANOMALY_START_WAVE || this.anomalyCooldownWaves > 0) {
            return false;
        }

        if (Math.random() >= this.anomalyCurrentChance) {
            this.anomalyCurrentChance += ANOMALY_CHANCE_INCREMENT;
            return false;
        }

        this.anomalyCurrentChance = ANOMALY_BASE_CHANCE;
        this.anomalyCooldownWaves = ANOMALY_COOLDOWN_WAVES;
        this.anomalySpawnCount += 1;
        this.enterAnomalyEncounter(currentTime);
        return true;
    }

    private removeEnemyTypes(enemyTypes: EnemyType[]): void {
        if (enemyTypes.length === 0) return;

        const typesToRemove = new Set(enemyTypes);
        this.enemies = this.enemies.filter((enemy) => !typesToRemove.has(enemy.enemyType));
    }

    private startBossWaveAnimation(rule: BossWaveRule, currentTime: number): void {
        this.activeBossWaveRule = rule;
        this.currentWaveType = 'BOSS';
        this.spawnQueue = [];
        this.engineState = EngineState.WAVE_STARTING_ANIMATION;
        this.waveStartingAnimationEndsAtMs = currentTime + this.waveTransitionAnimationDurationMs;

        emitGameEvent(GameEvents.WAVE_STARTING_ANIMATION_START, {
            wave: this.currentWave,
            waveType: 'BOSS',
            durationMs: this.waveTransitionAnimationDurationMs
        });
    }

    private enterBossWave(rule: BossWaveRule, currentTime: number): void {
        this.activeBossWaveRule = rule;
        this.enterBossFight(rule.bossKind, currentTime);
    }

    /**
     * In coop, the anomaly splits into one real copy + N-1 fakes, each glued to a
     * specific player. Fakes are 1-HP look-alikes; hitting the real one for the
     * first time collapses the illusion (handled in applyAnomalyCleanup).
     * Single-player keeps the classic single-anomaly behavior.
     */
    private spawnAnomalyGroup(spawnX: number, spawnY: number): HostileEntity[] {
        const players = this.getPlayers().filter((p) => p.health > 0);
        const refStats = this.buildAnomalyReferenceStats();
        const spawnCount = this.anomalySpawnCount;
        const wave = this.currentWave;

        if (players.length <= 1) {
            const anomaly = new Anomaly('anomaly_boss', spawnX, spawnY, refStats, spawnCount, wave);
            anomaly.assignedPlayerId = (players[0]?.id ?? this.player.id) as PlayerId;
            return [anomaly];
        }

        const sharedAbilityCtors: AnomalyAbilityCtor[] = Anomaly.selectAbilityConstructors(spawnCount);
        const realIndex = Math.floor(Math.random() * players.length);
        const ringRadius = 110;

        return players.map((player, i) => {
            const angle = (i / players.length) * Math.PI * 2;
            const x = spawnX + Math.cos(angle) * ringRadius;
            const y = spawnY + Math.sin(angle) * ringRadius;
            const isFake = i !== realIndex;
            const id = isFake ? `anomaly_boss_fake_${i}` : 'anomaly_boss';
            return new Anomaly(id, x, y, refStats, spawnCount, wave, {
                isFakeCopy: isFake,
                assignedPlayerId: player.id as PlayerId,
                abilityCtors: sharedAbilityCtors
            });
        });
    }

    private buildBossCoopScaling(): BossCoopScaling {
        const profile = this.getDifficultyProfile();
        return {
            healthMultiplier: profile.bossMaxHealthScale,
            bodyDamageMultiplier: profile.bossBodyDamageScale,
            bulletSpeedMultiplier: profile.bossBulletSpeedScale,
            bulletPenetrationMultiplier: profile.bossBulletPenetrationScale,
            bulletDamageMultiplier: profile.bossBulletDamageScale,
            movementSpeedMultiplier: profile.bossMovementSpeedScale,
            reloadBonus: profile.bossReloadBonus,
            extraPlayers: Math.max(0, this.getPlayers().length - 1),
        };
    }

    private buildAnomalyReferenceStats(): EntityStats {
        const base = this.player.currentStats;
        const profile = this.getDifficultyProfile();
        if (profile.bossMaxHealthScale === 1) {
            return base;
        }

        return {
            maxHealth: base.maxHealth * profile.bossMaxHealthScale,
            healthRegen: base.healthRegen * profile.bossHealthRegenScale,
            bodyDamage: base.bodyDamage * profile.bossBodyDamageScale,
            bulletSpeed: base.bulletSpeed * profile.bossBulletSpeedScale,
            bulletPenetration: base.bulletPenetration * profile.bossBulletPenetrationScale,
            bulletDamage: base.bulletDamage * profile.bossBulletDamageScale,
            reloadPoints: base.reloadPoints + profile.bossReloadBonus,
            movementSpeed: base.movementSpeed * profile.bossMovementSpeedScale,
        };
    }

    /**
     * Shared encounter setup: switches the arena to the compact ENCOUNTER_ARENA,
     * clears the run state that doesn't carry across the fight, and recenters the
     * party. Returns the spawn anchor for whatever the encounter wants to drop in.
     */
    private setupEncounterArena(): { spawnX: number; spawnY: number } {
        this.currentArena = { ...this.ENCOUNTER_ARENA };
        this.spawnQueue = [];
        this.enemiesSpawnedThisWave = 0;
        this.enemiesKilledThisWave = 0;
        this.clearUpgradeSelectionState();
        this.reviveDefeatedPlayers();

        const centerX = this.ENCOUNTER_ARENA.x + this.ENCOUNTER_ARENA.width / 2;
        const centerY = this.ENCOUNTER_ARENA.y + this.ENCOUNTER_ARENA.height / 2;
        this.positionPlayers(centerX, centerY);

        return { spawnX: centerX, spawnY: this.ENCOUNTER_ARENA.y + 220 };
    }

    private restoreMainArena(): void {
        this.currentArena = { x: 0, y: 0, width: this.arenaSize.width, height: this.arenaSize.height };
        this.enemies = [];
        this.spawnQueue = [];

        const centerX = this.arenaSize.width / 2;
        const centerY = this.arenaSize.height / 2;
        this.positionPlayers(centerX, centerY);
    }

    private buildEncounterArenaPayload() {
        return {
            bossArenaX: this.ENCOUNTER_ARENA.x,
            bossArenaY: this.ENCOUNTER_ARENA.y,
            bossArenaWidth: this.ENCOUNTER_ARENA.width,
            bossArenaHeight: this.ENCOUNTER_ARENA.height
        };
    }

    private enterBossFight(_kind: BossKind, currentTime: number): void {
        this.isBossFightActive = true;
        this.currentWaveType = 'BOSS';
        this.bossEncounterCount += 1;
        const { spawnX, spawnY } = this.setupEncounterArena();

        this.enemies = [new DreadnoughtBoss(
            'dreadnought_boss', spawnX, spawnY,
            this.bossEncounterCount, this.buildBossCoopScaling()
        )];
        this.engineState = EngineState.BOSS_FIGHT;
        this.missionManager.startBossMission(currentTime);

        emitGameEvent(GameEvents.BOSS_FIGHT_START, this.buildEncounterArenaPayload());
    }

    private endBossFight(currentTime: number): void {
        const bossWaveRule = this.activeBossWaveRule;
        this.isBossFightActive = false;
        this.activeBossWaveRule = null;
        this.restoreMainArena();

        this.missionManager.onBossDefeated();
        emitGameEvent(GameEvents.BOSS_DEFEATED, undefined);

        if (bossWaveRule) {
            const waveCleared = this.currentWave;
            const nextWave = waveCleared + 1;

            this.currentWave = nextWave;
            this.enemiesSpawnedThisWave = 0;
            this.enemiesKilledThisWave = 0;

            emitGameEvent(GameEvents.WAVE_CLEARED, { waveCleared, nextWave });
        }

        this.engineState = EngineState.WAVE_CLEAR_ANIMATION;
        this.waveClearAnimationEndsAtMs = currentTime + this.waveTransitionAnimationDurationMs;
    }

    /**
     * Anomalies are independent encounters — they share the arena/setup helpers with
     * bosses but live on their own state, event channel and mission, and do not
     * advance bossEncounterCount or change the wave type.
     */
    private enterAnomalyEncounter(currentTime: number): void {
        this.isAnomalyEncounterActive = true;
        this.totalAnomaliesMetInRun += 1;
        const { spawnX, spawnY } = this.setupEncounterArena();

        this.enemies = this.spawnAnomalyGroup(spawnX, spawnY);
        this.engineState = EngineState.ANOMALY_ENCOUNTER;
        this.missionManager.startAnomalyMission(currentTime);

        emitGameEvent(GameEvents.ANOMALY_ENCOUNTER_START, this.buildEncounterArenaPayload());
    }

    private endAnomalyEncounter(currentTime: number): void {
        this.isAnomalyEncounterActive = false;
        this.restoreMainArena();

        this.missionManager.onAnomalyDefeated();
        emitGameEvent(GameEvents.ANOMALY_DEFEATED, undefined);

        this.engineState = EngineState.WAVE_CLEAR_ANIMATION;
        this.waveClearAnimationEndsAtMs = currentTime + this.waveTransitionAnimationDurationMs;
    }

    private enterUpgradePhase(currentTime: number): void {
        this.engineState = EngineState.UPGRADE_PHASE;
        this.clearUpgradeSelectionState();

        const playersWithPendingUpgrades = this
            .getPlayers()
            .filter((candidate) => candidate.pendingUpgrades > 0);
        const totalPendingUpgrades = playersWithPendingUpgrades.reduce(
            (total, candidate) => total + candidate.pendingUpgrades,
            0
        );

        emitGameEvent(GameEvents.UPGRADE_PHASE_STARTED, {
            wave: this.currentWave,
            pendingUpgrades: totalPendingUpgrades
        });

        if (playersWithPendingUpgrades.length === 0) {
            this.startWaveStartingAnimation(currentTime);
            return;
        }

        this.upgradeSelectionQueue = playersWithPendingUpgrades.map((candidate) => candidate.id as PlayerId);
        this.advanceUpgradeSelection();
    }

    private startWaveStartingAnimation(currentTime: number): void {
        if (this.engineState === EngineState.WAVE_STARTING_ANIMATION) {
            return;
        }

        if (!getBossWaveRule(this.currentWave)) {
            this.currentWaveType = getRandomWaveType();
        }

        this.reviveDefeatedPlayersForNextWave();
        this.engineState = EngineState.WAVE_STARTING_ANIMATION;
        this.waveStartingAnimationEndsAtMs = currentTime + this.waveTransitionAnimationDurationMs;

        emitGameEvent(GameEvents.WAVE_STARTING_ANIMATION_START, {
            wave: this.currentWave,
            waveType: this.currentWaveType,
            durationMs: this.waveTransitionAnimationDurationMs
        });
    }

    private resumeWaveSpawning(currentTime: number): void {
        const bossWaveRule = this.activeBossWaveRule ?? getBossWaveRule(this.currentWave);
        if (bossWaveRule) {
            this.enterBossWave(bossWaveRule, currentTime);
            return;
        }

        this.engineState = EngineState.WAVE_ACTIVE;
        this.lastSpawnTime = currentTime;

        const milestone = getWaveMilestone(this.currentWave);

        if (this.currentWaveType === 'SURVIVE') {
            this.surviveWaveEndsAtMs = currentTime + Math.min(60, milestone.surviveDurationSeconds) * 1000;
            this.initSpawnQueue(milestone, milestone.maxActiveEnemiesSurvive * 2);
            const surviveTotal = Math.max(
                1,
                Math.round((milestone.maxActiveEnemiesSurvive * 2) * this.getDifficultySpawnScale())
            );
            this.initSpawnQueue(milestone, surviveTotal);
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
            if (this.engineState !== EngineState.UPGRADE_PHASE || !this.activeUpgradePlayerId) {
                return;
            }

            const activePlayer = this.getPlayerById(this.activeUpgradePlayerId);
            if (!activePlayer || activePlayer.pendingUpgrades <= 0) {
                this.advanceUpgradeSelection();
                return;
            }

            this.emitUpgradeOptions(this.activeUpgradePlayerId, activePlayer.pendingUpgrades, activePlayer.level);
        });
    }

    private handleCardSelected(selection: CardSelectedPayload): void {
        if (!this.activeUpgradePlayerId || selection.playerId !== this.activeUpgradePlayerId) {
            return;
        }

        const activePlayer = this.getPlayerById(selection.playerId);
        if (!activePlayer || activePlayer.pendingUpgrades <= 0) {
            this.advanceUpgradeSelection();
            return;
        }

        const selectedCard = this.upgradeManager.getCardById(selection.cardId);
        if (!selectedCard) {
            return;
        }

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
            if (!nextPlayerId) {
                continue;
            }

            const nextPlayer = this.getPlayerById(nextPlayerId);
            if (!nextPlayer || nextPlayer.pendingUpgrades <= 0) {
                continue;
            }

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
        emitGameEvent(GameEvents.UPDATE_UPGRADE_MODAL, {
            playerId,
            upgradesRemaining,
            options
        });
    }

    private reviveDefeatedPlayers(): void {
        for (const player of this.getPlayers()) {
            if (player.health > 0) {
                continue;
            }

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
        if (players.length <= 1) {
            return;
        }

        const alivePlayers = players.filter((player) => player.health > 0);
        const fallbackAnchor = players[0];
        const anchor = alivePlayers[0] ?? fallbackAnchor;
        const anchorX = anchor?.x ?? this.arenaSize.width / 2;
        const anchorY = anchor?.y ?? this.arenaSize.height / 2;

        for (let i = 0; i < players.length; i++) {
            const player = players[i];
            if (player.health > 0) {
                continue;
            }

            this.syncPlayerCoreStats(player);
            player.health = player.maxHealth;
            player.x = anchorX + this.getPlayerSpawnOffset(i, players.length);
            player.y = anchorY;
            this.clampToArena(player);
            player.knockbackVelocity = { x: 0, y: 0 };
            player.damageTimers.clear();
        }
    }

    private getCurrentWaveTotalToSpawn(): number {
        const waveRule = getWaveMilestone(this.currentWave);
        const waveOffset = Math.max(0, this.currentWave - waveRule.startWave);
        const scaledTotal = waveRule.totalEnemiesToSpawn * (1 + (waveOffset * waveRule.sizeMultiplier)) * this.getDifficultySpawnScale();

        return Math.max(1, Math.round(scaledTotal));
    }

    private getRemainingToKill(): number {
        if (this.engineState === EngineState.BOSS_FIGHT) {
            return this.enemies.some((enemy) => enemy.enemyType === 'DREADNOUGHT') ? 1 : 0;
        }

        if (this.engineState === EngineState.ANOMALY_ENCOUNTER) {
            return this.enemies.some((enemy) => enemy instanceof Anomaly && !enemy.isFakeCopy) ? 1 : 0;
        }

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
