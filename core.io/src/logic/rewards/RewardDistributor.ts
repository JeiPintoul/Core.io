import type { PlayerId } from '../../shared/Types';
import { calculateCoinDrop } from '../constants/GameBalance';
import { COOP_ASSIST_REWARD_RATIO, getRegularEnemyRewardScale } from '../constants/CoopRewardBalance';
import type { HostileEntity } from '../entities/enemies/HostileEntity';
import type { Player } from '../entities/player/Player';

export interface RewardDistributionResult {
    xpDropped: number;
    coinDropped: number;
}

export class RewardDistributor {
    public distributeEnemyReward(enemy: HostileEntity, players: Player[], killerId: PlayerId | null): RewardDistributionResult {
        const activePlayers = players.filter((player) => player.health > 0);
        if (activePlayers.length === 0 || enemy.xpDrop <= 0) return { xpDropped: 0, coinDropped: 0 };

        if (enemy.enemyType === 'DREADNOUGHT') {
            return this.distributeBossReward(enemy.xpDrop, activePlayers);
        }

        if (!killerId || !activePlayers.some((player) => player.id === killerId)) {
            return { xpDropped: 0, coinDropped: 0 };
        }

        const scale = getRegularEnemyRewardScale(activePlayers.length);
        let primaryXp = 0;
        let primaryCoins = 0;

        for (const player of activePlayers) {
            const ratio = player.id === killerId ? 1 : COOP_ASSIST_REWARD_RATIO;
            const xp = this.toRewardAmount(enemy.xpDrop * scale * ratio);
            const coins = calculateCoinDrop(xp);
            player.gainXp(xp);
            player.addCoins(coins);

            if (player.id === killerId) {
                primaryXp = xp;
                primaryCoins = coins;
            }
        }

        return { xpDropped: primaryXp, coinDropped: primaryCoins };
    }

    private distributeBossReward(baseXp: number, players: Player[]): RewardDistributionResult {
        const xp = this.toRewardAmount(baseXp);
        const coins = calculateCoinDrop(xp);

        for (const player of players) {
            player.gainXp(xp);
            player.addCoins(coins);
        }

        return { xpDropped: xp, coinDropped: coins };
    }

    private toRewardAmount(value: number): number {
        return Math.max(0, Math.round(value));
    }
}
