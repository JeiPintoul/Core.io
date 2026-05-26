import type { ProjectileVisualId } from './ProjectileVisuals';

export const MAX_RELOAD_POINTS = 12;

export type WaveType = 'CLEAR' | 'SURVIVE' | 'BOSS';
export const PLAYER_IDS = ['player_1', 'player_2', 'player_3', 'player_4'] as const;
export type PlayerId = (typeof PLAYER_IDS)[number];
export type PlayerCount = 1 | 2 | 3 | 4;
export type ControlPreference = 'KEYBOARD' | 'GAMEPAD';

export interface PlayerRunConfiguration {
    name: string;
    control: ControlPreference;
    primaryColorHex: string;
}

export interface RunConfiguration {
    playerCount: PlayerCount;
    players: Record<PlayerId, PlayerRunConfiguration>;
}

export interface EntityStats {
    maxHealth: number;
    healthRegen: number;
    bodyDamage: number;
    bulletSpeed: number;
    bulletPenetration: number;
    bulletDamage: number;
    reloadPoints: number;
    movementSpeed: number;
}

export interface BarrelConfig {
    id: string;
    offsetX: number;
    offsetY: number;
    angleOffset: number;
    recoilForce: number;
    damageMultiplier: number;
    speedMultiplier: number;
    lifespanMultiplier: number;
}

export interface ProjectileSpawnRequest {
    spawnX: number;
    spawnY: number;
    dirX: number;
    dirY: number;
    damage: number;
    penetration: number;
    speed: number;
    lifespan: number;
    shotAngle: number;
    recoilStrength: number;
}

export type StatModifiers = Partial<EntityStats>;
export type CardRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export interface UpgradeCardData {
    id: string;
    name: string;
    description: string;
    rarity: CardRarity;
    modifiers: StatModifiers;
    paintColor: string;
}

export interface UpgradeRollOption {
    card: UpgradeCardData;
    colorHex: string;
}

export interface UpgradeModalVisibilityPayload {
    playerId: PlayerId;
    upgradesRemaining: number;
}

export interface UpgradeModalOptionsPayload extends UpgradeModalVisibilityPayload {
    options: UpgradeRollOption[];
}

export interface CardSelectedPayload {
    playerId: PlayerId;
    cardId: string;
    colorHex: string;
}

export interface CardRerollRequestedPayload {
    playerId: PlayerId;
    lockedOptionIndexes: number[];
}

export interface UpgradeDeferredPayload {
    playerId: PlayerId;
}

export type EnemyType = 'KAMIKAZE' | 'RANGED' | 'SENTINEL' | 'SKIRMISHER' | 'BRUTE' | 'ANOMALY' | 'ANOMALY_DECOY' | 'DREADNOUGHT';
export type ProjectileFaction = 'player' | 'enemy';

export interface TriangleCollidable {
    readonly id: string;
    readonly faction: ProjectileFaction;
    readonly x: number;
    readonly y: number;
    readonly radius: number;
    readonly damage: number;
    health: number;
}

export interface WaveMilestone {
    startWave: number;
    enemyWeights: Partial<Record<EnemyType, number>>;
    maxActiveEnemies: number;
    maxActiveEnemiesSurvive: number;
    totalEnemiesToSpawn: number;
    sizeMultiplier: number;
    surviveDurationSeconds: number;
}

export interface SentinelTriangleData {
    id: string;
    x: number;
    y: number;
    rotation: number;
    mode: 'ORBIT' | 'SHIELD' | 'HOMING';
    health: number;
    maxHealth: number;
}


export interface EntityData {
    id: string;
    x: number;
    y: number;
    health: number;
    isDead: boolean;
    radius: number;
    color?: number;
    name?: string;
    stats: EntityStats;
    enemyType?: EnemyType;
    aimAngle?: number;
    sentinelTriangles?: SentinelTriangleData[];
    magnetarPhase?: 'CHARGING' | 'RELEASING';
    magnetarPhaseProgress?: number;
    ownerEnemyId?: string | null;
    spawnedAtMs?: number;
    dreadnoughtSummonProgress?: number;
    level?: number;
    currentXp?: number;
    xpToNextLevel?: number;
    pendingUpgrades?: number;
}

export interface ProjectileData {
    id: string;
    ownerId: string; // pra saber quem atirou e nÃ£o dar dano em si mesmo
    faction: ProjectileFaction;
    x: number;
    y: number;
    radius: number;
    color?: number;
    visualId?: ProjectileVisualId;
}
export interface BossFightStartPayload {
    bossArenaX: number;
    bossArenaY: number;
    bossArenaWidth: number;
    bossArenaHeight: number;
}

export interface ObjectiveState {
    id: string;
    title: string;
    description: string;
    progress: number;
    target: number;
    completed: boolean;
    failed: boolean;
}

export interface GameState {
    player: EntityData;
    players: EntityData[];
    enemies: EntityData[];
    projectiles: ProjectileData[];
    arena: { width: number; height: number };
    currentWave: number;
    waveType: WaveType;
    remainingToKill: number;
    activeEnemyCount: number;
    surviveTimeRemainingSeconds: number;
    isPaused: boolean;
    objective: ObjectiveState | null;
    isBossFight?: boolean;
    isAnomalyEncounter?: boolean;
    arenaOffset?: { x: number; y: number };
    isColorSelection: boolean;
    autoSpin: boolean;
    isCoop: boolean;
    bossExitPortal?: { x: number; y: number; radius: number } | null;
}

export interface InputState {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    targetX: number;
    targetY: number;
    isShooting: boolean;
    autoFire: boolean;
    autoSpin: boolean;
}

export interface PlayerInputPayload {
    playerId: PlayerId;
    input: InputState;
}

export interface EntityDamagePayload {
    id: string;
    currentHealth: number;
}

export interface EntityDestroyedPayload {
    id: string;
    color?: number;
}

export interface EnemyDestroyedPayload {
    id: string;
    xpDropped: number;
    x: number;
    y: number;
    radius: number;
}

export interface LevelUpPayload {
    newLevel: number;
}

export interface XpUpdatePayload {
    currentXp: number;
    requires: number;
}

export interface ProjectileDestroyedPayload {
    faction: ProjectileFaction;
    x: number;
    y: number;
    radius: number;
    color?: number;
    visualId?: ProjectileVisualId;
}

export interface WaveClearedPayload {
    waveCleared: number;
    nextWave: number;
}

export interface WaveAnimationPayload {
    wave: number;
    durationMs: number;
    waveType?: WaveType;
}

export interface WaveClearAnimationPayload extends WaveAnimationPayload {
    waveCleared: number;
    nextWave: number;
}

export interface UpgradePhaseStartedPayload {
    wave: number;
    pendingUpgrades: number;
}

export interface WaveSpawningResumedPayload {
    wave: number;
}

export interface ProjectileFiredPayload {
    shooterId: string;
    faction: ProjectileFaction;
    x: number;
    y: number;
    angle: number;
    recoilStrength: number;
}

export interface ObjectiveCompletedPayload {
    title: string;
    rewardUpgrades: number;
}

export interface AudioSettingsPayload {
    volume: number;
    muted: boolean;
}

export interface AnomalyTeleportPayload {
    id: string;
    x: number;
    y: number;
}

export interface AnomalyDashPayload {
    id: string;
    x: number;
    y: number;
    durationMs: number;
}

export interface GameOverPayload {
    waveReached: number;
    enemiesKilled: number;
    anomaliesMet: number;
}

export interface GameEventPayloads {
    player_input: PlayerInputPayload;
    state_update: GameState;
    level_up: LevelUpPayload;
    show_upgrade_modal: UpgradeModalVisibilityPayload;
    update_upgrade_modal: UpgradeModalOptionsPayload;
    hide_upgrade_modal: undefined;
    card_selected: CardSelectedPayload;
    card_reroll_requested: CardRerollRequestedPayload;
    upgrade_deferred: UpgradeDeferredPayload;
    upgrade_reopen_requested: undefined;
    game_over: GameOverPayload;
    entity_damage: EntityDamagePayload;
    entity_destroyed: EntityDestroyedPayload;
    enemy_destroyed: EnemyDestroyedPayload;
    xp_update: XpUpdatePayload;
    projectile_destroyed: ProjectileDestroyedPayload;
    wave_cleared: WaveClearedPayload;
    wave_clear_animation_start: WaveClearAnimationPayload;
    upgrade_phase_started: UpgradePhaseStartedPayload;
    wave_starting_animation_start: WaveAnimationPayload;
    wave_spawning_resumed: WaveSpawningResumedPayload;
    projectile_fired: ProjectileFiredPayload;
    objective_completed: ObjectiveCompletedPayload;
    audio_settings_changed: AudioSettingsPayload;
    audio_restart_requested: undefined;
    boss_fight_start: BossFightStartPayload;
    boss_defeated: undefined;
    boss_exit_portal_used: undefined;
    anomaly_encounter_start: BossFightStartPayload;
    anomaly_defeated: undefined;
    arena_resized: { width: number; height: number };
    anomaly_teleport: AnomalyTeleportPayload;
    anomaly_dash: AnomalyDashPayload;
    start_run_with_color: { playerColors: Partial<Record<PlayerId, string>> };
    auto_fire_toggled: { enabled: boolean };
    auto_spin_toggled: { enabled: boolean };
    run_config_changed: RunConfiguration;
}

