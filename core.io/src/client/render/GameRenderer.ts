import Phaser from 'phaser';
import type { GameState } from '../../shared/Types';
import { COLORS, ARENA, DEATH_ANIMATION_DURATION_MS, VISUAL } from '../constants/GameConstants';
import { HealthBarRenderer } from './HealthBarRenderer';

interface EntityRenderSnapshot {
    x: number;
    y: number;
    radius: number;
    fillColor: number;
    outlineColor: number;
    strokeWidth: number;
    lastSeenAt: number;
}

export class GameRenderer {
    private healthBarRenderer: HealthBarRenderer;
    private readonly entitySnapshots = new Map<string, EntityRenderSnapshot>();
    private currentPlayerId: string | null = null;
    private isPlayerDeathAnimating = false;

    constructor(
        private scene: Phaser.Scene,
        private gfxWorld: Phaser.GameObjects.Graphics,
        private gfxGame: Phaser.GameObjects.Graphics,
        private gfxPlayer: Phaser.GameObjects.Graphics,
        private gfxHud: Phaser.GameObjects.Graphics
    ) {
        this.healthBarRenderer = new HealthBarRenderer(scene, gfxGame);
    }

    /**
     * Desenha o estado completo do jogo para um frame
     */
    renderFrame(state: GameState, screenHeight: number) {
        this.gfxGame.clear();
        this.gfxHud.clear();
        this.currentPlayerId = state.player.id;

        const activeEntityIds = new Set<string>();

        this.drawProjectiles(state);
        this.drawEnemies(state, activeEntityIds);
        this.drawPlayer(state, activeEntityIds);
        this.drawHud(state, screenHeight);

        this.healthBarRenderer.pruneWorldHealthBars(activeEntityIds);
        this.pruneEntitySnapshots();
    }

    public playEntityDestroyedAnimation(entityId: string): void {
        if (this.currentPlayerId && entityId === this.currentPlayerId) {
            this.playPlayerDeathAnimation();
            return;
        }

        const snapshot = this.entitySnapshots.get(entityId);
        if (!snapshot) {
            return;
        }

        this.entitySnapshots.delete(entityId);

        const ghost = this.scene.add.circle(snapshot.x, snapshot.y, snapshot.radius, snapshot.fillColor, 1);
        ghost.setStrokeStyle(snapshot.strokeWidth, snapshot.outlineColor, 1);

        this.scene.tweens.add({
            targets: ghost,
            y: ghost.y - VISUAL.PLAYER.deathRiseDistance,
            scaleX: 0,
            scaleY: 0,
            alpha: 0,
            duration: DEATH_ANIMATION_DURATION_MS,
            ease: 'Quad.easeOut',
            onComplete: () => {
                ghost.destroy();
            }
        });
    }

    private playPlayerDeathAnimation(): void {
        if (this.isPlayerDeathAnimating) {
            return;
        }

        this.isPlayerDeathAnimating = true;
        this.scene.tweens.killTweensOf(this.gfxPlayer);

        this.scene.tweens.add({
            targets: this.gfxPlayer,
            y: this.gfxPlayer.y - VISUAL.PLAYER.deathRiseDistance,
            scaleX: 0,
            scaleY: 0,
            alpha: 0,
            duration: DEATH_ANIMATION_DURATION_MS,
            ease: 'Quad.easeOut',
            onComplete: () => {
                this.isPlayerDeathAnimating = false;
                this.gfxPlayer.clear();
            }
        });
    }

    private rememberEntitySnapshot(
        entityId: string,
        x: number,
        y: number,
        radius: number,
        fillColor: number,
        outlineColor: number,
        strokeWidth: number
    ): void {
        this.entitySnapshots.set(entityId, {
            x,
            y,
            radius,
            fillColor,
            outlineColor,
            strokeWidth,
            lastSeenAt: this.scene.time.now
        });
    }

    private pruneEntitySnapshots(): void {
        const maxSnapshotAgeMs = 5000;

        for (const [entityId, snapshot] of this.entitySnapshots.entries()) {
            if (this.scene.time.now - snapshot.lastSeenAt <= maxSnapshotAgeMs) {
                continue;
            }

            this.entitySnapshots.delete(entityId);
        }
    }

    /**
     * Desenha fundo e grid (chamado apenas uma vez no create)
     */
    drawStaticWorld() {
        this.gfxWorld.clear();

        // Arena background
        this.gfxWorld.fillStyle(COLORS.ARENA_BG);
        this.gfxWorld.fillRect(0, 0, ARENA.width, ARENA.height);

        // Grid
        const STEP = VISUAL.GRID_STEP;
        this.gfxWorld.lineStyle(
            VISUAL.STROKE.gridLine,
            COLORS.GRID_LINE,
            VISUAL.OPACITY.gridLine
        );

        for (let x = 0; x <= ARENA.width; x += STEP) {
            this.gfxWorld.beginPath();
            this.gfxWorld.moveTo(x, 0);
            this.gfxWorld.lineTo(x, ARENA.height);
            this.gfxWorld.strokePath();
        }

        for (let y = 0; y <= ARENA.height; y += STEP) {
            this.gfxWorld.beginPath();
            this.gfxWorld.moveTo(0, y);
            this.gfxWorld.lineTo(ARENA.width, y);
            this.gfxWorld.strokePath();
        }

        // Arena border
        this.gfxWorld.lineStyle(
            VISUAL.STROKE.arenaBorder,
            COLORS.ARENA_BORDER,
            1
        );
        this.gfxWorld.strokeRect(0, 0, ARENA.width, ARENA.height);
    }

    /**
     * Desenha o player com cano rotacionado para o cursor
     */
    private drawPlayer(state: GameState, activeEntityIds: Set<string>) {
        const { x, y, radius, stats, health, isDead } = state.player;

        if (isDead) {
            if (!this.isPlayerDeathAnimating) {
                this.gfxPlayer.clear();
            }

            return;
        }

        activeEntityIds.add(state.player.id);

        this.gfxPlayer.clear();
        this.gfxPlayer.setPosition(x, y);
        this.gfxPlayer.setScale(1);
        this.gfxPlayer.setAlpha(1);

        // Barrel angle towards cursor pointer
        const worldPoint = this.getCursorWorldPoint();
        const angle = Math.atan2(worldPoint.y - y, worldPoint.x - x);

        // Draw barrel
        this.drawPlayerBarrel(radius, angle);

        // Draw body
        this.drawPlayerBody(radius);
        this.rememberEntitySnapshot(
            state.player.id,
            x,
            y,
            radius,
            COLORS.PLAYER,
            COLORS.PLAYER_OUTLINE,
            VISUAL.STROKE.player
        );

        // Draw health bar
        this.healthBarRenderer.drawWorldHealthBar(
            state.player.id,
            x,
            y - radius - VISUAL.HEALTH_BAR.offsetAboveEntity,
            radius * 2,
            health,
            stats.maxHealth
        );
    }

    /**
     * Desenha todos os inimigos
     */
    private drawEnemies(state: GameState, activeEntityIds: Set<string>) {
        for (const enemy of state.enemies) {
            const { x, y, radius, health, stats, isDead } = enemy;

            if (isDead) {
                continue;
            }

            activeEntityIds.add(enemy.id);

            this.drawCircle(x, y, radius, COLORS.ENEMY, COLORS.ENEMY_OUTLINE);
            this.rememberEntitySnapshot(
                enemy.id,
                x,
                y,
                radius,
                COLORS.ENEMY,
                COLORS.ENEMY_OUTLINE,
                VISUAL.STROKE.enemy
            );

            this.healthBarRenderer.drawWorldHealthBar(
                enemy.id,
                x,
                y - radius - 10,
                radius * 2,
                health,
                stats.maxHealth
            );
        }
    }

    /**
     * Desenha todos os projéteis
     */
    private drawProjectiles(state: GameState) {
        for (const proj of state.projectiles) {
            this.drawCircle(proj.x, proj.y, proj.radius, COLORS.BULLET, COLORS.BULLET_OUTLINE);
        }
    }

    /**
     * Desenha barra de HP do player no HUD (canto inferior da tela)
     */
    private drawHud(state: GameState, screenHeight: number) {
        const { health, stats } = state.player;
        this.healthBarRenderer.drawHudHealthBar(
            this.gfxHud,
            health,
            stats.maxHealth,
            screenHeight
        );
    }

    /**
     * Helper: desenha círculo com outline (player, enemy, bullet)
     */
    private drawCircle(
        x: number,
        y: number,
        radius: number,
        fillColor: number,
        outlineColor: number,
        strokeWidth: number = 2
    ) {
        this.gfxGame.lineStyle(strokeWidth, outlineColor, 1);
        this.gfxGame.fillStyle(fillColor);
        this.gfxGame.beginPath();
        this.gfxGame.arc(x, y, radius, 0, Math.PI * 2);
        this.gfxGame.fillPath();
        this.gfxGame.strokePath();
    }

    /**
     * Helper: desenha cano do player
     */
    private drawPlayerBarrel(radius: number, angle: number) {
        const barrelLen = radius * VISUAL.PLAYER.barrelLengthFactor;
        const barrelWidth = radius * VISUAL.PLAYER.barrelWidthFactor;
        const bx = Math.cos(angle) * (radius * VISUAL.PLAYER.barrelOffsetFactor);
        const by = Math.sin(angle) * (radius * VISUAL.PLAYER.barrelOffsetFactor);

        this.gfxPlayer.fillStyle(COLORS.PLAYER_BARREL);
        this.gfxPlayer.save();
        this.gfxPlayer.translateCanvas(bx, by);
        this.gfxPlayer.rotateCanvas(angle);
        this.gfxPlayer.fillRect(0, -barrelWidth / 2, barrelLen, barrelWidth);
        this.gfxPlayer.restore();
    }

    private drawPlayerBody(radius: number): void {
        this.gfxPlayer.lineStyle(VISUAL.STROKE.player, COLORS.PLAYER_OUTLINE, 1);
        this.gfxPlayer.fillStyle(COLORS.PLAYER);
        this.gfxPlayer.beginPath();
        this.gfxPlayer.arc(0, 0, radius, 0, Math.PI * 2);
        this.gfxPlayer.fillPath();
        this.gfxPlayer.strokePath();
    }

    /**
     * Helper: obtém coordenadas do cursor no espaço do mundo
     */
    private getCursorWorldPoint(): Phaser.Geom.Point {
        return this.cursorWorldPoint;
    }

    /**
     * Setter para atualizar ponto do cursor
     */
    setCursorWorldPoint(x: number, y: number) {
        this.cursorWorldPoint = new Phaser.Geom.Point(x, y);
    }

    private cursorWorldPoint = new Phaser.Geom.Point(0, 0);
}
