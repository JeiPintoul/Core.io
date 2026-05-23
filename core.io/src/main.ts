import './style.css';
import { createIcons, Home, Volume2, VolumeX } from 'lucide';
import { GameEngine } from './logic/GameEngine';
import { createPhaserGame } from './client/PhaserGame';
import { HudController } from './client/hud/HudController';
import {
    MODIFIER_META,
    RARITY_LABELS_PTBR,
    formatModifierValue,
    getUpgradeCardFlavor,
    getUpgradeCardSymbol
} from './client/hud/UpgradePresentation';
import { GodMode } from './debug/GodMode';
import { emitGameEvent, GameEvents, onGameEvent } from './shared/EventBus';
import { normalizeColorHex } from './shared/ColorUtils';
import { PLAYER_IDS, type ControlPreference, type EntityStats, type PlayerCount, type PlayerId, type RunConfiguration, type UpgradeRollOption } from './shared/Types';
import { DEATH_ANIMATION_DURATION_MS } from './client/constants/GameConstants';

console.log('Inicializando Core.io...');

const engine = new GameEngine();
createPhaserGame();
const hudController = new HudController();
new GodMode(engine);

type UiMode = 'INITIAL_MENU' | 'COLOR_SELECTION' | 'IN_GAME' | 'PAUSED' | 'UPGRADE' | 'GAME_OVER';

const menuInicial = document.getElementById('menu-inicial');
const hudLayerEl = document.getElementById('hud-layer');
const btnJogar = document.getElementById('btn-jogar') as HTMLButtonElement | null;
const playerNameInput = document.getElementById('player-name') as HTMLInputElement | null;
const playerCountSelect = document.getElementById('player-count') as HTMLSelectElement | null;
const player2NameInput = document.getElementById('player2-name') as HTMLInputElement | null;
const player3NameInput = document.getElementById('player3-name') as HTMLInputElement | null;
const player4NameInput = document.getElementById('player4-name') as HTMLInputElement | null;
const player1ControlSelect = document.getElementById('player1-control') as HTMLSelectElement | null;
const player2ControlSelect = document.getElementById('player2-control') as HTMLSelectElement | null;
const player3ControlSelect = document.getElementById('player3-control') as HTMLSelectElement | null;
const player4ControlSelect = document.getElementById('player4-control') as HTMLSelectElement | null;
const player1ControlLabelEl = document.getElementById('player1-control-label');
const player2ControlLabelEl = document.getElementById('player2-control-label');
const player3ControlLabelEl = document.getElementById('player3-control-label');
const player4ControlLabelEl = document.getElementById('player4-control-label');
const menuControlSlotsHintEl = document.getElementById('menu-control-slots-hint');
const player2NameWrapEl = document.getElementById('player2-name-wrap');
const player2ControlWrapEl = document.getElementById('player2-control-wrap');
const player3NameWrapEl = document.getElementById('player3-name-wrap');
const player3ControlWrapEl = document.getElementById('player3-control-wrap');
const player4NameWrapEl = document.getElementById('player4-name-wrap');
const player4ControlWrapEl = document.getElementById('player4-control-wrap');
const btnPause = document.getElementById('btn-pause') as HTMLButtonElement | null;
const btnAudio = document.getElementById('btn-audio') as HTMLButtonElement | null;
const btnMute = document.getElementById('btn-mute') as HTMLButtonElement | null;
const musicVolumeInput = document.getElementById('music-volume') as HTMLInputElement | null;
const pauseAudioPanelEl = document.getElementById('pause-audio-panel');
const hudAudioWidgetEl = document.getElementById('hud-audio-widget');
const hudAudioPanelEl = document.getElementById('hud-audio-panel');
const btnAudioGlobal = document.getElementById('btn-audio-global') as HTMLButtonElement | null;
const btnMuteGlobal = document.getElementById('btn-mute-global') as HTMLButtonElement | null;
const musicVolumeGlobalInput = document.getElementById('music-volume-global') as HTMLInputElement | null;
const pauseMenu = document.getElementById('pause-menu');
const btnResume = document.getElementById('btn-resume') as HTMLButtonElement | null;
const btnRestart = document.getElementById('btn-restart') as HTMLButtonElement | null;
const btnHomePause = document.getElementById('btn-home-pause') as HTMLButtonElement | null;
const btnMenuHome = document.getElementById('btn-menu-home') as HTMLButtonElement | null;
const tituloMenu = menuInicial?.querySelector('h1') as HTMLHeadingElement | null;
const colorSelectionScreen = document.getElementById('color-selection-screen');
const upgradeModal = document.getElementById('upgrade-modal');
const upgradeTitleEl = upgradeModal?.querySelector('h2') as HTMLHeadingElement | null;
const upgradeRemainingEl = document.getElementById('upgrade-remaining');
const upgradeCardsEl = document.getElementById('upgrade-cards');
const hudStatsEl = document.getElementById('hud-stats');
const hudKeybindsEl = document.getElementById('hud-keybinds');

let gameOverUiTimeoutId: number | null = null;
let waitingUpgradeSelection = false;
let activeUpgradePlayerId: PlayerId | null = null;
let uiMode: UiMode = menuInicial ? 'INITIAL_MENU' : 'IN_GAME';
let previousUiMode: UiMode | null = null;
let menuGamepadFocusIndex = 0;
let upgradeGamepadCardIndex = 0;
let colorGamepadCardIndex = 0;
let pauseMenuGamepadFocusIndex = 0;
let activeUpgradeOptions: UpgradeRollOption[] = [];
let gamepadUiPollFrameId: number | null = null;
let activeRunPlayerColors: Partial<Record<PlayerId, string>> = {};

type UiGamepadActionKey = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' | 'pause';
type UiGamepadActionState = Record<UiGamepadActionKey, boolean>;

const GAMEPAD_NAV_AXIS_THRESHOLD = 0.55;
const UPGRADE_GAMEPAD_GRID_COLUMNS = 3;

const gamepadActionLatchByPadIndex = new Map<number, UiGamepadActionState>();
const _initialAudio = hudController.getInitialAudioPrefs();
let musicMuted = _initialAudio.muted;
let musicVolume = _initialAudio.volume;
const DEFAULT_RUN_CONFIGURATION: RunConfiguration = {
    playerCount: 1,
    players: {
        player_1: { name: 'Jogador', control: 'KEYBOARD' },
        player_2: { name: 'Jogador 2', control: 'GAMEPAD' },
        player_3: { name: 'Jogador 3', control: 'GAMEPAD' },
        player_4: { name: 'Jogador 4', control: 'GAMEPAD' },
    }
};
let activeRunConfiguration: RunConfiguration = structuredClone(DEFAULT_RUN_CONFIGURATION);
const DEFAULT_PLAYER_COLOR_HEX: Record<PlayerId, string> = {
    player_1: '#4488ff',
    player_2: '#55ffaa',
    player_3: '#ffcc00',
    player_4: '#ff77aa',
};


function setUiMode(nextMode: UiMode): void {
    const previousMode = uiMode;
    uiMode = nextMode;

    if (nextMode !== 'INITIAL_MENU' && nextMode !== 'GAME_OVER') {
        clearMenuGamepadFocusVisual();
    }
    if (nextMode !== 'PAUSED') {
        clearPauseGamepadFocusVisual();
    }

    if (nextMode === 'COLOR_SELECTION') {
        colorGamepadCardIndex = 0;
        window.setTimeout(() => {
            applyColorGamepadSelectionVisual();
        }, 0);
    } else if (previousMode === 'COLOR_SELECTION') {
        clearColorGamepadSelectionVisual();
    }

    if (nextMode !== 'UPGRADE') {
        clearUpgradeGamepadSelectionVisual();
    }

    applyUiModeEffects();
}

function applyUiModeEffects(): void {
    const shouldShowHud = uiMode !== 'INITIAL_MENU' && uiMode !== 'GAME_OVER' && uiMode !== 'COLOR_SELECTION';
    const shouldShowStats = shouldShowHud || uiMode === 'COLOR_SELECTION';
    const shouldShowAudioWidget = uiMode === 'INITIAL_MENU' || uiMode === 'GAME_OVER' || uiMode === 'COLOR_SELECTION';

    hudLayerEl?.classList.toggle('is-hidden', !shouldShowHud);
    hudStatsEl?.classList.toggle('is-hidden', !shouldShowStats);
    hudAudioWidgetEl?.classList.toggle('is-visible', shouldShowAudioWidget);
    hudKeybindsEl?.classList.toggle('is-visible', uiMode === 'INITIAL_MENU');

    if (uiMode === 'COLOR_SELECTION') {
        hudController.setStatsPinned(true);
    } else if (uiMode === 'IN_GAME') {
        hudController.setStatsPinned(false);
    }

    if (!shouldShowAudioWidget) {
        hudAudioPanelEl?.classList.remove('is-open');
    }

    if (uiMode !== 'PAUSED') {
        setPauseAudioPanelOpen(false);
    }
}

function applyPauseUi(isPaused: boolean): void {
    if (!btnPause) {
        return;
    }

    btnPause.textContent = isPaused ? '▶' : '||';
    btnPause.classList.toggle('is-paused', isPaused);
}

function emitAudioSettings(): void {
    emitGameEvent(GameEvents.AUDIO_SETTINGS_CHANGED, {
        volume: musicVolume,
        muted: musicMuted
    });
}

function updateAudioHud(): void {
    if (btnMute) {
        btnMute.textContent = musicMuted ? 'Som: OFF' : 'Som: ON';
        btnMute.classList.toggle('is-muted', musicMuted);
    }

    if (musicVolumeInput) {
        musicVolumeInput.value = Math.round(musicVolume * 100).toString();
    }

    if (btnMuteGlobal) {
        btnMuteGlobal.textContent = musicMuted ? 'Som: OFF' : 'Som: ON';
        btnMuteGlobal.classList.toggle('is-muted', musicMuted);
    }

    if (musicVolumeGlobalInput) {
        musicVolumeGlobalInput.value = Math.round(musicVolume * 100).toString();
    }

    btnAudioGlobal?.classList.toggle('is-muted', musicMuted);
}

function setPauseAudioPanelOpen(open: boolean): void {
    pauseAudioPanelEl?.classList.toggle('is-open', open);

    if (uiMode === 'PAUSED') {
        window.setTimeout(() => {
            applyPauseGamepadFocusVisual(getPauseNavigableControls());
        }, 0);
    }
}

function setPauseMenuVisible(visible: boolean): void {
    if (!pauseMenu) {
        return;
    }

    pauseMenu.style.display = visible ? 'flex' : 'none';
    pauseMenuGamepadFocusIndex = 0;

    if (visible) {
        window.setTimeout(() => {
            applyPauseGamepadFocusVisual(getPauseNavigableControls());
        }, 0);
    } else {
        clearPauseGamepadFocusVisual();
        setPauseAudioPanelOpen(false);
    }
}

function isPauseMenuVisible(): boolean {
    if (!pauseMenu) {
        return false;
    }

    return window.getComputedStyle(pauseMenu).display !== 'none';
}

function togglePauseFromUi(): void {
    if (uiMode === 'INITIAL_MENU' || uiMode === 'GAME_OVER' || uiMode === 'COLOR_SELECTION') {
        return;
    }

    const isPaused = engine.togglePause();
    applyPauseUi(isPaused);
    setPauseMenuVisible(isPaused);

    if (isPaused) {
        previousUiMode = uiMode;
        setUiMode('PAUSED');
    } else {
        const returnMode = previousUiMode ?? 'IN_GAME';
        previousUiMode = null;
        setUiMode(returnMode);
    }
}

function setUpgradeModalVisible(visible: boolean): void {
    if (!upgradeModal) {
        return;
    }

    upgradeModal.classList.toggle('is-visible', visible);
}

function setUpgradesRemaining(value: number): void {
    if (!upgradeRemainingEl) {
        return;
    }

    upgradeRemainingEl.textContent = `Aprimoramentos Restantes: ${Math.max(0, value)}`;
}

function getConfiguredPlayerName(playerId: PlayerId): string {
    return activeRunConfiguration.players[playerId]?.name ?? 'Jogador';
}

function setUpgradeSelectionOwner(playerId: PlayerId | null): void {
    activeUpgradePlayerId = playerId;
    if (!upgradeTitleEl) {
        return;
    }

    if (!playerId) {
        upgradeTitleEl.textContent = 'Escolha um Aprimoramento';
        return;
    }

    upgradeTitleEl.textContent = `Escolha de ${getConfiguredPlayerName(playerId)}`;
}

function clearUpgradeCards(): void {
    if (!upgradeCardsEl) {
        return;
    }

    upgradeCardsEl.replaceChildren();
}

function setUpgradeCardsDisabled(disabled: boolean): void {
    if (!upgradeCardsEl) {
        return;
    }

    const cardButtons = upgradeCardsEl.querySelectorAll('button');
    for (const cardButton of cardButtons) {
        cardButton.disabled = disabled;
    }
}

function renderModifierBadges(modifiers: UpgradeRollOption['card']['modifiers']): HTMLElement {
    const container = document.createElement('div');
    container.className = 'upgrade-card-modifiers';

    const entries = Object.entries(modifiers) as Array<[keyof EntityStats, number]>;

    for (const [statKey, value] of entries) {
        if (value === 0) {
            continue;
        }

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

function renderUpgradeCards(options: UpgradeRollOption[]): void {
    if (!upgradeCardsEl) {
        return;
    }

    activeUpgradeOptions = options;
    clearUpgradeCards();

    for (const [index, option] of options.entries()) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'upgrade-card';
        button.style.setProperty('--upgrade-card-color', option.colorHex);
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

        const modifiersEl = renderModifierBadges(option.card.modifiers);

        const footerEl = document.createElement('div');
        footerEl.className = 'upgrade-card-footer';
        footerEl.textContent = 'TOQUE PARA ESCOLHER';

        button.append(rarityEl, nameEl, artEl, descriptionEl, modifiersEl, footerEl);

        button.addEventListener('mouseenter', () => {
            if (waitingUpgradeSelection) {
                return;
            }

            upgradeGamepadCardIndex = index;
            applyUpgradeGamepadSelectionVisual();
            hudController.previewStatModifiers(option.card.modifiers);
        });

        button.addEventListener('mouseleave', () => {
            if (waitingUpgradeSelection) {
                return;
            }

            hudController.clearStatPreview();
        });

        button.addEventListener('click', () => {
            if (waitingUpgradeSelection) {
                return;
            }

            if (!activeUpgradePlayerId) {
                return;
            }

            waitingUpgradeSelection = true;
            setUpgradeCardsDisabled(true);
            hudController.clearStatPreview();

            emitGameEvent(GameEvents.CARD_SELECTED, {
                playerId: activeUpgradePlayerId,
                cardId: option.card.id,
                colorHex: option.colorHex
            });
        });

        upgradeCardsEl.appendChild(button);
    }

    if (options.length > 0) {
        upgradeGamepadCardIndex = Math.max(0, Math.min(upgradeGamepadCardIndex, options.length - 1));
        applyUpgradeGamepadSelectionVisual();
    }
}

function normalizePlayerName(rawName: string, fallbackName: string = 'Jogador'): string {
    const trimmedName = rawName.trim();

    if (trimmedName.length === 0) {
        return fallbackName;
    }

    return trimmedName.slice(0, 16);
}

function mapControlPreference(rawValue: string | null | undefined): ControlPreference {
    return rawValue === 'gamepad' ? 'GAMEPAD' : 'KEYBOARD';
}

function resolveRunPlayerColors(playerColors: Partial<Record<PlayerId, string>>): Partial<Record<PlayerId, string>> {
    const resolvedColors: Partial<Record<PlayerId, string>> = {};
    const activePlayerIds = PLAYER_IDS.slice(0, activeRunConfiguration.playerCount) as PlayerId[];

    for (const playerId of activePlayerIds) {
        resolvedColors[playerId] = normalizeColorHex(playerColors[playerId], DEFAULT_PLAYER_COLOR_HEX[playerId]);
    }

    return resolvedColors;
}

function mapPlayerCount(rawValue: string | null | undefined): PlayerCount {
    if (rawValue === '4') return 4;
    if (rawValue === '3') return 3;
    if (rawValue === '2') return 2;
    return 1;
}

function getMenuSelectedControlForPlayer(playerId: PlayerId): ControlPreference {
    if (playerId === 'player_1') {
        return mapControlPreference(player1ControlSelect?.value);
    }

    if (playerId === 'player_2') {
        return mapControlPreference(player2ControlSelect?.value);
    }

    if (playerId === 'player_3') {
        return mapControlPreference(player3ControlSelect?.value ?? 'gamepad');
    }

    return mapControlPreference(player4ControlSelect?.value ?? 'gamepad');
}

function updateGamepadOptionSlotLabel(selectEl: HTMLSelectElement | null, slot: number | undefined): void {
    if (!selectEl) {
        return;
    }

    const gamepadOption = selectEl.querySelector('option[value="gamepad"]');
    if (!gamepadOption) {
        return;
    }

    gamepadOption.textContent = slot ? `Controle ${slot}` : 'Controle';
}

function updateMenuControlSlotHints(): void {
    const activePlayerIds = PLAYER_IDS.slice(0, mapPlayerCount(playerCountSelect?.value)) as PlayerId[];
    const controlByPlayer = new Map<PlayerId, ControlPreference>();
    for (const playerId of PLAYER_IDS) {
        controlByPlayer.set(playerId, getMenuSelectedControlForPlayer(playerId));
    }

    const slotByPlayer = new Map<PlayerId, number>();
    let nextGamepadSlot = 1;

    for (const playerId of activePlayerIds) {
        if (controlByPlayer.get(playerId) !== 'GAMEPAD') {
            continue;
        }

        slotByPlayer.set(playerId, nextGamepadSlot);
        nextGamepadSlot += 1;
    }

    const formatLabel = (baseLabel: string, playerId: PlayerId): string => {
        if (!activePlayerIds.includes(playerId)) {
            return baseLabel;
        }

        const slot = slotByPlayer.get(playerId);
        return slot ? `${baseLabel} (Controle ${slot})` : `${baseLabel} (Teclado)`;
    };

    if (player1ControlLabelEl) {
        player1ControlLabelEl.textContent = formatLabel('P1', 'player_1');
    }
    if (player2ControlLabelEl) {
        player2ControlLabelEl.textContent = formatLabel('P2', 'player_2');
    }
    if (player3ControlLabelEl) {
        player3ControlLabelEl.textContent = formatLabel('P3', 'player_3');
    }
    if (player4ControlLabelEl) {
        player4ControlLabelEl.textContent = formatLabel('P4', 'player_4');
    }

    updateGamepadOptionSlotLabel(player1ControlSelect, slotByPlayer.get('player_1'));
    updateGamepadOptionSlotLabel(player2ControlSelect, slotByPlayer.get('player_2'));
    updateGamepadOptionSlotLabel(player3ControlSelect, slotByPlayer.get('player_3'));
    updateGamepadOptionSlotLabel(player4ControlSelect, slotByPlayer.get('player_4'));

    if (menuControlSlotsHintEl) {
        const activeGamepadPlayers = activePlayerIds.filter((playerId) => controlByPlayer.get(playerId) === 'GAMEPAD');
        if (activeGamepadPlayers.length === 0) {
            menuControlSlotsHintEl.textContent = 'Slots de controle: nenhum gamepad ativo no momento.';
        } else {
            const slotDescriptions = activeGamepadPlayers.map((playerId) => {
                const slot = slotByPlayer.get(playerId);
                return `${playerId.toUpperCase().replace('_', '')}=C${slot}`;
            });
            menuControlSlotsHintEl.textContent = `Slots de controle: ${slotDescriptions.join(' | ')} (ordem de conexao).`;
        }
    }
}

function isButtonPressed(button: GamepadButton | undefined): boolean {
    if (!button) {
        return false;
    }

    return button.pressed || button.value > 0.35;
}

function getConnectedGamepads(): Gamepad[] {
    if (!('getGamepads' in navigator)) {
        return [];
    }

    const pads = navigator.getGamepads();
    const connected: Gamepad[] = [];
    for (const pad of pads) {
        if (pad && pad.connected) {
            connected.push(pad);
        }
    }

    connected.sort((a, b) => a.index - b.index);
    return connected;
}

function getActivePlayerIdsFromConfiguration(config: RunConfiguration): PlayerId[] {
    return PLAYER_IDS.slice(0, config.playerCount) as PlayerId[];
}

function getGamepadPlayersFromConfiguration(config: RunConfiguration): PlayerId[] {
    const activePlayers = getActivePlayerIdsFromConfiguration(config);
    return activePlayers.filter((playerId) => config.players[playerId].control === 'GAMEPAD');
}

function resolvePlayerAssignedGamepad(playerId: PlayerId, connectedGamepads: Gamepad[]): Gamepad | null {
    const gamepadPlayers = getGamepadPlayersFromConfiguration(activeRunConfiguration);
    const slotIndex = gamepadPlayers.indexOf(playerId);
    if (slotIndex < 0) {
        return null;
    }

    return connectedGamepads[slotIndex] ?? null;
}

function readGamepadUiActions(gamepad: Gamepad): UiGamepadActionState {
    const axisX = gamepad.axes[0] ?? 0;
    const axisY = gamepad.axes[1] ?? 0;

    return {
        up: isButtonPressed(gamepad.buttons[12]) || axisY <= -GAMEPAD_NAV_AXIS_THRESHOLD,
        down: isButtonPressed(gamepad.buttons[13]) || axisY >= GAMEPAD_NAV_AXIS_THRESHOLD,
        left: isButtonPressed(gamepad.buttons[14]) || axisX <= -GAMEPAD_NAV_AXIS_THRESHOLD,
        right: isButtonPressed(gamepad.buttons[15]) || axisX >= GAMEPAD_NAV_AXIS_THRESHOLD,
        confirm: isButtonPressed(gamepad.buttons[0]),
        cancel: isButtonPressed(gamepad.buttons[1]) || isButtonPressed(gamepad.buttons[8]),
        pause: isButtonPressed(gamepad.buttons[9]),
    };
}

function getGamepadActionLatch(gamepadIndex: number): UiGamepadActionState {
    const cached = gamepadActionLatchByPadIndex.get(gamepadIndex);
    if (cached) {
        return cached;
    }

    const emptyLatch: UiGamepadActionState = {
        up: false,
        down: false,
        left: false,
        right: false,
        confirm: false,
        cancel: false,
        pause: false,
    };
    gamepadActionLatchByPadIndex.set(gamepadIndex, emptyLatch);
    return emptyLatch;
}

function consumeGamepadAction(
    gamepadIndex: number,
    actionKey: UiGamepadActionKey,
    pressed: boolean
): boolean {
    const latch = getGamepadActionLatch(gamepadIndex);
    const wasPressed = latch[actionKey];
    latch[actionKey] = pressed;
    return pressed && !wasPressed;
}

function isMainMenuVisible(): boolean {
    if (!menuInicial) {
        return false;
    }

    return window.getComputedStyle(menuInicial).display !== 'none';
}

function getMenuNavigableControls(): HTMLElement[] {
    const controls: HTMLElement[] = [];
    const maybePush = (element: HTMLElement | null): void => {
        if (!element) {
            return;
        }
        if (element.offsetParent === null) {
            return;
        }
        controls.push(element);
    };

    maybePush(playerCountSelect);
    maybePush(player1ControlSelect);
    maybePush(player2ControlSelect);
    maybePush(player3ControlSelect);
    maybePush(player4ControlSelect);
    maybePush(btnJogar);
    maybePush(btnMenuHome);
    return controls;
}

function clearMenuGamepadFocusVisual(): void {
    const rows = document.querySelectorAll('.menu-option-row.is-gamepad-focused');
    for (const row of rows) {
        row.classList.remove('is-gamepad-focused');
    }

    const controls = document.querySelectorAll('#btn-jogar.is-gamepad-focused, #btn-menu-home.is-gamepad-focused');
    for (const control of controls) {
        control.classList.remove('is-gamepad-focused');
    }
}

function applyMenuGamepadFocusVisual(navigableControls: HTMLElement[]): void {
    clearMenuGamepadFocusVisual();
    if (navigableControls.length === 0) {
        return;
    }

    menuGamepadFocusIndex = (menuGamepadFocusIndex + navigableControls.length) % navigableControls.length;
    const activeControl = navigableControls[menuGamepadFocusIndex];
    activeControl.focus({ preventScroll: true });

    const row = activeControl.closest('.menu-option-row');
    if (row) {
        row.classList.add('is-gamepad-focused');
    } else {
        activeControl.classList.add('is-gamepad-focused');
    }
}

function getPauseNavigableControls(): HTMLElement[] {
    if (!pauseMenu || pauseMenu.style.display === 'none') {
        return [];
    }

    const controls: HTMLElement[] = [];
    const maybePush = (element: HTMLElement | null): void => {
        if (!element || element.offsetParent === null) {
            return;
        }

        if ('disabled' in element && (element as HTMLButtonElement | HTMLInputElement).disabled) {
            return;
        }

        controls.push(element);
    };

    maybePush(btnResume);
    maybePush(btnRestart);
    maybePush(btnAudio);
    maybePush(btnHomePause);

    if (pauseAudioPanelEl?.classList.contains('is-open')) {
        maybePush(btnMute);
        maybePush(musicVolumeInput);
    }

    return controls;
}

function clearPauseGamepadFocusVisual(): void {
    if (!pauseMenu) {
        return;
    }

    const focusedControls = pauseMenu.querySelectorAll<HTMLElement>('.is-gamepad-focused');
    for (const focusedControl of focusedControls) {
        focusedControl.classList.remove('is-gamepad-focused');
    }
}

function applyPauseGamepadFocusVisual(navigableControls: HTMLElement[]): void {
    clearPauseGamepadFocusVisual();
    if (navigableControls.length === 0) {
        return;
    }

    pauseMenuGamepadFocusIndex = (pauseMenuGamepadFocusIndex + navigableControls.length) % navigableControls.length;
    const activeControl = navigableControls[pauseMenuGamepadFocusIndex];
    activeControl.classList.add('is-gamepad-focused');
    activeControl.focus({ preventScroll: true });
}

function adjustRangeInputValue(inputEl: HTMLInputElement, direction: -1 | 1): void {
    const min = inputEl.min === '' ? 0 : Number(inputEl.min);
    const max = inputEl.max === '' ? 100 : Number(inputEl.max);
    const step = inputEl.step === '' || inputEl.step === 'any' ? 1 : Number(inputEl.step);
    const current = Number(inputEl.value);
    if (!Number.isFinite(step) || step <= 0 || !Number.isFinite(current)) {
        return;
    }

    const nextValue = Math.max(min, Math.min(max, current + (step * direction)));
    if (nextValue === current) {
        return;
    }

    inputEl.value = nextValue.toString();
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
}

function cycleSelectValue(selectEl: HTMLSelectElement, direction: -1 | 1): void {
    const optionCount = selectEl.options.length;
    if (optionCount <= 1) {
        return;
    }

    const nextIndex = (selectEl.selectedIndex + direction + optionCount) % optionCount;
    selectEl.selectedIndex = nextIndex;
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
}

function applyUpgradeGamepadSelectionVisual(): void {
    if (!upgradeCardsEl || activeUpgradeOptions.length === 0) {
        return;
    }

    const buttons = Array.from(upgradeCardsEl.querySelectorAll<HTMLButtonElement>('button.upgrade-card'));
    if (buttons.length === 0) {
        return;
    }

    upgradeGamepadCardIndex = (upgradeGamepadCardIndex + buttons.length) % buttons.length;
    for (const [index, button] of buttons.entries()) {
        button.classList.toggle('is-gamepad-selected', index === upgradeGamepadCardIndex);
    }

    const selectedOption = activeUpgradeOptions[upgradeGamepadCardIndex];
    if (selectedOption && !waitingUpgradeSelection) {
        hudController.previewStatModifiers(selectedOption.card.modifiers);
    }
}

function clearUpgradeGamepadSelectionVisual(): void {
    if (!upgradeCardsEl) {
        return;
    }

    const buttons = upgradeCardsEl.querySelectorAll('button.upgrade-card.is-gamepad-selected');
    for (const button of buttons) {
        button.classList.remove('is-gamepad-selected');
    }
}

function applyColorGamepadSelectionVisual(): void {
    if (!colorSelectionScreen) {
        return;
    }

    const cards = Array.from(colorSelectionScreen.querySelectorAll<HTMLElement>('.color-card'));
    if (cards.length === 0) {
        return;
    }

    colorGamepadCardIndex = (colorGamepadCardIndex + cards.length) % cards.length;
    for (const [index, card] of cards.entries()) {
        card.classList.toggle('is-gamepad-selected', index === colorGamepadCardIndex);
    }
}

function clearColorGamepadSelectionVisual(): void {
    if (!colorSelectionScreen) {
        return;
    }

    const selectedCards = colorSelectionScreen.querySelectorAll('.color-card.is-gamepad-selected');
    for (const selectedCard of selectedCards) {
        selectedCard.classList.remove('is-gamepad-selected');
    }
}

function resolveUiNavigationGamepad(connectedGamepads: Gamepad[]): Gamepad | null {
    if (connectedGamepads.length === 0) {
        return null;
    }

    if (uiMode === 'UPGRADE') {
        if (activeUpgradePlayerId && activeRunConfiguration.players[activeUpgradePlayerId].control === 'GAMEPAD') {
            return resolvePlayerAssignedGamepad(activeUpgradePlayerId, connectedGamepads) ?? connectedGamepads[0];
        }

        return connectedGamepads[0];
    }

    if (uiMode === 'INITIAL_MENU' || uiMode === 'GAME_OVER' || uiMode === 'COLOR_SELECTION' || uiMode === 'PAUSED') {
        return connectedGamepads[0];
    }

    return null;
}

function handleInitialMenuGamepadNavigation(gamepadIndex: number, actions: UiGamepadActionState): void {
    if (!isMainMenuVisible()) {
        clearMenuGamepadFocusVisual();
        return;
    }

    const navigableControls = getMenuNavigableControls();
    if (navigableControls.length === 0) {
        clearMenuGamepadFocusVisual();
        return;
    }

    menuGamepadFocusIndex = Math.max(0, Math.min(menuGamepadFocusIndex, navigableControls.length - 1));
    applyMenuGamepadFocusVisual(navigableControls);

    if (consumeGamepadAction(gamepadIndex, 'up', actions.up)) {
        menuGamepadFocusIndex = (menuGamepadFocusIndex - 1 + navigableControls.length) % navigableControls.length;
        applyMenuGamepadFocusVisual(navigableControls);
    }

    if (consumeGamepadAction(gamepadIndex, 'down', actions.down)) {
        menuGamepadFocusIndex = (menuGamepadFocusIndex + 1) % navigableControls.length;
        applyMenuGamepadFocusVisual(navigableControls);
    }

    const currentControl = navigableControls[menuGamepadFocusIndex];
    if (currentControl instanceof HTMLSelectElement) {
        if (consumeGamepadAction(gamepadIndex, 'left', actions.left)) {
            cycleSelectValue(currentControl, -1);
            applyMenuGamepadFocusVisual(navigableControls);
        }
        if (consumeGamepadAction(gamepadIndex, 'right', actions.right)) {
            cycleSelectValue(currentControl, 1);
            applyMenuGamepadFocusVisual(navigableControls);
        }
    } else {
        consumeGamepadAction(gamepadIndex, 'left', actions.left);
        consumeGamepadAction(gamepadIndex, 'right', actions.right);
    }

    if (consumeGamepadAction(gamepadIndex, 'confirm', actions.confirm)) {
        if (currentControl instanceof HTMLButtonElement) {
            currentControl.click();
        } else if (currentControl instanceof HTMLSelectElement) {
            cycleSelectValue(currentControl, 1);
            applyMenuGamepadFocusVisual(navigableControls);
        }
    }
}

function handlePauseGamepadNavigation(gamepadIndex: number, actions: UiGamepadActionState): void {
    if (!isPauseMenuVisible()) {
        clearPauseGamepadFocusVisual();
        return;
    }

    const navigableControls = getPauseNavigableControls();
    if (navigableControls.length === 0) {
        clearPauseGamepadFocusVisual();
        return;
    }

    pauseMenuGamepadFocusIndex = Math.max(0, Math.min(pauseMenuGamepadFocusIndex, navigableControls.length - 1));
    applyPauseGamepadFocusVisual(navigableControls);

    if (consumeGamepadAction(gamepadIndex, 'up', actions.up)) {
        pauseMenuGamepadFocusIndex = (pauseMenuGamepadFocusIndex - 1 + navigableControls.length) % navigableControls.length;
        applyPauseGamepadFocusVisual(navigableControls);
    }

    if (consumeGamepadAction(gamepadIndex, 'down', actions.down)) {
        pauseMenuGamepadFocusIndex = (pauseMenuGamepadFocusIndex + 1) % navigableControls.length;
        applyPauseGamepadFocusVisual(navigableControls);
    }

    const activeControl = navigableControls[pauseMenuGamepadFocusIndex];
    if (activeControl instanceof HTMLInputElement && activeControl.type === 'range') {
        if (consumeGamepadAction(gamepadIndex, 'left', actions.left)) {
            adjustRangeInputValue(activeControl, -1);
        }
        if (consumeGamepadAction(gamepadIndex, 'right', actions.right)) {
            adjustRangeInputValue(activeControl, 1);
        }
    } else {
        consumeGamepadAction(gamepadIndex, 'left', actions.left);
        consumeGamepadAction(gamepadIndex, 'right', actions.right);
    }

    if (consumeGamepadAction(gamepadIndex, 'confirm', actions.confirm)) {
        if (activeControl instanceof HTMLButtonElement) {
            activeControl.click();
        }
    }

    if (consumeGamepadAction(gamepadIndex, 'cancel', actions.cancel)) {
        if (pauseAudioPanelEl?.classList.contains('is-open')) {
            setPauseAudioPanelOpen(false);
            applyPauseGamepadFocusVisual(getPauseNavigableControls());
        } else {
            togglePauseFromUi();
        }
    }
}

function handleUpgradeGamepadNavigation(gamepadIndex: number, actions: UiGamepadActionState): void {
    if (!upgradeModal?.classList.contains('is-visible') || waitingUpgradeSelection || activeUpgradeOptions.length === 0 || !upgradeCardsEl) {
        return;
    }

    const cardButtons = Array.from(upgradeCardsEl.querySelectorAll<HTMLButtonElement>('button.upgrade-card'));
    if (cardButtons.length === 0) {
        return;
    }

    let nextIndex = upgradeGamepadCardIndex;
    if (consumeGamepadAction(gamepadIndex, 'left', actions.left)) {
        nextIndex -= 1;
    }
    if (consumeGamepadAction(gamepadIndex, 'right', actions.right)) {
        nextIndex += 1;
    }
    if (consumeGamepadAction(gamepadIndex, 'up', actions.up)) {
        nextIndex -= UPGRADE_GAMEPAD_GRID_COLUMNS;
    }
    if (consumeGamepadAction(gamepadIndex, 'down', actions.down)) {
        nextIndex += UPGRADE_GAMEPAD_GRID_COLUMNS;
    }

    if (nextIndex !== upgradeGamepadCardIndex) {
        const normalized = ((nextIndex % cardButtons.length) + cardButtons.length) % cardButtons.length;
        upgradeGamepadCardIndex = normalized;
        applyUpgradeGamepadSelectionVisual();
    }

    if (consumeGamepadAction(gamepadIndex, 'confirm', actions.confirm)) {
        cardButtons[upgradeGamepadCardIndex]?.click();
    }
}

function handleColorSelectionGamepadNavigation(gamepadIndex: number, actions: UiGamepadActionState): void {
    if (!colorSelectionScreen || colorSelectionScreen.classList.contains('hidden')) {
        return;
    }

    const cards = Array.from(colorSelectionScreen.querySelectorAll<HTMLElement>('.color-card'));
    if (cards.length === 0) {
        return;
    }

    applyColorGamepadSelectionVisual();

    if (consumeGamepadAction(gamepadIndex, 'left', actions.left)) {
        colorGamepadCardIndex = (colorGamepadCardIndex - 1 + cards.length) % cards.length;
        applyColorGamepadSelectionVisual();
    }
    if (consumeGamepadAction(gamepadIndex, 'right', actions.right)) {
        colorGamepadCardIndex = (colorGamepadCardIndex + 1) % cards.length;
        applyColorGamepadSelectionVisual();
    }

    consumeGamepadAction(gamepadIndex, 'up', actions.up);
    consumeGamepadAction(gamepadIndex, 'down', actions.down);

    if (consumeGamepadAction(gamepadIndex, 'confirm', actions.confirm)) {
        cards[colorGamepadCardIndex]?.click();
    }
}

function canTogglePauseWithGamepad(): boolean {
    return uiMode === 'IN_GAME' || uiMode === 'PAUSED';
}

function processGamepadPauseToggles(connectedGamepads: Gamepad[]): void {
    for (const gamepad of connectedGamepads) {
        const actions = readGamepadUiActions(gamepad);
        if (!consumeGamepadAction(gamepad.index, 'pause', actions.pause)) {
            continue;
        }

        if (!canTogglePauseWithGamepad()) {
            continue;
        }

        togglePauseFromUi();
        break;
    }
}

function pollGamepadUiNavigation(): void {
    const connectedGamepads = getConnectedGamepads();
    processGamepadPauseToggles(connectedGamepads);
    const activeGamepad = resolveUiNavigationGamepad(connectedGamepads);

    if (!activeGamepad) {
        if (connectedGamepads.length > 0) {
            const fallbackGamepad = connectedGamepads[0];
            const fallbackActions = readGamepadUiActions(fallbackGamepad);
            const fallbackIndex = fallbackGamepad.index;
            consumeGamepadAction(fallbackIndex, 'up', fallbackActions.up);
            consumeGamepadAction(fallbackIndex, 'down', fallbackActions.down);
            consumeGamepadAction(fallbackIndex, 'left', fallbackActions.left);
            consumeGamepadAction(fallbackIndex, 'right', fallbackActions.right);
            consumeGamepadAction(fallbackIndex, 'confirm', fallbackActions.confirm);
            consumeGamepadAction(fallbackIndex, 'cancel', fallbackActions.cancel);
            consumeGamepadAction(fallbackIndex, 'pause', fallbackActions.pause);
        }

        clearMenuGamepadFocusVisual();
        clearPauseGamepadFocusVisual();
        gamepadUiPollFrameId = window.requestAnimationFrame(pollGamepadUiNavigation);
        return;
    }

    const actions = readGamepadUiActions(activeGamepad);
    const gamepadIndex = activeGamepad.index;

    if (uiMode === 'INITIAL_MENU' || uiMode === 'GAME_OVER') {
        handleInitialMenuGamepadNavigation(gamepadIndex, actions);
    } else if (uiMode === 'COLOR_SELECTION') {
        handleColorSelectionGamepadNavigation(gamepadIndex, actions);
    } else if (uiMode === 'PAUSED') {
        handlePauseGamepadNavigation(gamepadIndex, actions);
    } else if (uiMode === 'UPGRADE') {
        handleUpgradeGamepadNavigation(gamepadIndex, actions);
    } else {
        consumeGamepadAction(gamepadIndex, 'up', actions.up);
        consumeGamepadAction(gamepadIndex, 'down', actions.down);
        consumeGamepadAction(gamepadIndex, 'left', actions.left);
        consumeGamepadAction(gamepadIndex, 'right', actions.right);
        consumeGamepadAction(gamepadIndex, 'confirm', actions.confirm);
        consumeGamepadAction(gamepadIndex, 'cancel', actions.cancel);
    }

    consumeGamepadAction(gamepadIndex, 'pause', actions.pause);

    gamepadUiPollFrameId = window.requestAnimationFrame(pollGamepadUiNavigation);
}

function applyPlayerFieldVisibility(): void {
    const playerCount = mapPlayerCount(playerCountSelect?.value);
    const showP2 = playerCount >= 2;
    const showP3 = playerCount >= 3;
    const showP4 = playerCount >= 4;

    player2NameWrapEl?.classList.toggle('is-hidden', !showP2);
    player2ControlWrapEl?.classList.toggle('is-hidden', !showP2);
    player3NameWrapEl?.classList.toggle('is-hidden', !showP3);
    player3ControlWrapEl?.classList.toggle('is-hidden', !showP3);
    player4NameWrapEl?.classList.toggle('is-hidden', !showP4);
    player4ControlWrapEl?.classList.toggle('is-hidden', !showP4);
    updateMenuControlSlotHints();
    applyMenuGamepadFocusVisual(getMenuNavigableControls());
}

function buildRunConfiguration(primaryName: string): RunConfiguration {
    const playerCount = mapPlayerCount(playerCountSelect?.value);
    const players: RunConfiguration['players'] = {
        player_1: {
            name: primaryName,
            control: mapControlPreference(player1ControlSelect?.value),
        },
        player_2: {
            name: normalizePlayerName(player2NameInput?.value ?? '', 'Jogador 2'),
            control: mapControlPreference(player2ControlSelect?.value),
        },
        player_3: {
            name: normalizePlayerName(player3NameInput?.value ?? '', 'Jogador 3'),
            control: mapControlPreference(player3ControlSelect?.value),
        },
        player_4: {
            name: normalizePlayerName(player4NameInput?.value ?? '', 'Jogador 4'),
            control: mapControlPreference(player4ControlSelect?.value),
        },
    };

    // Teclado so eh suportado para P1 e P2.
    if (players.player_3.control === 'KEYBOARD') {
        players.player_3.control = 'GAMEPAD';
    }
    if (players.player_4.control === 'KEYBOARD') {
        players.player_4.control = 'GAMEPAD';
    }

    return { playerCount, players };
}

function clearPendingGameOverUiTimeout(): void {
    if (gameOverUiTimeoutId === null) {
        return;
    }

    window.clearTimeout(gameOverUiTimeoutId);
    gameOverUiTimeoutId = null;
}

function goToMainMenu(): void {
    clearPendingGameOverUiTimeout();

    // Emit GAME_OVER to save run stats, then immediately cancel its UI side-effect
    const summary = engine.getRunSummary();
    emitGameEvent(GameEvents.GAME_OVER, summary);
    clearPendingGameOverUiTimeout();

    engine.stop();
    setPauseMenuVisible(false);
    setUpgradeModalVisible(false);
    setUpgradeSelectionOwner(null);
    clearUpgradeCards();
    hudController.clearStatPreview();
    hudController.setStatsPinned(false);
    waitingUpgradeSelection = false;
    applyPauseUi(false);
    colorSelectionScreen?.classList.add('hidden');

    if (menuInicial) menuInicial.style.display = 'flex';
    if (tituloMenu) {
        tituloMenu.innerText = 'CORE.IO';
        tituloMenu.style.textShadow = '0 0 10px #4488ff';
    }
    if (btnJogar) {
        btnJogar.innerText = 'JOGAR';
        btnJogar.style.backgroundColor = '#4488ff';
        btnJogar.style.boxShadow = 'none';
    }
    if (btnMenuHome) btnMenuHome.style.display = 'none';

    setUiMode('INITIAL_MENU');
}

if (btnJogar && menuInicial && tituloMenu) {
    const scheduleGameOverUi = () => {
        if (gameOverUiTimeoutId !== null) {
            return;
        }

        gameOverUiTimeoutId = window.setTimeout(() => {
            gameOverUiTimeoutId = null;

            menuInicial.style.display = 'flex';
            tituloMenu.innerText = 'GAME OVER';
            tituloMenu.style.textShadow = '0 0 15px #ff4444';

            btnJogar.innerText = 'TENTAR NOVAMENTE';
            btnJogar.style.backgroundColor = '#cc0000';
            btnJogar.style.boxShadow = '0 0 15px #ff4444';

            if (btnMenuHome) btnMenuHome.style.display = 'inline-block';
        }, DEATH_ANIMATION_DURATION_MS);
    };

    btnJogar.addEventListener('click', () => {
        clearPendingGameOverUiTimeout();
        menuInicial.style.display = 'none';
        setPauseMenuVisible(false);
        setUpgradeModalVisible(false);
        setUpgradeSelectionOwner(null);
        clearUpgradeCards();
        hudController.clearStatPreview();
        hudController.setStatsPinned(false);
        waitingUpgradeSelection = false;
        if (btnMenuHome) btnMenuHome.style.display = 'none';

        const playerName = normalizePlayerName(playerNameInput?.value ?? '', 'Jogador');
        const runConfiguration = buildRunConfiguration(playerName);
        activeRunConfiguration = runConfiguration;
        activeRunPlayerColors = {};
        emitGameEvent(GameEvents.RUN_CONFIG_CHANGED, runConfiguration);
        hudController.resetForNewRun();
        applyPauseUi(false);

        tituloMenu.innerText = 'CORE.IO';
        tituloMenu.style.textShadow = '0 0 10px #4488ff';
        btnJogar.innerText = 'JOGAR';
        btnJogar.style.backgroundColor = '#4488ff';
        btnJogar.style.boxShadow = 'none';

        engine.reset(playerName, runConfiguration);
        engine.start();

        colorSelectionScreen?.classList.remove('hidden');
        setUiMode('COLOR_SELECTION');
    });

    onGameEvent(GameEvents.START_RUN_WITH_COLOR, ({ playerColors }) => {
        activeRunPlayerColors = resolveRunPlayerColors(playerColors);
        setUpgradeSelectionOwner(null);
        hudController.clearStatPreview();
        createIcons({ icons: { Home, Volume2, VolumeX } });
        setUiMode('IN_GAME');
    });

    onGameEvent(GameEvents.GAME_OVER, () => {
        console.log('Game Over!');

        engine.stop();
        setPauseMenuVisible(false);
        applyPauseUi(false);
        setUpgradeModalVisible(false);
        setUpgradeSelectionOwner(null);
        clearUpgradeCards();
        hudController.clearStatPreview();
        hudController.setStatsPinned(false);
        waitingUpgradeSelection = false;
        colorSelectionScreen?.classList.add('hidden');
        setUiMode('GAME_OVER');

        scheduleGameOverUi();
    });
} else {
    console.warn('Elementos do menu nao encontrados.');
    engine.start();
    applyPauseUi(false);
    setUiMode('IN_GAME');
}

if (btnPause) {
    btnPause.addEventListener('click', () => {
        togglePauseFromUi();
    });
}

if (btnAudio) {
    btnAudio.addEventListener('click', () => {
        if (!isPauseMenuVisible()) {
            return;
        }

        const isOpen = pauseAudioPanelEl?.classList.contains('is-open') ?? false;
        setPauseAudioPanelOpen(!isOpen);
    });
}

if (btnMute) {
    btnMute.addEventListener('click', () => {
        musicMuted = !musicMuted;
        updateAudioHud();
        emitAudioSettings();
    });
}

if (musicVolumeInput) {
    musicVolumeInput.addEventListener('input', () => {
        const rawValue = Number(musicVolumeInput.value);
        const clampedValue = Math.max(0, Math.min(100, rawValue));
        musicVolume = clampedValue / 100;

        updateAudioHud();
        emitAudioSettings();
    });
}

if (btnAudioGlobal) {
    btnAudioGlobal.addEventListener('click', () => {
        const isOpen = hudAudioPanelEl?.classList.contains('is-open') ?? false;
        hudAudioPanelEl?.classList.toggle('is-open', !isOpen);
    });
}

if (btnMuteGlobal) {
    btnMuteGlobal.addEventListener('click', () => {
        musicMuted = !musicMuted;
        updateAudioHud();
        emitAudioSettings();
    });
}

if (musicVolumeGlobalInput) {
    musicVolumeGlobalInput.addEventListener('input', () => {
        const rawValue = Number(musicVolumeGlobalInput.value);
        musicVolume = Math.max(0, Math.min(100, rawValue)) / 100;
        updateAudioHud();
        emitAudioSettings();
    });
}

if (btnResume) {
    btnResume.addEventListener('click', () => {
        if (!isPauseMenuVisible()) {
            return;
        }

        togglePauseFromUi();
    });
}

if (btnHomePause) {
    btnHomePause.addEventListener('click', () => {
        goToMainMenu();
    });
}

if (btnMenuHome) {
    btnMenuHome.addEventListener('click', () => {
        goToMainMenu();
    });
}

if (btnRestart) {
    btnRestart.addEventListener('click', () => {
        clearPendingGameOverUiTimeout();
        setPauseMenuVisible(false);
        setUpgradeModalVisible(false);
        setUpgradeSelectionOwner(null);
        clearUpgradeCards();
        hudController.clearStatPreview();
        hudController.setStatsPinned(false);
        waitingUpgradeSelection = false;
        applyPauseUi(false);
        hudController.resetForNewRun();

        emitGameEvent(GameEvents.RUN_CONFIG_CHANGED, activeRunConfiguration);
        engine.reset(activeRunConfiguration.players.player_1.name, activeRunConfiguration);
        engine.start();
        engine.startGameWithColor(activeRunPlayerColors);
        emitGameEvent(GameEvents.AUDIO_RESTART_REQUESTED, undefined);
        setUiMode('IN_GAME');

        if (menuInicial) {
            menuInicial.style.display = 'none';
        }
    });
}

onGameEvent(GameEvents.SHOW_UPGRADE_MODAL, ({ playerId, upgradesRemaining }) => {
    setUpgradeModalVisible(true);
    setUpgradeSelectionOwner(playerId);
    hudController.setStatsPinned(true);
    hudStatsEl?.classList.remove('is-user-collapsed');
    hudController.clearStatPreview();
    setUpgradesRemaining(upgradesRemaining);
    waitingUpgradeSelection = false;
    upgradeGamepadCardIndex = 0;
    setUiMode('UPGRADE');
});

onGameEvent(GameEvents.UPDATE_UPGRADE_MODAL, ({ playerId, upgradesRemaining, options }) => {
    setUpgradeModalVisible(true);
    setUpgradeSelectionOwner(playerId);
    hudController.setStatsPinned(true);
    hudStatsEl?.classList.remove('is-user-collapsed');
    hudController.clearStatPreview();
    setUpgradesRemaining(upgradesRemaining);
    waitingUpgradeSelection = false;
    upgradeGamepadCardIndex = 0;
    renderUpgradeCards(options);
    setUpgradeCardsDisabled(false);
    setUiMode('UPGRADE');
});

onGameEvent(GameEvents.HIDE_UPGRADE_MODAL, () => {
    setUpgradeModalVisible(false);
    setUpgradeSelectionOwner(null);
    clearUpgradeCards();
    hudController.clearStatPreview();
    hudController.setStatsPinned(false);
    hudStatsEl?.classList.remove('is-user-collapsed');
    waitingUpgradeSelection = false;
    activeUpgradeOptions = [];
    upgradeGamepadCardIndex = 0;
    clearUpgradeGamepadSelectionVisual();

    if (uiMode === 'GAME_OVER' || uiMode === 'INITIAL_MENU') {
        return;
    }

    setUiMode(isPauseMenuVisible() ? 'PAUSED' : 'IN_GAME');
});

if (playerCountSelect) {
    playerCountSelect.addEventListener('change', () => {
        applyPlayerFieldVisibility();
    });
}
if (player1ControlSelect) {
    player1ControlSelect.addEventListener('change', () => updateMenuControlSlotHints());
}
if (player2ControlSelect) {
    player2ControlSelect.addEventListener('change', () => updateMenuControlSlotHints());
}
if (player3ControlSelect) {
    player3ControlSelect.addEventListener('change', () => updateMenuControlSlotHints());
}
if (player4ControlSelect) {
    player4ControlSelect.addEventListener('change', () => updateMenuControlSlotHints());
}

window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.repeat) {
        return;
    }

    event.preventDefault();
    togglePauseFromUi();
});

function preventNameInputPropagation(): void {
    const stopEventPropagation = (event: KeyboardEvent): void => {
        event.stopPropagation();
    };

    const inputElements = [playerNameInput, player2NameInput, player3NameInput, player4NameInput];
    for (const inputElement of inputElements) {
        if (!inputElement) {
            continue;
        }

        inputElement.addEventListener('keydown', stopEventPropagation);
        inputElement.addEventListener('keyup', stopEventPropagation);
        inputElement.addEventListener('keypress', stopEventPropagation);
    }
}

if (hudStatsEl) {
    hudStatsEl.addEventListener('click', () => {
        if (uiMode !== 'UPGRADE') {
            return;
        }

        hudStatsEl.classList.toggle('is-user-collapsed');
    });
}

preventNameInputPropagation();
if (playerCountSelect) {
    playerCountSelect.value = activeRunConfiguration.playerCount.toString();
}
if (player1ControlSelect) {
    player1ControlSelect.value = activeRunConfiguration.players.player_1.control === 'GAMEPAD' ? 'gamepad' : 'keyboard';
}
if (player2ControlSelect) {
    player2ControlSelect.value = activeRunConfiguration.players.player_2.control === 'KEYBOARD' ? 'keyboard' : 'gamepad';
}
if (player3ControlSelect) {
    player3ControlSelect.value = 'gamepad';
}
if (player4ControlSelect) {
    player4ControlSelect.value = 'gamepad';
}
if (player2NameInput) {
    player2NameInput.value = activeRunConfiguration.players.player_2.name;
}
if (player3NameInput) {
    player3NameInput.value = activeRunConfiguration.players.player_3.name;
}
if (player4NameInput) {
    player4NameInput.value = activeRunConfiguration.players.player_4.name;
}
applyPlayerFieldVisibility();
updateMenuControlSlotHints();
applyUiModeEffects();
gamepadUiPollFrameId = window.requestAnimationFrame(pollGamepadUiNavigation);
createIcons({ icons: { Home, Volume2, VolumeX } });
updateAudioHud();
emitGameEvent(GameEvents.RUN_CONFIG_CHANGED, activeRunConfiguration);
emitAudioSettings();

function syncCanvasLayout(): void {
    const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const insetRight = Math.max(0, window.innerWidth - rect.right);
    const insetBottom = Math.max(0, window.innerHeight - rect.bottom);
    const scale = rect.height / 1080;
    const root = document.documentElement;
    root.style.setProperty('--canvas-inset-right', `${Math.round(insetRight)}px`);
    root.style.setProperty('--canvas-inset-bottom', `${Math.round(insetBottom)}px`);
    root.style.setProperty('--canvas-scale', scale.toFixed(4));
}

function attachCanvasSyncObserver(): void {
    const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
    if (!canvas) {
        window.setTimeout(attachCanvasSyncObserver, 100);
        return;
    }
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(() => syncCanvasLayout()).observe(canvas);
    }
    syncCanvasLayout();
}

// fullscreenchange fires when the transition starts but the canvas may still be settling —
// run sync after a short delay to catch the final resting dimensions.
document.addEventListener('fullscreenchange', () => {
    window.setTimeout(syncCanvasLayout, 60);
    window.setTimeout(syncCanvasLayout, 180);
});
window.addEventListener('resize', syncCanvasLayout);
attachCanvasSyncObserver();

window.addEventListener('beforeunload', () => {
    if (gamepadUiPollFrameId !== null) {
        window.cancelAnimationFrame(gamepadUiPollFrameId);
        gamepadUiPollFrameId = null;
    }
    engine.destroy();
    hudController.destroy();
});
