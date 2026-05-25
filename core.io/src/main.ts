import './style.css';
import './client/lobby/lobby.css';
import { createIcons, Home, Volume2, Volume1, VolumeX, Settings, HelpCircle, Users, ArrowRight, Keyboard, Gamepad2, Plus, X } from 'lucide';
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
import { PLAYER_IDS, type EntityStats, type PlayerId, type RunConfiguration, type UpgradeRollOption } from './shared/Types';
import { DEATH_ANIMATION_DURATION_MS } from './client/constants/GameConstants';
import { LobbyController } from './client/lobby/LobbyController';
import { HelpModal } from './client/lobby/HelpModal';

console.log('Inicializando Core.io...');

const engine = new GameEngine();
createPhaserGame();
const hudController = new HudController();
new GodMode(engine);

type UiMode = 'INITIAL_MENU' | 'IN_GAME' | 'PAUSED' | 'UPGRADE' | 'GAME_OVER';

const hudLayerEl = document.getElementById('hud-layer');
const lobbyRootEl = document.getElementById('lobby');
const settingsPanelEl = document.getElementById('lobby-settings-panel');
const musicVolumeGlobalInput = document.getElementById('music-volume-global') as HTMLInputElement | null;
const btnMuteGlobal = document.getElementById('btn-mute-global') as HTMLButtonElement | null;
const btnPause = document.getElementById('btn-pause') as HTMLButtonElement | null;
const btnAudio = document.getElementById('btn-audio') as HTMLButtonElement | null;
const btnMute = document.getElementById('btn-mute') as HTMLButtonElement | null;
const musicVolumeInput = document.getElementById('music-volume') as HTMLInputElement | null;
const pauseAudioPanelEl = document.getElementById('pause-audio-panel');
const pauseMenu = document.getElementById('pause-menu');
const btnResume = document.getElementById('btn-resume') as HTMLButtonElement | null;
const btnRestart = document.getElementById('btn-restart') as HTMLButtonElement | null;
const btnHomePause = document.getElementById('btn-home-pause') as HTMLButtonElement | null;
const upgradeModal = document.getElementById('upgrade-modal');
const upgradeTitleEl = upgradeModal?.querySelector('h2') as HTMLHeadingElement | null;
const upgradeRemainingEl = document.getElementById('upgrade-remaining');
const upgradeCardsEl = document.getElementById('upgrade-cards');
const hudStatsEl = document.getElementById('hud-stats');

let gameOverUiTimeoutId: number | null = null;
let waitingUpgradeSelection = false;
let activeUpgradePlayerId: PlayerId | null = null;
let uiMode: UiMode = lobbyRootEl ? 'INITIAL_MENU' : 'IN_GAME';
let previousUiMode: UiMode | null = null;
let upgradeGamepadCardIndex = 0;
let pauseMenuGamepadFocusIndex = 0;
let activeUpgradeOptions: UpgradeRollOption[] = [];
let gamepadUiPollFrameId: number | null = null;
let activeRunConfiguration: RunConfiguration | null = null;

type UiGamepadActionKey = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' | 'pause';
type UiGamepadActionState = Record<UiGamepadActionKey, boolean>;

const GAMEPAD_NAV_AXIS_THRESHOLD = 0.55;
const UPGRADE_GAMEPAD_GRID_COLUMNS = 3;

const gamepadActionLatchByPadIndex = new Map<number, UiGamepadActionState>();
const _initialAudio = hudController.getInitialAudioPrefs();
let musicMuted = _initialAudio.muted;
let musicVolume = _initialAudio.volume;

const helpModal = new HelpModal();
const lobby = new LobbyController({
    onStart: ({ runConfiguration }) => startRun(runConfiguration),
    onOpenHelp: () => helpModal.open(),
    onOpenSettings: () => { /* placeholder — settings has no behaviour yet */ },
    onToggleAudioPanel: () => toggleSettingsPanel(),
});

function toggleSettingsPanel(): void {
    if (!settingsPanelEl) return;
    settingsPanelEl.hidden = !settingsPanelEl.hidden;
}

function setUiMode(nextMode: UiMode): void {
    uiMode = nextMode;

    if (nextMode !== 'PAUSED') {
        clearPauseGamepadFocusVisual();
    }

    if (nextMode !== 'UPGRADE') {
        clearUpgradeGamepadSelectionVisual();
    }

    applyUiModeEffects();
}

function applyUiModeEffects(): void {
    const isLobbyMode = uiMode === 'INITIAL_MENU' || uiMode === 'GAME_OVER';
    const shouldShowHud = !isLobbyMode;

    hudLayerEl?.classList.toggle('is-hidden', !shouldShowHud);
    hudStatsEl?.classList.toggle('is-hidden', !shouldShowHud);
    if (isLobbyMode) lobby.show(); else lobby.hide();
    if (!isLobbyMode && settingsPanelEl) settingsPanelEl.hidden = true;

    if (uiMode === 'IN_GAME') {
        hudController.setStatsPinned(false);
    }

    if (uiMode !== 'PAUSED') {
        setPauseAudioPanelOpen(false);
    }
}

function applyPauseUi(isPaused: boolean): void {
    if (!btnPause) return;
    btnPause.textContent = isPaused ? '▶' : '||';
    btnPause.classList.toggle('is-paused', isPaused);
}

function emitAudioSettings(): void {
    emitGameEvent(GameEvents.AUDIO_SETTINGS_CHANGED, { volume: musicVolume, muted: musicMuted });
}

function updateAudioHud(): void {
    if (btnMute) {
        btnMute.textContent = musicMuted ? 'Som: OFF' : 'Som: ON';
        btnMute.classList.toggle('is-muted', musicMuted);
    }
    if (musicVolumeInput) musicVolumeInput.value = Math.round(musicVolume * 100).toString();
    if (musicVolumeGlobalInput) musicVolumeGlobalInput.value = Math.round(musicVolume * 100).toString();
    if (btnMuteGlobal) {
        btnMuteGlobal.textContent = musicMuted ? 'SOM: OFF' : 'SOM: ON';
        btnMuteGlobal.classList.toggle('is-muted', musicMuted);
    }
    lobby.setAudioState(musicVolume, musicMuted);
}

function setPauseAudioPanelOpen(open: boolean): void {
    pauseAudioPanelEl?.classList.toggle('is-open', open);
    if (uiMode === 'PAUSED') {
        window.setTimeout(() => applyPauseGamepadFocusVisual(getPauseNavigableControls()), 0);
    }
}

function setPauseMenuVisible(visible: boolean): void {
    if (!pauseMenu) return;
    pauseMenu.style.display = visible ? 'flex' : 'none';
    pauseMenuGamepadFocusIndex = 0;
    if (visible) {
        window.setTimeout(() => applyPauseGamepadFocusVisual(getPauseNavigableControls()), 0);
    } else {
        clearPauseGamepadFocusVisual();
        setPauseAudioPanelOpen(false);
    }
}

function isPauseMenuVisible(): boolean {
    return pauseMenu ? window.getComputedStyle(pauseMenu).display !== 'none' : false;
}

function togglePauseFromUi(): void {
    if (uiMode === 'INITIAL_MENU' || uiMode === 'GAME_OVER') return;
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
    upgradeModal?.classList.toggle('is-visible', visible);
}

function setUpgradesRemaining(value: number): void {
    if (upgradeRemainingEl) upgradeRemainingEl.textContent = `Aprimoramentos Restantes: ${Math.max(0, value)}`;
}

function getConfiguredPlayerName(playerId: PlayerId): string {
    return activeRunConfiguration?.players[playerId]?.name ?? 'Jogador';
}

function setUpgradeSelectionOwner(playerId: PlayerId | null): void {
    activeUpgradePlayerId = playerId;
    if (!upgradeTitleEl) return;
    upgradeTitleEl.textContent = playerId ? `Escolha de ${getConfiguredPlayerName(playerId)}` : 'Escolha um Aprimoramento';
}

function clearUpgradeCards(): void {
    upgradeCardsEl?.replaceChildren();
}

function setUpgradeCardsDisabled(disabled: boolean): void {
    if (!upgradeCardsEl) return;
    for (const cardButton of upgradeCardsEl.querySelectorAll('button')) cardButton.disabled = disabled;
}

function renderModifierBadges(modifiers: UpgradeRollOption['card']['modifiers']): HTMLElement {
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

function renderUpgradeCards(options: UpgradeRollOption[]): void {
    if (!upgradeCardsEl) return;

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

        const footerEl = document.createElement('div');
        footerEl.className = 'upgrade-card-footer';
        footerEl.textContent = 'TOQUE PARA ESCOLHER';

        button.append(rarityEl, nameEl, artEl, descriptionEl, renderModifierBadges(option.card.modifiers), footerEl);

        button.addEventListener('mouseenter', () => {
            if (waitingUpgradeSelection) return;
            upgradeGamepadCardIndex = index;
            applyUpgradeGamepadSelectionVisual();
            hudController.previewStatModifiers(option.card.modifiers);
        });

        button.addEventListener('mouseleave', () => {
            if (waitingUpgradeSelection) return;
            hudController.clearStatPreview();
        });

        button.addEventListener('click', () => {
            if (waitingUpgradeSelection || !activeUpgradePlayerId) return;

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

function isButtonPressed(button: GamepadButton | undefined): boolean {
    return !!button && (button.pressed || button.value > 0.35);
}

function getConnectedGamepads(): Gamepad[] {
    if (!('getGamepads' in navigator)) return [];
    const connected = Array.from(navigator.getGamepads()).filter((p): p is Gamepad => !!p && p.connected);
    connected.sort((a, b) => a.index - b.index);
    return connected;
}

function getGamepadPlayersFromConfiguration(config: RunConfiguration): PlayerId[] {
    const activePlayers = PLAYER_IDS.slice(0, config.playerCount) as PlayerId[];
    return activePlayers.filter((playerId) => config.players[playerId].control === 'GAMEPAD');
}

function resolvePlayerAssignedGamepad(playerId: PlayerId, connectedGamepads: Gamepad[]): Gamepad | null {
    if (!activeRunConfiguration) return null;
    const slotIndex = getGamepadPlayersFromConfiguration(activeRunConfiguration).indexOf(playerId);
    return slotIndex < 0 ? null : connectedGamepads[slotIndex] ?? null;
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
    let cached = gamepadActionLatchByPadIndex.get(gamepadIndex);
    if (!cached) {
        cached = { up: false, down: false, left: false, right: false, confirm: false, cancel: false, pause: false };
        gamepadActionLatchByPadIndex.set(gamepadIndex, cached);
    }
    return cached;
}

function consumeGamepadAction(gamepadIndex: number, actionKey: UiGamepadActionKey, pressed: boolean): boolean {
    const latch = getGamepadActionLatch(gamepadIndex);
    const wasPressed = latch[actionKey];
    latch[actionKey] = pressed;
    return pressed && !wasPressed;
}

function getEdgeActions(gamepadIndex: number, actions: UiGamepadActionState): UiGamepadActionState {
    return {
        up: consumeGamepadAction(gamepadIndex, 'up', actions.up),
        down: consumeGamepadAction(gamepadIndex, 'down', actions.down),
        left: consumeGamepadAction(gamepadIndex, 'left', actions.left),
        right: consumeGamepadAction(gamepadIndex, 'right', actions.right),
        confirm: consumeGamepadAction(gamepadIndex, 'confirm', actions.confirm),
        cancel: consumeGamepadAction(gamepadIndex, 'cancel', actions.cancel),
        pause: consumeGamepadAction(gamepadIndex, 'pause', actions.pause),
    };
}

function getPauseNavigableControls(): HTMLElement[] {
    if (!pauseMenu || pauseMenu.style.display === 'none') return [];

    const controls: HTMLElement[] = [];
    const maybePush = (element: HTMLElement | null): void => {
        if (!element || element.offsetParent === null) return;
        if ('disabled' in element && (element as HTMLButtonElement | HTMLInputElement).disabled) return;
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
    pauseMenu?.querySelectorAll<HTMLElement>('.is-gamepad-focused').forEach((el) => el.classList.remove('is-gamepad-focused'));
}

function applyPauseGamepadFocusVisual(navigableControls: HTMLElement[]): void {
    clearPauseGamepadFocusVisual();
    if (navigableControls.length === 0) return;

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
    if (!Number.isFinite(step) || step <= 0 || !Number.isFinite(current)) return;

    const nextValue = Math.max(min, Math.min(max, current + (step * direction)));
    if (nextValue === current) return;

    inputEl.value = nextValue.toString();
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
}

function applyUpgradeGamepadSelectionVisual(): void {
    if (!upgradeCardsEl || activeUpgradeOptions.length === 0) return;

    const buttons = Array.from(upgradeCardsEl.querySelectorAll<HTMLButtonElement>('button.upgrade-card'));
    if (buttons.length === 0) return;

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
    upgradeCardsEl?.querySelectorAll('button.upgrade-card.is-gamepad-selected').forEach((b) => b.classList.remove('is-gamepad-selected'));
}

function resolveUiNavigationGamepad(connectedGamepads: Gamepad[]): Gamepad | null {
    if (connectedGamepads.length === 0) return null;

    if (uiMode === 'UPGRADE') {
        if (activeUpgradePlayerId && activeRunConfiguration?.players[activeUpgradePlayerId].control === 'GAMEPAD') {
            return resolvePlayerAssignedGamepad(activeUpgradePlayerId, connectedGamepads) ?? connectedGamepads[0];
        }
        return connectedGamepads[0];
    }

    if (uiMode === 'INITIAL_MENU' || uiMode === 'GAME_OVER' || uiMode === 'PAUSED') {
        return connectedGamepads[0];
    }

    return null;
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
        if (consumeGamepadAction(gamepadIndex, 'left', actions.left)) adjustRangeInputValue(activeControl, -1);
        if (consumeGamepadAction(gamepadIndex, 'right', actions.right)) adjustRangeInputValue(activeControl, 1);
    } else {
        consumeGamepadAction(gamepadIndex, 'left', actions.left);
        consumeGamepadAction(gamepadIndex, 'right', actions.right);
    }

    if (consumeGamepadAction(gamepadIndex, 'confirm', actions.confirm) && activeControl instanceof HTMLButtonElement) {
        activeControl.click();
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
    if (!upgradeModal?.classList.contains('is-visible') || waitingUpgradeSelection || activeUpgradeOptions.length === 0 || !upgradeCardsEl) return;

    const cardButtons = Array.from(upgradeCardsEl.querySelectorAll<HTMLButtonElement>('button.upgrade-card'));
    if (cardButtons.length === 0) return;

    let nextIndex = upgradeGamepadCardIndex;
    if (consumeGamepadAction(gamepadIndex, 'left', actions.left)) nextIndex -= 1;
    if (consumeGamepadAction(gamepadIndex, 'right', actions.right)) nextIndex += 1;
    if (consumeGamepadAction(gamepadIndex, 'up', actions.up)) nextIndex -= UPGRADE_GAMEPAD_GRID_COLUMNS;
    if (consumeGamepadAction(gamepadIndex, 'down', actions.down)) nextIndex += UPGRADE_GAMEPAD_GRID_COLUMNS;

    if (nextIndex !== upgradeGamepadCardIndex) {
        upgradeGamepadCardIndex = ((nextIndex % cardButtons.length) + cardButtons.length) % cardButtons.length;
        applyUpgradeGamepadSelectionVisual();
    }

    if (consumeGamepadAction(gamepadIndex, 'confirm', actions.confirm)) cardButtons[upgradeGamepadCardIndex]?.click();
}

function canTogglePauseWithGamepad(): boolean {
    return uiMode === 'IN_GAME' || uiMode === 'PAUSED';
}

function processGamepadPauseToggles(connectedGamepads: Gamepad[]): void {
    for (const gamepad of connectedGamepads) {
        const actions = readGamepadUiActions(gamepad);
        if (!consumeGamepadAction(gamepad.index, 'pause', actions.pause)) continue;
        if (!canTogglePauseWithGamepad()) continue;
        togglePauseFromUi();
        break;
    }
}

function pollGamepadUiNavigation(): void {
    const connectedGamepads = getConnectedGamepads();
    processGamepadPauseToggles(connectedGamepads);
    const activeGamepad = resolveUiNavigationGamepad(connectedGamepads);

    if (!activeGamepad) {
        // Drain latches for any connected pad so a press at idle time doesn't fire later.
        for (const pad of connectedGamepads) {
            const a = readGamepadUiActions(pad);
            getEdgeActions(pad.index, a);
        }
        lobby.clearGamepadFocus();
        clearPauseGamepadFocusVisual();
        gamepadUiPollFrameId = window.requestAnimationFrame(pollGamepadUiNavigation);
        return;
    }

    const actions = readGamepadUiActions(activeGamepad);
    const gamepadIndex = activeGamepad.index;

    if (uiMode === 'INITIAL_MENU' || uiMode === 'GAME_OVER') {
        const edges = getEdgeActions(gamepadIndex, actions);
        lobby.handleGamepadNavigation(actions, edges);
    } else if (uiMode === 'PAUSED') {
        handlePauseGamepadNavigation(gamepadIndex, actions);
    } else if (uiMode === 'UPGRADE') {
        handleUpgradeGamepadNavigation(gamepadIndex, actions);
    } else {
        getEdgeActions(gamepadIndex, actions);
    }

    consumeGamepadAction(gamepadIndex, 'pause', actions.pause);

    gamepadUiPollFrameId = window.requestAnimationFrame(pollGamepadUiNavigation);
}

function clearPendingGameOverUiTimeout(): void {
    if (gameOverUiTimeoutId === null) return;
    window.clearTimeout(gameOverUiTimeoutId);
    gameOverUiTimeoutId = null;
}

function startRun(runConfiguration: RunConfiguration): void {
    clearPendingGameOverUiTimeout();
    setPauseMenuVisible(false);
    setUpgradeModalVisible(false);
    setUpgradeSelectionOwner(null);
    clearUpgradeCards();
    hudController.clearStatPreview();
    hudController.setStatsPinned(false);
    waitingUpgradeSelection = false;
    applyPauseUi(false);

    activeRunConfiguration = runConfiguration;
    const playerColors: Partial<Record<PlayerId, string>> = {};
    const activePlayerIds = PLAYER_IDS.slice(0, runConfiguration.playerCount) as PlayerId[];
    for (const playerId of activePlayerIds) {
        playerColors[playerId] = runConfiguration.players[playerId].primaryColorHex;
    }

    emitGameEvent(GameEvents.RUN_CONFIG_CHANGED, runConfiguration);
    hudController.resetForNewRun();

    engine.reset(runConfiguration.players.player_1.name, runConfiguration);
    engine.start();
    emitGameEvent(GameEvents.START_RUN_WITH_COLOR, { playerColors });

    createIcons({ icons: { Home, Volume2, Volume1, VolumeX, Settings, HelpCircle, Users, ArrowRight, Keyboard, Gamepad2, Plus, X } });
    setUiMode('IN_GAME');
}

function goToMainMenu(): void {
    clearPendingGameOverUiTimeout();

    // Emit GAME_OVER to flush run stats, then suppress its UI side-effect.
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

    setUiMode('INITIAL_MENU');
}

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

    if (gameOverUiTimeoutId === null) {
        gameOverUiTimeoutId = window.setTimeout(() => {
            gameOverUiTimeoutId = null;
            setUiMode('GAME_OVER');
        }, DEATH_ANIMATION_DURATION_MS);
    }
});

if (btnPause) btnPause.addEventListener('click', () => togglePauseFromUi());

if (btnAudio) {
    btnAudio.addEventListener('click', () => {
        if (!isPauseMenuVisible()) return;
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
        musicVolume = Math.max(0, Math.min(100, Number(musicVolumeInput.value))) / 100;
        updateAudioHud();
        emitAudioSettings();
    });
}

if (musicVolumeGlobalInput) {
    musicVolumeGlobalInput.addEventListener('input', () => {
        musicVolume = Math.max(0, Math.min(100, Number(musicVolumeGlobalInput.value))) / 100;
        // Moving the slider above zero implicitly unmutes.
        if (musicVolume > 0) musicMuted = false;
        updateAudioHud();
        emitAudioSettings();
    });
}

if (btnMuteGlobal) {
    btnMuteGlobal.addEventListener('click', () => {
        musicMuted = !musicMuted;
        updateAudioHud();
        emitAudioSettings();
    });
}

if (btnResume) {
    btnResume.addEventListener('click', () => {
        if (!isPauseMenuVisible()) return;
        togglePauseFromUi();
    });
}

if (btnHomePause) btnHomePause.addEventListener('click', () => goToMainMenu());

if (btnRestart) {
    btnRestart.addEventListener('click', () => {
        if (!activeRunConfiguration) return;
        startRun(activeRunConfiguration);
        emitGameEvent(GameEvents.AUDIO_RESTART_REQUESTED, undefined);
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

    if (uiMode === 'GAME_OVER' || uiMode === 'INITIAL_MENU') return;
    setUiMode(isPauseMenuVisible() ? 'PAUSED' : 'IN_GAME');
});

window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.repeat) return;
    if (helpModal.isOpen()) return;
    event.preventDefault();
    togglePauseFromUi();
});

if (hudStatsEl) {
    hudStatsEl.addEventListener('click', () => {
        if (uiMode !== 'UPGRADE') return;
        hudStatsEl.classList.toggle('is-user-collapsed');
    });
}

applyUiModeEffects();
gamepadUiPollFrameId = window.requestAnimationFrame(pollGamepadUiNavigation);
createIcons({ icons: { Home, Volume2, Volume1, VolumeX, Settings, HelpCircle, Users, ArrowRight, Keyboard, Gamepad2, Plus, X } });
updateAudioHud();
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
