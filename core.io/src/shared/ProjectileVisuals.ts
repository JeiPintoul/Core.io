export const PROJECTILE_VISUAL_IDS = {
    DEFAULT: 'default',
    ANOMALY: 'anomaly',
    DREADNOUGHT: 'dreadnought'
} as const;

export type ProjectileVisualId = typeof PROJECTILE_VISUAL_IDS[keyof typeof PROJECTILE_VISUAL_IDS];

export const ANOMALY_PROJECTILE_COLOR = 0xffffff;
