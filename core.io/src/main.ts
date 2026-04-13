import './style.css';
import { GameEngine }     from './logic/GameEngine';
import { createPhaserGame } from './client/PhaserGame';
import { HudController } from './client/hud/HudController';
import { emitGameEvent, GameEvents, onGameEvent } from './shared/EventBus';
import type { CardRarity, UpgradeRollOption } from './shared/Types';
import { DEATH_ANIMATION_DURATION_MS } from './client/constants/GameConstants';

console.log('Inicializando Core.io...');

const engine = new GameEngine();
createPhaserGame();
const hudController = new HudController();

const menuInicial = document.getElementById('menu-inicial');
const btnJogar = document.getElementById('btn-jogar');
const playerNameInput = document.getElementById('player-name') as HTMLInputElement | null;
const btnPause = document.getElementById('btn-pause') as HTMLButtonElement | null;
const pauseMenu = document.getElementById('pause-menu');
const btnResume = document.getElementById('btn-resume') as HTMLButtonElement | null;
const btnRestart = document.getElementById('btn-restart') as HTMLButtonElement | null;
const tituloMenu = menuInicial?.querySelector('h1');
const upgradeModal = document.getElementById('upgrade-modal');
const upgradeRemainingEl = document.getElementById('upgrade-remaining');
const upgradeCardsEl = document.getElementById('upgrade-cards');
let gameOverUiTimeoutId: number | null = null;
let waitingUpgradeSelection = false;

const RARITY_LABELS_PTBR: Record<CardRarity, string> = {
    COMMON: 'COMUM',
    UNCOMMON: 'INCOMUM',
    RARE: 'RARO',
    EPIC: 'EPICO',
    LEGENDARY: 'LENDARIO'
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

function isMenuVisible(): boolean {
    if (!menuInicial) {
        return false;
    }

    return window.getComputedStyle(menuInicial).display !== 'none';
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
    if (isMenuVisible() || isUpgradeModalVisible()) {
        return;
    }

    const isPaused = engine.togglePause();
    applyPauseUi(isPaused);
    setPauseMenuVisible(isPaused);
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
        artEl.appendChild(symbolEl);

        const descriptionEl = document.createElement('p');
        descriptionEl.className = 'upgrade-card-description';
        descriptionEl.textContent = option.card.description;

        const footerEl = document.createElement('div');
        footerEl.className = 'upgrade-card-footer';
        footerEl.textContent = 'TOQUE PARA ESCOLHER';

        button.append(rarityEl, nameEl, artEl, descriptionEl, footerEl);

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

            // Mostra o menu com estilo de Game Over (Vermelho)
            menuInicial.style.display = 'flex';
            tituloMenu.innerText = 'GAME OVER';
            tituloMenu.style.textShadow = '0 0 15px #ff4444';

            btnJogar.innerText = 'TENTAR NOVAMENTE';
            btnJogar.style.backgroundColor = '#cc0000';
            btnJogar.style.boxShadow = '0 0 15px #ff4444';
        }, DEATH_ANIMATION_DURATION_MS);
    };

    
    // Lógica ao clicar no botão JOGAR / TENTAR NOVAMENTE
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
        
        // Garante que o menu volte a ser azul da próxima vez que abrir
        tituloMenu.innerText = 'CORE.IO';
        tituloMenu.style.textShadow = '0 0 10px #4488ff';
        btnJogar.innerText = 'JOGAR';
        btnJogar.style.backgroundColor = '#4488ff';
        btnJogar.style.boxShadow = 'none';

        // Reseta as variáveis da engine e inicia o loop
        engine.reset(playerName);
        engine.start();
        console.log('Jogo iniciado!');
    });

    // Lógica quando o Player morre
    onGameEvent(GameEvents.GAME_OVER, () => {
        console.log('Game Over!');
        
        // Para a lógica do jogo
        engine.stop();
        setPauseMenuVisible(false);
        applyPauseUi(false);
        setUpgradeModalVisible(false);
        clearUpgradeCards();
        hudController.clearStatPreview();
        hudController.setStatsPinned(false);
        waitingUpgradeSelection = false;

        // Aguarda animacao de morte antes de exibir o menu.
        scheduleGameOverUi();
    });

} else {
    console.warn("Elementos do menu não encontrados.");
    engine.start();
    applyPauseUi(false);
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
});

onGameEvent(GameEvents.UPDATE_UPGRADE_MODAL, ({ upgradesRemaining, options }) => {
    setUpgradeModalVisible(true);
    hudController.setStatsPinned(true);
    hudController.clearStatPreview();
    setUpgradesRemaining(upgradesRemaining);
    waitingUpgradeSelection = false;
    renderUpgradeCards(options);
    setUpgradeCardsDisabled(false);
});

onGameEvent(GameEvents.HIDE_UPGRADE_MODAL, () => {
    setUpgradeModalVisible(false);
    clearUpgradeCards();
    hudController.clearStatPreview();
    hudController.setStatsPinned(false);
    waitingUpgradeSelection = false;
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

preventNameInputPropagation();

window.addEventListener('beforeunload', () => {
    hudController.destroy();
});