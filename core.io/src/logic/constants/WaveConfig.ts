import type { EnemyType, WaveMilestone, WaveType } from '../../shared/Types';

export type BossKind = 'DREADNOUGHT';

export interface BossWaveRule {
    readonly wave: number;
    readonly bossKind: BossKind;
}

export const ENEMY_STAT_MULTIPLIER_PER_WAVE = 0.05;
export const WAVE_UPGRADE_PHASE_DURATION_MS = 3000;
export const WAVE_SPAWN_INTERVAL_SECONDS = 0.25;

export const ANOMALY_START_WAVE = 5;
export const ANOMALY_BASE_CHANCE = 0.15;
export const ANOMALY_CHANCE_INCREMENT = 0.03;
export const ANOMALY_COOLDOWN_WAVES = 3;

export const BOSS_WAVE_RULES: readonly BossWaveRule[] = [
    {
        wave: 5,
        bossKind: 'DREADNOUGHT'
    }
];

export const WAVE_MILESTONES: WaveMilestone[] = [
    {
        startWave: 1,
        enemyWeights: { KAMIKAZE: 100 },
        maxActiveEnemies: 10,
        maxActiveEnemiesSurvive: 6,
        totalEnemiesToSpawn: 17,
        sizeMultiplier: 0.07,
        surviveDurationSeconds: 36
    },
    {
        startWave: 2,
        enemyWeights: { KAMIKAZE: 78, RANGED: 22 },
        maxActiveEnemies: 11,
        maxActiveEnemiesSurvive: 8,
        totalEnemiesToSpawn: 24,
        sizeMultiplier: 0.09,
        surviveDurationSeconds: 40
    },
    {
        startWave: 3,
        enemyWeights: { KAMIKAZE: 62, RANGED: 28, SENTINEL: 10 },
        maxActiveEnemies: 14,
        maxActiveEnemiesSurvive: 10,
        totalEnemiesToSpawn: 31,
        sizeMultiplier: 0.11,
        surviveDurationSeconds: 45
    },
    {
        startWave: 4,
        enemyWeights: { KAMIKAZE: 54, RANGED: 29, SENTINEL: 17 },
        maxActiveEnemies: 17,
        maxActiveEnemiesSurvive: 12,
        totalEnemiesToSpawn: 38,
        sizeMultiplier: 0.12,
        surviveDurationSeconds: 49
    },
    {
        startWave: 6,
        enemyWeights: { KAMIKAZE: 40, RANGED: 24, SENTINEL: 16, SKIRMISHER: 20 },
        maxActiveEnemies: 22,
        maxActiveEnemiesSurvive: 14,
        totalEnemiesToSpawn: 46,
        sizeMultiplier: 0.14,
        surviveDurationSeconds: 54
    },
    {
        startWave: 8,
        enemyWeights: { KAMIKAZE: 30, RANGED: 23, SENTINEL: 17, SKIRMISHER: 20, BRUTE: 10 },
        maxActiveEnemies: 25,
        maxActiveEnemiesSurvive: 16,
        totalEnemiesToSpawn: 54,
        sizeMultiplier: 0.16,
        surviveDurationSeconds: 58
    },
    {
        startWave: 10,
        enemyWeights: { KAMIKAZE: 22, RANGED: 22, SENTINEL: 18, SKIRMISHER: 22, BRUTE: 16 },
        maxActiveEnemies: 29,
        maxActiveEnemiesSurvive: 18,
        totalEnemiesToSpawn: 63,
        sizeMultiplier: 0.18,
        surviveDurationSeconds: 60
    },
];

export function getRandomWaveType(): WaveType {
    return Math.random() < 0.75 ? 'CLEAR' : 'SURVIVE';
}

export function getWaveMilestone(currentWave: number): WaveMilestone {
    let selectedMilestone = WAVE_MILESTONES[0];

    for (const milestone of WAVE_MILESTONES) {
        if (milestone.startWave <= currentWave) {
            selectedMilestone = milestone;
        }
    }

    return selectedMilestone;
}

export function getBossWaveRule(currentWave: number): BossWaveRule | undefined {
    return BOSS_WAVE_RULES.find((rule) => rule.wave === currentWave);
}

export function getEnemyFirstWave(enemyType: EnemyType): number {
    for (const milestone of WAVE_MILESTONES) {
        if ((milestone.enemyWeights[enemyType] ?? 0) > 0) {
            return milestone.startWave;
        }
    }

    return 1;
}
