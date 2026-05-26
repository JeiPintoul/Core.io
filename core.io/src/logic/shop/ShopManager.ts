import type { CardRarity, ShopItemData, UpgradeRollOption } from '../../shared/Types';
import { SHOP_CARD_PRICE_BY_RARITY, SHOP_HEAL_PRICE } from '../constants/GameBalance';
import { CARD_RARITIES, UpgradeManager } from '../UpgradeManager';

export type ShopPurchaseResult =
    | { ok: true; item: ShopItemData }
    | { ok: false; reason: 'SOLD_OUT' | 'INSUFFICIENT_COINS' | 'UNKNOWN_ITEM' };

type ShopInventoryItem = ShopItemData;

const ITEM_RADIUS = 44;
const CARD_STOCK_PER_RARITY = 1;

export class ShopManager {
    private readonly items = new Map<string, ShopInventoryItem>();
    private merchant: { x: number; y: number; radius: number; label: string } | null = null;

    constructor(private readonly upgradeManager: UpgradeManager) {}

    public reset(): void {
        this.items.clear();
        this.merchant = null;
    }

    public openShop(centerX: number, centerY: number): void {
        this.items.clear();
        this.merchant = { x: centerX, y: centerY - 380, radius: 42, label: '67' };

        this.addItem({
            id: 'shop_heal',
            kind: 'HEAL',
            x: centerX - 560,
            y: centerY + 70,
            radius: ITEM_RADIUS,
            price: SHOP_HEAL_PRICE,
            sold: false,
            label: 'Reparo',
            stock: 1,
        });

        const startX = centerX - 520;
        for (let index = 0; index < CARD_RARITIES.length; index++) {
            const rarity = CARD_RARITIES[index];
            this.addItem({
                id: `shop_card_${rarity.toLowerCase()}`,
                kind: 'CARD',
                rarity,
                x: startX + index * 260,
                y: centerY + 330,
                radius: ITEM_RADIUS,
                price: SHOP_CARD_PRICE_BY_RARITY[rarity],
                sold: false,
                label: `Carta ${this.formatRarity(rarity)}`,
                stock: CARD_STOCK_PER_RARITY,
            });
        }
    }

    public getItems(): ShopItemData[] {
        return Array.from(this.items.values()).map((item) => ({
            id: item.id,
            kind: item.kind,
            x: item.x,
            y: item.y,
            radius: item.radius,
            price: item.price,
            sold: item.sold,
            label: item.label,
            rarity: item.rarity,
            stock: item.stock,
        }));
    }

    public getMerchant(): { x: number; y: number; radius: number; label: string } | null {
        return this.merchant ? { ...this.merchant } : null;
    }

    public purchase(itemId: string, coins: number): ShopPurchaseResult {
        const item = this.items.get(itemId);
        if (!item) return { ok: false, reason: 'UNKNOWN_ITEM' };
        if (item.sold || (item.stock ?? 1) <= 0) return { ok: false, reason: 'SOLD_OUT' };
        if (coins < item.price) return { ok: false, reason: 'INSUFFICIENT_COINS' };

        item.sold = true;
        item.stock = 0;

        return { ok: true, item: { ...item } };
    }

    public rollCardOptions(rarity: CardRarity, count = 3, initialExcludedIds: Iterable<string> = []): UpgradeRollOption[] {
        const options: UpgradeRollOption[] = [];
        const excludedIds = new Set<string>(initialExcludedIds);

        for (let index = 0; index < count; index++) {
            const card = this.upgradeManager.rollCardByRarity(rarity, excludedIds);
            excludedIds.add(card.id);
            options.push({ card, colorHex: card.paintColor });
        }

        return options;
    }

    private addItem(item: ShopInventoryItem): void {
        this.items.set(item.id, item);
    }

    private formatRarity(rarity: CardRarity): string {
        switch (rarity) {
            case 'COMMON': return 'Comum';
            case 'UNCOMMON': return 'Incomum';
            case 'RARE': return 'Rara';
            case 'EPIC': return 'Epica';
            case 'LEGENDARY': return 'Lendaria';
        }
    }
}
