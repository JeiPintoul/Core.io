import Phaser from 'phaser';
import { COLORS, VISUAL } from '../constants/GameConstants';

interface BarTweenState {
    value: number;
    target: number;
    tween: Phaser.Tweens.Tween | null;
}

export class HealthBarRenderer {
    private readonly worldBarStates = new Map<string, BarTweenState>();
    private hudBarState: BarTweenState | null = null;

    constructor(
        private scene: Phaser.Scene,
        private gfxGame: Phaser.GameObjects.Graphics
    ) {}

    private resolveSmoothedRatio(state: BarTweenState, target: number): number {
        if (Math.abs(state.target - target) > 0.001) {
            state.target = target;

            if (state.tween) {
                state.tween.stop();
                state.tween = null;
            }

            state.tween = this.scene.tweens.add({
                targets: state,
                value: target,
                duration: 150,
                ease: 'Quad.easeOut',
                onComplete: () => {
                    state.tween = null;
                }
            });
        }

        return state.value;
    }

    private getOrCreateWorldState(entityId: string, ratio: number): BarTweenState {
        const existingState = this.worldBarStates.get(entityId);
        if (existingState) {
            return existingState;
        }

        const newState: BarTweenState = {
            value: ratio,
            target: ratio,
            tween: null
        };

        this.worldBarStates.set(entityId, newState);
        return newState;
    }

    public pruneWorldHealthBars(activeEntityIds: Set<string>): void {
        for (const [entityId, state] of this.worldBarStates.entries()) {
            if (activeEntityIds.has(entityId)) {
                continue;
            }

            if (state.tween) {
                state.tween.stop();
            }

            this.worldBarStates.delete(entityId);
        }
    }

    /**
     * Desenha barra de HP no espaço do mundo (acompanha a entidade)
     */
    drawWorldHealthBar(
        entityId: string,
        cx: number,
        y: number,
        width: number,
        health: number,
        maxHealth: number
    ) {
        if (health >= maxHealth) {
            return;
        }

        const targetRatio = Math.max(0, health / maxHealth);
        const state = this.getOrCreateWorldState(entityId, targetRatio);
        const ratio = this.resolveSmoothedRatio(state, targetRatio);
        const barColor = targetRatio > 0.4 ? COLORS.HEALTH_BAR : COLORS.HEALTH_LOW;
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
        const targetRatio = Math.max(0, health / maxHealth);

        if (!this.hudBarState) {
            this.hudBarState = {
                value: targetRatio,
                target: targetRatio,
                tween: null
            };
        }

        const ratio = this.resolveSmoothedRatio(this.hudBarState, targetRatio);
        const barW = VISUAL.HEALTH_BAR.hudWidth;
        const barH = VISUAL.HEALTH_BAR.hudHeight;
        const x = VISUAL.HEALTH_BAR.hudMargin;
        const y = screenHeight - VISUAL.HEALTH_BAR.hudBottomOffset;
        const barColor = targetRatio > 0.4 ? COLORS.HEALTH_BAR : COLORS.HEALTH_LOW;

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
