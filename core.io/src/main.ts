import './style.css';
import { createIcons, Home, Volume2, VolumeX } from 'lucide';
import { GameEngine } from './logic/GameEngine';
import { createPhaserGame } from './client/PhaserGame';
import { HudController } from './client/hud/HudController';
import { emitGameEvent, GameEvents, onGameEvent } from './shared/EventBus';
import type { CardRarity, EntityStats, UpgradeRollOption } from './shared/Types';
import { DEATH_ANIMATION_DURATION_MS } from './client/constants/GameConstants';

console.log('Inicializando Core.io...');

const engine = new GameEngine();
createPhaserGame();
const hudController = new HudController();

type UiMode = 'INITIAL_MENU' | 'COLOR_SELECTION' | 'IN_GAME' | 'PAUSED' | 'UPGRADE' | 'GAME_OVER';

const menuInicial = document.getElementById('menu-inicial');
const hudLayerEl = document.getElementById('hud-layer');
const btnJogar = document.getElementById('btn-jogar') as HTMLButtonElement | null;
const playerNameInput = document.getElementById('player-name') as HTMLInputElement | null;
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
const upgradeRemainingEl = document.getElementById('upgrade-remaining');
const upgradeCardsEl = document.getElementById('upgrade-cards');
const hudStatsEl = document.getElementById('hud-stats');
const hudKeybindsEl = document.getElementById('hud-keybinds');

let gameOverUiTimeoutId: number | null = null;
let waitingUpgradeSelection = false;
let uiMode: UiMode = menuInicial ? 'INITIAL_MENU' : 'IN_GAME';
let previousUiMode: UiMode | null = null;
const _initialAudio = hudController.getInitialAudioPrefs();
let musicMuted = _initialAudio.muted;
let musicVolume = _initialAudio.volume;

const RARITY_LABELS_PTBR: Record<CardRarity, string> = {
    COMMON: 'COMUM',
    UNCOMMON: 'INCOMUM',
    RARE: 'RARO',
    EPIC: 'EPICO',
    LEGENDARY: 'LENDARIO'
};

const MODIFIER_META: Record<keyof EntityStats, { label: string; icon: string; tone: 'offense' | 'defense' | 'mobility' | 'utility' }> = {
    maxHealth: { label: 'Vida Max', icon: 'HP', tone: 'defense' },
    healthRegen: { label: 'Regeneracao', icon: 'RG', tone: 'defense' },
    bodyDamage: { label: 'Dano Corpo', icon: 'BD', tone: 'offense' },
    bulletSpeed: { label: 'Vel. Tiro', icon: 'SP', tone: 'offense' },
    bulletPenetration: { label: 'Penetracao', icon: 'PN', tone: 'offense' },
    bulletDamage: { label: 'Dano Tiro', icon: 'DM', tone: 'offense' },
    reloadPoints: { label: 'Recarga', icon: 'RL', tone: 'utility' },
    movementSpeed: { label: 'Velocidade', icon: 'MV', tone: 'mobility' }
};

function getUpgradeCardSymbol(cardId: string): string {
    const map: Record<string, string> = {
        heavy_plating: 'HP',
        lightweight_tracks: 'MV',
        kinetic_ram: 'KR',
        stability_gyros: 'GY',
        rapid_reloader: 'RL',
        tungsten_rounds: 'TR',
        shield_matrix: 'SM',
        burst_chamber: 'BC',
        nanite_repair: 'NR',
        vector_thrusters: 'VT',
        phase_alloy: 'PA',
        overclocked_core: 'OC',
        helix_launcher: 'HX',
        singularity_shells: 'SS',
        apex_drive: 'AX'
    };

    return map[cardId] ?? 'UP';
}

function getUpgradeCardFlavor(cardId: string): string {
    const map: Record<string, string> = {
        heavy_plating: 'Camadas extras para segurar o caos da horda.',
        lightweight_tracks: 'Atrito minimo para cortes agressivos no mapa.',
        kinetic_ram: 'Impacto cinetico para furar linhas de inimigos.',
        stability_gyros: 'Estabilizacao do canhao para tiros limpos e retos.',
        rapid_reloader: 'Sequencia de disparo calibrada para ritmo brutal.',
        shield_matrix: 'Camada reativa para segurar a frente sem recuar.',
        burst_chamber: 'Pressurizacao extra para abrir sequencias curtas.',
        tungsten_rounds: 'Municao densa que perfura formações compactas.',
        nanite_repair: 'Nanitas de campo estabilizam sua estrutura.',
        vector_thrusters: 'Microimpulsos para trocar de angulo instantaneamente.',
        phase_alloy: 'Composto adaptativo para resistir em lutas longas.',
        overclocked_core: 'Potencia extrema para pushes curtos e letais.',
        helix_launcher: 'Matriz de tiro helicoidal para perfuracao pesada.',
        singularity_shells: 'Projetis instaveis com inercia monstruosa.',
        apex_drive: 'Nucleo em limite absoluto para explosao de dano.'
    };

    return map[cardId] ?? 'Modulo experimental para combates extremos.';
}

function formatModifierValue(stat: keyof EntityStats, value: number): string {
    const sign = value >= 0 ? '+' : '';

    if (stat === 'reloadPoints') {
        return `${sign}${value.toFixed(1)} pts`;
    }

    const hasFraction = Math.abs(value % 1) > 0.001;
    return `${sign}${value.toFixed(hasFraction ? 1 : 0)}`;
}

function setUiMode(nextMode: UiMode): void {
    uiMode = nextMode;
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
}

function setPauseMenuVisible(visible: boolean): void {
    if (!pauseMenu) {
        return;
    }

    pauseMenu.style.display = visible ? 'flex' : 'none';

    if (!visible) {
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

    clearUpgradeCards();

    for (const option of options) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'upgrade-card';
        button.style.setProperty('--upgrade-card-color', option.colorHex);

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

            waitingUpgradeSelection = true;
            setUpgradeCardsDisabled(true);
            hudController.clearStatPreview();

            emitGameEvent(GameEvents.CARD_SELECTED, {
                cardId: option.card.id,
                colorHex: option.colorHex
            });
        });

        upgradeCardsEl.appendChild(button);
    }
}

function normalizePlayerName(rawName: string): string {
    const trimmedName = rawName.trim();

    if (trimmedName.length === 0) {
        return 'Jogador';
    }

    return trimmedName.slice(0, 16);
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
        clearUpgradeCards();
        hudController.clearStatPreview();
        hudController.setStatsPinned(false);
        waitingUpgradeSelection = false;
        if (btnMenuHome) btnMenuHome.style.display = 'none';

        const playerName = normalizePlayerName(playerNameInput?.value ?? '');
        hudController.resetForNewRun();
        applyPauseUi(false);

        tituloMenu.innerText = 'CORE.IO';
        tituloMenu.style.textShadow = '0 0 10px #4488ff';
        btnJogar.innerText = 'JOGAR';
        btnJogar.style.backgroundColor = '#4488ff';
        btnJogar.style.boxShadow = 'none';

        engine.reset(playerName);
        engine.start();

        colorSelectionScreen?.classList.remove('hidden');
        setUiMode('COLOR_SELECTION');
    });

    onGameEvent(GameEvents.START_RUN_WITH_COLOR, () => {
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
        clearUpgradeCards();
        hudController.clearStatPreview();
        hudController.setStatsPinned(false);
        waitingUpgradeSelection = false;
        applyPauseUi(false);
        hudController.resetForNewRun();

        engine.reset();
        engine.start();
        engine.startGameWithColor('#4488ff');
        emitGameEvent(GameEvents.AUDIO_RESTART_REQUESTED, undefined);
        setUiMode('IN_GAME');

        if (menuInicial) {
            menuInicial.style.display = 'none';
        }
    });
}

onGameEvent(GameEvents.SHOW_UPGRADE_MODAL, ({ upgradesRemaining }) => {
    setUpgradeModalVisible(true);
    hudController.setStatsPinned(true);
    hudStatsEl?.classList.remove('is-user-collapsed');
    hudController.clearStatPreview();
    setUpgradesRemaining(upgradesRemaining);
    waitingUpgradeSelection = false;
    setUiMode('UPGRADE');
});

onGameEvent(GameEvents.UPDATE_UPGRADE_MODAL, ({ upgradesRemaining, options }) => {
    setUpgradeModalVisible(true);
    hudController.setStatsPinned(true);
    hudStatsEl?.classList.remove('is-user-collapsed');
    hudController.clearStatPreview();
    setUpgradesRemaining(upgradesRemaining);
    waitingUpgradeSelection = false;
    renderUpgradeCards(options);
    setUpgradeCardsDisabled(false);
    setUiMode('UPGRADE');
});

onGameEvent(GameEvents.HIDE_UPGRADE_MODAL, () => {
    setUpgradeModalVisible(false);
    clearUpgradeCards();
    hudController.clearStatPreview();
    hudController.setStatsPinned(false);
    hudStatsEl?.classList.remove('is-user-collapsed');
    waitingUpgradeSelection = false;

    if (uiMode === 'GAME_OVER' || uiMode === 'INITIAL_MENU') {
        return;
    }

    setUiMode(isPauseMenuVisible() ? 'PAUSED' : 'IN_GAME');
});

window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.repeat) {
        return;
    }

    event.preventDefault();
    togglePauseFromUi();
});

function preventNameInputPropagation(): void {
    if (!playerNameInput) {
        return;
    }

    const stopEventPropagation = (event: KeyboardEvent): void => {
        event.stopPropagation();
    };

    playerNameInput.addEventListener('keydown', stopEventPropagation);
    playerNameInput.addEventListener('keyup', stopEventPropagation);
    playerNameInput.addEventListener('keypress', stopEventPropagation);
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
applyUiModeEffects();
createIcons({ icons: { Home, Volume2, VolumeX } });
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

// fullscreenchange fires when the transition starts but the canvas may still be settling —
// run sync after a short delay to catch the final resting dimensions.
document.addEventListener('fullscreenchange', () => {
    window.setTimeout(syncCanvasLayout, 60);
    window.setTimeout(syncCanvasLayout, 180);
});
window.addEventListener('resize', syncCanvasLayout);
attachCanvasSyncObserver();

window.addEventListener('beforeunload', () => {
    engine.destroy();
    hudController.destroy();
});
