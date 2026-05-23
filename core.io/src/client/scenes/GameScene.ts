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
    private subscriptions: Array<() => void> = [];
    private cameraFollowTarget!: Phaser.GameObjects.Zone;
    private colorPanX = 0;
    private colorPanY = 0;
    private readonly cameraMaxZoom = 1.02;
    private readonly cameraMinZoom = 0.58;
    private readonly cameraZoomLerp = 0.14;
    private readonly cameraFramingPadding = 360;
    private cameraCullOverrideActive = false;
    private hudCamera: Phaser.Cameras.Scene2D.Camera | null = null;

    constructor() {
        super({ key: 'GameScene' });
    }

    preload() {
        this.load.audio('bgm', 'audio/bgm.mp3');
    }

    create() {
        // Configurar câmera
        this.cameras.main.setBounds(-400, -400, ARENA.width + 800, ARENA.height + 800);
        this.cameras.main.setZoom(this.cameraMaxZoom);

        // Target invisivel para follow suave da camera.
        this.cameraFollowTarget = this.add.zone(ARENA.width / 2, ARENA.height / 2, 1, 1);
        this.cameras.main.startFollow(this.cameraFollowTarget, true, 0.3, 0.3);

        // Criar graphics objects (ordem define z-order)
        const gfxWorld = this.add.graphics(); // grid + arena
        const gfxGame = this.add.graphics();  // entidades + projéteis
        const gfxPlayer = this.add.graphics(); // player principal (objeto real para tween de morte)
        const gfxHud = this.add.graphics();   // HUD fixo na tela
        gfxHud.setScrollFactor(0);

        this.hudCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height, false, 'HUDCamera');
        this.hudCamera.setZoom(1);
        this.hudCamera.setScroll(0, 0);

        this.cameras.main.ignore(gfxHud);

        const ignoreFromHudCamera = (gameObject: Phaser.GameObjects.GameObject): void => {
            if (!this.hudCamera || gameObject === gfxHud) {
                return;
            }

            this.hudCamera.ignore(gameObject);
        };

        for (const gameObject of this.children.getAll()) {
            ignoreFromHudCamera(gameObject as Phaser.GameObjects.GameObject);
        }

        const handleObjectAdded = (gameObject: Phaser.GameObjects.GameObject): void => {
            ignoreFromHudCamera(gameObject);
        };

        const syncHudCameraViewport = (): void => {
            if (!this.hudCamera) {
                return;
            }

            this.hudCamera.setViewport(0, 0, this.scale.width, this.scale.height);
        };

        this.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, handleObjectAdded);
        this.scale.on(Phaser.Scale.Events.RESIZE, syncHudCameraViewport);
        this.subscriptions.push(() => {
            this.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, handleObjectAdded);
            this.scale.off(Phaser.Scale.Events.RESIZE, syncHudCameraViewport);
        });

        // Inicializar renderer e input handler
        this.gameRenderer = new GameRenderer(this, this.cameras.main, gfxWorld, gfxGame, gfxPlayer, gfxHud);
        this.inputHandler = new InputHandler(this, this.cameras.main);
        this.inputHandler.disable();
        this.startBackgroundMusic();

        this.gameRenderer.drawStaticWorld(ARENA.width, ARENA.height);

        this.subscriptions.push(
            onGameEvent(GameEvents.STATE_UPDATE, (state: GameState) => {
                this.latestState = state;
                const alivePlayers = state.players.filter((player) => !player.isDead);

                if (!state.isColorSelection && alivePlayers.length > 0) {
                    this.inputHandler.enable();
                }

                if (!state.isColorSelection) {
                    this.colorPanX = 0;
                    this.colorPanY = 0;
                    this.applyDynamicCameraFraming(state);
                }
            })
        );

        this.subscriptions.push(
            onGameEvent(GameEvents.ENTITY_DESTROYED, ({ id }) => {
                this.gameRenderer.playEntityDestroyedAnimation(id);

                if (this.latestState && id === this.latestState.player.id) {
                    this.lockInputAfterDeath();
                }
            })
        );

        this.subscriptions.push(
            onGameEvent(GameEvents.PROJECTILE_DESTROYED, ({ x, y, radius, faction, color, visualId }) => {
                this.gameRenderer.playProjectileDeathAnimation(x, y, radius, faction, color, visualId);
            })
        );

        this.subscriptions.push(
            onGameEvent(GameEvents.PROJECTILE_FIRED, ({ shooterId, recoilStrength, faction }) => {
                const isPlayer = faction === 'player';
                this.gameRenderer.playFiringRecoil(shooterId, recoilStrength, isPlayer);
            })
        );

        this.subscriptions.push(
            onGameEvent(GameEvents.ENEMY_DESTROYED, ({ x, y, xpDropped, radius }) => {
                if (xpDropped <= 0) {
                    return;
                }

                this.gameRenderer.playFloatingText(x, y - radius - 30, `+${xpDropped} XP`, '#44ff44');
            })
        );

        this.subscriptions.push(
            onGameEvent(GameEvents.GAME_OVER, () => {
                this.lockInputAfterDeath();
            })
        );

        this.subscriptions.push(
            onGameEvent(GameEvents.AUDIO_SETTINGS_CHANGED, ({ volume, muted }) => {
                this.musicVolume = Phaser.Math.Clamp(volume, 0, 1);
                this.isMusicMuted = muted;
                this.applyBackgroundMusicSettings();
            })
        );

        this.subscriptions.push(
            onGameEvent(GameEvents.AUDIO_RESTART_REQUESTED, () => {
                this.restartBackgroundMusic();
            })
        );

        const focusEncounterArena = (payload: { bossArenaX: number; bossArenaY: number; bossArenaWidth: number; bossArenaHeight: number }) => {
            this.cameras.main.fadeOut(500, 255, 255, 255);
            this.cameras.main.once(
                Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
                () => {
                    this.gameRenderer.drawBossWorld(
                        payload.bossArenaX,
                        payload.bossArenaY,
                        payload.bossArenaWidth,
                        payload.bossArenaHeight
                    );
                    this.cameras.main.setBounds(
                        payload.bossArenaX - 400,
                        payload.bossArenaY - 400,
                        payload.bossArenaWidth + 800,
                        payload.bossArenaHeight + 800
                    );
                    this.cameras.main.fadeIn(500, 255, 255, 255);
                }
            );
        };

        const restoreMainArena = () => {
            this.cameras.main.fadeOut(500, 255, 255, 255);
            this.cameras.main.once(
                Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
                () => {
                    this.gameRenderer.drawStaticWorld(ARENA.width, ARENA.height);
                    this.cameras.main.setBounds(-400, -400, ARENA.width + 800, ARENA.height + 800);
                    this.cameras.main.fadeIn(500, 255, 255, 255);
                }
            );
        };

        this.subscriptions.push(onGameEvent(GameEvents.BOSS_FIGHT_START, focusEncounterArena));
        this.subscriptions.push(onGameEvent(GameEvents.ANOMALY_ENCOUNTER_START, focusEncounterArena));
        this.subscriptions.push(onGameEvent(GameEvents.BOSS_EXIT_PORTAL_USED, restoreMainArena));
        this.subscriptions.push(onGameEvent(GameEvents.ANOMALY_DEFEATED, restoreMainArena));

        this.subscriptions.push(
            onGameEvent(GameEvents.ARENA_RESIZED, ({ width, height }) => {
                this.cameras.main.setBounds(-400, -400, width + 800, height + 800);
                this.gameRenderer.drawStaticWorld(width, height);
            })
        );

        this.subscriptions.push(
            onGameEvent(GameEvents.ANOMALY_TELEPORT, ({ x, y }) => {
                this.gameRenderer.playTeleportFlash(x, y);
            })
        );

        this.subscriptions.push(
            onGameEvent(GameEvents.ANOMALY_DASH, ({ id, durationMs }) => {
                const tickInterval = 50;
                const repeatCount = Math.floor(durationMs / tickInterval);

                this.time.addEvent({
                    delay: tickInterval,
                    repeat: repeatCount,
                    callback: () => {
                        const enemy = this.latestState?.enemies.find(e => e.id === id);
                        if (!enemy) return;
                        this.gameRenderer.playDashGhostTrail(enemy.x, enemy.y, enemy.radius);
                    }
                });
            })
        );

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanupListeners());
        this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanupListeners());
    }

    update() {
        if (!this.latestState) return;

        const state = this.latestState;
        this.updateCameraCullMode(state);

        if (state.isColorSelection) {
            this.colorPanX += 0.5;
            this.colorPanY += 0.3;
            this.cameraFollowTarget.setPosition(
                state.player.x + this.colorPanX,
                state.player.y + this.colorPanY
            );
            const nextZoom = Phaser.Math.Linear(this.cameras.main.zoom, this.cameraMaxZoom, this.cameraZoomLerp);
            this.cameras.main.setZoom(nextZoom);
            this.gameRenderer.renderFrame(state);
            return;
        }

        this.applyDynamicCameraFraming(state);
        this.inputHandler.handleInput(state);

        if (!state.isPaused) {
            this.updateCursorWorldPoint();
        }

        this.gameRenderer.renderFrame(state);
    }

    private updateCameraCullMode(state: GameState): void {
        const shouldDisableCull = state.isCoop;
        if (this.cameraCullOverrideActive === shouldDisableCull) {
            return;
        }

        this.cameraCullOverrideActive = shouldDisableCull;
        this.cameras.main.disableCull = shouldDisableCull;
    }

    private updateCursorWorldPoint(): void {
        const pointer = this.input.activePointer;
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        this.gameRenderer.setCursorWorldPoint(worldPoint.x, worldPoint.y);
    }

    private lockInputAfterDeath(): void {
        this.inputHandler.disable();
    }

    private applyDynamicCameraFraming(state: GameState): void {
        const framing = this.getDynamicCameraFraming(state);
        this.cameraFollowTarget.setPosition(framing.x, framing.y);
        const nextZoom = Phaser.Math.Linear(this.cameras.main.zoom, framing.zoom, this.cameraZoomLerp);
        this.cameras.main.setZoom(nextZoom);
    }

    private getDynamicCameraFraming(state: GameState): { x: number; y: number; zoom: number } {
        const alivePlayers = state.players.filter((player) => !player.isDead);
        if (alivePlayers.length === 0) {
            return { x: state.player.x, y: state.player.y, zoom: this.cameraMaxZoom };
        }

        let minX = alivePlayers[0].x;
        let maxX = alivePlayers[0].x;
        let minY = alivePlayers[0].y;
        let maxY = alivePlayers[0].y;

        for (let i = 1; i < alivePlayers.length; i++) {
            const player = alivePlayers[i];
            minX = Math.min(minX, player.x);
            maxX = Math.max(maxX, player.x);
            minY = Math.min(minY, player.y);
            maxY = Math.max(maxY, player.y);
        }

        const focusX = (minX + maxX) / 2;
        const focusY = (minY + maxY) / 2;

        const spreadX = Math.max(0, maxX - minX);
        const spreadY = Math.max(0, maxY - minY);
        const viewportWidth = Math.max(1, this.scale.width);
        const viewportHeight = Math.max(1, this.scale.height);
        const widthWithPadding = Math.max(1, spreadX + (this.cameraFramingPadding * 2));
        const heightWithPadding = Math.max(1, spreadY + (this.cameraFramingPadding * 2));

        const zoomByWidth = viewportWidth / widthWithPadding;
        const zoomByHeight = viewportHeight / heightWithPadding;
        const desiredZoom = alivePlayers.length === 1
            ? this.cameraMaxZoom
            : Math.min(zoomByWidth, zoomByHeight, this.cameraMaxZoom);
        const clampedZoom = Phaser.Math.Clamp(desiredZoom, this.cameraMinZoom, this.cameraMaxZoom);

        return {
            x: focusX,
            y: focusY,
            zoom: clampedZoom,
        };
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
        if (this.hudCamera) {
            this.hudCamera.destroy();
            this.hudCamera = null;
        }
        this.gameRenderer.destroy();
        this.inputHandler.destroy();

        if (this.bgm) {
            this.bgm.stop();
            this.bgm.destroy();
            this.bgm = null;
        }

        if (this.cameraFollowTarget) {
            this.cameraFollowTarget.destroy();
        }

        for (const unsubscribe of this.subscriptions) {
            unsubscribe();
        }

        this.subscriptions.length = 0;
    }
}
