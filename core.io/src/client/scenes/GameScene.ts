import Phaser from 'phaser';
import { eventBus, GameEvents } from '../../shared/EventBus';
import type { GameState } from '../../shared/Types';
import { GameRenderer } from '../render/GameRenderer';
import { InputHandler } from '../input/InputHandler';

/**
 * GameScene: Orquestra renderização e input.
 * Responsabilidades:
 * - Lifecycle do Phaser (create, update)
 * - Câmera do jogo
 * - Coordenação entre renderers e input handler
 */
export class GameScene extends Phaser.Scene {
    private gameRenderer!: GameRenderer;
    private inputHandler!: InputHandler;
    private latestState: GameState | null = null;

    constructor() {
        super({ key: 'GameScene' });
    }

    create() {
        // Configurar câmera
        this.cameras.main.setBounds(0, 0, 2000, 2000);
        this.cameras.main.setZoom(1);

        // Criar graphics objects (ordem define z-order)
        const gfxWorld = this.add.graphics(); // grid + arena
        const gfxGame = this.add.graphics();  // entidades + projéteis
        const gfxHud = this.add.graphics();   // HUD (fixo na tela)
        gfxHud.setScrollFactor(0);

        // Inicializar renderer e input handler
        this.gameRenderer = new GameRenderer(gfxWorld, gfxGame, gfxHud);
        this.inputHandler = new InputHandler(this, this.cameras.main);

        // Desenhar mundo estático
        this.gameRenderer.drawStaticWorld();

        // Ouvir mudanças de estado do engine
        eventBus.on(GameEvents.STATE_UPDATE, (state: GameState) => {
            this.latestState = state;
            // Atualizar ponto do cursor no renderer
            this.gameRenderer.setCursorWorldPoint(
                this.input.activePointer.worldX,
                this.input.activePointer.worldY
            );
        });
    }

    update() {
        if (!this.latestState) return;

        const state = this.latestState;

        // Seguir o player
        this.cameras.main.centerOn(state.player.x, state.player.y);

        // Processar input e enviar para engine
        this.inputHandler.handleInput();

        // Renderizar frame
        this.gameRenderer.renderFrame(state, this.scale.height);
    }
}
