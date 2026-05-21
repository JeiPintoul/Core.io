import Phaser from 'phaser';
import type { EnemyType, GameState } from '../../../shared/Types';
import { COLORS, VISUAL } from '../../constants/GameConstants';
import { darkenColor } from '../RenderUtils';

type EnemyData = GameState['enemies'][number];

export class EnemyVisualRenderer {
    private readonly enemyColorByType: Record<EnemyType, number> = {
        KAMIKAZE: COLORS.ENEMY,
        RANGED: COLORS.ENEMY,
        SENTINEL: COLORS.ENEMY,
        SKIRMISHER: COLORS.ENEMY,
        BRUTE: COLORS.ENEMY,
        ANOMALY: 0xdde8ff,
        ANOMALY_DECOY: 0xdde8ff,
        DREADNOUGHT: 0xb184ff
    };

    constructor(private readonly gfx: Phaser.GameObjects.Graphics) {}

    public getBodyColor(enemyType?: EnemyType): number {
        if (!enemyType) return COLORS.ENEMY;
        return this.enemyColorByType[enemyType] ?? COLORS.ENEMY;
    }

    public draw(enemy: EnemyData, bodyColor: number, nowSeconds: number, spawnScale: number): void {
        const {
            x, y, radius, enemyType, aimAngle,
            magnetarPhase, magnetarPhaseProgress, dreadnoughtSummonProgress
        } = enemy;

        if (enemyType === 'ANOMALY' || enemyType === 'ANOMALY_DECOY') {
            this.drawAnomalyAura(x, y, radius);
        }

        const drawRadius = radius * spawnScale;
        if (spawnScale < 1) {
            this.drawSpawnAppearFx(x, y, radius, spawnScale, bodyColor);
        }

        switch (enemyType) {
            case 'KAMIKAZE':
                this.drawRaiderBody(x, y, drawRadius, bodyColor, aimAngle ?? 0, nowSeconds);
                return;
            case 'DREADNOUGHT':
                this.drawDreadnoughtBody(x, y, radius, bodyColor, aimAngle ?? 0, nowSeconds, dreadnoughtSummonProgress ?? 0);
                return;
            case 'BRUTE':
                this.drawMagnetarBody(
                    x,
                    y,
                    drawRadius,
                    bodyColor,
                    aimAngle ?? 0,
                    nowSeconds,
                    magnetarPhase,
                    magnetarPhaseProgress ?? 0
                );
                return;
            default:
                this.drawCircle(x, y, drawRadius, bodyColor, VISUAL.STROKE.enemy);
        }
    }

    private drawAnomalyAura(x: number, y: number, radius: number): void {
        this.gfx.lineStyle(2, 0xaabbff, 0.35);
        this.gfx.strokeCircle(x, y, radius + 8);
        this.gfx.lineStyle(1, 0xaabbff, 0.15);
        this.gfx.strokeCircle(x, y, radius + 16);
    }

    private drawSpawnAppearFx(x: number, y: number, radius: number, scale: number, color: number): void {
        const progress = Phaser.Math.Clamp((scale - 0.2) / 0.8, 0, 1);
        const alpha = 0.55 * (1 - progress);

        this.gfx.lineStyle(2, 0xe7d6ff, alpha);
        this.gfx.strokeCircle(x, y, radius * (1.25 + progress * 0.45));
        this.gfx.fillStyle(color, alpha * 0.35);
        this.gfx.fillCircle(x, y, radius * (0.8 + progress * 0.45));
    }

    private drawRaiderBody(x: number, y: number, radius: number, color: number, aimAngle: number, nowSeconds: number): void {
        const outline = darkenColor(color, 42);
        const spin = nowSeconds * 2.4;

        this.drawPolygon(x, y, radius * 1.02, 4, spin + aimAngle, color, outline, VISUAL.STROKE.enemy, 1);
        this.drawPolygon(x, y, radius * 0.58, 4, -spin * 0.8 + aimAngle, 0xffd6b8, 0xc97546, 2, 0.85);

        const coreX = x + Math.cos(aimAngle) * radius * 0.16;
        const coreY = y + Math.sin(aimAngle) * radius * 0.16;
        this.gfx.fillStyle(0x111726, 0.95);
        this.gfx.fillCircle(coreX, coreY, radius * 0.24);

        this.gfx.lineStyle(1.6, 0xffcaa0, 0.5);
        this.gfx.strokeCircle(x, y, radius + 5);
    }

    private drawDreadnoughtBody(
        x: number,
        y: number,
        radius: number,
        color: number,
        aimAngle: number,
        nowSeconds: number,
        summonProgress: number
    ): void {
        const outline = darkenColor(color, 46);
        const hullBase = darkenColor(color, 26);
        const rotA = nowSeconds * 0.42;
        const summonSpin = summonProgress <= 0.35
            ? -summonProgress * 3.2
            : -1.12 + ((summonProgress - 0.35) / 0.65) * 8.6;
        const rotB = -nowSeconds * 0.64 + summonSpin;
        const gearGlow = summonProgress > 0 ? 0.25 + summonProgress * 0.45 : 0;

        this.drawPolygon(x, y, radius + 22, 8, rotA, 0x2b203d, 0xdfc4ff, 2, 0.26);
        this.drawPolygon(x, y, radius + 12, 6, rotB, hullBase, 0xe6d3ff, 2, 0.55);
        this.drawPolygon(x, y, radius, 6, aimAngle, color, outline, VISUAL.STROKE.enemy, 1);

        this.gfx.lineStyle(2, 0xf0deff, 0.45);
        this.gfx.beginPath();
        this.gfx.moveTo(x - Math.cos(aimAngle) * radius * 0.66, y - Math.sin(aimAngle) * radius * 0.66);
        this.gfx.lineTo(x + Math.cos(aimAngle) * radius * 0.95, y + Math.sin(aimAngle) * radius * 0.95);
        this.gfx.strokePath();

        this.drawTriangle(x, y, radius * 0.42, aimAngle + Math.PI / 2, 0xf7ecff, 2);
        this.gfx.fillStyle(0x130d20, 0.9);
        this.gfx.fillCircle(x, y, radius * 0.28);
        this.gfx.lineStyle(1.4 + summonProgress * 2.2, 0xffd7ff, Math.min(1, 0.65 + gearGlow));
        this.gfx.strokeCircle(x, y, radius * 0.28);

        if (summonProgress > 0) {
            this.gfx.lineStyle(2, 0xe9c7ff, 0.42 * (1 - Math.abs(0.72 - summonProgress)));
            this.gfx.strokeCircle(x, y, radius * (1.28 + summonProgress * 0.28));
        }
    }

    private drawMagnetarBody(
        x: number,
        y: number,
        radius: number,
        color: number,
        aimAngle: number,
        nowSeconds: number,
        phase: 'CHARGING' | 'RELEASING' | undefined,
        phaseProgress: number
    ): void {
        const outline = darkenColor(color, 50);
        const hullCore = darkenColor(color, 22);
        const coilSpin = nowSeconds * (phase === 'RELEASING' ? 6.5 : 1.4);
        const polePerp = aimAngle + Math.PI / 2;

        this.drawPolygon(x, y, radius * 1.08, 6, aimAngle, hullCore, outline, VISUAL.STROKE.enemy, 1);
        this.drawPolygon(x, y, radius * 0.78, 6, -aimAngle, color, outline, 2, 0.6);

        this.gfx.lineStyle(2.2, 0xb6a2ff, 0.55);
        this.gfx.beginPath();
        this.gfx.arc(x, y, radius * 0.62, coilSpin, coilSpin + Math.PI * 0.85);
        this.gfx.strokePath();
        this.gfx.beginPath();
        this.gfx.arc(x, y, radius * 0.62, coilSpin + Math.PI, coilSpin + Math.PI * 1.85);
        this.gfx.strokePath();

        const poleOffset = radius * 0.96;
        const poleRadius = radius * 0.36;
        const northX = x + Math.cos(polePerp) * poleOffset;
        const northY = y + Math.sin(polePerp) * poleOffset;
        const southX = x - Math.cos(polePerp) * poleOffset;
        const southY = y - Math.sin(polePerp) * poleOffset;
        this.drawPolePad(northX, northY, poleRadius, 0xe34d4d, polePerp);
        this.drawPolePad(southX, southY, poleRadius, 0xe34d4d, polePerp + Math.PI);

        const coreColor = phase === 'RELEASING' ? 0xfff7d0 : 0x9be8ff;
        const corePulse = 1 + (phase === 'CHARGING' ? Math.sin(nowSeconds * 8) * 0.08 * phaseProgress : 0);
        this.gfx.fillStyle(0x14102a, 0.95);
        this.gfx.fillCircle(x, y, radius * 0.32);
        this.gfx.fillStyle(coreColor, 0.9);
        this.gfx.fillCircle(x, y, radius * 0.2 * corePulse);

        this.drawMagnetarFieldFx(x, y, radius, nowSeconds, phase, phaseProgress);
    }

    private drawPolePad(x: number, y: number, radius: number, color: number, facing: number): void {
        const outline = darkenColor(color, 45);
        this.gfx.lineStyle(2, outline, 1);
        this.gfx.fillStyle(color, 0.92);
        this.gfx.beginPath();
        this.gfx.arc(x, y, radius, facing - Math.PI / 2, facing + Math.PI / 2);
        this.gfx.closePath();
        this.gfx.fillPath();
        this.gfx.strokePath();
    }

    private drawMagnetarFieldFx(
        x: number,
        y: number,
        radius: number,
        nowSeconds: number,
        phase: 'CHARGING' | 'RELEASING' | undefined,
        progress: number
    ): void {
        if (phase === 'CHARGING' || phase === undefined) {
            const intensity = 0.18 + progress * 0.5;
            for (let i = 0; i < 3; i++) {
                const phase01 = (nowSeconds * 0.55 + i / 3) % 1;
                const ringRadius = radius + 110 - phase01 * 110;
                const alpha = (1 - phase01) * intensity;
                if (alpha <= 0.02) continue;
                this.gfx.lineStyle(1.5, 0x9be8ff, alpha);
                this.gfx.strokeCircle(x, y, ringRadius);
            }
            return;
        }

        const maxReach = 760;
        const shockRadius = radius + progress * (maxReach - radius);
        const alpha = (1 - progress) * 0.85;
        this.gfx.lineStyle(3.5, 0xfff7d0, alpha);
        this.gfx.strokeCircle(x, y, shockRadius);
        this.gfx.lineStyle(1.8, 0xffcf6b, alpha * 0.6);
        this.gfx.strokeCircle(x, y, shockRadius * 1.04);
    }

    private drawCircle(x: number, y: number, radius: number, fillColor: number, strokeWidth = 2): void {
        const outlineColor = darkenColor(fillColor, 40);
        this.gfx.lineStyle(strokeWidth, outlineColor, 1);
        this.gfx.fillStyle(fillColor);
        this.gfx.beginPath();
        this.gfx.arc(x, y, radius, 0, Math.PI * 2);
        this.gfx.fillPath();
        this.gfx.strokePath();
    }

    private drawTriangle(x: number, y: number, radius: number, rotation: number, fillColor: number, strokeWidth = 2): void {
        const outlineColor = darkenColor(fillColor, 40);
        this.gfx.lineStyle(strokeWidth, outlineColor, 1);
        this.gfx.fillStyle(fillColor);
        this.gfx.save();
        this.gfx.translateCanvas(x, y);
        this.gfx.rotateCanvas(rotation);
        this.gfx.beginPath();
        this.gfx.moveTo(0, -radius);
        this.gfx.lineTo(-radius * 0.866, radius * 0.5);
        this.gfx.lineTo(radius * 0.866, radius * 0.5);
        this.gfx.closePath();
        this.gfx.fillPath();
        this.gfx.strokePath();
        this.gfx.restore();
    }

    private drawPolygon(
        x: number,
        y: number,
        radius: number,
        sides: number,
        rotation: number,
        fillColor: number,
        strokeColor: number,
        strokeWidth: number,
        alpha = 1
    ): void {
        if (sides < 3) return;

        this.gfx.lineStyle(strokeWidth, strokeColor, alpha);
        this.gfx.fillStyle(fillColor, alpha);
        this.gfx.beginPath();

        for (let i = 0; i < sides; i++) {
            const angle = rotation + (i * Math.PI * 2) / sides;
            const px = x + Math.cos(angle) * radius;
            const py = y + Math.sin(angle) * radius;
            if (i === 0) this.gfx.moveTo(px, py);
            else this.gfx.lineTo(px, py);
        }

        this.gfx.closePath();
        this.gfx.fillPath();
        this.gfx.strokePath();
    }
}
