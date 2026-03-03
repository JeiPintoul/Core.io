import { EventEmitter } from 'eventemitter3';

/**
 * EventBus Central do Core.io
 * Responsável por comunicar a Lógica e a Renderização (Phaser)
 * de forma totalmente isolada.
 */
export const eventBus = new EventEmitter();

// Eventos principais do jogo para a equipe
export const GameEvents = {
    PLAYER_INPUT: 'player_input', // Quando o dev de UI captura o teclado
    STATE_UPDATE: 'state_update', // Quando a Lógica atualiza as coordenadas
    LEVEL_UP: 'level_up',         // Quando o inimigo morre e o jogador passa de nível
    GAME_OVER: 'game_over'        // Quando a vida chega a zero, etc
};
