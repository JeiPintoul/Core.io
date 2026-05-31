import type { CardRarity, UpgradeRollOption } from '../shared/Types';
import { UPGRADE_CARDS, UPGRADE_CARDS_BY_RARITY, type UpgradeCard } from './constants/CardsDatabase';
import { MathRng, type Rng } from './Rng';

type RarityWeights = Record<CardRarity, number>;

export const CARD_RARITIES: CardRarity[] = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];

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
    constructor(private readonly rng: Rng = new MathRng()) {}

    public rollUpgradeOptions(playerLevel: number): UpgradeRollOption[] {
        const options: UpgradeRollOption[] = [];
        const selectedCardIds = new Set<string>();
        const weights = this.getWeightsForLevel(playerLevel);

        for (let index = 0; index < 3; index++) {
            const rarity = this.rollRarity(weights);
            const card = this.rollCard(rarity, selectedCardIds);
            selectedCardIds.add(card.id);

            options.push({ card, colorHex: card.paintColor });
        }

        return options;
    }

    public rerollUpgradeOption(playerLevel: number, excludedCardIds: readonly string[]): UpgradeRollOption {
        const excludedIds = new Set(excludedCardIds);
        const rarity = this.rollRarity(this.getWeightsForLevel(playerLevel));
        const card = this.rollCard(rarity, excludedIds);
        return { card, colorHex: card.paintColor };
    }

    public rollReplacementOptions(
        playerLevel: number,
        currentOptions: UpgradeRollOption[],
        lockedOptionIndexes: Iterable<number>,
        selectedCardId?: string
    ): UpgradeRollOption[] {
        const nextOptions = [...currentOptions];
        const lockedIndexes = this.normalizeLockedIndexes(lockedOptionIndexes, nextOptions.length);
        const excludedIds = new Set(
            currentOptions
                .filter((_, index) => lockedIndexes.has(index))
                .map((option) => option.card.id)
        );
        if (selectedCardId) excludedIds.add(selectedCardId);

        for (let index = 0; index < nextOptions.length; index++) {
            if (lockedIndexes.has(index) && nextOptions[index]?.card.id !== selectedCardId) continue;
            nextOptions[index] = this.rerollUpgradeOption(playerLevel, Array.from(excludedIds));
            excludedIds.add(nextOptions[index].card.id);
        }

        return nextOptions;
    }

    public getCardById(cardId: string): UpgradeCard | undefined {
        return UPGRADE_CARDS.find((card) => card.id === cardId);
    }

    public rollCardByRarity(rarity: CardRarity, excludedIds: Set<string> = new Set()): UpgradeCard {
        return this.rollCard(rarity, excludedIds);
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

        let roll = this.rng.random() * totalWeight;
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
            return rarityPool[Math.floor(this.rng.random() * rarityPool.length)];
        }

        const fallbackPool = UPGRADE_CARDS.filter((card) => !excludedIds.has(card.id));
        if (fallbackPool.length > 0) {
            return fallbackPool[Math.floor(this.rng.random() * fallbackPool.length)];
        }

        return UPGRADE_CARDS[0];
    }

    private normalizeLockedIndexes(indexes: Iterable<number>, optionCount: number): Set<number> {
        const result = new Set<number>();
        for (const index of indexes) {
            if (Number.isInteger(index) && index >= 0 && index < optionCount) result.add(index);
        }
        return result;
    }
}
