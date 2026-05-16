import type { CardRarity, UpgradeRollOption } from '../shared/Types';
import { UPGRADE_CARDS, UPGRADE_CARDS_BY_RARITY, UPGRADE_CARD_COLORS, type UpgradeCard } from './constants/CardsDatabase';

type RarityWeights = Record<CardRarity, number>;

const LEVEL_RARITY_WEIGHTS: Array<{ maxLevel: number; weights: RarityWeights }> = [
    {
        maxLevel: 4,
        weights: { COMMON: 70, UNCOMMON: 22, RARE: 6, EPIC: 2, LEGENDARY: 0 }
    },
    {
        maxLevel: 8,
        weights: { COMMON: 50, UNCOMMON: 32, RARE: 13, EPIC: 4, LEGENDARY: 1 }
    },
    {
        maxLevel: 14,
        weights: { COMMON: 34, UNCOMMON: 34, RARE: 20, EPIC: 9, LEGENDARY: 3 }
    },
    {
        maxLevel: Number.POSITIVE_INFINITY,
        weights: { COMMON: 20, UNCOMMON: 30, RARE: 27, EPIC: 16, LEGENDARY: 7 }
    }
];

export class UpgradeManager {
    public rollUpgradeOptions(playerLevel: number): UpgradeRollOption[] {
        const options: UpgradeRollOption[] = [];
        const selectedCardIds = new Set<string>();
        const weights = this.getWeightsForLevel(playerLevel);

        for (let index = 0; index < 3; index++) {
            const rarity = this.rollRarity(weights);
            const card = this.rollCard(rarity, selectedCardIds);
            selectedCardIds.add(card.id);

            options.push({
                card,
                colorHex: this.rollColor()
            });
        }

        return options;
    }

    public getCardById(cardId: string): UpgradeCard | undefined {
        return UPGRADE_CARDS.find((card) => card.id === cardId);
    }

    private getWeightsForLevel(playerLevel: number): RarityWeights {
        for (const tier of LEVEL_RARITY_WEIGHTS) {
            if (playerLevel <= tier.maxLevel) {
                return tier.weights;
            }
        }

        return LEVEL_RARITY_WEIGHTS[LEVEL_RARITY_WEIGHTS.length - 1].weights;
    }

    private rollRarity(weights: RarityWeights): CardRarity {
        const entries = Object.entries(weights) as Array<[CardRarity, number]>;
        const totalWeight = entries.reduce((acc, [, weight]) => acc + Math.max(0, weight), 0);

        if (totalWeight <= 0) {
            return 'COMMON';
        }

        let roll = Math.random() * totalWeight;
        for (const [rarity, weight] of entries) {
            roll -= Math.max(0, weight);
            if (roll <= 0) {
                return rarity;
            }
        }

        return 'COMMON';
    }

    private rollCard(rarity: CardRarity, excludedIds: Set<string>): UpgradeCard {
        const rarityPool = UPGRADE_CARDS_BY_RARITY[rarity].filter((card) => !excludedIds.has(card.id));
        if (rarityPool.length > 0) {
            return rarityPool[Math.floor(Math.random() * rarityPool.length)];
        }

        const fallbackPool = UPGRADE_CARDS.filter((card) => !excludedIds.has(card.id));
        if (fallbackPool.length > 0) {
            return fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
        }

        return UPGRADE_CARDS[0];
    }

    private rollColor(): string {
        return UPGRADE_CARD_COLORS[Math.floor(Math.random() * UPGRADE_CARD_COLORS.length)];
    }
}
