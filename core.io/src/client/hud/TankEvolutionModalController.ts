import { emitGameEvent, GameEvents, onGameEvent } from '../../shared/EventBus';
import type { TankEvolutionModalPayload, TankEvolutionOption, TankFormId } from '../../shared/Types';

const GAMEPAD_TREE_BUTTON_INDEX = 3;
const GAMEPAD_CHOICE_BUTTON_INDEX = 2;
const GAMEPAD_CONFIRM_BUTTON_INDEX = 0;
const GAMEPAD_CANCEL_BUTTON_INDEX = 1;
const GAMEPAD_NAV_AXIS_THRESHOLD = 0.55;

export class TankEvolutionModalController {
    private readonly rootEl = document.getElementById('tank-evolution-modal');
    private readonly treeEl = document.getElementById('tank-evolution-tree');
    private readonly wheelEl = document.getElementById('tank-evolution-wheel');
    private readonly choiceListEl = document.getElementById('tank-evolution-choice-list');
    private readonly openChoiceGroup = document.getElementById('hud-tank-evolution-trigger') as HTMLElement | null;
    private readonly openChoiceBtn = document.getElementById('hud-tank-evolution') as HTMLButtonElement | null;
    private readonly hideChoiceBtn = document.getElementById('hud-tank-evolution-hide') as HTMLButtonElement | null;
    private readonly closeBtn = document.getElementById('btn-tank-evolution-close') as HTMLButtonElement | null;
    private readonly unsubscribers: Array<() => void> = [];
    private gamepadPollFrameId: number | null = null;
    private treeHoldOpen = false;
    private choiceOpen = false;
    private lastGamepadTreeButtonPressed = false;
    private lastGamepadChoiceButtonPressed = false;
    private lastGamepadConfirmButtonPressed = false;
    private lastGamepadCancelButtonPressed = false;
    private lastGamepadNavDirection = 0;
    private choiceFocusIndex = 0;
    private choiceButtonHiddenByUser = false;
    private activePayload: TankEvolutionModalPayload | null = null;

    constructor() {
        this.bindDomEvents();
        this.bindGameEvents();
        this.gamepadPollFrameId = window.requestAnimationFrame(() => this.pollGamepad());
    }

    public destroy(): void {
        for (const unsubscribe of this.unsubscribers) unsubscribe();
        this.unsubscribers.length = 0;
        if (this.gamepadPollFrameId !== null) {
            window.cancelAnimationFrame(this.gamepadPollFrameId);
            this.gamepadPollFrameId = null;
        }
    }

    private bindDomEvents(): void {
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        this.openChoiceBtn?.addEventListener('click', () => this.openChoice());
        this.openChoiceBtn?.addEventListener('pointerdown', (event) => event.stopPropagation());
        this.hideChoiceBtn?.addEventListener('click', () => this.hideChoicePrompt());
        this.hideChoiceBtn?.addEventListener('pointerdown', (event) => event.stopPropagation());
        this.closeBtn?.addEventListener('click', () => this.closeChoice());
        this.closeBtn?.addEventListener('pointerdown', (event) => event.stopPropagation());
        this.unsubscribers.push(() => window.removeEventListener('keydown', this.handleKeyDown));
        this.unsubscribers.push(() => window.removeEventListener('keyup', this.handleKeyUp));
    }

    private bindGameEvents(): void {
        this.unsubscribers.push(onGameEvent(GameEvents.SHOW_TANK_EVOLUTION_MODAL, (payload) => this.updatePayload(payload)));
        this.unsubscribers.push(onGameEvent(GameEvents.UPDATE_TANK_EVOLUTION_MODAL, (payload) => this.updatePayload(payload)));
        this.unsubscribers.push(onGameEvent(GameEvents.HIDE_TANK_EVOLUTION_MODAL, () => this.closeAll()));
    }

    private handleKeyDown = (event: KeyboardEvent): void => {
        if (event.repeat || event.key.toLowerCase() !== 'y') return;
        if (this.choiceOpen) return;
        const target = event.target as HTMLElement | null;
        if (target?.closest('input, textarea, [contenteditable="true"]')) return;
        this.treeHoldOpen = true;
        emitGameEvent(GameEvents.TANK_EVOLUTION_REOPEN_REQUESTED, undefined);
        this.openTree();
    };

    private handleKeyUp = (event: KeyboardEvent): void => {
        if (event.key.toLowerCase() !== 'y') return;
        this.treeHoldOpen = false;
        this.closeTree();
    };

    private pollGamepad(): void {
        const gamepads = 'getGamepads' in navigator ? Array.from(navigator.getGamepads()).filter((gamepad): gamepad is Gamepad => !!gamepad?.connected) : [];
        const treePressed = gamepads.some((gamepad) => {
            const button = gamepad?.buttons[GAMEPAD_TREE_BUTTON_INDEX];
            return !!button && (button.pressed || button.value > 0.35);
        });

        if (treePressed && !this.lastGamepadTreeButtonPressed && !this.choiceOpen) {
            this.treeHoldOpen = true;
            emitGameEvent(GameEvents.TANK_EVOLUTION_REOPEN_REQUESTED, undefined);
            this.openTree();
        }

        if (!treePressed && this.lastGamepadTreeButtonPressed) {
            this.treeHoldOpen = false;
            this.closeTree();
        }

        const choicePressed = gamepads.some((gamepad) => this.isButtonPressed(gamepad.buttons[GAMEPAD_CHOICE_BUTTON_INDEX]));
        if (choicePressed && !this.lastGamepadChoiceButtonPressed && !this.choiceOpen) {
            this.openChoice();
        }

        if (this.choiceOpen) this.handleChoiceGamepad(gamepads);

        this.lastGamepadTreeButtonPressed = treePressed;
        this.lastGamepadChoiceButtonPressed = choicePressed;
        this.gamepadPollFrameId = window.requestAnimationFrame(() => this.pollGamepad());
    }

    private updatePayload(payload: TankEvolutionModalPayload): void {
        this.activePayload = payload;
        this.renderTree(payload);
        this.renderChoice(payload);
        this.syncOpenChoiceButton(payload);
        if (this.treeHoldOpen) this.openTree();
    }

    private syncOpenChoiceButton(payload: TankEvolutionModalPayload): void {
        if (!this.openChoiceGroup || !this.openChoiceBtn) return;
        const hasAvailableOption = payload.options.some((option) => option.available);
        this.openChoiceGroup.hidden = !hasAvailableOption;
        this.openChoiceGroup.classList.toggle('is-collapsed', hasAvailableOption && this.choiceButtonHiddenByUser);
        this.openChoiceBtn.textContent = 'EVOLUIR';
        this.openChoiceBtn.dataset.tooltip = 'Escolher evolucao de tank';
    }

    private openTree(): void {
        this.rootEl?.classList.add('is-visible', 'is-tree-visible');
        this.rootEl?.classList.remove('is-choice-visible', 'is-closing');
        this.treeEl?.classList.remove('is-closing');
    }

    private closeTree(): void {
        if (this.choiceOpen) return;
        if (!this.rootEl?.classList.contains('is-tree-visible')) return;
        this.treeEl?.classList.add('is-closing');
        window.setTimeout(() => {
            if (this.treeHoldOpen || this.choiceOpen) return;
            this.rootEl?.classList.remove('is-visible', 'is-tree-visible');
            this.treeEl?.classList.remove('is-closing');
        }, 160);
    }

    private openChoice(): void {
        if (!this.activePayload?.options.some((option) => option.available)) return;
        this.choiceOpen = true;
        this.treeHoldOpen = false;
        this.choiceFocusIndex = 0;
        this.renderChoice(this.activePayload);
        this.rootEl?.classList.add('is-visible', 'is-choice-visible');
        this.rootEl?.classList.remove('is-tree-visible', 'is-closing');
        emitGameEvent(GameEvents.TANK_EVOLUTION_CHOICE_OPENED, undefined);
    }

    private hideChoicePrompt(): void {
        this.choiceButtonHiddenByUser = true;
        this.openChoiceGroup?.classList.add('is-collapsed');
    }

    private closeChoice(): void {
        if (!this.choiceOpen) return;
        this.choiceOpen = false;
        this.rootEl?.classList.add('is-closing');
        emitGameEvent(GameEvents.TANK_EVOLUTION_CHOICE_CLOSED, undefined);
        window.setTimeout(() => {
            if (this.choiceOpen) return;
            this.rootEl?.classList.remove('is-visible', 'is-choice-visible', 'is-closing');
        }, 160);
    }

    private closeAll(): void {
        this.treeHoldOpen = false;
        if (this.choiceOpen) emitGameEvent(GameEvents.TANK_EVOLUTION_CHOICE_CLOSED, undefined);
        this.choiceOpen = false;
        this.choiceButtonHiddenByUser = false;
        this.activePayload = null;
        if (this.openChoiceGroup) this.openChoiceGroup.hidden = true;
        this.rootEl?.classList.remove('is-visible', 'is-tree-visible', 'is-choice-visible', 'is-closing');
        this.treeEl?.classList.remove('is-closing');
    }

    private renderTree(payload: TankEvolutionModalPayload): void {
        if (!this.wheelEl) return;

        this.wheelEl.replaceChildren();

        for (const [index, option] of payload.options.entries()) {
            this.wheelEl.appendChild(this.createTreeNode(option, index, payload.options.length));
        }
    }

    private renderChoice(payload: TankEvolutionModalPayload): void {
        if (!this.choiceListEl) return;
        this.choiceListEl.replaceChildren();
        for (const option of payload.options) {
            if (!option.available) continue;
            this.choiceListEl.appendChild(this.createChoiceButton(option));
        }
        this.applyChoiceFocus();
    }

    private createTreeNode(option: TankEvolutionOption, index: number, total: number): HTMLElement {
        const node = document.createElement('section');
        node.className = 'tank-tree-node';
        node.classList.toggle('is-locked', !option.available);
        const angle = (360 / Math.max(1, total)) * index - 90;
        node.style.setProperty('--option-index', String(index));
        node.style.setProperty('--option-angle', `${angle}deg`);
        node.style.setProperty('--option-angle-inverse', `${-angle}deg`);
        node.append(
            this.createTankPreview(option.id, option.name),
            this.createNodeLabel(option.available ? option.name : `${option.name} LV ${option.requiredLevel}`)
        );
        return node;
    }

    private createChoiceButton(option: TankEvolutionOption): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tank-choice-option';
        button.append(
            this.createTankPreview(option.id, option.name),
            this.createNodeLabel(option.description)
        );
        button.addEventListener('click', () => {
            if (!this.activePayload) return;
            emitGameEvent(GameEvents.TANK_EVOLUTION_SELECTED, {
                playerId: this.activePayload.playerId,
                formId: option.id
            });
            this.closeChoice();
        });
        button.addEventListener('pointerdown', (event) => event.stopPropagation());
        return button;
    }

    private handleChoiceGamepad(gamepads: Gamepad[]): void {
        const navDirection = this.readChoiceNavDirection(gamepads);
        if (navDirection !== 0 && this.lastGamepadNavDirection === 0) this.moveChoiceFocus(navDirection);
        this.lastGamepadNavDirection = navDirection;

        const confirmPressed = gamepads.some((gamepad) => this.isButtonPressed(gamepad.buttons[GAMEPAD_CONFIRM_BUTTON_INDEX]));
        if (confirmPressed && !this.lastGamepadConfirmButtonPressed) {
            this.getChoiceButtons()[this.choiceFocusIndex]?.click();
        }
        this.lastGamepadConfirmButtonPressed = confirmPressed;

        const cancelPressed = gamepads.some((gamepad) => this.isButtonPressed(gamepad.buttons[GAMEPAD_CANCEL_BUTTON_INDEX]));
        if (cancelPressed && !this.lastGamepadCancelButtonPressed) this.closeChoice();
        this.lastGamepadCancelButtonPressed = cancelPressed;
    }

    private readChoiceNavDirection(gamepads: Gamepad[]): number {
        for (const gamepad of gamepads) {
            const axisX = gamepad.axes[0] ?? 0;
            if (this.isButtonPressed(gamepad.buttons[14]) || axisX <= -GAMEPAD_NAV_AXIS_THRESHOLD) return -1;
            if (this.isButtonPressed(gamepad.buttons[15]) || axisX >= GAMEPAD_NAV_AXIS_THRESHOLD) return 1;
        }
        return 0;
    }

    private moveChoiceFocus(direction: number): void {
        const buttons = this.getChoiceButtons();
        if (buttons.length === 0) return;
        this.choiceFocusIndex = (this.choiceFocusIndex + direction + buttons.length) % buttons.length;
        this.applyChoiceFocus();
    }

    private applyChoiceFocus(): void {
        const buttons = this.getChoiceButtons();
        if (buttons.length === 0) return;
        this.choiceFocusIndex = Math.max(0, Math.min(this.choiceFocusIndex, buttons.length - 1));
        buttons.forEach((button, index) => button.classList.toggle('is-gamepad-focused', index === this.choiceFocusIndex));
    }

    private getChoiceButtons(): HTMLButtonElement[] {
        return Array.from(this.choiceListEl?.querySelectorAll<HTMLButtonElement>('.tank-choice-option') ?? []);
    }

    private isButtonPressed(button: GamepadButton | undefined): boolean {
        return !!button && (button.pressed || button.value > 0.35);
    }

    private createTankPreview(formId: TankFormId, label: string): HTMLElement {
        const preview = document.createElement('div');
        preview.className = `tank-preview tank-preview--${formId}`;
        preview.setAttribute('aria-label', label);
        const body = document.createElement('span');
        body.className = 'tank-preview-body';
        preview.append(body);
        const barrelCount = formId === 'twin' ? 2 : 1;
        for (let i = 0; i < barrelCount; i++) {
            const barrel = document.createElement('span');
            barrel.className = 'tank-preview-barrel';
            preview.append(barrel);
        }
        return preview;
    }

    private createNodeLabel(text: string): HTMLElement {
        const label = document.createElement('span');
        label.className = 'tank-node-label';
        label.textContent = text;
        return label;
    }

}
