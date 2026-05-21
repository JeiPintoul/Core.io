import Phaser from 'phaser';
import type { ProjectileVisualId } from '../../../shared/ProjectileVisuals';
import { ANOMALY_PROJECTILE_COLOR, PROJECTILE_VISUAL_IDS } from '../../../shared/ProjectileVisuals';
import { VISUAL } from '../../constants/GameConstants';
import { darkenColor } from '../RenderUtils';

export class ProjectileDeathAnimator {
    constructor(private readonly scene: Phaser.Scene) {}

    public play(x: number, y: number, radius: number, color: number, visualId?: ProjectileVisualId): void {
        switch (visualId) {
            case PROJECTILE_VISUAL_IDS.DREADNOUGHT:
                this.playDreadnought(x, y, radius);
                return;
            case PROJECTILE_VISUAL_IDS.ANOMALY:
                this.playAnomaly(x, y, radius);
                return;
            default:
                this.playDefault(x, y, radius, color);
        }
    }

    private playDefault(x: number, y: number, radius: number, color: number): void {
        const outlineColor = darkenColor(color, 42);
        const pulse = this.scene.add.circle(x, y, radius, color, 1);
        pulse.setStrokeStyle(VISUAL.STROKE.bullet, outlineColor, 1);

        this.scene.tweens.add({
            targets: pulse,
            scaleX: 0,
            scaleY: 0,
            alpha: 0,
            duration: 150,
            ease: 'Quad.easeOut',
            onComplete: () => pulse.destroy()
        });
    }

    private playAnomaly(x: number, y: number, radius: number): void {
        const glow = this.scene.add.circle(x, y, radius * 1.65, ANOMALY_PROJECTILE_COLOR, 0.32);
        glow.setDepth(8);

        const core = this.scene.add.circle(x, y, radius, ANOMALY_PROJECTILE_COLOR, 1);
        core.setStrokeStyle(1.2, 0xdfeeff, 0.72);
        core.setDepth(9);

        this.scene.tweens.add({
            targets: glow,
            scaleX: 1.45,
            scaleY: 1.45,
            alpha: 0,
            duration: 170,
            ease: 'Quad.easeOut',
            onComplete: () => glow.destroy()
        });

        this.scene.tweens.add({
            targets: core,
            scaleX: 0,
            scaleY: 0,
            alpha: 0,
            duration: 150,
            ease: 'Quad.easeOut',
            onComplete: () => core.destroy()
        });
    }

    private playDreadnought(x: number, y: number, radius: number): void {
        const aura = this.scene.add.circle(x, y, radius * 2.1, 0xbb7bff, 0.34);
        aura.setDepth(8);

        const ring = this.scene.add.circle(x, y, radius * 1.25, 0xffffff, 0);
        ring.setStrokeStyle(2, 0xe5c6ff, 0.85);
        ring.setDepth(9);

        const core = this.scene.add.circle(x, y, radius * 0.92, 0xf8e9ff, 1);
        core.setDepth(10);

        this.scene.tweens.add({
            targets: aura,
            scaleX: 1.55,
            scaleY: 1.55,
            alpha: 0,
            duration: 220,
            ease: 'Quad.easeOut',
            onComplete: () => aura.destroy()
        });

        this.scene.tweens.add({
            targets: ring,
            scaleX: 1.35,
            scaleY: 1.35,
            alpha: 0,
            duration: 190,
            ease: 'Quad.easeOut',
            onComplete: () => ring.destroy()
        });

        this.scene.tweens.add({
            targets: core,
            scaleX: 0,
            scaleY: 0,
            alpha: 0,
            duration: 150,
            ease: 'Quad.easeOut',
            onComplete: () => core.destroy()
        });
    }
}
