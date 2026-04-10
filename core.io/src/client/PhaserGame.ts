import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';

/**
 * Inicializa e cria a instância do Phaser.Game
 * Toda a lógica de renderização, input e lifecycle
 * está separada em módulos especializados
 */
export function createPhaserGame(): Phaser.Game {
    const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,              // WebGL com fallback para Canvas
        parent: 'game-container',       // div do index.html
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: '#1a1a2e',
        scene: [GameScene],
        scale: {
            mode: Phaser.Scale.RESIZE,  // responsivo ao redimensionar
            autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        render: {
            antialias: true,
            pixelArt: false,
        },
    };

    return new Phaser.Game(config);
}