import './style.css';
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

type UiMode = 'INITIAL_MENU' | 'IN_GAME' | 'PAUSED' | 'UPGRADE' | 'GAME_OVER';

const menuInicial = document.getElementById('menu-inicial');
const btnJogar = document.getElementById('btn-jogar') as HTMLButtonElement | null;
const playerNameInput = document.getElementById('player-name') as HTMLInputElement | null;
const btnPause = document.getElementById('btn-pause') as HTMLButtonElement | null;
const pauseMenu = document.getElementById('pause-menu');
const btnResume = document.getElementById('btn-resume') as HTMLButtonElement | null;
const btnRestart = document.getElementById('btn-restart') as HTMLButtonElement | null;
const tituloMenu = menuInicial?.querySelector('h1') as HTMLHeadingElement | null;
const upgradeModal = document.getElementById('upgrade-modal');
const upgradeRemainingEl = document.getElementById('upgrade-remaining');
const upgradeCardsEl = document.getElementById('upgrade-cards');
const hudStatsEl = document.getElementById('hud-stats');

let gameOverUiTimeoutId: number | null = null;
let waitingUpgradeSelection = false;
let uiMode: UiMode = menuInicial ? 'INITIAL_MENU' : 'IN_GAME';

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
    reload: { label: 'Recarga', icon: 'RL', tone: 'utility' },
    movementSpeed: { label: 'Velocidade', icon: 'MV', tone: 'mobility' }
};

function getUpgradeCardSymbol(cardId: string): string {
    const map: Record<string, string> = {
        heavy_plating: 'HP',
        lightweight_tracks: 'MV',
        rapid_reloader: 'RL',
        tungsten_rounds: 'TR',
        nanite_repair: 'NR',
        overclocked_core: 'OC',
        singularity_shells: 'SS'
    };

    return map[cardId] ?? 'UP';
}

function getUpgradeCardFlavor(cardId: string): string {
    const map: Record<string, string> = {
        heavy_plating: 'Camadas extras para segurar o caos da horda.',
        lightweight_tracks: 'Atrito minimo para cortes agressivos no mapa.',
        rapid_reloader: 'Sequencia de disparo calibrada para ritmo brutal.',
        tungsten_rounds: 'Municao densa que perfura formações compactas.',
        nanite_repair: 'Nanitas de campo estabilizam sua estrutura.',
        overclocked_core: 'Potencia extrema para pushes curtos e letais.',
        singularity_shells: 'Projetis instaveis com inercia monstruosa.'
    };

    return map[cardId] ?? 'Modulo experimental para combates extremos.';
}

function formatModifierValue(stat: keyof EntityStats, value: number): string {
    const sign = value >= 0 ? '+' : '';

    if (stat === 'reload') {
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
    if (!hudStatsEl) {
        return;
    }

    const shouldShowStats = uiMode !== 'INITIAL_MENU';
    hudStatsEl.classList.toggle('is-hidden', !shouldShowStats);
}

function applyPauseUi(isPaused: boolean): void {
    if (!btnPause) {
        return;
    }

    btnPause.textContent = isPaused ? '▶' : '||';
    btnPause.classList.toggle('is-paused', isPaused);
}

function setPauseMenuVisible(visible: boolean): void {
    if (!pauseMenu) {
        return;
    }

    pauseMenu.style.display = visible ? 'flex' : 'none';
}

function isPauseMenuVisible(): boolean {
    if (!pauseMenu) {
        return false;
    }

    return window.getComputedStyle(pauseMenu).display !== 'none';
}

function togglePauseFromUi(): void {
    if (uiMode === 'INITIAL_MENU' || uiMode === 'UPGRADE' || uiMode === 'GAME_OVER') {
        return;
    }

    const isPaused = engine.togglePause();
    applyPauseUi(isPaused);
    setPauseMenuVisible(isPaused);
    setUiMode(isPaused ? 'PAUSED' : 'IN_GAME');
}

function setUpgradeModalVisible(visible: boolean): void {
    if (!upgradeModal) {
        return;
    }

    upgradeModal.classList.toggle('is-visible', visible);
}

function isUpgradeModalVisible(): boolean {
    if (!upgradeModal) {
        return false;
    }

    return upgradeModal.classList.contains('is-visible');
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
        return 'Player';
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
        setUiMode('IN_GAME');
        console.log('Jogo iniciado!');
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

if (btnResume) {
    btnResume.addEventListener('click', () => {
        if (!isPauseMenuVisible()) {
            return;
        }

        togglePauseFromUi();
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
        setUiMode('IN_GAME');

        if (menuInicial) {
            menuInicial.style.display = 'none';
        }
    });
}

onGameEvent(GameEvents.SHOW_UPGRADE_MODAL, ({ upgradesRemaining }) => {
    setUpgradeModalVisible(true);
    hudController.setStatsPinned(true);
    hudController.clearStatPreview();
    setUpgradesRemaining(upgradesRemaining);
    waitingUpgradeSelection = false;
    setUiMode('UPGRADE');
});

onGameEvent(GameEvents.UPDATE_UPGRADE_MODAL, ({ upgradesRemaining, options }) => {
    setUpgradeModalVisible(true);
    hudController.setStatsPinned(true);
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

    if (isUpgradeModalVisible()) {
        return;
    }

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

preventNameInputPropagation();
applyUiModeEffects();

window.addEventListener('beforeunload', () => {
    hudController.destroy();
});
