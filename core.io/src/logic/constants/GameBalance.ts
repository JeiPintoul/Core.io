import type { CardRarity, PlayerId, RunConfiguration } from '../../shared/Types';

export interface DifficultyProfile {
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

export const PLAYER_DEFAULT_COLORS: Record<PlayerId, number> = {
    player_1: 0x4488ff,
    player_2: 0x55ffaa,
    player_3: 0xffcc00,
    player_4: 0xff77aa,
};

export const PLAYER_DEFAULT_COLOR_HEX: Record<PlayerId, string> = {
    player_1: '#4488ff',
    player_2: '#55ffaa',
    player_3: '#ffcc00',
    player_4: '#ff77aa',
};

export const DEFAULT_RUN_CONFIGURATION: RunConfiguration = {
    playerCount: 1,
    players: {
        player_1: { name: 'Jogador', control: 'KEYBOARD' },
        player_2: { name: 'Jogador 2', control: 'GAMEPAD' },
        player_3: { name: 'Jogador 3', control: 'GAMEPAD' },
        player_4: { name: 'Jogador 4', control: 'GAMEPAD' },
    }
};

export const COIN_DROP_XP_RATIO = 0.2;
export const SHOP_HEAL_PRICE = 45;
export const SHOP_CARD_PRICE_BY_RARITY: Record<CardRarity, number> = {
    COMMON: 60,
    UNCOMMON: 95,
    RARE: 150,
    EPIC: 240,
    LEGENDARY: 380,
};

export function calculateCoinDrop(xpDrop: number): number {
    return Math.max(0, Math.round(xpDrop * COIN_DROP_XP_RATIO));
}

export const DIFFICULTY_PROFILE_BY_PLAYER_COUNT: Record<1 | 2 | 3 | 4, DifficultyProfile> = {
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

export function getDifficultyProfile(playerCount: number): DifficultyProfile {
    const normalizedPlayerCount = Math.max(1, Math.min(4, playerCount)) as 1 | 2 | 3 | 4;
    return DIFFICULTY_PROFILE_BY_PLAYER_COUNT[normalizedPlayerCount];
}
