import { createIcons, Lock, Unlock } from 'lucide';
import {
    MODIFIER_META,
    RARITY_LABELS_PTBR,
    formatModifierValue,
    getUpgradeCardFlavor,
    getUpgradeCardSymbol
} from './UpgradePresentation';
import { emitGameEvent, GameEvents, onGameEvent } from '../../shared/EventBus';
import { PLAYER_IDS, type EntityStats, type PlayerId, type UpgradeRollOption } from '../../shared/Types';
import type { HudController } from './HudController';

export type UpgradeUiMode = 'INITIAL_MENU' | 'IN_GAME' | 'PAUSED' | 'UPGRADE' | 'TANK_EVOLUTION' | 'GAME_OVER';
export type UpgradeGamepadActionKey = 'up' | 'down' | 'left' | 'right' | 'confirm';
export type UpgradeGamepadActionState = Record<UpgradeGamepadActionKey, boolean>;

interface UpgradeModalControllerOptions {
    hudController: HudController;
    getPlayerName: (playerId: PlayerId) => string;
    getUiMode: () => UpgradeUiMode;
    setUiMode: (mode: UpgradeUiMode) => void;
    isPauseMenuVisible: () => boolean;
}

const UPGRADE_GAMEPAD_GRID_COLUMNS = 3;
const DEFAULT_UPGRADE_REROLLS = 0;
const RARITY_CARD_COLORS: Record<UpgradeRollOption['card']['rarity'], string> = {
    COMMON: '#9aa7bd',
    UNCOMMON: '#44cc66',
    RARE: '#4d96ff',
    EPIC: '#b388ff',
    LEGENDARY: '#ffbf4d'
};

export class UpgradeModalController {
    private readonly upgradeModal = document.getElementById('upgrade-modal');
    private readonly upgradeTitleEl = this.upgradeModal?.querySelector('h2') as HTMLHeadingElement | null;
    private readonly upgradeRemainingEl = document.getElementById('upgrade-remaining');
    private readonly upgradeCardsEl = document.getElementById('upgrade-cards');
    private readonly btnUpgradeDefer = document.getElementById('btn-upgrade-defer') as HTMLButtonElement | null;
    private readonly btnUpgradeReroll = document.getElementById('btn-upgrade-reroll') as HTMLButtonElement | null;
    private readonly btnUpgradeBank = document.getElementById('hud-upgrade-bank') as HTMLButtonElement | null;
    private readonly rerollsByPlayer: Record<PlayerId, number> = {
        player_1: DEFAULT_UPGRADE_REROLLS,
        player_2: DEFAULT_UPGRADE_REROLLS,
        player_3: DEFAULT_UPGRADE_REROLLS,
        player_4: DEFAULT_UPGRADE_REROLLS
    };
    private readonly unsubscribers: Array<() => void> = [];

    private waitingSelection = false;
    private activePlayerId: PlayerId | null = null;
    private activeOptions: UpgradeRollOption[] = [];
    private lockedOptionIndexes = new Set<number>();
    private preserveRerollStateOnNextOptions = false;
    private gamepadCardIndex = 0;
    private isShop = false;

    constructor(private readonly options: UpgradeModalControllerOptions) {
        this.bindDomEvents();
        this.bindGameEvents();
        this.updateRerollButton();
    }

    public destroy(): void {
        for (const unsubscribe of this.unsubscribers) unsubscribe();
        this.unsubscribers.length = 0;
    }

    public getActivePlayerId(): PlayerId | null {
        return this.activePlayerId;
    }

    public resetForRun(): void {
        this.close();
        for (const playerId of PLAYER_IDS) this.rerollsByPlayer[playerId] = DEFAULT_UPGRADE_REROLLS;
        this.isShop = false;
    }

    public close(): void {
        this.setVisible(false);
        this.setSelectionOwner(null);
        this.clearCards();
        this.options.hudController.clearStatPreview();
        this.options.hudController.setStatsPinned(false);
        this.waitingSelection = false;
        this.activeOptions = [];
        this.lockedOptionIndexes = new Set<number>();
        this.preserveRerollStateOnNextOptions = false;
        this.gamepadCardIndex = 0;
        this.clearGamepadSelectionVisual();
    }

    public clearGamepadSelectionVisual(): void {
        this.upgradeCardsEl?.querySelectorAll('button.upgrade-card.is-gamepad-selected').forEach((button) => {
            button.classList.remove('is-gamepad-selected');
        });
    }

    public handleGamepadNavigation(
        actions: UpgradeGamepadActionState,
        consumeAction: (actionKey: UpgradeGamepadActionKey, pressed: boolean) => boolean
    ): void {
        if (!this.upgradeModal?.classList.contains('is-visible') || this.waitingSelection || this.activeOptions.length === 0 || !this.upgradeCardsEl) return;

        const cardButtons = Array.from(this.upgradeCardsEl.querySelectorAll<HTMLButtonElement>('button.upgrade-card'));
        if (cardButtons.length === 0) return;

        let nextIndex = this.gamepadCardIndex;
        if (consumeAction('left', actions.left)) nextIndex -= 1;
        if (consumeAction('right', actions.right)) nextIndex += 1;
        if (consumeAction('up', actions.up)) nextIndex -= UPGRADE_GAMEPAD_GRID_COLUMNS;
        if (consumeAction('down', actions.down)) nextIndex += UPGRADE_GAMEPAD_GRID_COLUMNS;

        if (nextIndex !== this.gamepadCardIndex) {
            this.gamepadCardIndex = ((nextIndex % cardButtons.length) + cardButtons.length) % cardButtons.length;
            this.applyGamepadSelectionVisual();
        }

        if (consumeAction('confirm', actions.confirm)) cardButtons[this.gamepadCardIndex]?.click();
    }

    private bindDomEvents(): void {
        this.btnUpgradeBank?.addEventListener('click', () => {
            const mode = this.options.getUiMode();
            if (mode === 'INITIAL_MENU' || mode === 'GAME_OVER') return;
            if (!this.isShop) return;
            emitGameEvent(GameEvents.UPGRADE_REOPEN_REQUESTED, undefined);
        });
        this.btnUpgradeBank?.addEventListener('pointerdown', (event) => event.stopPropagation());

        this.btnUpgradeDefer?.addEventListener('click', () => {
            if (!this.activePlayerId || this.waitingSelection) return;
            const playerId = this.activePlayerId;
            const lockedOptionIndexes = Array.from(this.lockedOptionIndexes);
            this.options.hudController.clearStatPreview();
            this.hideDeferredModal();
            emitGameEvent(GameEvents.UPGRADE_DEFERRED, {
                playerId,
                lockedOptionIndexes
            });
        });
        this.btnUpgradeDefer?.addEventListener('pointerdown', (event) => event.stopPropagation());

        this.btnUpgradeReroll?.addEventListener('click', () => this.rerollUnlockedCards());
        this.btnUpgradeReroll?.addEventListener('pointerdown', (event) => event.stopPropagation());
    }

    private bindGameEvents(): void {
        this.unsubscribers.push(onGameEvent(GameEvents.STATE_UPDATE, (state) => {
            this.isShop = state.isShop ?? false;
        }));

        this.unsubscribers.push(onGameEvent(GameEvents.UPGRADE_PHASE_STARTED, ({ rerollPlayerIds }) => {
            for (const playerId of new Set(rerollPlayerIds)) {
                this.rerollsByPlayer[playerId] += 1;
            }
            this.updateRerollButton();
        }));

        this.unsubscribers.push(onGameEvent(GameEvents.SHOW_UPGRADE_MODAL, ({ playerId, upgradesRemaining }) => {
            this.open(playerId, upgradesRemaining, null);
        }));

        this.unsubscribers.push(onGameEvent(GameEvents.UPDATE_UPGRADE_MODAL, ({ playerId, upgradesRemaining, options, lockedOptionIndexes }) => {
            this.open(playerId, upgradesRemaining, options, lockedOptionIndexes);
        }));

        this.unsubscribers.push(onGameEvent(GameEvents.HIDE_UPGRADE_MODAL, () => {
            this.close();
            const mode = this.options.getUiMode();
            if (mode === 'GAME_OVER' || mode === 'INITIAL_MENU') return;
            this.options.setUiMode(this.options.isPauseMenuVisible() ? 'PAUSED' : 'IN_GAME');
        }));
    }

    private open(playerId: PlayerId, upgradesRemaining: number, options: UpgradeRollOption[] | null, lockedOptionIndexes?: number[]): void {
        this.setVisible(true);
        this.setSelectionOwner(playerId);
        this.options.hudController.setStatsPinned(true, 'upgrade');
        this.options.hudController.clearStatPreview();
        this.setRemaining(upgradesRemaining);
        this.waitingSelection = false;
        this.gamepadCardIndex = 0;

        if (options) {
            if (lockedOptionIndexes) {
                this.lockedOptionIndexes = new Set(lockedOptionIndexes);
            } else if (!this.preserveRerollStateOnNextOptions) {
                this.lockedOptionIndexes = new Set<number>();
            }
            this.preserveRerollStateOnNextOptions = false;
            this.renderCards(options);
            this.setCardsDisabled(false);
        } else {
            this.lockedOptionIndexes = new Set<number>();
            this.preserveRerollStateOnNextOptions = false;
            this.updateRerollButton();
        }

        this.options.setUiMode('UPGRADE');
    }

    private setVisible(visible: boolean): void {
        this.upgradeModal?.classList.toggle('is-visible', visible);
    }

    private hideDeferredModal(): void {
        this.setVisible(false);
        this.setSelectionOwner(null);
        this.options.hudController.clearStatPreview();
        this.options.hudController.setStatsPinned(false);
        this.preserveRerollStateOnNextOptions = true;
        const mode = this.options.getUiMode();
        if (mode !== 'GAME_OVER' && mode !== 'INITIAL_MENU') {
            this.options.setUiMode(this.options.isPauseMenuVisible() ? 'PAUSED' : 'IN_GAME');
        }
    }

    private setRemaining(value: number): void {
        if (this.upgradeRemainingEl) this.upgradeRemainingEl.textContent = `Aprimoramentos Restantes: ${Math.max(0, value)}`;
    }

    private setSelectionOwner(playerId: PlayerId | null): void {
        this.activePlayerId = playerId;
        this.options.hudController.setActiveUpgradePlayer(playerId);
        if (!this.upgradeTitleEl) return;
        this.upgradeTitleEl.textContent = playerId ? `Escolha de ${this.options.getPlayerName(playerId)}` : 'Escolha um Aprimoramento';
    }

    private clearCards(): void {
        this.upgradeCardsEl?.replaceChildren();
        this.updateRerollButton();
    }

    private setCardsDisabled(disabled: boolean): void {
        if (!this.upgradeCardsEl) return;
        for (const cardButton of this.upgradeCardsEl.querySelectorAll('button')) cardButton.disabled = disabled;
        this.updateRerollButton();
    }

    private renderCards(options: UpgradeRollOption[]): void {
        if (!this.upgradeCardsEl) return;

        this.activeOptions = options;
        this.clearCards();

        for (const [index, option] of options.entries()) {
            this.upgradeCardsEl.appendChild(this.createCardButton(option, index));
        }

        if (options.length > 0) {
            this.gamepadCardIndex = Math.max(0, Math.min(this.gamepadCardIndex, options.length - 1));
            this.applyGamepadSelectionVisual();
        }

        this.updateRerollButton();
        createIcons({ icons: { Lock, Unlock } });
    }

    private createCardButton(option: UpgradeRollOption, index: number): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `upgrade-card upgrade-card--${option.card.rarity.toLowerCase()}`;
        button.style.setProperty('--upgrade-card-color', RARITY_CARD_COLORS[option.card.rarity]);
        button.dataset.optionIndex = index.toString();

        const rarityEl = document.createElement('span');
        rarityEl.className = 'upgrade-card-rarity';
        rarityEl.textContent = RARITY_LABELS_PTBR[option.card.rarity];

        const nameEl = document.createElement('h3');
        nameEl.className = 'upgrade-card-name';
        nameEl.textContent = option.card.name;

        const artEl = document.createElement('div');
        artEl.className = 'upgrade-card-art';

        const symbolEl = document.createElement('span');
        symbolEl.className = 'upgrade-card-art-symbol';
        symbolEl.textContent = getUpgradeCardSymbol(option.card.id);

        const flavorEl = document.createElement('p');
        flavorEl.className = 'upgrade-card-art-flavor';
        flavorEl.textContent = getUpgradeCardFlavor(option.card.id);
        artEl.append(symbolEl, flavorEl);

        const descriptionEl = document.createElement('p');
        descriptionEl.className = 'upgrade-card-description';
        descriptionEl.textContent = option.card.description;

        const footerEl = document.createElement('div');
        footerEl.className = 'upgrade-card-footer';
        const chooseText = document.createElement('span');
        chooseText.textContent = 'TOQUE PARA ESCOLHER';
        footerEl.append(chooseText);

        const lockControl = this.createLockControl(index);
        button.append(rarityEl, nameEl, artEl, descriptionEl, this.renderModifierBadges(option.card.modifiers), footerEl, lockControl);

        button.addEventListener('mouseenter', () => {
            if (this.waitingSelection) return;
            this.gamepadCardIndex = index;
            this.applyGamepadSelectionVisual();
            this.options.hudController.previewStatModifiers(option.card.modifiers);
        });

        button.addEventListener('mouseleave', () => {
            if (!this.waitingSelection) this.options.hudController.clearStatPreview();
        });

        button.addEventListener('click', () => {
            if (this.waitingSelection || !this.activePlayerId) return;
            this.waitingSelection = true;
            this.setCardsDisabled(true);
            this.options.hudController.clearStatPreview();
            const lockedOptionIndexes = Array.from(this.lockedOptionIndexes);
            if (this.lockedOptionIndexes.has(index)) {
                this.lockedOptionIndexes.delete(index);
            }
            this.preserveRerollStateOnNextOptions = true;
            emitGameEvent(GameEvents.CARD_SELECTED, {
                playerId: this.activePlayerId,
                cardId: option.card.id,
                colorHex: option.colorHex,
                lockedOptionIndexes
            });
        });

        return button;
    }

    private createLockControl(index: number): HTMLElement {
        const isLocked = this.lockedOptionIndexes.has(index);
        const lockControl = document.createElement('span');
        lockControl.className = 'upgrade-card-lock';
        lockControl.setAttribute('role', 'button');
        lockControl.setAttribute('aria-label', isLocked ? 'Destravar carta' : 'Travar carta');
        lockControl.dataset.locked = String(isLocked);
        lockControl.innerHTML = `<i data-lucide="${isLocked ? 'lock' : 'unlock'}"></i>`;

        lockControl.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (this.waitingSelection) return;
            if (this.lockedOptionIndexes.has(index)) this.lockedOptionIndexes.delete(index);
            else this.lockedOptionIndexes.add(index);
            this.renderCards(this.activeOptions);
        });

        lockControl.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            event.stopPropagation();
        });

        return lockControl;
    }

    private renderModifierBadges(modifiers: UpgradeRollOption['card']['modifiers']): HTMLElement {
        const container = document.createElement('div');
        container.className = 'upgrade-card-modifiers';

        for (const [statKey, value] of Object.entries(modifiers) as Array<[keyof EntityStats, number]>) {
            if (value === 0) continue;

            const meta = MODIFIER_META[statKey];
            const badge = document.createElement('div');
            badge.className = `upgrade-modifier upgrade-modifier--${meta.tone}`;

            const icon = document.createElement('span');
            icon.className = 'upgrade-modifier-icon';
            icon.textContent = meta.icon;

            const label = document.createElement('span');
            label.className = 'upgrade-modifier-label';
            label.textContent = meta.label;

            const amount = document.createElement('strong');
            amount.className = 'upgrade-modifier-value';
            amount.textContent = formatModifierValue(statKey, value);

            badge.append(icon, label, amount);
            container.appendChild(badge);
        }

        return container;
    }

    private rerollUnlockedCards(): void {
        if (!this.activePlayerId || this.waitingSelection) return;
        if (this.getActiveRerolls() <= 0) return;
        if (this.activeOptions.length > 0 && this.lockedOptionIndexes.size >= this.activeOptions.length) return;

        this.rerollsByPlayer[this.activePlayerId] = Math.max(0, this.rerollsByPlayer[this.activePlayerId] - 1);
        this.preserveRerollStateOnNextOptions = true;
        this.updateRerollButton();

        emitGameEvent(GameEvents.CARD_REROLL_REQUESTED, {
            playerId: this.activePlayerId,
            lockedOptionIndexes: Array.from(this.lockedOptionIndexes)
        });
    }

    private getActiveRerolls(): number {
        return this.activePlayerId ? this.rerollsByPlayer[this.activePlayerId] : 0;
    }

    private updateRerollButton(): void {
        if (!this.btnUpgradeReroll) return;
        const available = this.getActiveRerolls();
        const allLocked = this.activeOptions.length > 0 && this.lockedOptionIndexes.size >= this.activeOptions.length;
        this.btnUpgradeReroll.disabled = this.waitingSelection || available <= 0 || allLocked;
        this.btnUpgradeReroll.querySelector('strong')?.replaceChildren(document.createTextNode(String(available)));
    }

    private applyGamepadSelectionVisual(): void {
        if (!this.upgradeCardsEl || this.activeOptions.length === 0) return;

        const buttons = Array.from(this.upgradeCardsEl.querySelectorAll<HTMLButtonElement>('button.upgrade-card'));
        if (buttons.length === 0) return;

        this.gamepadCardIndex = (this.gamepadCardIndex + buttons.length) % buttons.length;
        for (const [index, button] of buttons.entries()) {
            button.classList.toggle('is-gamepad-selected', index === this.gamepadCardIndex);
        }

        const selectedOption = this.activeOptions[this.gamepadCardIndex];
        if (selectedOption && !this.waitingSelection) {
            this.options.hudController.previewStatModifiers(selectedOption.card.modifiers);
        }
    }
}
