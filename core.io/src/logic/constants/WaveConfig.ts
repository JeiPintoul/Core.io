import type { EnemyType, EntityStats, WaveMilestone } from '../../shared/Types';

export const ENEMY_STAT_MULTIPLIER_PER_WAVE = 0.05;
export const WAVE_UPGRADE_PHASE_DURATION_MS = 3000;
export const WAVE_SPAWN_INTERVAL_SECONDS = 0.45;
export const ENEMY_XP_DROP = 25;

export const ENEMY_BASE_STATS: Record<EnemyType, EntityStats> = {
    KAMIKAZE: {
        maxHealth: 30,
        healthRegen: 0,
        bodyDamage: 5,
        bulletSpeed: 0,
        bulletPenetration: 0,
        bulletDamage: 0,
        reload: 0,
        movementSpeed: 100
    },
    RANGED: {
        maxHealth: 22,
        healthRegen: 0,
        bodyDamage: 3,
        bulletSpeed: 320,
        bulletPenetration: 1,
        bulletDamage: 8,
        reload: 1.2,
        movementSpeed: 85
    }, 
    SENTINEL: {
        maxHealth: 55,
        healthRegen: 0,
        bodyDamage: 6,
        bulletSpeed: 0,
        bulletPenetration: 0,
        bulletDamage: 0,
        reload: 0,
        movementSpeed: 70
    },
    MIRROR_BOSS: {
        maxHealth: 100, // placeholder — substituído pelos stats do jogador no spawn
        healthRegen: 0,
        bodyDamage: 10,
        bulletSpeed: 500,
        bulletPenetration: 1,
        bulletDamage: 15,
        reload: 0,
        movementSpeed: 150

    }
    
};

export const WAVE_MILESTONES: WaveMilestone[] = [
    {
        startWave: 1,
        enemyWeights: { KAMIKAZE: 100 },
        maxActiveEnemies: 10,
        totalEnemiesToSpawn: 20,
        sizeMultiplier: 0.08
    },
    {
        startWave: 2,
        enemyWeights: { KAMIKAZE: 80, RANGED: 20 },
        maxActiveEnemies: 14,
        totalEnemiesToSpawn: 28,
        sizeMultiplier: 0.1
    },

     {
        startWave: 3,
        enemyWeights: { KAMIKAZE: 60, RANGED: 30, SENTINEL: 10 },
        maxActiveEnemies: 18,
        totalEnemiesToSpawn: 36,
        sizeMultiplier: 0.13
    },
    

        
];

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
