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

export type EnemyType = 'KAMIKAZE' | 'RANGED';
export type ProjectileFaction = 'player' | 'enemy';

export interface WaveMilestone {
    startWave: number;
    enemyWeights: Partial<Record<EnemyType, number>>;
    maxActiveEnemies: number;
    totalEnemiesToSpawn: number;
    sizeMultiplier: number;
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
}

export interface ProjectileData {
    id: string;
    ownerId: string; // pra saber quem atirou e não dar dano em si mesmo
    faction: ProjectileFaction;
    x: number;
    y: number;
    radius: number;
}

export interface GameState {
    player: EntityData;
    enemies: EntityData[];
    projectiles: ProjectileData[];
    arena: { width: number; height: number };
    remainingEnemies: number;
    isPaused: boolean;
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
}
