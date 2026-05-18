import type { StatModifiers } from '../../shared/Types';

export type ColorTier = 'PRIMARY' | 'SECONDARY' | 'TERTIARY';

export interface ColorDefinition {
    id: string;
    hex: string;
    name: string;
    tier: ColorTier;
    modifiers: StatModifiers;
    effects: string[];
}

export const COLOR_REGISTRY: ColorDefinition[] = [
    {
        id: 'vanguard_red',
        hex: '#ff4444',
        name: 'Vanguard',
        tier: 'PRIMARY',
        modifiers: { bodyDamage: 4, bulletDamage: 3, maxHealth: -8 },
        effects: ['impact']
    },
    {
        id: 'sentinel_blue',
        hex: '#4488ff',
        name: 'Sentinel',
        tier: 'PRIMARY',
        modifiers: { maxHealth: 20, healthRegen: 0.9, movementSpeed: -10 },
        effects: ['fortify']
    },
    {
        id: 'phantom_yellow',
        hex: '#ffcc00',
        name: 'Phantom',
        tier: 'PRIMARY',
        modifiers: { movementSpeed: 28, bulletSpeed: 75, bodyDamage: -2 },
        effects: ['tempo']
    },
    {
        id: 'crimson',
        hex: '#ff595e',
        name: 'Crimson',
        tier: 'SECONDARY',
        modifiers: { bulletDamage: 4, bodyDamage: 2, maxHealth: -8 },
        effects: ['rupture']
    },
    {
        id: 'azure',
        hex: '#4d96ff',
        name: 'Azure',
        tier: 'SECONDARY',
        modifiers: { maxHealth: 14, healthRegen: 0.7, bulletDamage: -2 },
        effects: ['aegis']
    },
    {
        id: 'emerald',
        hex: '#4ccf7a',
        name: 'Emerald',
        tier: 'SECONDARY',
        modifiers: { healthRegen: 1.2, maxHealth: 10, bulletSpeed: -35 },
        effects: ['recovery']
    },
    {
        id: 'gold',
        hex: '#ffd166',
        name: 'Gold',
        tier: 'SECONDARY',
        modifiers: { movementSpeed: 16, bulletSpeed: 45, bodyDamage: -1 },
        effects: ['accelerate']
    },
    {
        id: 'teal',
        hex: '#2ec4b6',
        name: 'Teal',
        tier: 'SECONDARY',
        modifiers: { bulletPenetration: 0.8, movementSpeed: 12, bulletDamage: -1 },
        effects: ['pierce']
    },
    {
        id: 'rose',
        hex: '#f15bb5',
        name: 'Rose',
        tier: 'SECONDARY',
        modifiers: { bulletDamage: 5, reloadPoints: 0.7, maxHealth: -6 },
        effects: ['surge']
    },
    {
        id: 'violet',
        hex: '#b388ff',
        name: 'Violet',
        tier: 'TERTIARY',
        modifiers: { bulletPenetration: 1.4, reloadPoints: 1, movementSpeed: -12 },
        effects: ['focus']
    },
    {
        id: 'amber',
        hex: '#ff9f43',
        name: 'Amber',
        tier: 'TERTIARY',
        modifiers: { bulletDamage: 7, bulletSpeed: 55, maxHealth: -10 },
        effects: ['burst']
    },
    {
        id: 'obsidian',
        hex: '#8d99ae',
        name: 'Obsidian',
        tier: 'TERTIARY',
        modifiers: { maxHealth: 24, bodyDamage: 5, movementSpeed: -16 },
        effects: ['colossus']
    },
    {
        id: 'prism',
        hex: '#9b5de5',
        name: 'Prism',
        tier: 'TERTIARY',
        modifiers: { reloadPoints: 1.5, bulletSpeed: 90, healthRegen: -1 },
        effects: ['overdrive']
    },
    {
        id: 'frost',
        hex: '#70d6ff',
        name: 'Frost',
        tier: 'TERTIARY',
        modifiers: { healthRegen: 2, bulletPenetration: 0.8, bulletDamage: -2 },
        effects: ['stasis']
    },
];

const colorByHex = new Map<string, ColorDefinition>(
    COLOR_REGISTRY.map((color) => [color.hex.toLowerCase(), color])
);

export function getColorDefinition(hex: string): ColorDefinition | undefined {
    return colorByHex.get(hex.toLowerCase());
}

export function getColorsByTier(tier: ColorTier): ColorDefinition[] {
    return COLOR_REGISTRY.filter((color) => color.tier === tier);
}

export function getUpgradeColorHexes(): string[] {
    return COLOR_REGISTRY
        .filter((color) => color.tier !== 'PRIMARY')
        .map((color) => color.hex);
}
