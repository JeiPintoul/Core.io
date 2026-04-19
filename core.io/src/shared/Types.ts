export interface EntityStats {
    maxHealth: number;
    healthRegen: number;
    bodyDamage: number;
    bulletSpeed: number;
    bulletPenetration: number;
    bulletDamage: number;
    reload: number;
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

export type StatModifiers = Partial<EntityStats>;
export type CardRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export interface UpgradeCardData {
    id: string;
    name: string;
    description: string;
    rarity: CardRarity;
    modifiers: StatModifiers;
}

export interface UpgradeRollOption {
    card: UpgradeCardData;
    colorHex: string;
}

export interface UpgradeModalVisibilityPayload {
    upgradesRemaining: number;
}

export interface UpgradeModalOptionsPayload extends UpgradeModalVisibilityPayload {
    options: UpgradeRollOption[];
}

export interface CardSelectedPayload {
    cardId: string;
    colorHex: string;
}

export type EnemyType = 'KAMIKAZE' | 'RANGED' | 'SENTINEL' | 'MIRROR_BOSS';
export type ProjectileFaction = 'player' | 'enemy';

export interface WaveMilestone {
    startWave: number;
    enemyWeights: Partial<Record<EnemyType, number>>;
    maxActiveEnemies: number;
    totalEnemiesToSpawn: number;
    sizeMultiplier: number;
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
}

export interface ProjectileData {
    id: string;
    ownerId: string; // pra saber quem atirou e não dar dano em si mesmo
    faction: ProjectileFaction;
    x: number;
    y: number;
    radius: number;
}
export interface BossFightStartPayload {
    bossArenaX: number;
    bossArenaY: number;
    bossArenaWidth: number;
    bossArenaHeight: number;
}

export interface GameState {
    player: EntityData;
    enemies: EntityData[];
    projectiles: ProjectileData[];
    arena: { width: number; height: number };
    remainingEnemies: number;
    isPaused: boolean;
    //Boss 
    isBossFight?: boolean;                    
    arenaOffset?: { x: number; y: number };   

}

export interface InputState {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    targetX: number; // Substitui mouseX/Y. O Dev de UI deve mandar a coordenada global da arena
    targetY: number;
    isShooting: boolean;
}

export interface EntityDamagePayload {
    id: string;
    currentHealth: number;
}

export interface EntityDestroyedPayload {
    id: string;
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
}

export interface WaveClearedPayload {
    waveCleared: number;
    nextWave: number;
}

export interface WaveAnimationPayload {
    wave: number;
    durationMs: number;
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

export interface GameEventPayloads {
    player_input: InputState;
    state_update: GameState;
    level_up: LevelUpPayload;
    show_upgrade_modal: UpgradeModalVisibilityPayload;
    update_upgrade_modal: UpgradeModalOptionsPayload;
    hide_upgrade_modal: undefined;
    card_selected: CardSelectedPayload;
    game_over: undefined;
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
    //Eventos de boos 
    boss_fight_start: BossFightStartPayload;
    boss_defeated: undefined;

}
