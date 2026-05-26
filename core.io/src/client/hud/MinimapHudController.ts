import { ARENA } from '../constants/GameConstants';
import { GameEvents, onGameEvent } from '../../shared/EventBus';
import type { CameraViewportPayload, GameState } from '../../shared/Types';

const FALLBACK_ACCENT_COLOR = 0x9cc8ff;
const FRAME_FILL = 'rgba(15, 27, 68, 0.98)';
const GRID_STROKE = 'rgba(56, 81, 124, 0.42)';
const PORTAL_FILL = '#d7c3ff';
const PORTAL_STROKE = '#8ee8ff';
const MIN_VIEWPORT_SIZE = 10;

export class MinimapHudController {
    private readonly canvas: HTMLCanvasElement | null;
    private readonly ctx: CanvasRenderingContext2D | null;
    private readonly unsubscribers: Array<() => void> = [];
    private readonly resizeObserver: ResizeObserver | null = null;
    private latestState: GameState | null = null;
    private latestViewport: CameraViewportPayload | null = null;

    constructor() {
        this.canvas = document.getElementById(
            'hud-minimap'
        ) as HTMLCanvasElement | null;
        this.ctx = this.canvas?.getContext('2d') ?? null;

        if (!this.canvas || !this.ctx) return;

        this.unsubscribers.push(
            onGameEvent(GameEvents.STATE_UPDATE, (state) => {
                this.latestState = state;
                this.draw();
            })
        );
        this.unsubscribers.push(
            onGameEvent(GameEvents.CAMERA_VIEWPORT_CHANGED, (viewport) => {
                this.latestViewport = viewport;
                this.draw();
            })
        );

        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => this.draw());
            this.resizeObserver.observe(this.canvas);
        }
    }

    public destroy(): void {
        for (const unsubscribe of this.unsubscribers) unsubscribe();
        this.unsubscribers.length = 0;
        this.resizeObserver?.disconnect();
    }

    private draw(): void {
        const canvas = this.canvas;
        const ctx = this.ctx;
        const state = this.latestState;
        if (!canvas || !ctx || !state) return;

        const rect = canvas.getBoundingClientRect();
        const size = Math.min(rect.width, rect.height);
        if (size <= 0) return;

        this.syncCanvasSize(canvas, ctx, size);

        const players =
            state.players?.length > 0 ? state.players : [state.player];
        const accentColor = this.toCssColor(
            players[0]?.color ?? FALLBACK_ACCENT_COLOR
        );

        ctx.clearRect(0, 0, size, size);
        this.drawFrame(ctx, size, accentColor);
        this.drawViewport(ctx, size, accentColor);
        this.drawPortal(ctx, size, state);
        this.drawPlayers(ctx, players, size, accentColor);
    }

    private syncCanvasSize(
        canvas: HTMLCanvasElement,
        ctx: CanvasRenderingContext2D,
        size: number
    ): void {
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const width = Math.round(size * dpr);
        const height = Math.round(size * dpr);

        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    private drawFrame(
        ctx: CanvasRenderingContext2D,
        size: number,
        accentColor: string
    ): void {
        ctx.fillStyle = FRAME_FILL;
        this.roundRect(ctx, 0, 0, size, size, 5);
        ctx.fill();

        ctx.strokeStyle = accentColor;
        ctx.globalAlpha = 0.95;
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, size, size);
        ctx.globalAlpha = 1;

        ctx.strokeStyle = GRID_STROKE;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < 4; i++) {
            const split = (size / 4) * i;
            ctx.moveTo(split, 0);
            ctx.lineTo(split, size);
            ctx.moveTo(0, split);
            ctx.lineTo(size, split);
        }
        ctx.stroke();

        this.drawCorners(ctx, size, accentColor);
    }

    private drawCorners(
        ctx: CanvasRenderingContext2D,
        size: number,
        accentColor: string
    ): void {
        const tick = 16;
        const offset = 5;
        const corners = [
            { x: offset, y: offset, dx: 1, dy: 1 },
            { x: size - offset, y: offset, dx: -1, dy: 1 },
            { x: offset, y: size - offset, dx: 1, dy: -1 },
            { x: size - offset, y: size - offset, dx: -1, dy: -1 },
        ];

        ctx.strokeStyle = accentColor;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const corner of corners) {
            ctx.moveTo(corner.x, corner.y);
            ctx.lineTo(corner.x + corner.dx * tick, corner.y);
            ctx.moveTo(corner.x, corner.y);
            ctx.lineTo(corner.x, corner.y + corner.dy * tick);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    private drawViewport(
        ctx: CanvasRenderingContext2D,
        size: number,
        accentColor: string
    ): void {
        const viewport = this.latestViewport;
        if (!viewport) return;

        const left = this.toMapX(viewport.left, size);
        const top = this.toMapY(viewport.top, size);
        const right = this.toMapX(viewport.right, size);
        const bottom = this.toMapY(viewport.bottom, size);
        const width = Math.max(MIN_VIEWPORT_SIZE, right - left);
        const height = Math.max(MIN_VIEWPORT_SIZE, bottom - top);

        ctx.fillStyle = accentColor;
        ctx.globalAlpha = 0.1;
        ctx.fillRect(left, top, width, height);
        ctx.globalAlpha = 0.72;
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(left, top, width, height);
        ctx.globalAlpha = 1;
    }

    private drawPlayers(
        ctx: CanvasRenderingContext2D,
        players: GameState['players'],
        size: number,
        accentColor: string
    ): void {
        for (const [index, player] of players.entries()) {
            if (player.isDead) continue;

            const dotX = this.toMapX(player.x, size);
            const dotY = this.toMapY(player.y, size);
            const radius = index === 0 ? 4.8 : 4.1;

            ctx.fillStyle = this.toCssColor(player.color ?? 0xffffff);
            ctx.beginPath();
            ctx.arc(dotX, dotY, radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = accentColor;
            ctx.globalAlpha = 0.76;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.arc(dotX, dotY, radius + 0.8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }

    private drawPortal(
        ctx: CanvasRenderingContext2D,
        size: number,
        state: GameState
    ): void {
        if (!state.bossExitPortal) return;

        const portal = state.bossExitPortal;
        const dotX = this.toMapX(portal.x, size);
        const dotY = this.toMapY(portal.y, size);
        const pulse = 0.5 + Math.sin(performance.now() / 180) * 0.5;

        ctx.fillStyle = PORTAL_FILL;
        ctx.globalAlpha = 0.35 + pulse * 0.25;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 6.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = PORTAL_STROKE;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 8.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    private toMapX(x: number, size: number): number {
        return (this.clamp(x, 0, ARENA.width) / ARENA.width) * size;
    }

    private toMapY(y: number, size: number): number {
        return (this.clamp(y, 0, ARENA.height) / ARENA.height) * size;
    }

    private toCssColor(color: number): string {
        return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }

    private roundRect(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number
    ): void {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(
            x + width,
            y + height,
            x + width - radius,
            y + height
        );
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }
}
