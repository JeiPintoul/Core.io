import Phaser from 'phaser';
import { VISUAL } from '../constants/GameConstants';
import { darkenColor } from './RenderUtils';

export class ParticleManager {
    constructor(private scene: Phaser.Scene) {}

    playProjectileDeath(x: number, y: number, radius: number, color: number): void {
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

    playEntityDeathGhost(
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

    playFloatingText(x: number, y: number, text: string, color: string): void {
        const floatingText = this.scene.add.text(x, y, text, {
            fontFamily: 'Trebuchet MS, sans-serif',
            fontSize: '18px',
            color,
            stroke: '#0b122d',
            strokeThickness: 3
        });
        floatingText.setOrigin(0.5, 0.5);
        floatingText.setDepth(20);

        this.scene.tweens.add({
            targets: floatingText,
            y: y - 40,
            alpha: 0,
            duration: 800,
            ease: 'Quad.easeOut',
            onComplete: () => floatingText.destroy()
        });
    }

    playTeleportFlash(x: number, y: number): void {
        const flash = this.scene.add.circle(x, y, 28, 0xffffff, 1);
        flash.setStrokeStyle(3, 0xaabbff, 1);
        flash.setDepth(15);

        this.scene.tweens.add({
            targets: flash,
            alpha: 0,
            scaleX: 3.5,
            scaleY: 3.5,
            duration: 380,
            ease: 'Quad.easeOut',
            onComplete: () => flash.destroy()
        });
    }

    playDashGhostTrail(x: number, y: number, radius: number): void {
        const ghost = this.scene.add.circle(x, y, radius, 0xaabbff, 0.45);
        ghost.setStrokeStyle(2, 0xdde8ff, 0.6);
        ghost.setDepth(5);

        this.scene.tweens.add({
            targets: ghost,
            alpha: 0,
            scaleX: 1.35,
            scaleY: 1.35,
            duration: 300,
            ease: 'Quad.easeOut',
            onComplete: () => ghost.destroy()
        });
    }
}
