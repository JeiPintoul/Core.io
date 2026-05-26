import './styles/base.css';
import './styles/hud.css';
import './styles/minimap.css';
import './styles/hud-player-panels.css';
import './styles/pause-menu.css';
import './styles/upgrade-modal.css';
import './styles/debug.css';
import './client/lobby/lobby.css';
import { createIcons, Home, Volume2, Volume1, VolumeX, Settings, HelpCircle, Users, ArrowRight, Keyboard, Gamepad2, Plus, X, Play, RotateCcw, Lock, Unlock } from 'lucide';
import { GameEngine } from './logic/GameEngine';
import { createPhaserGame } from './client/PhaserGame';
import { HudController } from './client/hud/HudController';
import { MinimapHudController } from './client/hud/MinimapHudController';
import { UpgradeModalController, type UpgradeGamepadActionKey, type UpgradeGamepadActionState, type UpgradeUiMode } from './client/hud/UpgradeModalController';
import { GodMode } from './debug/GodMode';
import { emitGameEvent, GameEvents, onGameEvent } from './shared/EventBus';
import { PLAYER_IDS, type PlayerId, type RunConfiguration } from './shared/Types';
import { DEATH_ANIMATION_DURATION_MS } from './client/constants/GameConstants';
import { LobbyController } from './client/lobby/LobbyController';
import { HelpModal } from './client/lobby/HelpModal';

const engine = new GameEngine();
createPhaserGame();
const hudController = new HudController();
const minimapHudController = new MinimapHudController();
new GodMode(engine);

type UiMode = UpgradeUiMode;

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
const hudStatsEl = document.getElementById('hud-stats');

let gameOverUiTimeoutId: number | null = null;
let uiMode: UiMode = lobbyRootEl ? 'INITIAL_MENU' : 'IN_GAME';
let previousUiMode: UiMode | null = null;
let pauseMenuGamepadFocusIndex = 0;
let gamepadUiPollFrameId: number | null = null;
let activeRunConfiguration: RunConfiguration | null = null;

type UiGamepadActionKey = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' | 'pause';
type UiGamepadActionState = Record<UiGamepadActionKey, boolean>;

const GAMEPAD_NAV_AXIS_THRESHOLD = 0.55;

const gamepadActionLatchByPadIndex = new Map<number, UiGamepadActionState>();
const _initialAudio = hudController.getInitialAudioPrefs();
let musicMuted = _initialAudio.muted;
let musicVolume = _initialAudio.volume;

const helpModal = new HelpModal();
const lobby = new LobbyController({
    onStart: ({ runConfiguration }) => startRun(runConfiguration),
    onOpenHelp: () => helpModal.open(),
    onOpenSettings: () => toggleSettingsPanel(),
    onToggleAudioPanel: () => toggleSettingsPanel(),
});
const upgradeModalController = new UpgradeModalController({
    hudController,
    getPlayerName: (playerId) => getConfiguredPlayerName(playerId),
    getUiMode: () => uiMode,
    setUiMode: (mode) => setUiMode(mode),
    isPauseMenuVisible: () => isPauseMenuVisible()
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
        upgradeModalController.clearGamepadSelectionVisual();
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
        hudController.setStatsPinned(true, 'pause');
        setUiMode('PAUSED');
    } else {
        const returnMode = previousUiMode ?? 'IN_GAME';
        previousUiMode = null;
        hudController.setStatsPinned(returnMode === 'UPGRADE', 'upgrade');
        setUiMode(returnMode);
    }
}

function getConfiguredPlayerName(playerId: PlayerId): string {
    return activeRunConfiguration?.players[playerId]?.name ?? 'Jogador';
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

function resolveUiNavigationGamepad(connectedGamepads: Gamepad[]): Gamepad | null {
    if (connectedGamepads.length === 0) return null;

    if (uiMode === 'UPGRADE') {
        const activeUpgradePlayerId = upgradeModalController.getActivePlayerId();
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
    upgradeModalController.handleGamepadNavigation(
        actions as UpgradeGamepadActionState,
        (actionKey: UpgradeGamepadActionKey, pressed) => consumeGamepadAction(gamepadIndex, actionKey, pressed)
    );
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
    upgradeModalController.resetForRun();
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

    createIcons({ icons: { Home, Volume2, Volume1, VolumeX, Settings, HelpCircle, Users, ArrowRight, Keyboard, Gamepad2, Plus, X, Play, RotateCcw, Lock, Unlock } });
    setUiMode('IN_GAME');
}

function goToMainMenu(): void {
    clearPendingGameOverUiTimeout();

    const summary = engine.getRunSummary();
    emitGameEvent(GameEvents.GAME_OVER, summary);
    clearPendingGameOverUiTimeout();

    engine.stop();
    setPauseMenuVisible(false);
    upgradeModalController.close();
    applyPauseUi(false);

    setUiMode('INITIAL_MENU');
}

onGameEvent(GameEvents.GAME_OVER, () => {
    engine.stop();
    setPauseMenuVisible(false);
    applyPauseUi(false);
    upgradeModalController.close();

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

window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.repeat) return;
    if (helpModal.isOpen()) return;
    event.preventDefault();
    togglePauseFromUi();
});

applyUiModeEffects();
gamepadUiPollFrameId = window.requestAnimationFrame(pollGamepadUiNavigation);
createIcons({ icons: { Home, Volume2, Volume1, VolumeX, Settings, HelpCircle, Users, ArrowRight, Keyboard, Gamepad2, Plus, X, Play, RotateCcw, Lock, Unlock } });
updateAudioHud();
emitAudioSettings();

function syncCanvasLayout(): void {
    const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const insetRight = Math.max(0, window.innerWidth - rect.right);
    const insetBottom = Math.max(0, window.innerHeight - rect.bottom);
    const uiScale = Math.min(1, Math.max(0.74, Math.min(rect.width / 1920, rect.height / 1080)));
    const root = document.documentElement;
    root.style.setProperty('--hud-inset-right', `${Math.round(insetRight)}px`);
    root.style.setProperty('--hud-inset-bottom', `${Math.round(insetBottom)}px`);
    root.style.setProperty('--ui-scale', uiScale.toFixed(4));
    root.classList.toggle('is-compact-ui', window.devicePixelRatio > 1.1 || rect.width < 1700 || rect.height < 900);
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
    upgradeModalController.destroy();
    minimapHudController.destroy();
    hudController.destroy();
});
