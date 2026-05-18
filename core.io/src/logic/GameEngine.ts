import { emitGameEvent, GameEvents, onGameEvent } from '../shared/EventBus';
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
import { Anomaly } from './entities/enemies/Anomaly';
import { AnomalyDecoy } from './entities/enemies/AnomalyDecoy';
import { DreadnoughtBoss } from './entities/enemies/DreadnoughtBoss';
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

const PLAYER_DEFAULT_COLORS: Record<PlayerId, number> = {
    player_1: 0x4488ff,
    player_2: 0x55ffaa,
    player_3: 0xffcc00,
    player_4: 0xff77aa,
};

const PLAYER_DEFAULT_COLOR_HEX: Record<PlayerId, string> = {
    player_1: '#4488ff',
    player_2: '#55ffaa',
    player_3: '#ffcc00',
    player_4: '#ff77aa',
};

interface DifficultyProfile {
    enemyStatScale: number;
    spawnScale: number;
    activeEnemyScale: number;
    bossMaxHealthScale: number;
    bossHealthRegenScale: number;
    bossBodyDamageScale: number;
    bossBulletSpeedScale: number;
    bossBulletPenetrationScale: number;
    bossBulletDamageScale: number;
    bossReloadBonus: number;
    bossMovementSpeedScale: number;
}

const DIFFICULTY_PROFILE_BY_PLAYER_COUNT: Record<1 | 2 | 3 | 4, DifficultyProfile> = {
    1: {
        enemyStatScale: 1,
        spawnScale: 1,
        activeEnemyScale: 1,
        bossMaxHealthScale: 1,
        bossHealthRegenScale: 1,
        bossBodyDamageScale: 1,
        bossBulletSpeedScale: 1,
        bossBulletPenetrationScale: 1,
        bossBulletDamageScale: 1,
        bossReloadBonus: 0,
        bossMovementSpeedScale: 1,
    },
    2: {
        enemyStatScale: 1.2,
        spawnScale: 1.34,
        activeEnemyScale: 1.28,
        bossMaxHealthScale: 1.3,
        bossHealthRegenScale: 1.13,
        bossBodyDamageScale: 1.16,
        bossBulletSpeedScale: 1.04,
        bossBulletPenetrationScale: 1.08,
        bossBulletDamageScale: 1.18,
        bossReloadBonus: 0.8,
        bossMovementSpeedScale: 1.04,
    },
    3: {
        enemyStatScale: 1.34,
        spawnScale: 1.62,
        activeEnemyScale: 1.5,
        bossMaxHealthScale: 1.56,
        bossHealthRegenScale: 1.24,
        bossBodyDamageScale: 1.3,
        bossBulletSpeedScale: 1.08,
        bossBulletPenetrationScale: 1.14,
        bossBulletDamageScale: 1.34,
        bossReloadBonus: 1.6,
        bossMovementSpeedScale: 1.08,
    },
    4: {
        enemyStatScale: 1.46,
        spawnScale: 1.86,
        activeEnemyScale: 1.68,
        bossMaxHealthScale: 1.78,
        bossHealthRegenScale: 1.33,
        bossBodyDamageScale: 1.42,
        bossBulletSpeedScale: 1.12,
        bossBulletPenetrationScale: 1.2,
        bossBulletDamageScale: 1.48,
        bossReloadBonus: 2.3,
        bossMovementSpeedScale: 1.12,
    },
};

const DEFAULT_RUN_CONFIGURATION: RunConfiguration = {
    playerCount: 1,
    players: {
        player_1: { name: 'Jogador', control: 'KEYBOARD' },
        player_2: { name: 'Jogador 2', control: 'GAMEPAD' },
        player_3: { name: 'Jogador 3', control: 'GAMEPAD' },
        player_4: { name: 'Jogador 4', control: 'GAMEPAD' },
    }
};

// use BossKind type from WaveConfig import

enum EngineState {
    COLOR_SELECTION = 'COLOR_SELECTION',
    WAVE_ACTIVE = 'WAVE_ACTIVE',
    WAVE_CLEAR_ANIMATION = 'WAVE_CLEAR_ANIMATION',
    UPGRADE_PHASE = 'UPGRADE_PHASE',
    WAVE_STARTING_ANIMATION = 'WAVE_STARTING_ANIMATION',
    BOSS_FIGHT = 'BOSS_FIGHT',
}

export class GameEngine {
    private static readonly FIXED_DREADNOUGHT_WAVE = 5;

    private static readonly ENEMY_REGISTRY: Partial<Record<EnemyType, new (id: string, x: number, y: number, multiplier: number) => HostileEntity>> = {
        RANGED: RangedEnemy,
        SENTINEL: SentinelEnemy,
        SKIRMISHER: SkirmisherEnemy,
        BRUTE: BruteEnemy,
    };

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
    private activeBossWaveRule: BossWaveRule | null = null;
    private currentArena: { x: number; y: number; width: number; height: number };
    private readonly BOSS_ARENA = { x: 1500, y: 1500, width: 2000, height: 2000 };

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

    private normalizeColorHex(value: string | undefined, fallbackHex: string): string {
        if (typeof value !== 'string') {
            return fallbackHex;
        }

        const trimmed = value.trim();
        if (!/^#?[0-9a-fA-F]{6}$/.test(trimmed)) {
            return fallbackHex;
        }

        return trimmed.startsWith('#') ? trimmed.toLowerCase() : `#${trimmed.toLowerCase()}`;
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

    public startGameWithColor(playerColors: Partial<Record<PlayerId, string>>): void {
        const now = performance.now();
        for (const player of this.getPlayers()) {
            const playerId = player.id as PlayerId;
            const fallbackColorHex = this.getDefaultPlayerColorHex(playerId);
            const selectedColorHex = this.normalizeColorHex(playerColors[playerId], fallbackColorHex);
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

    private emitStateUpdate(): void {
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
            currentWave: this.currentWave,
            waveType: this.currentWaveType,
            remainingToKill: this.getRemainingToKill(),
            activeEnemyCount: this.enemies.length,
            surviveTimeRemainingSeconds: this.getSurviveTimeRemaining(this.lastTick),
            isPaused: this.isPaused,
            objective: this.missionManager.getObjectiveState(),
            isColorSelection: this.engineState === EngineState.COLOR_SELECTION,
            autoSpin: this.currentInputs.player_1.autoSpin,
            isCoop: playersData.length > 1,
        };

        emitGameEvent(GameEvents.STATE_UPDATE, exportState);
    }

    private updatePlayerMovement(player: Player, input: InputState, dt: number): void {
        const isInverted = this.isBossFightActive && (this.getActiveAnomaly()?.isInverted ?? false);
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
            const targetPlayer = this.getNearestAlivePlayer(enemy.x, enemy.y) ?? fallbackTarget;
            const context: EnemyUpdateContext = {
                playerX: targetPlayer.x,
                playerY: targetPlayer.y,
                player: targetPlayer,
                dt,
                currentTime,
                onShoot: (aimAngle) => this.spawnProjectiles(enemy, 'enemy', aimAngle, enemy.stats)
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
                    spawn.orbitRadius
                );
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

    private spawnEnemyAt(enemyType: EnemyType, x: number, y: number, multiplier: number, orbitSlot = 0, orbitTotal = 1, orbitRadius = 0): void {
        const enemyId = `enemy_${this.enemyIdCounter++}`;
        this.enemies.push(this.createEnemyInstance(enemyType, enemyId, x, y, multiplier, orbitSlot, orbitTotal, orbitRadius));
    }

    private createEnemyInstance(
        enemyType: EnemyType,
        id: string,
        x: number,
        y: number,
        multiplier: number,
        orbitSlot: number,
        orbitTotal: number,
        orbitRadius: number
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
                return new AnomalyDecoy(id, x, y, orbitSlot, orbitTotal, orbitRadius);
            case 'ANOMALY':
                return new Anomaly(id, x, y, this.buildBossReferenceStats(), Math.max(1, Math.round(multiplier)));
            case 'DREADNOUGHT':
                return new DreadnoughtBoss(id, x, y, this.buildBossReferenceStats(), Math.max(1, Math.round(multiplier)));
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
        const playerCount = Math.max(1, Math.min(4, this.getPlayers().length)) as 1 | 2 | 3 | 4;
        return DIFFICULTY_PROFILE_BY_PLAYER_COUNT[playerCount];
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
                const bossAlive = this.enemies.some((enemy) => enemy.enemyType === 'ANOMALY' || enemy.enemyType === 'DREADNOUGHT');
                if (!bossAlive) {
                    this.endBossFight(currentTime);
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

    private rollBossKind(): BossKind {
        const nextKind: BossKind = this.bossEncounterCount % 2 === 0 ? 'ANOMALY' : 'DREADNOUGHT';
        this.bossEncounterCount += 1;
        return nextKind;
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
        this.enterBossFight(this.rollBossKind(), currentTime);
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

    private buildBossReferenceStats(): EntityStats {
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

    private enterBossFight(kind: BossKind, currentTime: number): void {
        this.isBossFightActive = true;
        this.currentWaveType = 'BOSS';
        this.totalAnomaliesMetInRun += 1;
        this.currentArena = { ...this.BOSS_ARENA };
        this.spawnQueue = [];
        this.enemiesSpawnedThisWave = 0;
        this.enemiesKilledThisWave = 0;
        this.clearUpgradeSelectionState();
        this.reviveDefeatedPlayers();

        const centerX = this.BOSS_ARENA.x + this.BOSS_ARENA.width / 2;
        const centerY = this.BOSS_ARENA.y + this.BOSS_ARENA.height / 2;
        this.positionPlayers(centerX, centerY);

        const spawnX = this.BOSS_ARENA.x + this.BOSS_ARENA.width / 2;
        const spawnY = this.BOSS_ARENA.y + 220;
        const bossReferenceStats = this.buildBossReferenceStats();
        const boss = kind === 'ANOMALY'
            ? new Anomaly('anomaly_boss', spawnX, spawnY, bossReferenceStats, this.anomalySpawnCount)
            : new DreadnoughtBoss('dreadnought_boss', spawnX, spawnY, bossReferenceStats, this.anomalySpawnCount);

        this.enemies = [boss];
        this.engineState = EngineState.BOSS_FIGHT;
        this.missionManager.startBossMission(currentTime, kind);

        emitGameEvent(GameEvents.BOSS_FIGHT_START, {
            bossArenaX: this.BOSS_ARENA.x,
            bossArenaY: this.BOSS_ARENA.y,
            bossArenaWidth: this.BOSS_ARENA.width,
            bossArenaHeight: this.BOSS_ARENA.height
        });
    }

    private endBossFight(currentTime: number): void {
        const bossWaveRule = this.activeBossWaveRule;
        this.isBossFightActive = false;
        this.activeBossWaveRule = null;
        this.currentArena = { x: 0, y: 0, width: this.arenaSize.width, height: this.arenaSize.height };
        this.enemies = [];
        this.spawnQueue = [];

        const centerX = this.arenaSize.width / 2;
        const centerY = this.arenaSize.height / 2;
        this.positionPlayers(centerX, centerY);

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

        this.player.applyStatModifiers(selectedCard.modifiers);
        this.player.applyUpgradeColorBuff(selection.colorHex);
        this.player.applyUpgradeColor(selection.colorHex);
        this.player.consumePendingUpgrade();
        this.syncPlayerCoreStats(this.player);
        const colorHex = this.normalizeColorHex(selection.colorHex, '#4488ff');

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
        if (this.currentWaveType === 'BOSS') {
            return this.enemies.some((enemy) => enemy.enemyType === 'ANOMALY' || enemy.enemyType === 'DREADNOUGHT') ? 1 : 0;
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
