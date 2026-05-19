import type { CardRarity, EntityStats } from '../../shared/Types';

export const RARITY_LABELS_PTBR: Record<CardRarity, string> = {
    COMMON: 'COMUM',
    UNCOMMON: 'INCOMUM',
    RARE: 'RARO',
    EPIC: 'EPICO',
    LEGENDARY: 'LENDARIO'
};

export const MODIFIER_META: Record<keyof EntityStats, { label: string; icon: string; tone: 'offense' | 'defense' | 'mobility' | 'utility' }> = {
    maxHealth: { label: 'Vida Max', icon: 'HP', tone: 'defense' },
    healthRegen: { label: 'Regeneracao', icon: 'RG', tone: 'defense' },
    bodyDamage: { label: 'Dano Corpo', icon: 'BD', tone: 'offense' },
    bulletSpeed: { label: 'Vel. Tiro', icon: 'SP', tone: 'offense' },
    bulletPenetration: { label: 'Penetracao', icon: 'PN', tone: 'offense' },
    bulletDamage: { label: 'Dano Tiro', icon: 'DM', tone: 'offense' },
    reloadPoints: { label: 'Recarga', icon: 'RL', tone: 'utility' },
    movementSpeed: { label: 'Velocidade', icon: 'MV', tone: 'mobility' }
};

const UPGRADE_CARD_SYMBOLS: Record<string, string> = {
    heavy_plating: 'HP',
    lightweight_tracks: 'MV',
    kinetic_ram: 'KR',
    stability_gyros: 'GY',
    rapid_reloader: 'RL',
    tungsten_rounds: 'TR',
    shield_matrix: 'SM',
    burst_chamber: 'BC',
    nanite_repair: 'NR',
    vector_thrusters: 'VT',
    phase_alloy: 'PA',
    overclocked_core: 'OC',
    helix_launcher: 'HX',
    singularity_shells: 'SS',
    apex_drive: 'AX'
};

const UPGRADE_CARD_FLAVORS: Record<string, string> = {
    heavy_plating: 'Camadas extras para segurar o caos da horda.',
    lightweight_tracks: 'Atrito minimo para cortes agressivos no mapa.',
    kinetic_ram: 'Impacto cinetico para furar linhas de inimigos.',
    stability_gyros: 'Estabilizacao do canhao para tiros limpos e retos.',
    rapid_reloader: 'Sequencia de disparo calibrada para ritmo brutal.',
    shield_matrix: 'Camada reativa para segurar a frente sem recuar.',
    burst_chamber: 'Pressurizacao extra para abrir sequencias curtas.',
    tungsten_rounds: 'Municao densa que perfura formacoes compactas.',
    nanite_repair: 'Nanitas de campo estabilizam sua estrutura.',
    vector_thrusters: 'Microimpulsos para trocar de angulo instantaneamente.',
    phase_alloy: 'Composto adaptativo para resistir em lutas longas.',
    overclocked_core: 'Potencia extrema para pushes curtos e letais.',
    helix_launcher: 'Matriz de tiro helicoidal para perfuracao pesada.',
    singularity_shells: 'Projetis instaveis com inercia monstruosa.',
    apex_drive: 'Nucleo em limite absoluto para explosao de dano.'
};

export function getUpgradeCardSymbol(cardId: string): string {
    return UPGRADE_CARD_SYMBOLS[cardId] ?? 'UP';
}

export function getUpgradeCardFlavor(cardId: string): string {
    return UPGRADE_CARD_FLAVORS[cardId] ?? 'Modulo experimental para combates extremos.';
}

export function formatModifierValue(stat: keyof EntityStats, value: number): string {
    const sign = value >= 0 ? '+' : '';

    if (stat === 'reloadPoints') {
        return `${sign}${value.toFixed(1)} pts`;
    }

    const hasFraction = Math.abs(value % 1) > 0.001;
    return `${sign}${value.toFixed(hasFraction ? 1 : 0)}`;
}
