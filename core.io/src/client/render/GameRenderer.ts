import Phaser from 'phaser';
import type { EnemyType, GameState, ProjectileFaction } from '../../shared/Types';
import { COLORS, ARENA, DEATH_ANIMATION_DURATION_MS, VISUAL } from '../constants/GameConstants';
import { HealthBarRenderer } from './HealthBarRenderer';
import { ParticleManager } from './ParticleManager';
import { darkenColor } from './RenderUtils';

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
    private particleManager: ParticleManager;
    private readonly entitySnapshots = new Map<string, EntityRenderSnapshot>();
    private currentPlayerId: string | null = null;
    private isPlayerDeathAnimating = false;
    private playerNameText: Phaser.GameObjects.Text | null = null;
    private cursorWorldPoint = new Phaser.Geom.Point(0, 0);
    private readonly playerBarrelRetraction = { value: 0 };
    private readonly enemyBarrelRetractions = new Map<string, { value: number }>();
    private readonly enemyRecoilTweens = new Map<string, Phaser.Tweens.Tween>();
    private playerRecoilTween: Phaser.Tweens.Tween | null = null;

    private readonly minimapBackground = 0x060b1f;
    private readonly minimapBorder = 0x79a6ff;
    private readonly minimapPlayerDot = 0xffffff;
    private readonly dreadnoughtProjectileCore = 0xf8e9ff;
    private readonly dreadnoughtProjectileAura = 0xbb7bff;
    private readonly dreadnoughtProjectileRing = 0x5d2ea1;
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

    constructor(
        private scene: Phaser.Scene,
        private camera: Phaser.Cameras.Scene2D.Camera,
        private gfxWorld: Phaser.GameObjects.Graphics,
        private gfxGame: Phaser.GameObjects.Graphics,
        private gfxPlayer: Phaser.GameObjects.Graphics,
        private gfxHud: Phaser.GameObjects.Graphics
    ) {
        this.healthBarRenderer = new HealthBarRenderer(scene, gfxGame);
        this.particleManager = new ParticleManager(scene);
    }

    /**
     * Desenha o estado completo do jogo para um frame
     */
    renderFrame(state: GameState) {
        this.gfxGame.clear();
        this.gfxHud.clear();
        this.currentPlayerId = state.player.id;

        const activeEntityIds = new Set<string>();

        const resolvedPlayerColor = state.player.color ?? COLORS.PLAYER;
        this.drawProjectiles(state, resolvedPlayerColor);
        this.drawEnemies(state, activeEntityIds);
        this.drawPlayer(state, activeEntityIds);
        this.updatePlayerName(state.player);
        this.drawMinimap(state.player.x, state.player.y);
        this.pruneEnemyBarrelRetraction(activeEntityIds);

        this.healthBarRenderer.pruneWorldHealthBars(activeEntityIds);
        this.pruneEntitySnapshots();
    }

    public playEntityDestroyedAnimation(entityId: string): void {
        if (this.currentPlayerId && entityId === this.currentPlayerId) {
            this.hidePlayerName();
            this.playPlayerDeathAnimation();
            return;
        }

        const snapshot = this.entitySnapshots.get(entityId);
        if (!snapshot) {
            return;
        }

        this.entitySnapshots.delete(entityId);

        this.particleManager.playEntityDeathGhost(
            snapshot.x, snapshot.y, snapshot.radius,
            snapshot.fillColor, snapshot.outlineColor, snapshot.strokeWidth
        );
    }

    public playProjectileDeathAnimation(x: number, y: number, radius: number, faction: ProjectileFaction, color?: number): void {
        const isPlayerProjectile = faction === 'player';
        const pulseColor = color ?? (isPlayerProjectile ? COLORS.PLAYER : COLORS.ENEMY);
        this.particleManager.playProjectileDeath(x, y, radius, pulseColor);
    }

    public playFloatingText(x: number, y: number, text: string, color: string): void {
        this.particleManager.playFloatingText(x, y, text, color);
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
                this.hidePlayerName();
            }
        });
    }

    private rememberEntitySnapshot(
        entityId: string,
        x: number,
        y: number,
        radius: number,
        fillColor: number,
        strokeWidth: number
    ): void {
        const outlineColor = darkenColor(fillColor, 40);

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
    drawStaticWorld(width: number, height: number) {
        this.gfxWorld.clear();

        const abyssPadding = 400;
        const edgeShadeSize = 200;
        const abyssColor = 0x0f0f1a;
        const arenaEdgeShade = 0x11172d;

        this.gfxWorld.fillStyle(abyssColor);
        this.gfxWorld.fillRect(
            -abyssPadding,
            -abyssPadding,
            width + (abyssPadding * 2),
            height + (abyssPadding * 2)
        );

        this.gfxWorld.fillStyle(COLORS.ARENA_BG);
        this.gfxWorld.fillRect(0, 0, width, height);

        this.gfxWorld.fillStyle(arenaEdgeShade, 0.5);
        this.gfxWorld.fillRect(0, 0, width, edgeShadeSize);
        this.gfxWorld.fillRect(0, height - edgeShadeSize, width, edgeShadeSize);
        this.gfxWorld.fillRect(0, edgeShadeSize, edgeShadeSize, height - (edgeShadeSize * 2));
        this.gfxWorld.fillRect(width - edgeShadeSize, edgeShadeSize, edgeShadeSize, height - (edgeShadeSize * 2));

        const STEP = VISUAL.GRID_STEP;
        this.gfxWorld.lineStyle(
            VISUAL.STROKE.gridLine,
            COLORS.GRID_LINE,
            VISUAL.OPACITY.gridLine
        );

        for (let x = 0; x <= width; x += STEP) {
            this.gfxWorld.beginPath();
            this.gfxWorld.moveTo(x, 0);
            this.gfxWorld.lineTo(x, height);
            this.gfxWorld.strokePath();
        }

        for (let y = 0; y <= height; y += STEP) {
            this.gfxWorld.beginPath();
            this.gfxWorld.moveTo(0, y);
            this.gfxWorld.lineTo(width, y);
            this.gfxWorld.strokePath();
        }

        this.gfxWorld.lineStyle(
            VISUAL.STROKE.arenaBorder,
            COLORS.ARENA_BORDER,
            1
        );
        this.gfxWorld.strokeRect(0, 0, width, height);
    }

    /**
     * Desenha o player com cano rotacionado para o cursor
     */
    private drawPlayer(state: GameState, activeEntityIds: Set<string>) {
        const { x, y, radius, stats, health, isDead, color: playerColor } = state.player;

        if (isDead) {
            if (!this.isPlayerDeathAnimating) {
                this.gfxPlayer.clear();
            }

            this.hidePlayerName();

            return;
        }

        activeEntityIds.add(state.player.id);

        this.gfxPlayer.clear();
        this.gfxPlayer.setPosition(x, y);
        this.gfxPlayer.setScale(1);
        this.gfxPlayer.setAlpha(1);

        // When auto-spin is active use the server-driven spinAngle; otherwise aim at cursor
        let angle: number;
        if (state.autoSpin && state.player.aimAngle !== undefined) {
            angle = state.player.aimAngle;
        } else {
            const worldPoint = this.getCursorWorldPoint();
            angle = Math.atan2(worldPoint.y - y, worldPoint.x - x);
        }

        // Draw barrel
        this.drawPlayerBarrel(radius, angle, this.playerBarrelRetraction.value);

        // Draw body
        const resolvedPlayerColor = playerColor ?? COLORS.PLAYER;
        this.drawPlayerBody(radius, resolvedPlayerColor);
        this.rememberEntitySnapshot(
            state.player.id,
            x,
            y,
            radius,
            resolvedPlayerColor,
            VISUAL.STROKE.player
        );

        // Draw health bar
        this.healthBarRenderer.drawWorldHealthBar(
            state.player.id,
            x,
            y + radius + VISUAL.HEALTH_BAR.offsetAboveEntity,
            radius * 2,
            health,
            stats.maxHealth
        );
    }

    /**
     * Desenha todos os inimigos
     */
    private drawEnemies(state: GameState, activeEntityIds: Set<string>) {
        const nowSeconds = this.scene.time.now / 1000;
        const shouldMaskAnomalyHealth = state.enemies.some((enemy) => enemy.enemyType === 'ANOMALY_DECOY');

        for (const enemy of state.enemies) {
            const { x, y, radius, health, stats, isDead, enemyType, aimAngle, sentinelTriangles } = enemy;

            if (isDead) {
                continue;
            }

            activeEntityIds.add(enemy.id);

            if (!this.isInCameraView(x, y, radius, 80)) {
                continue;
            }

            const barrelRetraction = this.enemyBarrelRetractions.get(enemy.id)?.value ?? 0;

            if ((enemyType === 'RANGED' || enemyType === 'SKIRMISHER' || enemyType === 'ANOMALY' || enemyType === 'ANOMALY_DECOY' || enemyType === 'DREADNOUGHT')
                && typeof aimAngle === 'number') {
                this.drawEnemyBarrel(x, y, radius, aimAngle, barrelRetraction);
            }

            if (enemyType === 'ANOMALY' || enemyType === 'ANOMALY_DECOY') {
                this.gfxGame.lineStyle(2, 0xaabbff, 0.35);
                this.gfxGame.strokeCircle(x, y, radius + 8);
                this.gfxGame.lineStyle(1, 0xaabbff, 0.15);
                this.gfxGame.strokeCircle(x, y, radius + 16);
            }

            const bodyColor = this.getEnemyBodyColor(enemyType);

            if (enemyType === 'KAMIKAZE') {
                this.drawRaiderBody(x, y, radius, bodyColor, aimAngle ?? 0, nowSeconds);
            } else if (enemyType === 'DREADNOUGHT') {
                this.drawDreadnoughtBody(x, y, radius, bodyColor, aimAngle ?? 0, nowSeconds);
            } else {
                this.drawCircle(x, y, radius, bodyColor, VISUAL.STROKE.enemy);
            }

            this.rememberEntitySnapshot(
                enemy.id,
                x,
                y,
                radius,
                bodyColor,
                VISUAL.STROKE.enemy
            );

            if (!this.shouldHideEnemyHealthBar(enemyType, shouldMaskAnomalyHealth)) {
                this.healthBarRenderer.drawWorldHealthBar(
                    enemy.id,
                    x,
                    y - radius - 10,
                    radius * 2,
                    health,
                    stats.maxHealth
                );
            }

            // Draw sentinel triangles if present
            if (sentinelTriangles) {
                for (const triangle of sentinelTriangles) {
                    if (!this.isInCameraView(triangle.x, triangle.y, 12, 20)) {
                        continue;
                    }

                    this.drawTriangle(triangle.x, triangle.y, 12, triangle.rotation, COLORS.ENEMY, VISUAL.STROKE.enemy);
                    this.healthBarRenderer.drawWorldHealthBar(
                        triangle.id,
                        triangle.x,
                        triangle.y - 12 - 5,
                        24,
                        triangle.health,
                        triangle.maxHealth
                    );
                }
            }
        }
    }

    private shouldHideEnemyHealthBar(enemyType: EnemyType | undefined, shouldMaskAnomalyHealth: boolean): boolean {
        return shouldMaskAnomalyHealth && (enemyType === 'ANOMALY' || enemyType === 'ANOMALY_DECOY');
    }

    /**
     * Desenha todos os projéteis
     */
    private drawProjectiles(state: GameState, playerColor: number) {
        const pulseTime = this.scene.time.now / 1000;

        for (const proj of state.projectiles) {
            if (!this.isInCameraView(proj.x, proj.y, proj.radius, 20)) {
                continue;
            }

            const isPlayerProjectile = proj.faction === 'player';
            const isDreadnoughtProjectile = proj.faction === 'enemy' && proj.ownerId === 'dreadnought_boss';

            if (isDreadnoughtProjectile) {
                this.drawDreadnoughtProjectile(proj.x, proj.y, proj.radius, pulseTime);
                continue;
            }

            const fillColor = isPlayerProjectile ? playerColor : COLORS.ENEMY;
            this.drawCircle(proj.x, proj.y, proj.radius, fillColor, VISUAL.STROKE.bullet);
        }
    }

    private drawDreadnoughtProjectile(x: number, y: number, radius: number, pulseTime: number): void {
        const pulse = 0.5 + (Math.sin((x + y) * 0.02 + pulseTime * 11) * 0.5);
        const auraRadius = radius * (1.95 + pulse * 0.42);
        const ringRadius = radius * (1.28 + pulse * 0.2);

        this.gfxGame.fillStyle(this.dreadnoughtProjectileAura, 0.24 + pulse * 0.16);
        this.gfxGame.fillCircle(x, y, auraRadius);

        this.gfxGame.lineStyle(2, this.dreadnoughtProjectileRing, 0.88);
        this.gfxGame.strokeCircle(x, y, ringRadius);

        this.gfxGame.fillStyle(this.dreadnoughtProjectileCore, 1);
        this.gfxGame.fillCircle(x, y, radius * 0.92);

        const spikeLength = radius * 1.55;
        this.gfxGame.lineStyle(1.2, 0xe5c6ff, 0.86);
        this.gfxGame.beginPath();
        this.gfxGame.moveTo(x - spikeLength, y);
        this.gfxGame.lineTo(x + spikeLength, y);
        this.gfxGame.moveTo(x, y - spikeLength);
        this.gfxGame.lineTo(x, y + spikeLength);
        this.gfxGame.strokePath();
    }

    private drawRaiderBody(x: number, y: number, radius: number, color: number, aimAngle: number, nowSeconds: number): void {
        const outline = darkenColor(color, 42);
        const spin = nowSeconds * 2.4;

        this.drawPolygon(x, y, radius * 1.02, 4, spin + aimAngle, color, outline, VISUAL.STROKE.enemy, 1);
        this.drawPolygon(x, y, radius * 0.58, 4, -spin * 0.8 + aimAngle, 0xffd6b8, 0xc97546, 2, 0.85);

        const coreX = x + Math.cos(aimAngle) * radius * 0.16;
        const coreY = y + Math.sin(aimAngle) * radius * 0.16;
        this.gfxGame.fillStyle(0x111726, 0.95);
        this.gfxGame.fillCircle(coreX, coreY, radius * 0.24);

        this.gfxGame.lineStyle(1.6, 0xffcaa0, 0.5);
        this.gfxGame.strokeCircle(x, y, radius + 5);
    }

    private drawDreadnoughtBody(
        x: number,
        y: number,
        radius: number,
        color: number,
        aimAngle: number,
        nowSeconds: number
    ): void {
        const outline = darkenColor(color, 46);
        const hullBase = darkenColor(color, 26);
        const rotA = nowSeconds * 0.42;
        const rotB = -nowSeconds * 0.64;

        this.drawPolygon(x, y, radius + 22, 8, rotA, 0x2b203d, 0xdfc4ff, 2, 0.26);
        this.drawPolygon(x, y, radius + 12, 6, rotB, hullBase, 0xe6d3ff, 2, 0.55);
        this.drawPolygon(x, y, radius, 6, aimAngle, color, outline, VISUAL.STROKE.enemy, 1);

        this.gfxGame.lineStyle(2, 0xf0deff, 0.45);
        this.gfxGame.beginPath();
        this.gfxGame.moveTo(x - Math.cos(aimAngle) * radius * 0.66, y - Math.sin(aimAngle) * radius * 0.66);
        this.gfxGame.lineTo(x + Math.cos(aimAngle) * radius * 0.95, y + Math.sin(aimAngle) * radius * 0.95);
        this.gfxGame.strokePath();

        this.drawTriangle(x, y, radius * 0.42, aimAngle + Math.PI / 2, 0xf7ecff, 2);
        this.gfxGame.fillStyle(0x130d20, 0.9);
        this.gfxGame.fillCircle(x, y, radius * 0.28);
        this.gfxGame.lineStyle(1.4, 0xffd7ff, 0.65);
        this.gfxGame.strokeCircle(x, y, radius * 0.28);
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
        if (sides < 3) {
            return;
        }

        this.gfxGame.lineStyle(strokeWidth, strokeColor, alpha);
        this.gfxGame.fillStyle(fillColor, alpha);
        this.gfxGame.beginPath();

        for (let i = 0; i < sides; i++) {
            const angle = rotation + (i * Math.PI * 2) / sides;
            const px = x + Math.cos(angle) * radius;
            const py = y + Math.sin(angle) * radius;
            if (i === 0) {
                this.gfxGame.moveTo(px, py);
            } else {
                this.gfxGame.lineTo(px, py);
            }
        }

        this.gfxGame.closePath();
        this.gfxGame.fillPath();
        this.gfxGame.strokePath();
    }

    private getEnemyBodyColor(enemyType?: EnemyType): number {
        if (!enemyType) {
            return COLORS.ENEMY;
        }

        return this.enemyColorByType[enemyType] ?? COLORS.ENEMY;
    }

    private drawEnemyBarrel(x: number, y: number, radius: number, angle: number, retraction: number): void {
        const barrelMetrics = this.getBarrelMetrics(radius, retraction);
        const bx = x + Math.cos(angle) * barrelMetrics.offset;
        const by = y + Math.sin(angle) * barrelMetrics.offset;

        this.gfxGame.fillStyle(COLORS.PLAYER_BARREL);
        this.gfxGame.lineStyle(2, COLORS.BARREL_OUTLINE, 1);
        this.gfxGame.save();
        this.gfxGame.translateCanvas(bx, by);
        this.gfxGame.rotateCanvas(angle);
        this.gfxGame.fillRect(0, -barrelMetrics.width / 2, barrelMetrics.length, barrelMetrics.width);
        this.gfxGame.strokeRect(0, -barrelMetrics.width / 2, barrelMetrics.length, barrelMetrics.width);
        this.gfxGame.restore();
    }

    /**
     * Helper: desenha círculo com outline (player, enemy, bullet)
     */
    private drawCircle(
        x: number,
        y: number,
        radius: number,
        fillColor: number,
        strokeWidth: number = 2
    ): void {
        const outlineColor = darkenColor(fillColor, 40);
        this.gfxGame.lineStyle(strokeWidth, outlineColor, 1);
        this.gfxGame.fillStyle(fillColor);
        this.gfxGame.beginPath();
        this.gfxGame.arc(x, y, radius, 0, Math.PI * 2);
        this.gfxGame.fillPath();
        this.gfxGame.strokePath();
    }

    /**
     * Helper: desenha triângulo com outline
     */
    private drawTriangle(
        x: number,
        y: number,
        radius: number,
        rotation: number,
        fillColor: number,
        strokeWidth: number = 2
    ): void {
        const outlineColor = darkenColor(fillColor, 40);
        this.gfxGame.lineStyle(strokeWidth, outlineColor, 1);
        this.gfxGame.fillStyle(fillColor);
        this.gfxGame.save();
        this.gfxGame.translateCanvas(x, y);
        this.gfxGame.rotateCanvas(rotation);
        this.gfxGame.beginPath();
        this.gfxGame.moveTo(0, -radius);
        this.gfxGame.lineTo(-radius * 0.866, radius * 0.5); // cos(30°) ≈ 0.866
        this.gfxGame.lineTo(radius * 0.866, radius * 0.5);
        this.gfxGame.closePath();
        this.gfxGame.fillPath();
        this.gfxGame.strokePath();
        this.gfxGame.restore();
    }

    /**
     * Helper: desenha cano do player
     */
    private drawPlayerBarrel(radius: number, angle: number, retraction: number) {
        const barrelMetrics = this.getBarrelMetrics(radius, retraction);
        const bx = Math.cos(angle) * barrelMetrics.offset;
        const by = Math.sin(angle) * barrelMetrics.offset;

        this.gfxPlayer.fillStyle(COLORS.PLAYER_BARREL);
        this.gfxPlayer.lineStyle(2, COLORS.BARREL_OUTLINE, 1);
        this.gfxPlayer.save();
        this.gfxPlayer.translateCanvas(bx, by);
        this.gfxPlayer.rotateCanvas(angle);
        this.gfxPlayer.fillRect(0, -barrelMetrics.width / 2, barrelMetrics.length, barrelMetrics.width);
        this.gfxPlayer.strokeRect(0, -barrelMetrics.width / 2, barrelMetrics.length, barrelMetrics.width);
        this.gfxPlayer.restore();
    }

    private drawPlayerBody(radius: number, color: number): void {
        this.gfxPlayer.lineStyle(VISUAL.STROKE.player, darkenColor(color, 40), 1);
        this.gfxPlayer.fillStyle(color);
        this.gfxPlayer.beginPath();
        this.gfxPlayer.arc(0, 0, radius, 0, Math.PI * 2);
        this.gfxPlayer.fillPath();
        this.gfxPlayer.strokePath();
    }

    private getBarrelMetrics(radius: number, retraction: number = 0): { length: number; width: number; offset: number } {
        const baseLength = radius * VISUAL.PLAYER.barrelLengthFactor;
        const baseOffset = radius * VISUAL.PLAYER.barrelOffsetFactor;
        const clampedRetraction = Phaser.Math.Clamp(retraction, 0, radius * 0.62);

        return {
            length: Math.max(radius * 0.44, baseLength - clampedRetraction),
            width: radius * VISUAL.PLAYER.barrelWidthFactor,
            offset: Math.max(radius * 0.08, baseOffset - (clampedRetraction * 0.45))
        };
    }

    private ensurePlayerNameText(): Phaser.GameObjects.Text {
        if (this.playerNameText) {
            return this.playerNameText;
        }

        this.playerNameText = this.scene.add.text(0, 0, '', {
            fontFamily: 'Trebuchet MS, sans-serif',
            fontSize: '16px',
            color: '#ffffff',
            stroke: '#0d1736',
            strokeThickness: 4
        });
        this.playerNameText.setOrigin(0.5, 1);
        this.playerNameText.setDepth(10);

        return this.playerNameText;
    }

    private updatePlayerName(player: GameState['player']): void {
        if (player.isDead || !player.name) {
            this.hidePlayerName();
            return;
        }

        const playerNameText = this.ensurePlayerNameText();
        playerNameText.setText(player.name);
        playerNameText.setPosition(player.x, player.y - player.radius - 18);
        playerNameText.setVisible(this.isInCameraView(player.x, player.y, player.radius, 150));
    }

    private hidePlayerName(): void {
        if (!this.playerNameText) {
            return;
        }

        this.playerNameText.setVisible(false);
    }

    private getMinimapMetrics(): { size: number; padding: number } {
        const h = this.scene.scale.displaySize.height;
        if (h <= 900) return { size: 148, padding: 18 };
        if (h <= 1120) return { size: 168, padding: 22 };
        return { size: 192, padding: 28 };
    }

    private drawMinimap(playerX: number, playerY: number): void {
        const metrics = this.getMinimapMetrics();
        const x = this.camera.width - metrics.size - metrics.padding;
        const y = this.camera.height - metrics.size - metrics.padding;

        this.gfxHud.fillStyle(this.minimapBackground, 0.65);
        this.gfxHud.fillRoundedRect(x - 6, y - 6, metrics.size + 12, metrics.size + 12, 8);

        this.gfxHud.fillStyle(0x10183a, 0.95);
        this.gfxHud.fillRect(x, y, metrics.size, metrics.size);

        this.gfxHud.lineStyle(2, this.minimapBorder, 1);
        this.gfxHud.strokeRect(x, y, metrics.size, metrics.size);

        const mapX = Phaser.Math.Clamp(playerX, 0, ARENA.width);
        const mapY = Phaser.Math.Clamp(playerY, 0, ARENA.height);
        const dotX = x + (mapX / ARENA.width) * metrics.size;
        const dotY = y + (mapY / ARENA.height) * metrics.size;

        this.gfxHud.fillStyle(this.minimapPlayerDot, 1);
        this.gfxHud.fillCircle(dotX, dotY, 4);
    }

    private isInCameraView(x: number, y: number, radius: number, padding = 0): boolean {
        const worldView = this.camera.worldView;
        return (
            x + radius + padding >= worldView.left &&
            x - radius - padding <= worldView.right &&
            y + radius + padding >= worldView.top &&
            y - radius - padding <= worldView.bottom
        );
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
    setCursorWorldPoint(x: number, y: number): void {
        this.cursorWorldPoint = new Phaser.Geom.Point(x, y);
    }

    public playFiringRecoil(shooterId: string, recoilStrength: number, isPlayer: boolean): void {
        const retractionDistance = Phaser.Math.Clamp(recoilStrength, 2, 16);

        if (isPlayer) {
            if (this.playerRecoilTween) {
                this.playerRecoilTween.stop();
                this.playerRecoilTween = null;
            }

            this.playerBarrelRetraction.value = retractionDistance;

            this.playerRecoilTween = this.scene.tweens.add({
                targets: this.playerBarrelRetraction,
                value: 0,
                duration: 132,
                ease: 'Cubic.easeOut',
                onComplete: () => {
                    this.playerRecoilTween = null;
                }
            });
            return;
        }

        const state = this.enemyBarrelRetractions.get(shooterId) ?? { value: 0 };
        state.value = retractionDistance;
        this.enemyBarrelRetractions.set(shooterId, state);

        const existingTween = this.enemyRecoilTweens.get(shooterId);
        if (existingTween) {
            existingTween.stop();
            this.enemyRecoilTweens.delete(shooterId);
        }

        const tween = this.scene.tweens.add({
            targets: state,
            value: 0,
            duration: 138,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                this.enemyRecoilTweens.delete(shooterId);
            }
        });

        this.enemyRecoilTweens.set(shooterId, tween);
    }

    private pruneEnemyBarrelRetraction(activeEntityIds: Set<string>): void {
        for (const enemyId of this.enemyBarrelRetractions.keys()) {
            if (activeEntityIds.has(enemyId)) {
                continue;
            }

            this.enemyBarrelRetractions.delete(enemyId);
            const tween = this.enemyRecoilTweens.get(enemyId);
            if (tween) {
                tween.stop();
                this.enemyRecoilTweens.delete(enemyId);
            }
        }
    }

    public playTeleportFlash(x: number, y: number): void {
        this.particleManager.playTeleportFlash(x, y);
    }

    public playDashGhostTrail(x: number, y: number, radius: number): void {
        this.particleManager.playDashGhostTrail(x, y, radius);
    }

    public destroy(): void {
        if (this.playerRecoilTween) {
            this.playerRecoilTween.stop();
            this.playerRecoilTween = null;
        }

        for (const tween of this.enemyRecoilTweens.values()) {
            tween.stop();
        }

        this.enemyRecoilTweens.clear();
    this.enemyBarrelRetractions.clear();
        this.entitySnapshots.clear();
        this.healthBarRenderer.pruneWorldHealthBars(new Set<string>());

        if (!this.playerNameText) {
            return;
        }

        this.playerNameText.destroy();
        this.playerNameText = null;
    }

    public drawBossWorld(arenaX: number, arenaY: number, arenaWidth: number, arenaHeight: number): void {
    this.gfxWorld.clear();

    const abyssPadding = 400;
    const abyssColor   = 0x050810;
    const floorColor   = 0x0d1520;
    const edgeColor    = 0x0a1018;
    const edgeSize     = 150;

    // Fundo externo
    this.gfxWorld.fillStyle(abyssColor);
    this.gfxWorld.fillRect(
        arenaX - abyssPadding, arenaY - abyssPadding,
        arenaWidth + abyssPadding * 2, arenaHeight + abyssPadding * 2
    );

    // Piso da arena do boss
    this.gfxWorld.fillStyle(floorColor);
    this.gfxWorld.fillRect(arenaX, arenaY, arenaWidth, arenaHeight);

    // Sombra nas bordas
    this.gfxWorld.fillStyle(edgeColor, 0.6);
    this.gfxWorld.fillRect(arenaX, arenaY, arenaWidth, edgeSize);
    this.gfxWorld.fillRect(arenaX, arenaY + arenaHeight - edgeSize, arenaWidth, edgeSize);
    this.gfxWorld.fillRect(arenaX, arenaY + edgeSize, edgeSize, arenaHeight - edgeSize * 2);
    this.gfxWorld.fillRect(arenaX + arenaWidth - edgeSize, arenaY + edgeSize, edgeSize, arenaHeight - edgeSize * 2);

    // Grid prateado
    const STEP = VISUAL.GRID_STEP;
    this.gfxWorld.lineStyle(VISUAL.STROKE.gridLine, 0x8899bb, 0.5);
    for (let x = arenaX; x <= arenaX + arenaWidth; x += STEP) {
        this.gfxWorld.beginPath();
        this.gfxWorld.moveTo(x, arenaY);
        this.gfxWorld.lineTo(x, arenaY + arenaHeight);
        this.gfxWorld.strokePath();
    }
    for (let y = arenaY; y <= arenaY + arenaHeight; y += STEP) {
        this.gfxWorld.beginPath();
        this.gfxWorld.moveTo(arenaX, y);
        this.gfxWorld.lineTo(arenaX + arenaWidth, y);
        this.gfxWorld.strokePath();
    }

    // Linhas diagonais — efeito espelho/reflexo
    this.gfxWorld.lineStyle(0.5, 0xaabbdd, 0.18);
    const diagStep = STEP * 2;
    for (let d = 0; d <= arenaWidth + arenaHeight; d += diagStep) {
        const x1 = arenaX + Math.min(d, arenaWidth);
        const y1 = arenaY + Math.max(0, d - arenaWidth);
        const x2 = arenaX + Math.max(0, d - arenaHeight);
        const y2 = arenaY + Math.min(d, arenaHeight);
        this.gfxWorld.beginPath();
        this.gfxWorld.moveTo(x1, y1);
        this.gfxWorld.lineTo(x2, y2);
        this.gfxWorld.strokePath();
    }

    // Borda brilhante
    this.gfxWorld.lineStyle(3, 0xccddff, 1);
    this.gfxWorld.strokeRect(arenaX, arenaY, arenaWidth, arenaHeight);
}
}
