import type { CardRarity, UpgradeCardData } from '../../shared/Types';

export interface UpgradeCard extends UpgradeCardData {}

export const UPGRADE_CARDS: UpgradeCard[] = [
    {
        id: 'heavy_plating',
        name: 'Blindagem Reforcada',
        description: '+20 de Vida Maxima e +4 de Dano de Contato.',
        rarity: 'COMMON',
        modifiers: { maxHealth: 20, bodyDamage: 4 }
    },
    {
        id: 'lightweight_tracks',
        name: 'Esteiras Leves',
        description: '+25 de Velocidade de Movimento.',
        rarity: 'COMMON',
        modifiers: { movementSpeed: 25 }
    },
    {
        id: 'rapid_reloader',
        name: 'Recarga Acelerada',
        description: '+1 Ponto de Recarga e +60 de Velocidade de Projetil.',
        rarity: 'UNCOMMON',
        modifiers: { reload: 1, bulletSpeed: 60 }
    },
    {
        id: 'tungsten_rounds',
        name: 'Municao de Tungstenio',
        description: '+6 de Dano de Projetil e +0.5 de Penetracao.',
        rarity: 'UNCOMMON',
        modifiers: { bulletDamage: 6, bulletPenetration: 0.5 }
    },
    {
        id: 'nanite_repair',
        name: 'Reparo Nanita',
        description: '+1.5 de Regeneracao e +12 de Vida Maxima.',
        rarity: 'RARE',
        modifiers: { healthRegen: 1.5, maxHealth: 12 }
    },
    {
        id: 'overclocked_core',
        name: 'Nucleo Overclockado',
        description: '+12 de Dano de Projetil, +2 Pontos de Recarga e +20 de Velocidade.',
        rarity: 'EPIC',
        modifiers: { bulletDamage: 12, reload: 2, movementSpeed: 20 }
    },
    {
        id: 'singularity_shells',
        name: 'Capsulas de Singularidade',
        description: '+8 de Dano de Contato, +2 de Penetracao e +120 de Velocidade de Projetil.',
        rarity: 'LEGENDARY',
        modifiers: { bodyDamage: 8, bulletPenetration: 2, bulletSpeed: 120 }
    }
];

export const UPGRADE_CARD_COLORS: string[] = [
    '#ff595e',
    '#4d96ff',
    '#4ccf7a',
    '#ffd166',
    '#b388ff',
    '#ff9f43'
];

export const UPGRADE_CARDS_BY_RARITY: Record<CardRarity, UpgradeCard[]> = {
    COMMON: UPGRADE_CARDS.filter((card) => card.rarity === 'COMMON'),
    UNCOMMON: UPGRADE_CARDS.filter((card) => card.rarity === 'UNCOMMON'),
    RARE: UPGRADE_CARDS.filter((card) => card.rarity === 'RARE'),
    EPIC: UPGRADE_CARDS.filter((card) => card.rarity === 'EPIC'),
    LEGENDARY: UPGRADE_CARDS.filter((card) => card.rarity === 'LEGENDARY')
};
