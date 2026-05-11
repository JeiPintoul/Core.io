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
    // ── PRIMARY (initial faction selection) ──────────────────────────────
    {
        id: 'vanguard_red',
        hex: '#ff4444',
        name: 'Vanguard',
        tier: 'PRIMARY',
        modifiers: { bodyDamage: 3, maxHealth: -10 },
        effects: []
    },
    {
        id: 'sentinel_blue',
        hex: '#4488ff',
        name: 'Sentinel',
        tier: 'PRIMARY',
        modifiers: { movementSpeed: 20, reloadPoints: 2 },
        effects: []
    },
    {
        id: 'phantom_yellow',
        hex: '#ffcc00',
        name: 'Phantom',
        tier: 'PRIMARY',
        modifiers: { maxHealth: 25, healthRegen: 1 },
        effects: []
    },

    // ── SECONDARY (upgrade card color rolls) ─────────────────────────────
    {
        id: 'crimson',
        hex: '#ff595e',
        name: 'Crimson',
        tier: 'SECONDARY',
        modifiers: { bulletDamage: 5, bodyDamage: 2, maxHealth: -12 },
        effects: []
    },
    {
        id: 'azure',
        hex: '#4d96ff',
        name: 'Azure',
        tier: 'SECONDARY',
        modifiers: { maxHealth: 18, healthRegen: 0.8, bulletDamage: -3 },
        effects: []
    },
    {
        id: 'emerald',
        hex: '#4ccf7a',
        name: 'Emerald',
        tier: 'SECONDARY',
        modifiers: { healthRegen: 1.5, maxHealth: 14, bulletSpeed: -40 },
        effects: []
    },
    {
        id: 'gold',
        hex: '#ffd166',
        name: 'Gold',
        tier: 'SECONDARY',
        modifiers: { movementSpeed: 18, bulletSpeed: 50, bodyDamage: -2 },
        effects: []
    },

    // ── TERTIARY (rare upgrade card color rolls) ──────────────────────────
    {
        id: 'violet',
        hex: '#b388ff',
        name: 'Violet',
        tier: 'TERTIARY',
        modifiers: { bulletPenetration: 1.5, reloadPoints: 1, movementSpeed: -15 },
        effects: []
    },
    {
        id: 'amber',
        hex: '#ff9f43',
        name: 'Amber',
        tier: 'TERTIARY',
        modifiers: { bulletDamage: 8, bulletSpeed: 60, maxHealth: -15 },
        effects: []
    },
];

const _colorByHex = new Map<string, ColorDefinition>(
    COLOR_REGISTRY.map(def => [def.hex.toLowerCase(), def])
);

export function getColorDefinition(hex: string): ColorDefinition | undefined {
    return _colorByHex.get(hex.toLowerCase());
}
