import { describe, expect, it } from 'vitest';
import { calculateCoinDrop } from '../constants/GameBalance';
import { COOP_ASSIST_REWARD_RATIO, getRegularEnemyRewardScale } from '../constants/CoopRewardBalance';
import type { EnemyType, PlayerId } from '../../shared/Types';
import type { HostileEntity } from '../entities/enemies/HostileEntity';
import type { Player } from '../entities/player/Player';
import { RewardDistributor } from './RewardDistributor';

interface PlayerProbe {
    readonly player: Player;
    readonly xp: () => number;
    readonly coins: () => number;
}

function createPlayerProbe(id: PlayerId, health = 100): PlayerProbe {
    let xp = 0;
    let coins = 0;

    const player = {
        id,
        health,
        gainXp: (amount: number) => { xp += amount; },
        addCoins: (amount: number) => { coins += amount; },
    } satisfies Pick<Player, 'id' | 'health' | 'gainXp' | 'addCoins'>;

    return {
        player: player as unknown as Player,
        xp: () => xp,
        coins: () => coins,
    };
}

function createEnemy(enemyType: EnemyType, xpDrop: number): HostileEntity {
    const enemy = {
        id: `${enemyType}_test`,
        enemyType,
        xpDrop,
    } satisfies Pick<HostileEntity, 'id' | 'enemyType' | 'xpDrop'>;

    return enemy as unknown as HostileEntity;
}

describe('RewardDistributor', () => {
    it('gives regular enemy full scaled reward to the killer and assist rewards to active allies', () => {
        const distributor = new RewardDistributor();
        const player1 = createPlayerProbe('player_1');
        const player2 = createPlayerProbe('player_2');
        const player3 = createPlayerProbe('player_3');
        const player4 = createPlayerProbe('player_4', 0);
        const players = [player1, player2, player3, player4];
        const enemy = createEnemy('KAMIKAZE', 100);

        const result = distributor.distributeEnemyReward(enemy, players.map((probe) => probe.player), 'player_2');

        const scale = getRegularEnemyRewardScale(3);
        const killerXp = Math.round(enemy.xpDrop * scale);
        const assistXp = Math.round(enemy.xpDrop * scale * COOP_ASSIST_REWARD_RATIO);

        expect(result).toEqual({ xpDropped: killerXp, coinDropped: calculateCoinDrop(killerXp) });
        expect(player1.xp()).toBe(assistXp);
        expect(player1.coins()).toBe(calculateCoinDrop(assistXp));
        expect(player2.xp()).toBe(killerXp);
        expect(player2.coins()).toBe(calculateCoinDrop(killerXp));
        expect(player3.xp()).toBe(assistXp);
        expect(player3.coins()).toBe(calculateCoinDrop(assistXp));
        expect(player4.xp()).toBe(0);
        expect(player4.coins()).toBe(0);
    });

    it('does not grant regular enemy rewards without a player damage source', () => {
        const distributor = new RewardDistributor();
        const player = createPlayerProbe('player_1');
        const enemy = createEnemy('BRUTE', 120);

        const result = distributor.distributeEnemyReward(enemy, [player.player], null);

        expect(result).toEqual({ xpDropped: 0, coinDropped: 0 });
        expect(player.xp()).toBe(0);
        expect(player.coins()).toBe(0);
    });

    it('gives full unscaled boss rewards to every active player', () => {
        const distributor = new RewardDistributor();
        const player1 = createPlayerProbe('player_1');
        const player2 = createPlayerProbe('player_2');
        const player3 = createPlayerProbe('player_3', 0);
        const enemy = createEnemy('DREADNOUGHT', 500);

        const result = distributor.distributeEnemyReward(enemy, [player1.player, player2.player, player3.player], 'player_1');

        const coins = calculateCoinDrop(enemy.xpDrop);

        expect(result).toEqual({ xpDropped: enemy.xpDrop, coinDropped: coins });
        expect(player1.xp()).toBe(enemy.xpDrop);
        expect(player1.coins()).toBe(coins);
        expect(player2.xp()).toBe(enemy.xpDrop);
        expect(player2.coins()).toBe(coins);
        expect(player3.xp()).toBe(0);
        expect(player3.coins()).toBe(0);
    });
});
