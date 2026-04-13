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
    private unsubscribeEnemyDestroyed: (() => void) | null = null;
    private unsubscribeProjectileDestroyed: (() => void) | null = null;
    private unsubscribeProjectileFired: (() => void) | null = null;
    private unsubscribeGameOver: (() => void) | null = null;
    private cameraFollowTarget!: Phaser.GameObjects.Zone;

    constructor() {
        super({ key: 'GameScene' });
    }

    create() {
        // Configurar câmera
        this.cameras.main.setBounds(-400, -400, ARENA.width + 800, ARENA.height + 800);
        this.cameras.main.setZoom(1);

        // Target invisivel para follow suave da camera.
        this.cameraFollowTarget = this.add.zone(ARENA.width / 2, ARENA.height / 2, 1, 1);
        this.cameras.main.startFollow(this.cameraFollowTarget, true, 0.3, 0.3);

        // Criar graphics objects (ordem define z-order)
        const gfxWorld = this.add.graphics(); // grid + arena
        const gfxGame = this.add.graphics();  // entidades + projéteis
        const gfxPlayer = this.add.graphics(); // player principal (objeto real para tween de morte)
        const gfxHud = this.add.graphics();   // HUD (fixo na tela)
        gfxHud.setScrollFactor(0);

        // Inicializar renderer e input handler
        this.gameRenderer = new GameRenderer(this, this.cameras.main, gfxWorld, gfxGame, gfxPlayer, gfxHud);
        this.inputHandler = new InputHandler(this, this.cameras.main);
        this.inputHandler.disable();

        // Desenhar mundo estático
        this.gameRenderer.drawStaticWorld();

        // Ouvir mudanças de estado do engine
        this.unsubscribeStateUpdate = onGameEvent(GameEvents.STATE_UPDATE, (state: GameState) => {
            this.latestState = state;

            if (state.player.health > 0) {
                this.inputHandler.enable();
            }

            this.cameraFollowTarget.setPosition(state.player.x, state.player.y);
        });

        this.unsubscribeEntityDestroyed = onGameEvent(GameEvents.ENTITY_DESTROYED, ({ id }) => {
            this.gameRenderer.playEntityDestroyedAnimation(id);

            if (this.latestState && id === this.latestState.player.id) {
                this.lockInputAfterDeath();
            }
        });

        this.unsubscribeProjectileDestroyed = onGameEvent(GameEvents.PROJECTILE_DESTROYED, ({ x, y, radius, faction }) => {
            this.gameRenderer.playProjectileDeathAnimation(x, y, radius, faction);
        });

        this.unsubscribeProjectileFired = onGameEvent(GameEvents.PROJECTILE_FIRED, ({ shooterId, recoilStrength, faction }) => {
            const isPlayer = faction === 'player';
            this.gameRenderer.playFiringRecoil(shooterId, recoilStrength, isPlayer);
        });

        this.unsubscribeEnemyDestroyed = onGameEvent(GameEvents.ENEMY_DESTROYED, ({ x, y, xpDropped, radius }) => {
            this.gameRenderer.playFloatingText(x, y - radius - 30, `+${xpDropped} XP`, '#44ff44');
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
        if (!state.isPaused) {
            this.updateCursorWorldPoint();
        }

        // Renderizar frame
        this.gameRenderer.renderFrame(state);
    }

    private updateCursorWorldPoint(): void {
        const pointer = this.input.activePointer;
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        this.gameRenderer.setCursorWorldPoint(worldPoint.x, worldPoint.y);
    }

    private lockInputAfterDeath(): void {
        this.inputHandler.disable();
    }

    private cleanupListeners(): void {
        this.cameras.main.stopFollow();
        this.gameRenderer.destroy();

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

        if (this.unsubscribeEnemyDestroyed) {
            this.unsubscribeEnemyDestroyed();
            this.unsubscribeEnemyDestroyed = null;
        }

        if (this.unsubscribeProjectileDestroyed) {
            this.unsubscribeProjectileDestroyed();
            this.unsubscribeProjectileDestroyed = null;
        }

        if (this.unsubscribeProjectileFired) {
            this.unsubscribeProjectileFired();
            this.unsubscribeProjectileFired = null;
        }

        if (this.unsubscribeGameOver) {
            this.unsubscribeGameOver();
            this.unsubscribeGameOver = null;
        }
    }
}
