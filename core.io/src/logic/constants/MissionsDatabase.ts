import type { EnemyType } from '../../shared/Types';

export type MissionKind = 'KILL_COUNT' | 'ENEMY_TYPE_KILL_COUNT' | 'NO_DAMAGE_DURATION';

export interface MissionDefinition {
    readonly id: string;
    readonly kind: MissionKind;
    readonly title: string;
    readonly description: string;
    readonly target: number;
    readonly rewardUpgrades: number;
    readonly weight: number;
    readonly requiredEnemyType?: EnemyType;
}

export const MISSIONS_DATABASE: readonly MissionDefinition[] = [
    {
        id: 'kill_12',
        kind: 'KILL_COUNT',
        title: 'Eliminador',
        description: 'Elimine 12 inimigos nesta onda',
        target: 12,
        rewardUpgrades: 1,
        weight: 30,
    },
    {
        id: 'kill_20',
        kind: 'KILL_COUNT',
        title: 'Exterminador',
        description: 'Elimine 20 inimigos nesta onda',
        target: 20,
        rewardUpgrades: 1,
        weight: 15,
    },
    {
        id: 'kill_4_ranged',
        kind: 'ENEMY_TYPE_KILL_COUNT',
        title: 'Caçador de Ranged',
        description: 'Elimine 4 inimigos ranged nesta onda',
        target: 4,
        rewardUpgrades: 1,
        weight: 25,
        requiredEnemyType: 'RANGED',
    },
    {
        id: 'kill_3_sentinel',
        kind: 'ENEMY_TYPE_KILL_COUNT',
        title: 'Neutralizador',
        description: 'Elimine 3 sentinelas nesta onda',
        target: 3,
        rewardUpgrades: 1,
        weight: 20,
        requiredEnemyType: 'SENTINEL',
    },
    {
        id: 'no_damage_20s',
        kind: 'NO_DAMAGE_DURATION',
        title: 'Blindagem Perfeita',
        description: 'Fique 20s sem receber dano',
        target: 20,
        rewardUpgrades: 1,
        weight: 25,
    },
];
