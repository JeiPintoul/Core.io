import type { EnemyType, WaveMilestone, WaveType } from '../../shared/Types';

export const ENEMY_STAT_MULTIPLIER_PER_WAVE = 0.05;
export const WAVE_UPGRADE_PHASE_DURATION_MS = 3000;
export const WAVE_SPAWN_INTERVAL_SECONDS = 0.25;

export const WAVE_MILESTONES: WaveMilestone[] = [
    {
        startWave: 1,
        enemyWeights: { KAMIKAZE: 100 },
        maxActiveEnemies: 10,
        maxActiveEnemiesSurvive: 8,
        totalEnemiesToSpawn: 20,
        sizeMultiplier: 0.08,
        surviveDurationSeconds: 40
    },
    {
        startWave: 2,
        enemyWeights: { KAMIKAZE: 80, RANGED: 20 },
        maxActiveEnemies: 14,
        maxActiveEnemiesSurvive: 10,
        totalEnemiesToSpawn: 28,
        sizeMultiplier: 0.1,
        surviveDurationSeconds: 45
    },
    {
        startWave: 3,
        enemyWeights: { KAMIKAZE: 60, RANGED: 30, SENTINEL: 10 },
        maxActiveEnemies: 18,
        maxActiveEnemiesSurvive: 12,
        totalEnemiesToSpawn: 36,
        sizeMultiplier: 0.13,
        surviveDurationSeconds: 50
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

export function getEnemyFirstWave(enemyType: EnemyType): number {
    for (const milestone of WAVE_MILESTONES) {
        if ((milestone.enemyWeights[enemyType] ?? 0) > 0) {
            return milestone.startWave;
        }
    }

    return 1;
}
