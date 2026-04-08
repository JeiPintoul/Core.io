import Phaser from 'phaser';
import type { GameState } from '../../shared/Types';
import { COLORS, ARENA, VISUAL } from '../constants/GameConstants';
import { HealthBarRenderer } from './HealthBarRenderer';

export class GameRenderer {
    private healthBarRenderer: HealthBarRenderer;

    constructor(
        private gfxWorld: Phaser.GameObjects.Graphics,
        private gfxGame: Phaser.GameObjects.Graphics,
        private gfxHud: Phaser.GameObjects.Graphics
    ) {
        this.healthBarRenderer = new HealthBarRenderer(gfxGame);
    }

    /**
     * Desenha o estado completo do jogo para um frame
     */
    renderFrame(state: GameState, screenHeight: number) {
        this.gfxGame.clear();
        this.gfxHud.clear();

        this.drawProjectiles(state);
        this.drawEnemies(state);
        this.drawPlayer(state);
        this.drawHud(state, screenHeight);
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
    private drawPlayer(state: GameState) {
        const { x, y, radius, stats, health } = state.player;

        // Barrel angle towards cursor pointer
        const worldPoint = this.getCursorWorldPoint();
        const angle = Math.atan2(worldPoint.y - y, worldPoint.x - x);

        // Draw barrel
        this.drawBarrel(x, y, radius, angle);

        // Draw body
        this.drawCircle(x, y, radius, COLORS.PLAYER, COLORS.PLAYER_OUTLINE);

        // Draw health bar
        this.healthBarRenderer.drawWorldHealthBar(
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
    private drawEnemies(state: GameState) {
        for (const enemy of state.enemies) {
            const { x, y, radius, health, stats } = enemy;

            this.drawCircle(x, y, radius, COLORS.ENEMY, COLORS.ENEMY_OUTLINE);

            this.healthBarRenderer.drawWorldHealthBar(
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
    private drawBarrel(x: number, y: number, radius: number, angle: number) {
        const barrelLen = radius * VISUAL.PLAYER.barrelLengthFactor;
        const barrelWidth = radius * VISUAL.PLAYER.barrelWidthFactor;
        const bx = x + Math.cos(angle) * (radius * VISUAL.PLAYER.barrelOffsetFactor);
        const by = y + Math.sin(angle) * (radius * VISUAL.PLAYER.barrelOffsetFactor);

        this.gfxGame.fillStyle(COLORS.PLAYER_BARREL);
        this.gfxGame.save();
        this.gfxGame.translateCanvas(bx, by);
        this.gfxGame.rotateCanvas(angle);
        this.gfxGame.fillRect(0, -barrelWidth / 2, barrelLen, barrelWidth);
        this.gfxGame.restore();
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
