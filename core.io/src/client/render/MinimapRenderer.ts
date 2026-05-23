import Phaser from 'phaser';
import type { GameState } from '../../shared/Types';
import { ARENA } from '../constants/GameConstants';

export class MinimapRenderer {
    private readonly background = 0x060b1f;
    private readonly border = 0x9cc8ff;
    private readonly grid = 0x38517c;
    private readonly viewport = 0xd5e9ff;
    private readonly playerDot = 0xffffff;
    private readonly portalDot = 0xd7c3ff;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly camera: Phaser.Cameras.Scene2D.Camera,
        private readonly gfxHud: Phaser.GameObjects.Graphics
    ) {}

    public draw(players: GameState['players'], portal: GameState['bossExitPortal'] = null): void {
        const metrics = this.getMetrics();
        const mapSize = metrics.size;
        const x = this.camera.width - mapSize - metrics.padding;
        const y = this.camera.height - mapSize - metrics.padding;

        this.drawFrame(x, y, mapSize);
        this.drawViewport(x, y, mapSize);
        this.drawPortal(portal, x, y, mapSize);
        this.drawPlayers(players, x, y, mapSize);
    }

    private getMetrics(): { size: number; padding: number } {
        const h = this.scene.scale.displaySize.height;
        if (h <= 900) return { size: 148, padding: 18 };
        if (h <= 1120) return { size: 168, padding: 22 };
        return { size: 192, padding: 28 };
    }

    private drawFrame(x: number, y: number, mapSize: number): void {
        const frameInset = 8;
        const borderWidth = 2;

        this.gfxHud.fillStyle(this.background, 0.8);
        this.gfxHud.fillRoundedRect(x - frameInset, y - frameInset, mapSize + (frameInset * 2), mapSize + (frameInset * 2), 8);
        this.gfxHud.fillStyle(0x0f1b44, 0.98);
        this.gfxHud.fillRoundedRect(x, y, mapSize, mapSize, 5);
        this.gfxHud.lineStyle(borderWidth, this.border, 0.95);
        this.gfxHud.strokeRect(x, y, mapSize, mapSize);
        this.drawGrid(x, y, mapSize);
        this.drawCorners(x, y, mapSize);
    }

    private drawGrid(x: number, y: number, mapSize: number): void {
        this.gfxHud.lineStyle(1, this.grid, 0.42);
        this.gfxHud.beginPath();

        for (let i = 1; i < 4; i++) {
            const split = (mapSize / 4) * i;
            this.gfxHud.moveTo(x + split, y);
            this.gfxHud.lineTo(x + split, y + mapSize);
            this.gfxHud.moveTo(x, y + split);
            this.gfxHud.lineTo(x + mapSize, y + split);
        }

        this.gfxHud.strokePath();
    }

    private drawCorners(x: number, y: number, mapSize: number): void {
        const cornerTick = 16;
        const cornerOffset = 5;
        const corners = [
            { x: x + cornerOffset, y: y + cornerOffset, dx: 1, dy: 1 },
            { x: x + mapSize - cornerOffset, y: y + cornerOffset, dx: -1, dy: 1 },
            { x: x + cornerOffset, y: y + mapSize - cornerOffset, dx: 1, dy: -1 },
            { x: x + mapSize - cornerOffset, y: y + mapSize - cornerOffset, dx: -1, dy: -1 }
        ];

        this.gfxHud.lineStyle(2, this.border, 0.75);
        this.gfxHud.beginPath();

        for (const corner of corners) {
            this.gfxHud.moveTo(corner.x, corner.y);
            this.gfxHud.lineTo(corner.x + (corner.dx * cornerTick), corner.y);
            this.gfxHud.moveTo(corner.x, corner.y);
            this.gfxHud.lineTo(corner.x, corner.y + (corner.dy * cornerTick));
        }

        this.gfxHud.strokePath();
    }

    private drawViewport(x: number, y: number, mapSize: number): void {
        const worldView = this.camera.worldView;
        const viewLeftRatio = Phaser.Math.Clamp(worldView.left / ARENA.width, 0, 1);
        const viewTopRatio = Phaser.Math.Clamp(worldView.top / ARENA.height, 0, 1);
        const viewRightRatio = Phaser.Math.Clamp(worldView.right / ARENA.width, 0, 1);
        const viewBottomRatio = Phaser.Math.Clamp(worldView.bottom / ARENA.height, 0, 1);
        const viewX = x + (viewLeftRatio * mapSize);
        const viewY = y + (viewTopRatio * mapSize);
        const viewWidth = Math.max(10, (viewRightRatio - viewLeftRatio) * mapSize);
        const viewHeight = Math.max(10, (viewBottomRatio - viewTopRatio) * mapSize);

        this.gfxHud.fillStyle(this.viewport, 0.1);
        this.gfxHud.fillRect(viewX, viewY, viewWidth, viewHeight);
        this.gfxHud.lineStyle(1.2, this.viewport, 0.72);
        this.gfxHud.strokeRect(viewX, viewY, viewWidth, viewHeight);
    }

    private drawPlayers(players: GameState['players'], x: number, y: number, mapSize: number): void {
        for (const [index, player] of players.entries()) {
            if (player.isDead) {
                continue;
            }

            const dotX = x + (Phaser.Math.Clamp(player.x, 0, ARENA.width) / ARENA.width) * mapSize;
            const dotY = y + (Phaser.Math.Clamp(player.y, 0, ARENA.height) / ARENA.height) * mapSize;
            const dotRadius = index === 0 ? 4.8 : 4.1;

            this.gfxHud.fillStyle(player.color ?? this.playerDot, 1);
            this.gfxHud.fillCircle(dotX, dotY, dotRadius);
            this.gfxHud.lineStyle(1.1, this.border, 0.76);
            this.gfxHud.strokeCircle(dotX, dotY, dotRadius + 0.8);
        }
    }

    private drawPortal(portal: GameState['bossExitPortal'], x: number, y: number, mapSize: number): void {
        if (!portal) {
            return;
        }

        const dotX = x + (Phaser.Math.Clamp(portal.x, 0, ARENA.width) / ARENA.width) * mapSize;
        const dotY = y + (Phaser.Math.Clamp(portal.y, 0, ARENA.height) / ARENA.height) * mapSize;
        const pulse = 0.5 + Math.sin(this.scene.time.now / 180) * 0.5;

        this.gfxHud.fillStyle(this.portalDot, 0.35 + pulse * 0.25);
        this.gfxHud.fillCircle(dotX, dotY, 6.5);
        this.gfxHud.lineStyle(1.6, 0x8ee8ff, 0.85);
        this.gfxHud.strokeCircle(dotX, dotY, 8.2);
    }
}
