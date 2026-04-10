import Phaser from 'phaser';
import { COLORS, VISUAL } from '../constants/GameConstants';

export class HealthBarRenderer {
    constructor(private gfxGame: Phaser.GameObjects.Graphics) {}

    /**
     * Desenha barra de HP no espaço do mundo (acompanha a entidade)
     */
    drawWorldHealthBar(
        cx: number,
        y: number,
        width: number,
        health: number,
        maxHealth: number
    ) {
        const ratio = Math.max(0, health / maxHealth);
        const barColor = ratio > 0.4 ? COLORS.HEALTH_BAR : COLORS.HEALTH_LOW;
        const halfW = width / 2;
        const height = VISUAL.HEALTH_BAR.height;

        // Background
        this.gfxGame.fillStyle(COLORS.HEALTH_BG);
        this.gfxGame.fillRect(cx - halfW, y, width, height);

        // Health fill
        this.gfxGame.fillStyle(barColor);
        this.gfxGame.fillRect(cx - halfW, y, width * ratio, height);
    }

    /**
     * Desenha barra de HP grande do player no HUD (fixo na tela)
     */
    drawHudHealthBar(
        gfxHud: Phaser.GameObjects.Graphics,
        health: number,
        maxHealth: number,
        screenHeight: number
    ) {
        const ratio = Math.max(0, health / maxHealth);
        const barW = VISUAL.HEALTH_BAR.hudWidth;
        const barH = VISUAL.HEALTH_BAR.hudHeight;
        const x = VISUAL.HEALTH_BAR.hudMargin;
        const y = screenHeight - VISUAL.HEALTH_BAR.hudBottomOffset;
        const barColor = ratio > 0.4 ? COLORS.HEALTH_BAR : COLORS.HEALTH_LOW;

        // Dark background
        gfxHud.fillStyle(0x000000, VISUAL.OPACITY.hudBackground);
        gfxHud.fillRoundedRect(x - 6, y - 6, barW + 12, barH + 12, 4);

        // Empty track
        gfxHud.fillStyle(COLORS.HEALTH_BG);
        gfxHud.fillRect(x, y, barW, barH);

        // Health fill
        gfxHud.fillStyle(barColor);
        gfxHud.fillRect(x, y, barW * ratio, barH);

        // Border
        gfxHud.lineStyle(VISUAL.STROKE.healthBar, 0xffffff, VISUAL.OPACITY.hudBorder);
        gfxHud.strokeRect(x, y, barW, barH);
    }
}
