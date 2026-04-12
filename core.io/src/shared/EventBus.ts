import { EventEmitter } from 'eventemitter3';
import type { GameEventPayloads } from './Types';

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
    GAME_OVER: 'game_over',        // Quando a vida chega a zero, etc
    ENTITY_DAMAGE: 'entity_damage',
    ENTITY_DESTROYED: 'entity_destroyed',
    ENEMY_DESTROYED: 'enemy_destroyed',
    XP_UPDATE: 'xp_update'
} as const;

export type GameEventName = keyof GameEventPayloads;

export function emitGameEvent<K extends GameEventName>(
    event: K,
    payload: GameEventPayloads[K]
): void {
    eventBus.emit(event, payload);
}

export function onGameEvent<K extends GameEventName>(
    event: K,
    handler: (payload: GameEventPayloads[K]) => void
): () => void {
    const typedHandler = handler as (payload: unknown) => void;
    eventBus.on(event, typedHandler);
    return () => eventBus.off(event, typedHandler);
}
