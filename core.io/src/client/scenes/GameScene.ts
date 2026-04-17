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
    private bgm: Phaser.Sound.BaseSound | null = null;
    private musicVolume = 0.32;
    private isMusicMuted = false;
    private latestState: GameState | null = null;
    private unsubscribeStateUpdate: (() => void) | null = null;
    private unsubscribeEntityDestroyed: (() => void) | null = null;
    private unsubscribeEnemyDestroyed: (() => void) | null = null;
    private unsubscribeProjectileDestroyed: (() => void) | null = null;
    private unsubscribeProjectileFired: (() => void) | null = null;
    private unsubscribeGameOver: (() => void) | null = null;
    private unsubscribeAudioSettingsChanged: (() => void) | null = null;
    private unsubscribeAudioRestartRequested: (() => void) | null = null;
    private cameraFollowTarget!: Phaser.GameObjects.Zone;

    constructor() {
        super({ key: 'GameScene' });
    }

    preload() {
        this.load.audio('bgm', 'audio/bgm.mp3');
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
        this.startBackgroundMusic();

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

        this.unsubscribeAudioSettingsChanged = onGameEvent(GameEvents.AUDIO_SETTINGS_CHANGED, ({ volume, muted }) => {
            this.musicVolume = Phaser.Math.Clamp(volume, 0, 1);
            this.isMusicMuted = muted;
            this.applyBackgroundMusicSettings();
        });

        this.unsubscribeAudioRestartRequested = onGameEvent(GameEvents.AUDIO_RESTART_REQUESTED, () => {
            this.restartBackgroundMusic();
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

    private startBackgroundMusic(): void {
        if (!this.cache.audio.exists('bgm')) {
            return;
        }

        this.bgm = this.sound.add('bgm', {
            loop: true,
            volume: this.musicVolume
        });
        this.applyBackgroundMusicSettings();

        if (this.sound.locked) {
            this.input.once('pointerdown', () => {
                if (this.bgm && !this.bgm.isPlaying) {
                    this.bgm.play();
                }
            });
            return;
        }

        this.bgm.play();
    }

    private applyBackgroundMusicSettings(): void {
        if (!this.bgm) {
            return;
        }

        const controllableBgm = this.bgm as unknown as {
            setMute: (muted: boolean) => void;
            setVolume: (volume: number) => void;
        };

        controllableBgm.setMute(this.isMusicMuted);
        controllableBgm.setVolume(this.musicVolume);
    }

    private restartBackgroundMusic(): void {
        if (!this.bgm) {
            return;
        }

        this.bgm.stop();

        if (this.sound.locked) {
            return;
        }

        this.bgm.play();
        this.applyBackgroundMusicSettings();
    }

    private cleanupListeners(): void {
        this.cameras.main.stopFollow();
        this.gameRenderer.destroy();

        if (this.bgm) {
            this.bgm.stop();
            this.bgm.destroy();
            this.bgm = null;
        }

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

        if (this.unsubscribeAudioSettingsChanged) {
            this.unsubscribeAudioSettingsChanged();
            this.unsubscribeAudioSettingsChanged = null;
        }

        if (this.unsubscribeAudioRestartRequested) {
            this.unsubscribeAudioRestartRequested();
            this.unsubscribeAudioRestartRequested = null;
        }
    }
}
