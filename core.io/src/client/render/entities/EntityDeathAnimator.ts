import Phaser from 'phaser';
import type { EnemyType } from '../../../shared/Types';
import { VISUAL } from '../../constants/GameConstants';

export class EntityDeathAnimator {
    constructor(private readonly scene: Phaser.Scene) {}

    public play(
        x: number,
        y: number,
        radius: number,
        fillColor: number,
        outlineColor: number,
        strokeWidth: number,
        enemyType?: EnemyType
    ): void {
        if (enemyType === 'DREADNOUGHT') {
            this.playBossDefeated(x, y, radius, fillColor);
            return;
        }

        this.playGhost(x, y, radius, fillColor, outlineColor, strokeWidth);
    }

    private playGhost(
        x: number,
        y: number,
        radius: number,
        fillColor: number,
        outlineColor: number,
        strokeWidth: number
    ): void {
        const ghost = this.scene.add.circle(x, y, radius, fillColor, 1);
        ghost.setStrokeStyle(strokeWidth, outlineColor, 1);

        this.scene.tweens.add({
            targets: ghost,
            y: ghost.y - VISUAL.PLAYER.deathRiseDistance,
            scaleX: 0,
            scaleY: 0,
            alpha: 0,
            duration: 500,
            ease: 'Quad.easeOut',
            onComplete: () => ghost.destroy()
        });
    }

    private playBossDefeated(x: number, y: number, radius: number, color: number): void {
        const core = this.scene.add.circle(x, y, radius, color, 0.72);
        core.setStrokeStyle(4, 0xf2e6ff, 0.9);
        core.setDepth(12);

        const ring = this.scene.add.circle(x, y, radius * 1.1, 0xffffff, 0);
        ring.setStrokeStyle(5, 0xd7c3ff, 0.86);
        ring.setDepth(11);

        this.scene.tweens.add({
            targets: core,
            scaleX: 0.18,
            scaleY: 0.18,
            alpha: 0,
            angle: 180,
            duration: 760,
            ease: 'Cubic.easeIn',
            onComplete: () => core.destroy()
        });

        this.scene.tweens.add({
            targets: ring,
            scaleX: 4.2,
            scaleY: 4.2,
            alpha: 0,
            duration: 820,
            ease: 'Quad.easeOut',
            onComplete: () => ring.destroy()
        });
    }
}
