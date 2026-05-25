import { createIcons, Keyboard, Gamepad2, Plus, X, Volume2, Volume1, VolumeX } from 'lucide';
import { PLAYER_IDS, type ControlPreference, type PlayerCount, type PlayerId, type RunConfiguration } from '../../shared/Types';
import { getColorsByTier } from '../../logic/constants/ColorConfig';
import { DEFAULT_RUN_CONFIGURATION } from '../../logic/constants/GameBalance';
import { loadLobby, saveLobby, type PersistedLobby, type PersistedSlot } from './lobbyPersistence';

const PRIMARY_COLORS = getColorsByTier('PRIMARY');
const COLOR_ROLES: Record<string, string> = {
    '#ff4444': 'ATTACK',
    '#44cc66': 'SPEED',
    '#4488ff': 'DEFENSE',
};

interface SlotState extends PersistedSlot {
    playerId: PlayerId;
}

export interface LobbyStartPayload {
    runConfiguration: RunConfiguration;
}

export interface LobbyCallbacks {
    onStart: (payload: LobbyStartPayload) => void;
    onOpenHelp: () => void;
    onOpenSettings: () => void;
    onToggleAudioPanel: () => void;
}

interface GamepadActions {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    confirm: boolean;
    cancel: boolean;
}

export class LobbyController {
    private readonly rootEl: HTMLElement;
    private readonly gridEl: HTMLElement;
    private readonly playerCountEl: HTMLElement | null;
    private readonly muteBtn: HTMLButtonElement | null;
    private readonly playBtn: HTMLButtonElement;
    private readonly slots: Record<PlayerId, SlotState>;
    private gamepadFocusIndex = 0;
    private readonly slotEls = new Map<PlayerId, HTMLElement>();

    constructor(private readonly callbacks: LobbyCallbacks) {
        const root = document.getElementById('lobby');
        if (!root) throw new Error('LobbyController: #lobby root element not found');
        this.rootEl = root;

        const grid = root.querySelector<HTMLElement>('.lobby-grid');
        if (!grid) throw new Error('LobbyController: .lobby-grid not found');
        this.gridEl = grid;

        this.playerCountEl = document.getElementById('lobby-player-count');
        this.playBtn = document.getElementById('btn-jogar') as HTMLButtonElement;
        this.muteBtn = document.getElementById('lobby-mute') as HTMLButtonElement | null;

        this.slots = this.loadInitialSlots();
        this.bindTopBar();
        this.bindPlayButton();
        this.renderAll();
    }

    public show(): void {
        this.rootEl.classList.remove('is-hidden');
    }

    public hide(): void {
        this.rootEl.classList.add('is-hidden');
    }

    public isVisible(): boolean {
        return !this.rootEl.classList.contains('is-hidden');
    }

    public buildRunConfiguration(): RunConfiguration {
        // The engine spawns player_1..player_N consecutively, so we compact enabled
        // slots into the leading PLAYER_IDS regardless of which UI cards are active.
        const enabledSlots = this.getEnabledPlayerIds().map((id) => this.slots[id]);
        const playerCount = (enabledSlots.length || 1) as PlayerCount;
        const players = {} as RunConfiguration['players'];

        for (let i = 0; i < PLAYER_IDS.length; i++) {
            const playerId = PLAYER_IDS[i];
            const source = enabledSlots[i] ?? this.slots[playerId];
            let control = source.control;
            // P3/P4 only support gamepad.
            if ((playerId === 'player_3' || playerId === 'player_4') && control === 'KEYBOARD') {
                control = 'GAMEPAD';
            }
            players[playerId] = {
                name: source.name.trim() || `Jogador ${i + 1}`,
                control,
                primaryColorHex: source.primaryColorHex,
            };
        }

        return { playerCount, players };
    }

    public handleGamepadNavigation(actions: GamepadActions, edgeActions: GamepadActions): void {
        if (!this.isVisible()) return;

        const focusables = this.getFocusables();
        if (focusables.length === 0) return;

        this.gamepadFocusIndex = Math.max(0, Math.min(this.gamepadFocusIndex, focusables.length - 1));

        let moved = false;
        if (edgeActions.right) { this.gamepadFocusIndex = (this.gamepadFocusIndex + 1) % focusables.length; moved = true; }
        if (edgeActions.left) { this.gamepadFocusIndex = (this.gamepadFocusIndex - 1 + focusables.length) % focusables.length; moved = true; }
        if (edgeActions.down) { this.gamepadFocusIndex = Math.min(focusables.length - 1, this.gamepadFocusIndex + 2); moved = true; }
        if (edgeActions.up) { this.gamepadFocusIndex = Math.max(0, this.gamepadFocusIndex - 2); moved = true; }

        if (moved) this.applyGamepadFocus(focusables);

        if (edgeActions.confirm) {
            focusables[this.gamepadFocusIndex]?.click();
        }
        void actions;
    }

    public refreshGamepadVisual(): void {
        this.applyGamepadFocus(this.getFocusables());
    }

    public clearGamepadFocus(): void {
        this.rootEl.querySelectorAll('.is-gamepad-focused').forEach((el) => el.classList.remove('is-gamepad-focused'));
    }

    public setAudioState(volume: number, muted: boolean): void {
        if (!this.muteBtn) return;
        this.muteBtn.classList.toggle('is-muted', muted || volume <= 0);

        const iconName = muted || volume <= 0
            ? 'volume-x'
            : volume < 0.5
                ? 'volume-1'
                : 'volume-2';

        this.muteBtn.innerHTML = `<i data-lucide="${iconName}"></i>`;
        createIcons({ icons: { Volume2, Volume1, VolumeX } });
    }

    private loadInitialSlots(): Record<PlayerId, SlotState> {
        const persisted = loadLobby();
        const slots = {} as Record<PlayerId, SlotState>;

        // `name` stays empty until the player actually types something; the
        // default "Jogador X" is shown as a placeholder and applied as a
        // fallback inside buildRunConfiguration().
        for (const playerId of PLAYER_IDS) {
            const fallback = DEFAULT_RUN_CONFIGURATION.players[playerId];
            const saved = persisted?.[playerId];
            slots[playerId] = {
                playerId,
                enabled: saved?.enabled ?? playerId === 'player_1',
                name: saved?.name ?? '',
                primaryColorHex: saved?.primaryColorHex ?? fallback.primaryColorHex,
                control: saved?.control ?? fallback.control,
            };
        }

        // P1 is always enabled.
        slots.player_1.enabled = true;
        return slots;
    }

    private persist(): void {
        const snapshot = {} as PersistedLobby;
        for (const playerId of PLAYER_IDS) {
            const slot = this.slots[playerId];
            snapshot[playerId] = {
                enabled: slot.enabled,
                name: slot.name,
                primaryColorHex: slot.primaryColorHex,
                control: slot.control,
            };
        }
        saveLobby(snapshot);
    }

    private getEnabledPlayerIds(): PlayerId[] {
        return PLAYER_IDS.filter((id) => this.slots[id].enabled);
    }

    private indexOfPlayer(playerId: PlayerId): number {
        return PLAYER_IDS.indexOf(playerId);
    }

    private bindTopBar(): void {
        document.getElementById('lobby-help')?.addEventListener('click', () => this.callbacks.onOpenHelp());
        document.getElementById('lobby-settings')?.addEventListener('click', () => this.callbacks.onOpenSettings());
        this.muteBtn?.addEventListener('click', () => this.callbacks.onToggleAudioPanel());
    }

    private bindPlayButton(): void {
        this.playBtn.addEventListener('click', () => {
            this.persist();
            this.callbacks.onStart({ runConfiguration: this.buildRunConfiguration() });
        });
    }

    private renderAll(): void {
        this.gridEl.replaceChildren();
        this.slotEls.clear();

        for (const playerId of PLAYER_IDS) {
            const slotEl = this.renderSlot(playerId);
            this.gridEl.appendChild(slotEl);
            this.slotEls.set(playerId, slotEl);
        }

        this.updatePlayerCount();
        // Hydrate any newly-inserted <i data-lucide> placeholders.
        createIcons({ icons: { Keyboard, Gamepad2, Plus, X } });
        this.refreshGamepadVisual();
    }

    private updatePlayerCount(): void {
        if (this.playerCountEl) {
            this.playerCountEl.textContent = String(this.getEnabledPlayerIds().length);
        }
    }

    private renderSlot(playerId: PlayerId): HTMLElement {
        const slot = this.slots[playerId];
        const article = document.createElement('article');
        article.className = 'lobby-slot';
        article.dataset.slot = String(this.indexOfPlayer(playerId) + 1);
        article.dataset.state = slot.enabled ? 'active' : 'empty';
        article.style.setProperty('--slot-color', slot.primaryColorHex);

        const header = document.createElement('header');
        header.className = 'lobby-slot-header';
        const tag = document.createElement('span');
        tag.className = 'lobby-slot-tag';
        tag.textContent = `P${this.indexOfPlayer(playerId) + 1}`;
        header.appendChild(tag);

        if (slot.enabled && playerId !== 'player_1') {
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'lobby-slot-remove';
            removeBtn.setAttribute('aria-label', 'Remover jogador');
            removeBtn.innerHTML = '<i data-lucide="x"></i>';
            removeBtn.addEventListener('click', () => this.deactivateSlot(playerId));
            header.appendChild(removeBtn);
        }

        article.appendChild(header);

        if (!slot.enabled) {
            const joinBtn = document.createElement('button');
            joinBtn.type = 'button';
            joinBtn.className = 'lobby-slot-join';
            joinBtn.addEventListener('click', () => this.activateSlot(playerId));
            joinBtn.innerHTML = '<span class="lobby-slot-join-icon"><i data-lucide="plus"></i></span><strong>ENTRAR</strong><small>CLIQUE · PRESSIONE A</small>';
            article.appendChild(joinBtn);
            return article;
        }

        article.append(
            this.renderSlotBody(playerId),
            this.renderColorPicker(playerId),
            this.renderDeviceChip(playerId),
        );

        return article;
    }

    private renderSlotBody(playerId: PlayerId): HTMLElement {
        const body = document.createElement('div');
        body.className = 'lobby-slot-body';

        const tank = document.createElement('div');
        tank.className = 'lobby-slot-tank';
        tank.innerHTML = '<span class="lobby-slot-tank-barrel"></span><span class="lobby-slot-tank-body"></span>';

        const nameWrap = document.createElement('label');
        nameWrap.className = 'lobby-slot-name';
        const nameLabel = document.createElement('small');
        nameLabel.textContent = 'NOME';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.maxLength = 16;
        nameInput.value = this.slots[playerId].name;
        nameInput.placeholder = `Jogador ${this.indexOfPlayer(playerId) + 1}`;
        nameInput.addEventListener('input', () => {
            this.slots[playerId].name = nameInput.value;
        });
        nameInput.addEventListener('blur', () => this.persist());
        ['keydown', 'keyup', 'keypress'].forEach((evt) => {
            nameInput.addEventListener(evt, (e) => e.stopPropagation());
        });
        nameWrap.append(nameLabel, nameInput);

        body.append(tank, nameWrap);
        return body;
    }

    private renderColorPicker(playerId: PlayerId): HTMLElement {
        const group = document.createElement('div');
        group.className = 'lobby-slot-colors';
        group.setAttribute('role', 'radiogroup');

        for (const color of PRIMARY_COLORS) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'lobby-slot-color';
            btn.dataset.color = color.hex;
            btn.style.setProperty('--color', color.hex);
            btn.setAttribute('role', 'radio');
            btn.setAttribute('aria-checked', String(this.slots[playerId].primaryColorHex === color.hex));
            btn.classList.toggle('is-selected', this.slots[playerId].primaryColorHex === color.hex);

            const dot = document.createElement('span');
            dot.className = 'lobby-slot-color-dot';
            const label = document.createElement('span');
            label.className = 'lobby-slot-color-label';
            label.textContent = COLOR_ROLES[color.hex] ?? color.name.toUpperCase();

            btn.append(dot, label);
            btn.addEventListener('click', () => this.selectColor(playerId, color.hex));
            group.appendChild(btn);
        }

        return group;
    }

    private renderDeviceChip(playerId: PlayerId): HTMLElement {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'lobby-slot-device';

        const slot = this.slots[playerId];
        const canUseKeyboard = playerId === 'player_1' || playerId === 'player_2';
        const isKeyboard = slot.control === 'KEYBOARD';

        chip.dataset.device = isKeyboard ? 'keyboard' : 'gamepad';
        chip.innerHTML = isKeyboard
            ? '<i data-lucide="keyboard"></i><span>TECLADO + MOUSE</span>'
            : `<i data-lucide="gamepad-2"></i><span>CONTROLE ${this.gamepadSlotIndex(playerId)}</span>`;

        chip.disabled = !canUseKeyboard;
        if (canUseKeyboard) {
            chip.addEventListener('click', () => this.toggleDevice(playerId));
        }

        return chip;
    }

    private gamepadSlotIndex(playerId: PlayerId): number {
        const gamepadPlayers = this.getEnabledPlayerIds().filter((id) => this.slots[id].control === 'GAMEPAD');
        return gamepadPlayers.indexOf(playerId) + 1;
    }

    private activateSlot(playerId: PlayerId): void {
        this.slots[playerId].enabled = true;
        // Auto-pick a free primary color: prefer one not used by other enabled slots.
        const usedColors = new Set(this.getEnabledPlayerIds().filter((id) => id !== playerId).map((id) => this.slots[id].primaryColorHex));
        const free = PRIMARY_COLORS.find((c) => !usedColors.has(c.hex));
        if (free) this.slots[playerId].primaryColorHex = free.hex;

        // Force GAMEPAD if keyboard already taken or slot is P3/P4.
        const keyboardTaken = this.getEnabledPlayerIds().some((id) => id !== playerId && this.slots[id].control === 'KEYBOARD');
        if (keyboardTaken || playerId === 'player_3' || playerId === 'player_4') {
            this.slots[playerId].control = 'GAMEPAD';
        }

        this.persist();
        this.renderAll();
    }

    private deactivateSlot(playerId: PlayerId): void {
        if (playerId === 'player_1') return;
        this.slots[playerId].enabled = false;
        this.persist();
        this.renderAll();
    }

    private selectColor(playerId: PlayerId, hex: string): void {
        this.slots[playerId].primaryColorHex = hex;
        this.persist();
        this.renderAll();
    }

    private toggleDevice(playerId: PlayerId): void {
        const slot = this.slots[playerId];
        const nextControl: ControlPreference = slot.control === 'KEYBOARD' ? 'GAMEPAD' : 'KEYBOARD';

        if (nextControl === 'KEYBOARD') {
            // Reclaim keyboard from any other slot.
            for (const otherId of PLAYER_IDS) {
                if (otherId === playerId) continue;
                if (this.slots[otherId].control === 'KEYBOARD') {
                    this.slots[otherId].control = 'GAMEPAD';
                }
            }
        }

        slot.control = nextControl;
        this.persist();
        this.renderAll();
    }

    private getFocusables(): HTMLElement[] {
        return Array.from(this.rootEl.querySelectorAll<HTMLElement>('.lobby-slot-join, .lobby-slot-color, .lobby-play-btn'));
    }

    private applyGamepadFocus(focusables: HTMLElement[]): void {
        this.clearGamepadFocus();
        if (focusables.length === 0) return;
        const active = focusables[Math.max(0, Math.min(this.gamepadFocusIndex, focusables.length - 1))];
        active?.classList.add('is-gamepad-focused');
        active?.focus({ preventScroll: true });
    }
}
