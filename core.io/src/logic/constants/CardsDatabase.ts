import type { CardRarity, UpgradeCardData } from '../../shared/Types';
import { getUpgradeColorHexes } from './ColorConfig';

export type UpgradeCard = UpgradeCardData;

export const UPGRADE_CARDS: UpgradeCard[] = [
    {
        id: 'heavy_plating',
        name: 'Blindagem Reforcada',
        description: '+20 de Vida Maxima e +4 de Dano de Contato.',
        rarity: 'COMMON',
        modifiers: { maxHealth: 20, bodyDamage: 4 },
        paintColor: '#8d99ae'
    },
    {
        id: 'lightweight_tracks',
        name: 'Esteiras Leves',
        description: '+25 de Velocidade de Movimento.',
        rarity: 'COMMON',
        modifiers: { movementSpeed: 25 },
        paintColor: '#ffd166'
    },
    {
        id: 'kinetic_ram',
        name: 'Ariete Cinematico',
        description: '+3 de Dano de Contato e +12 de Velocidade.',
        rarity: 'COMMON',
        modifiers: { bodyDamage: 3, movementSpeed: 12 },
        paintColor: '#ff9f43'
    },
    {
        id: 'stability_gyros',
        name: 'Giroscopios de Estabilidade',
        description: '+80 de Velocidade de Projetil e +0.3 de Penetracao.',
        rarity: 'COMMON',
        modifiers: { bulletSpeed: 80, bulletPenetration: 0.3 },
        paintColor: '#2ec4b6'
    },
    {
        id: 'rapid_reloader',
        name: 'Recarga Acelerada',
        description: '+1 Ponto de Recarga e +60 de Velocidade de Projetil.',
        rarity: 'UNCOMMON',
        modifiers: { reloadPoints: 1, bulletSpeed: 60 },
        paintColor: '#ffd166'
    },
    {
        id: 'tungsten_rounds',
        name: 'Municao de Tungstenio',
        description: '+6 de Dano de Projetil e +0.5 de Penetracao.',
        rarity: 'UNCOMMON',
        modifiers: { bulletDamage: 6, bulletPenetration: 0.5 },
        paintColor: '#ff595e'
    },
    {
        id: 'shield_matrix',
        name: 'Matriz de Escudo',
        description: '+24 de Vida Maxima, +1 de Regeneracao e -8 de Velocidade.',
        rarity: 'UNCOMMON',
        modifiers: { maxHealth: 24, healthRegen: 1, movementSpeed: -8 },
        paintColor: '#4d96ff'
    },
    {
        id: 'burst_chamber',
        name: 'Camara de Rajada',
        description: '+5 de Dano de Projetil e +1 de Recarga.',
        rarity: 'UNCOMMON',
        modifiers: { bulletDamage: 5, reloadPoints: 1 },
        paintColor: '#f15bb5'
    },
    {
        id: 'nanite_repair',
        name: 'Reparo Nanita',
        description: '+1.5 de Regeneracao e +12 de Vida Maxima.',
        rarity: 'RARE',
        modifiers: { healthRegen: 1.5, maxHealth: 12 },
        paintColor: '#4ccf7a'
    },
    {
        id: 'vector_thrusters',
        name: 'Propulsores Vetoriais',
        description: '+35 de Velocidade, +1 de Recarga e +40 de Velocidade de Projetil.',
        rarity: 'RARE',
        modifiers: { movementSpeed: 35, reloadPoints: 1, bulletSpeed: 40 },
        paintColor: '#ffd166'
    },
    {
        id: 'phase_alloy',
        name: 'Liga de Fase',
        description: '+30 de Vida Maxima, +1.2 de Regeneracao e +0.8 de Penetracao.',
        rarity: 'RARE',
        modifiers: { maxHealth: 30, healthRegen: 1.2, bulletPenetration: 0.8 },
        paintColor: '#70d6ff'
    },
    {
        id: 'overclocked_core',
        name: 'Nucleo Overclockado',
        description: '+12 de Dano de Projetil, +2 Pontos de Recarga e +20 de Velocidade.',
        rarity: 'EPIC',
        modifiers: { bulletDamage: 12, reloadPoints: 2, movementSpeed: 20 },
        paintColor: '#ff9f43'
    },
    {
        id: 'helix_launcher',
        name: 'Lancador Helix',
        description: '+10 de Dano de Projetil, +1.5 de Penetracao e +90 de Velocidade de Projetil.',
        rarity: 'EPIC',
        modifiers: { bulletDamage: 10, bulletPenetration: 1.5, bulletSpeed: 90 },
        paintColor: '#b388ff'
    },
    {
        id: 'singularity_shells',
        name: 'Capsulas de Singularidade',
        description: '+8 de Dano de Contato, +2 de Penetracao e +120 de Velocidade de Projetil.',
        rarity: 'LEGENDARY',
        modifiers: { bodyDamage: 8, bulletPenetration: 2, bulletSpeed: 120 },
        paintColor: '#9b5de5'
    },
    {
        id: 'apex_drive',
        name: 'Propulsor Apex',
        description: '+16 de Dano de Projetil, +3 de Recarga e +30 de Velocidade.',
        rarity: 'LEGENDARY',
        modifiers: { bulletDamage: 16, reloadPoints: 3, movementSpeed: 30 },
        paintColor: '#ff595e'
    }
];

export const UPGRADE_CARD_COLORS: string[] = getUpgradeColorHexes();

export const UPGRADE_CARDS_BY_RARITY: Record<CardRarity, UpgradeCard[]> = {
    COMMON: UPGRADE_CARDS.filter((card) => card.rarity === 'COMMON'),
    UNCOMMON: UPGRADE_CARDS.filter((card) => card.rarity === 'UNCOMMON'),
    RARE: UPGRADE_CARDS.filter((card) => card.rarity === 'RARE'),
    EPIC: UPGRADE_CARDS.filter((card) => card.rarity === 'EPIC'),
    LEGENDARY: UPGRADE_CARDS.filter((card) => card.rarity === 'LEGENDARY')
};