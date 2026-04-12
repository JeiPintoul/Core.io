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

export interface EntityData {
    id: string;
    x: number;
    y: number;
    health: number;
    isDead: boolean;
    radius: number;
    stats: EntityStats;
}

export interface ProjectileData {
    id: string;
    ownerId: string; // pra saber quem atirou e não dar dano em si mesmo
    x: number;
    y: number;
    radius: number;
}

export interface GameState {
    player: EntityData;
    enemies: EntityData[];
    projectiles: ProjectileData[];
    arena: { width: number; height: number };
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
}

export interface LevelUpPayload {
    newLevel: number;
}

export interface XpUpdatePayload {
    currentXp: number;
    requires: number;
}

export interface GameEventPayloads {
    player_input: InputState;
    state_update: GameState;
    level_up: LevelUpPayload;
    game_over: undefined;
    entity_damage: EntityDamagePayload;
    entity_destroyed: EntityDestroyedPayload;
    enemy_destroyed: EnemyDestroyedPayload;
    xp_update: XpUpdatePayload;
}
