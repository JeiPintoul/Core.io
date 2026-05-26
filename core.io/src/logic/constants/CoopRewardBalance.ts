import { getDifficultyProfile } from './GameBalance';

export const COOP_ASSIST_REWARD_RATIO = 0.3;

export function getRegularEnemyRewardScale(playerCount: number): number {
    const normalizedPlayerCount = Math.max(1, Math.min(4, Math.floor(playerCount)));
    if (normalizedPlayerCount <= 1) return 1;

    const spawnScale = getDifficultyProfile(normalizedPlayerCount).spawnScale;
    const averageShare = COOP_ASSIST_REWARD_RATIO + ((1 - COOP_ASSIST_REWARD_RATIO) / normalizedPlayerCount);
    return 1 / (spawnScale * averageShare);
}
