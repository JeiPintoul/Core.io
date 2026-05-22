import Phaser from 'phaser';
import type { ProjectileData } from '../../../shared/Types';
import { ANOMALY_PROJECTILE_COLOR, PROJECTILE_VISUAL_IDS } from '../../../shared/ProjectileVisuals';
import { VISUAL } from '../../constants/GameConstants';
import { darkenColor } from '../RenderUtils';

export class ProjectileVisualRenderer {
    private readonly dreadnoughtCore = 0xf8e9ff;
    private readonly dreadnoughtAura = 0xbb7bff;
    private readonly dreadnoughtRing = 0x5d2ea1;

    constructor(private readonly gfx: Phaser.GameObjects.Graphics) {}

    public draw(projectile: ProjectileData, fallbackColor: number, pulseTime: number): void {
        switch (projectile.visualId) {
            case PROJECTILE_VISUAL_IDS.DREADNOUGHT:
                this.drawDreadnought(projectile.x, projectile.y, projectile.radius, pulseTime);
                return;
            case PROJECTILE_VISUAL_IDS.ANOMALY:
                this.drawAnomaly(projectile.x, projectile.y, projectile.radius, pulseTime);
                return;
            case PROJECTILE_VISUAL_IDS.SENTINEL:
                this.drawSentinel(projectile.x, projectile.y, projectile.radius, pulseTime);
                return;
            default:
                this.drawDefault(projectile.x, projectile.y, projectile.radius, projectile.color ?? fallbackColor);
        }
    }

    private drawDefault(x: number, y: number, radius: number, color: number): void {
        const outlineColor = darkenColor(color, 40);
        this.gfx.lineStyle(VISUAL.STROKE.bullet, outlineColor, 1);
        this.gfx.fillStyle(color);
        this.gfx.beginPath();
        this.gfx.arc(x, y, radius, 0, Math.PI * 2);
        this.gfx.fillPath();
        this.gfx.strokePath();
    }

    private drawAnomaly(x: number, y: number, radius: number, pulseTime: number): void {
        const pulse = 0.5 + (Math.sin((x + y) * 0.025 + pulseTime * 10) * 0.5);

        this.gfx.fillStyle(ANOMALY_PROJECTILE_COLOR, 0.16 + pulse * 0.08);
        this.gfx.fillCircle(x, y, radius * (1.7 + pulse * 0.15));

        this.gfx.lineStyle(1.2, 0xdfeeff, 0.55);
        this.gfx.strokeCircle(x, y, radius * 1.18);

        this.gfx.fillStyle(ANOMALY_PROJECTILE_COLOR, 1);
        this.gfx.fillCircle(x, y, radius);
    }

    private drawDreadnought(x: number, y: number, radius: number, pulseTime: number): void {
        const pulse = 0.5 + (Math.sin((x + y) * 0.02 + pulseTime * 11) * 0.5);
        const auraRadius = radius * (1.95 + pulse * 0.42);
        const ringRadius = radius * (1.28 + pulse * 0.2);

        this.gfx.fillStyle(this.dreadnoughtAura, 0.24 + pulse * 0.16);
        this.gfx.fillCircle(x, y, auraRadius);

        this.gfx.lineStyle(2, this.dreadnoughtRing, 0.88);
        this.gfx.strokeCircle(x, y, ringRadius);

        this.gfx.fillStyle(this.dreadnoughtCore, 1);
        this.gfx.fillCircle(x, y, radius * 0.92);

        const spikeLength = radius * 1.55;
        this.gfx.lineStyle(1.2, 0xe5c6ff, 0.86);
        this.gfx.beginPath();
        this.gfx.moveTo(x - spikeLength, y);
        this.gfx.lineTo(x + spikeLength, y);
        this.gfx.moveTo(x, y - spikeLength);
        this.gfx.lineTo(x, y + spikeLength);
        this.gfx.strokePath();
    }

    private drawSentinel(x: number, y: number, radius: number, pulseTime: number): void {
        const pulse = 0.5 + Math.sin((x + y) * 0.035 + pulseTime * 9) * 0.5;

        this.gfx.lineStyle(1.7, 0xffc1c1, 0.58 + pulse * 0.2);
        this.gfx.strokeCircle(x, y, radius * 1.35);

        this.gfx.lineStyle(1.2, 0x7a1515, 0.9);
        this.gfx.fillStyle(0xff4444, 1);
        this.gfx.beginPath();
        this.gfx.moveTo(x, y - radius * 1.08);
        this.gfx.lineTo(x - radius * 0.94, y + radius * 0.56);
        this.gfx.lineTo(x + radius * 0.94, y + radius * 0.56);
        this.gfx.closePath();
        this.gfx.fillPath();
        this.gfx.strokePath();

        this.gfx.lineStyle(1, 0xffe0e0, 0.42);
        this.gfx.strokeCircle(x, y, radius * 0.46);
    }
}
