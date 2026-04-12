import Phaser from 'phaser';
import { GameEvents, onGameEvent } from '../../shared/EventBus';
import type { GameState } from '../../shared/Types';
import { GameRenderer } from '../render/GameRenderer';
import { InputHandler } from '../input/InputHandler';
import { ARENA } from '../constants/GameConstants';

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
    private unsubscribeStateUpdate: (() => void) | null = null;
    private unsubscribeEntityDestroyed: (() => void) | null = null;
    private unsubscribeGameOver: (() => void) | null = null;
    private cameraFollowTarget!: Phaser.GameObjects.Zone;
    private isInputLockedByDeath = false;

    constructor() {
        super({ key: 'GameScene' });
    }

    create() {
        // Configurar câmera
        this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height);
        this.cameras.main.setZoom(1);

        // Target invisivel para follow suave da camera.
        this.cameraFollowTarget = this.add.zone(ARENA.width / 2, ARENA.height / 2, 1, 1);
        this.cameras.main.startFollow(this.cameraFollowTarget, true, 0.1, 0.1);
        this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
        this.handleResize(this.scale.gameSize);

        // Criar graphics objects (ordem define z-order)
        const gfxWorld = this.add.graphics(); // grid + arena
        const gfxGame = this.add.graphics();  // entidades + projéteis
        const gfxPlayer = this.add.graphics(); // player principal (objeto real para tween de morte)
        const gfxHud = this.add.graphics();   // HUD (fixo na tela)
        gfxHud.setScrollFactor(0);

        // Inicializar renderer e input handler
        this.gameRenderer = new GameRenderer(this, gfxWorld, gfxGame, gfxPlayer, gfxHud);
        this.inputHandler = new InputHandler(this, this.cameras.main);

        // Desenhar mundo estático
        this.gameRenderer.drawStaticWorld();

        // Ouvir mudanças de estado do engine
        this.unsubscribeStateUpdate = onGameEvent(GameEvents.STATE_UPDATE, (state: GameState) => {
            this.latestState = state;

            if (this.isInputLockedByDeath && state.player.health > 0) {
                this.inputHandler.enable();
                this.isInputLockedByDeath = false;
            }

            this.cameraFollowTarget.setPosition(state.player.x, state.player.y);
        });

        this.unsubscribeEntityDestroyed = onGameEvent(GameEvents.ENTITY_DESTROYED, ({ id }) => {
            this.gameRenderer.playEntityDestroyedAnimation(id);

            if (this.latestState && id === this.latestState.player.id) {
                this.lockInputAfterDeath();
            }
        });

        this.unsubscribeGameOver = onGameEvent(GameEvents.GAME_OVER, () => {
            this.lockInputAfterDeath();
        });

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanupListeners());
        this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanupListeners());
    }

    update() {
        if (!this.latestState) return;

        const state = this.latestState;

        // Mantem target da camera sempre no player atual.
        this.cameraFollowTarget.setPosition(state.player.x, state.player.y);

        // Processar input e enviar para engine
        this.inputHandler.handleInput();

        // Mira visual usa exclusivamente vetor mouse->player no frame atual.
        this.updateCursorWorldPoint();

        // Renderizar frame
        this.gameRenderer.renderFrame(state, this.scale.height);
    }

    private handleResize(gameSize: Phaser.Structs.Size): void {
        this.cameras.main.setSize(gameSize.width, gameSize.height);
    }

    private updateCursorWorldPoint(): void {
        const pointer = this.input.activePointer;
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        this.gameRenderer.setCursorWorldPoint(worldPoint.x, worldPoint.y);
    }

    private lockInputAfterDeath(): void {
        this.inputHandler.disable();
        this.isInputLockedByDeath = true;
    }

    private cleanupListeners(): void {
        this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
        this.cameras.main.stopFollow();

        if (this.cameraFollowTarget) {
            this.cameraFollowTarget.destroy();
        }

        if (this.unsubscribeStateUpdate) {
            this.unsubscribeStateUpdate();
            this.unsubscribeStateUpdate = null;
        }

        if (this.unsubscribeEntityDestroyed) {
            this.unsubscribeEntityDestroyed();
            this.unsubscribeEntityDestroyed = null;
        }

        if (this.unsubscribeGameOver) {
            this.unsubscribeGameOver();
            this.unsubscribeGameOver = null;
        }
    }
}
