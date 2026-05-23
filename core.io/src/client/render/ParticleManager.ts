import Phaser from 'phaser';
import type { EnemyType } from '../../shared/Types';
import type { ProjectileVisualId } from '../../shared/ProjectileVisuals';
import { EntityDeathAnimator } from './entities/EntityDeathAnimator';
import { ProjectileDeathAnimator } from './projectiles/ProjectileDeathAnimator';

export class ParticleManager {
    private readonly entityDeathAnimator: EntityDeathAnimator;
    private readonly projectileDeathAnimator: ProjectileDeathAnimator;

    constructor(private scene: Phaser.Scene) {
        this.entityDeathAnimator = new EntityDeathAnimator(scene);
        this.projectileDeathAnimator = new ProjectileDeathAnimator(scene);
    }

    playProjectileDeath(x: number, y: number, radius: number, color: number, visualId?: ProjectileVisualId): void {
        this.projectileDeathAnimator.play(x, y, radius, color, visualId);
    }

    playEntityDeath(
        x: number,
        y: number,
        radius: number,
        fillColor: number,
        outlineColor: number,
        strokeWidth: number,
        enemyType?: EnemyType
    ): void {
        this.entityDeathAnimator.play(x, y, radius, fillColor, outlineColor, strokeWidth, enemyType);
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
