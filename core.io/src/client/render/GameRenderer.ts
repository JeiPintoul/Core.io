import Phaser from 'phaser';
import type { GameState, ProjectileFaction } from '../../shared/Types';
import { COLORS, ARENA, DEATH_ANIMATION_DURATION_MS, VISUAL } from '../constants/GameConstants';
import { HealthBarRenderer } from './HealthBarRenderer';

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

    constructor(
        private scene: Phaser.Scene,
        private camera: Phaser.Cameras.Scene2D.Camera,
        private gfxWorld: Phaser.GameObjects.Graphics,
        private gfxGame: Phaser.GameObjects.Graphics,
        private gfxPlayer: Phaser.GameObjects.Graphics,
        private gfxHud: Phaser.GameObjects.Graphics
    ) {
        this.healthBarRenderer = new HealthBarRenderer(scene, gfxGame);
    }

    /**
     * Desenha o estado completo do jogo para um frame
     */
    renderFrame(state: GameState) {
        this.gfxGame.clear();
        this.gfxHud.clear();
        this.currentPlayerId = state.player.id;

        const activeEntityIds = new Set<string>();

        this.drawProjectiles(state);
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

        const ghost = this.scene.add.circle(snapshot.x, snapshot.y, snapshot.radius, snapshot.fillColor, 1);
        ghost.setStrokeStyle(snapshot.strokeWidth, snapshot.outlineColor, 1);

        this.scene.tweens.add({
            targets: ghost,
            y: ghost.y - VISUAL.PLAYER.deathRiseDistance,
            scaleX: 0,
            scaleY: 0,
            alpha: 0,
            duration: DEATH_ANIMATION_DURATION_MS,
            ease: 'Quad.easeOut',
            onComplete: () => {
                ghost.destroy();
            }
        });
    }

    public playProjectileDeathAnimation(x: number, y: number, radius: number, faction: ProjectileFaction): void {
        const isPlayerProjectile = faction === 'player';
        const pulseColor = isPlayerProjectile ? COLORS.PLAYER : COLORS.ENEMY;
        const pulseOutlineColor = this.getDarkenedColor(pulseColor, 42);
        const pulse = this.scene.add.circle(x, y, radius, pulseColor, 1);
        pulse.setStrokeStyle(VISUAL.STROKE.bullet, pulseOutlineColor, 1);

        this.scene.tweens.add({
            targets: pulse,
            scaleX: 0,
            scaleY: 0,
            alpha: 0,
            duration: 150,
            ease: 'Quad.easeOut',
            onComplete: () => {
                pulse.destroy();
            }
        });
    }

    public playFloatingText(x: number, y: number, text: string, color: string): void {
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
            onComplete: () => {
                floatingText.destroy();
            }
        });
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
        const outlineColor = this.getDarkenedColor(fillColor, 40);

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
    drawStaticWorld() {
        this.gfxWorld.clear();

        const abyssPadding = 400;
        const edgeShadeSize = 200;
        const abyssColor = 0x0f0f1a;
        const arenaEdgeShade = 0x11172d;

        // Abyss outside the playable arena.
        this.gfxWorld.fillStyle(abyssColor);
        this.gfxWorld.fillRect(
            -abyssPadding,
            -abyssPadding,
            ARENA.width + (abyssPadding * 2),
            ARENA.height + (abyssPadding * 2)
        );

        // Main playable arena surface.
        this.gfxWorld.fillStyle(COLORS.ARENA_BG);
        this.gfxWorld.fillRect(0, 0, ARENA.width, ARENA.height);

        // Subtle dark shade just inside the arena border to emphasize map edge.
        this.gfxWorld.fillStyle(arenaEdgeShade, 0.5);
        this.gfxWorld.fillRect(0, 0, ARENA.width, edgeShadeSize);
        this.gfxWorld.fillRect(0, ARENA.height - edgeShadeSize, ARENA.width, edgeShadeSize);
        this.gfxWorld.fillRect(0, edgeShadeSize, edgeShadeSize, ARENA.height - (edgeShadeSize * 2));
        this.gfxWorld.fillRect(ARENA.width - edgeShadeSize, edgeShadeSize, edgeShadeSize, ARENA.height - (edgeShadeSize * 2));

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
    private drawPlayer(state: GameState, activeEntityIds: Set<string>) {
        const { x, y, radius, stats, health, isDead } = state.player;

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

        // Barrel angle towards cursor pointer
        const worldPoint = this.getCursorWorldPoint();
        const angle = Math.atan2(worldPoint.y - y, worldPoint.x - x);

        // Draw barrel
        this.drawPlayerBarrel(radius, angle, this.playerBarrelRetraction.value);

        // Draw body
        this.drawPlayerBody(radius);
        this.rememberEntitySnapshot(
            state.player.id,
            x,
            y,
            radius,
            COLORS.PLAYER,
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
        for (const enemy of state.enemies) {
            const { x, y, radius, health, stats, isDead, enemyType, aimAngle } = enemy;

            if (isDead) {
                continue;
            }

            activeEntityIds.add(enemy.id);

            if (!this.isInCameraView(x, y, radius, 80)) {
                continue;
            }

            const barrelRetraction = this.enemyBarrelRetractions.get(enemy.id)?.value ?? 0;

            if (enemyType === 'RANGED' && typeof aimAngle === 'number') {
                this.drawEnemyBarrel(x, y, radius, aimAngle, barrelRetraction);
            }

            this.drawCircle(x, y, radius, COLORS.ENEMY, VISUAL.STROKE.enemy);
            this.rememberEntitySnapshot(
                enemy.id,
                x,
                y,
                radius,
                COLORS.ENEMY,
                VISUAL.STROKE.enemy
            );

            this.healthBarRenderer.drawWorldHealthBar(
                enemy.id,
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
            if (!this.isInCameraView(proj.x, proj.y, proj.radius, 20)) {
                continue;
            }

            const isPlayerProjectile = proj.faction === 'player';
            const fillColor = isPlayerProjectile ? COLORS.PLAYER : COLORS.ENEMY;
            this.drawCircle(proj.x, proj.y, proj.radius, fillColor, VISUAL.STROKE.bullet);
        }
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
        const outlineColor = this.getDarkenedColor(fillColor, 40);
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

    private drawPlayerBody(radius: number): void {
        this.gfxPlayer.lineStyle(VISUAL.STROKE.player, this.getDarkenedColor(COLORS.PLAYER, 40), 1);
        this.gfxPlayer.fillStyle(COLORS.PLAYER);
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

    private getDarkenedColor(color: number, darkenPercent: number): number {
        const clampedPercent = Phaser.Math.Clamp(darkenPercent, 0, 95);
        const factor = (100 - clampedPercent) / 100;
        const red = Math.round(((color >> 16) & 0xff) * factor);
        const green = Math.round(((color >> 8) & 0xff) * factor);
        const blue = Math.round((color & 0xff) * factor);

        return (red << 16) | (green << 8) | blue;
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
        if (this.camera.height <= 1120) {
            return { size: 168, padding: 22 };
        }

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
}
