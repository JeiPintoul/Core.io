// ─────────────────────────────────────────────
//  GAME CONSTANTS - Colors, Dimensions, Config
// ─────────────────────────────────────────────

export const COLORS = {
    PLAYER:          0x4488ff,
    PLAYER_BARREL:   0x2266cc,
    PLAYER_OUTLINE:  0xffffff,

    ENEMY:           0xff4444,
    ENEMY_OUTLINE:   0xaa0000,

    BULLET:          0xffee44,
    BULLET_OUTLINE:  0xcc9900,

    HEALTH_BG:       0x330000,
    HEALTH_BAR:      0x44ff44,
    HEALTH_LOW:      0xff4444,

    ARENA_BG:        0x1a1a2e,
    GRID_LINE:       0x2a2a4a,
    ARENA_BORDER:    0x3a3a6a,
};

export const ARENA = {
    width: 2000,
    height: 2000,
};

// Visual constants
export const VISUAL = {
    GRID_STEP: 100,
    
    PLAYER: {
        barrelLengthFactor: 1.6,
        barrelWidthFactor: 0.55,
        barrelOffsetFactor: 0.4,
    },
    
    HEALTH_BAR: {
        offsetAboveEntity: 12,
        height: 4,
        hudHeight: 14,
        hudWidth: 220,
        hudMargin: 20,
        hudBottomOffset: 40,
    },
    
    STROKE: {
        player: 2,
        enemy: 2,
        bullet: 1,
        healthBar: 1,
        arenaBorder: 3,
        gridLine: 0.5,
    },
    
    OPACITY: {
        gridLine: 0.6,
        hudBackground: 0.6,
        hudBorder: 0.3,
    },
};

export const PHASER_CONFIG = {
    parentSelector: 'game-container',
    backgroundColor: '#1a1a2e',
};
