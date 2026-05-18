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
        weight: 28,
    },
    {
        id: 'kill_20',
        kind: 'KILL_COUNT',
        title: 'Exterminador',
        description: 'Elimine 20 inimigos nesta onda',
        target: 20,
        rewardUpgrades: 1,
        weight: 18,
    },
    {
        id: 'kill_30',
        kind: 'KILL_COUNT',
        title: 'Aniquilador',
        description: 'Elimine 30 inimigos nesta onda',
        target: 30,
        rewardUpgrades: 2,
        weight: 10,
    },
    {
        id: 'kill_6_ranged',
        kind: 'ENEMY_TYPE_KILL_COUNT',
        title: 'Cacador de Artilheiros',
        description: 'Elimine 6 inimigos ranged nesta onda',
        target: 6,
        rewardUpgrades: 1,
        weight: 20,
        requiredEnemyType: 'RANGED',
    },
    {
        id: 'kill_4_sentinel',
        kind: 'ENEMY_TYPE_KILL_COUNT',
        title: 'Quebra-Escolta',
        description: 'Elimine 4 sentinelas nesta onda',
        target: 4,
        rewardUpgrades: 1,
        weight: 16,
        requiredEnemyType: 'SENTINEL',
    },
    {
        id: 'kill_6_skirmisher',
        kind: 'ENEMY_TYPE_KILL_COUNT',
        title: 'Interceptor',
        description: 'Elimine 6 skirmishers nesta onda',
        target: 6,
        rewardUpgrades: 1,
        weight: 16,
        requiredEnemyType: 'SKIRMISHER',
    },
    {
        id: 'kill_4_brute',
        kind: 'ENEMY_TYPE_KILL_COUNT',
        title: 'Demolidor',
        description: 'Elimine 4 brutes nesta onda',
        target: 4,
        rewardUpgrades: 2,
        weight: 12,
        requiredEnemyType: 'BRUTE',
    },
    {
        id: 'kill_10_kamikaze',
        kind: 'ENEMY_TYPE_KILL_COUNT',
        title: 'Interceptador',
        description: 'Elimine 10 raiders nesta onda',
        target: 10,
        rewardUpgrades: 1,
        weight: 14,
        requiredEnemyType: 'KAMIKAZE',
    },
    {
        id: 'no_damage_20s',
        kind: 'NO_DAMAGE_DURATION',
        title: 'Blindagem Perfeita',
        description: 'Fique 20s sem receber dano',
        target: 20,
        rewardUpgrades: 1,
        weight: 22,
    },
    {
        id: 'no_damage_30s',
        kind: 'NO_DAMAGE_DURATION',
        title: 'Fantasma de Combate',
        description: 'Fique 30s sem receber dano',
        target: 30,
        rewardUpgrades: 2,
        weight: 10,
    },
];
