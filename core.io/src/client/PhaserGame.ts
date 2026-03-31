import Phaser from 'phaser';
import { eventBus, GameEvents } from '../shared/EventBus';
import type { GameState, InputState } from '../shared/Types';

// ─────────────────────────────────────────────
//  CONSTANTES DE VISUAL
// ─────────────────────────────────────────────
const COLORS = {
    PLAYER:          0x4488ff,
    PLAYER_BARREL:   0x2266cc,
    PLAYER_OUTLINE:  0xffffff,

    ENEMY:           0xff4444,
    ENEMY_OUTLINE:   0xaa0000,

    BULLET:          0xffee44,
    BULLET_OUTLINE:  0xcc9900,

    HEALTH_BG:       0x330000,
    HEALTH_BAR:      0x44ff44,
    HEALTH_LOW:      0xff4444,

    ARENA_BG:        0x1a1a2e,
    GRID_LINE:       0x2a2a4a,
    ARENA_BORDER:    0x3a3a6a,
};

const ARENA = { width: 2000, height: 2000 };

// ─────────────────────────────────────────────
//  GAME SCENE
// ─────────────────────────────────────────────
class GameScene extends Phaser.Scene {

    // Objetos gráficos reutilizáveis (limpos a cada frame)
    private gfxWorld!:  Phaser.GameObjects.Graphics; // grid + arena
    private gfxGame!:   Phaser.GameObjects.Graphics; // entidades + projéteis
    private gfxHud!:    Phaser.GameObjects.Graphics; // barras de HP fixas na câmera

    // Controles de teclado
    private keys!: {
        up:    Phaser.Input.Keyboard.Key;
        down:  Phaser.Input.Keyboard.Key;
        left:  Phaser.Input.Keyboard.Key;
        right: Phaser.Input.Keyboard.Key;
        w:     Phaser.Input.Keyboard.Key;
        s:     Phaser.Input.Keyboard.Key;
        a:     Phaser.Input.Keyboard.Key;
        d:     Phaser.Input.Keyboard.Key;
    };

    // Estado mais recente recebido da GameEngine
    private latestState: GameState | null = null;

    constructor() {
        super({ key: 'GameScene' });
    }

    // ── Phaser lifecycle ──────────────────────

    create() {
        // Câmera: limites da arena e zoom inicial
        this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height);
        this.cameras.main.setZoom(1);

        // Ordem de criação define z-order (mundo → entidades → HUD)
        this.gfxWorld = this.add.graphics();
        this.gfxGame  = this.add.graphics();

        // HUD fica fora do scroll da câmera
        this.gfxHud = this.add.graphics();
        this.gfxHud.setScrollFactor(0); // fixo na tela

        // Teclas de movimento
        const kb = this.input.keyboard!;
        this.keys = {
            up:    kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
            down:  kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
            left:  kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
            right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
            w:     kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            s:     kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            a:     kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            d:     kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        };

        // Ouvir o estado da lógica
        eventBus.on(GameEvents.STATE_UPDATE, (state: GameState) => {
            this.latestState = state;
        });

        // Desenhar o fundo e grid uma única vez (estático)
        this.drawStaticWorld();
    }

    update() {
        if (!this.latestState) return;

        const state = this.latestState;

        // 1. Atualizar câmera para seguir o player
        this.cameras.main.centerOn(state.player.x, state.player.y);

        // 2. Capturar input e enviar para a GameEngine
        this.emitInput(state);

        // 3. Renderizar o frame
        this.renderFrame(state);
    }

    // ── Input ─────────────────────────────────

    private emitInput(state: GameState) {
        const k = this.keys;

        const movingUp    = k.up.isDown    || k.w.isDown;
        const movingDown  = k.down.isDown  || k.s.isDown;
        const movingLeft  = k.left.isDown  || k.a.isDown;
        const movingRight = k.right.isDown || k.d.isDown;
        const isShooting  = this.input.activePointer.isDown;

        // Converter coordenadas da tela → coordenadas globais da arena
        const worldPoint = this.cameras.main.getWorldPoint(
            this.input.activePointer.x,
            this.input.activePointer.y
        );

        const input: InputState = {
            up:        movingUp,
            down:      movingDown,
            left:      movingLeft,
            right:     movingRight,
            targetX:   worldPoint.x,
            targetY:   worldPoint.y,
            isShooting,
        };

        eventBus.emit(GameEvents.PLAYER_INPUT, input);
    }

    // ── Render ────────────────────────────────

    private renderFrame(state: GameState) {
        this.gfxGame.clear();
        this.gfxHud.clear();

        this.drawProjectiles(state);
        this.drawEnemies(state);
        this.drawPlayer(state);
        this.drawHud(state);
    }

    // Fundo e grid — desenhado apenas no create() pois é estático
    private drawStaticWorld() {
        this.gfxWorld.clear();

        // Fundo da arena
        this.gfxWorld.fillStyle(COLORS.ARENA_BG);
        this.gfxWorld.fillRect(0, 0, ARENA.width, ARENA.height);

        // Grid de 100 em 100px
        const STEP = 100;
        this.gfxWorld.lineStyle(0.5, COLORS.GRID_LINE, 0.6);

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

        // Borda da arena
        this.gfxWorld.lineStyle(3, COLORS.ARENA_BORDER, 1);
        this.gfxWorld.strokeRect(0, 0, ARENA.width, ARENA.height);
    }

    private drawPlayer(state: GameState) {
        const { x, y, radius, stats, health } = state.player;

        // Calcular ângulo do cano em direção ao cursor
        const worldPoint = this.cameras.main.getWorldPoint(
            this.input.activePointer.x,
            this.input.activePointer.y
        );
        const angle = Math.atan2(worldPoint.y - y, worldPoint.x - x);

        // Cano (retângulo apontando pro cursor)
        const barrelLen   = radius * 1.6;
        const barrelWidth = radius * 0.55;
        const bx = x + Math.cos(angle) * (radius * 0.4);
        const by = y + Math.sin(angle) * (radius * 0.4);

        this.gfxGame.fillStyle(COLORS.PLAYER_BARREL);
        this.gfxGame.save();
        this.gfxGame.translateCanvas(bx, by);
        this.gfxGame.rotateCanvas(angle);
        this.gfxGame.fillRect(0, -barrelWidth / 2, barrelLen, barrelWidth);
        this.gfxGame.restore();

        // Corpo (círculo)
        this.gfxGame.lineStyle(2, COLORS.PLAYER_OUTLINE, 1);
        this.gfxGame.fillStyle(COLORS.PLAYER);
        this.gfxGame.beginPath();
        this.gfxGame.arc(x, y, radius, 0, Math.PI * 2);
        this.gfxGame.fillPath();
        this.gfxGame.strokePath();

        // Barra de HP acima do player (no espaço do mundo)
        this.drawWorldHealthBar(x, y - radius - 12, radius * 2, health, stats.maxHealth);
    }

    private drawEnemies(state: GameState) {
        for (const enemy of state.enemies) {
            const { x, y, radius, health, stats } = enemy;

            this.gfxGame.lineStyle(2, COLORS.ENEMY_OUTLINE, 1);
            this.gfxGame.fillStyle(COLORS.ENEMY);
            this.gfxGame.beginPath();
            this.gfxGame.arc(x, y, radius, 0, Math.PI * 2);
            this.gfxGame.fillPath();
            this.gfxGame.strokePath();

            // Barra de HP do inimigo
            this.drawWorldHealthBar(x, y - radius - 10, radius * 2, health, stats.maxHealth);
        }
    }

    private drawProjectiles(state: GameState) {
        for (const proj of state.projectiles) {
            this.gfxGame.lineStyle(1, COLORS.BULLET_OUTLINE, 1);
            this.gfxGame.fillStyle(COLORS.BULLET);
            this.gfxGame.beginPath();
            this.gfxGame.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
            this.gfxGame.fillPath();
            this.gfxGame.strokePath();
        }
    }

    // Barra de HP desenhada no espaço do mundo (acompanha a entidade)
    private drawWorldHealthBar(
        cx: number,
        y: number,
        width: number,
        health: number,
        maxHealth: number
    ) {
        const ratio    = Math.max(0, health / maxHealth);
        const barColor = ratio > 0.4 ? COLORS.HEALTH_BAR : COLORS.HEALTH_LOW;
        const halfW    = width / 2;
        const height   = 4;

        this.gfxGame.fillStyle(COLORS.HEALTH_BG);
        this.gfxGame.fillRect(cx - halfW, y, width, height);

        this.gfxGame.fillStyle(barColor);
        this.gfxGame.fillRect(cx - halfW, y, width * ratio, height);
    }

    // HUD fixo na tela: barra de HP grande do player (canto inferior)
    private drawHud(state: GameState) {
        const { health, stats } = state.player;
        const ratio   = Math.max(0, health / stats.maxHealth);
        const barW    = 220;
        const barH    = 14;
        const x       = 20;
        const y       = this.scale.height - 40;
        const barColor = ratio > 0.4 ? COLORS.HEALTH_BAR : COLORS.HEALTH_LOW;

        // Fundo escuro
        this.gfxHud.fillStyle(0x000000, 0.6);
        this.gfxHud.fillRoundedRect(x - 6, y - 6, barW + 12, barH + 12, 4);

        // Trilha vazia
        this.gfxHud.fillStyle(COLORS.HEALTH_BG);
        this.gfxHud.fillRect(x, y, barW, barH);

        // Preenchimento
        this.gfxHud.fillStyle(barColor);
        this.gfxHud.fillRect(x, y, barW * ratio, barH);

        // Borda
        this.gfxHud.lineStyle(1, 0xffffff, 0.3);
        this.gfxHud.strokeRect(x, y, barW, barH);
    }
}

// ─────────────────────────────────────────────
//  INICIALIZADOR DO PHASER
// ─────────────────────────────────────────────
export function createPhaserGame(): Phaser.Game {
    const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,           // WebGL com fallback para Canvas
        parent: 'game-container',    // div do index.html
        width:  window.innerWidth,
        height: window.innerHeight,
        backgroundColor: '#1a1a2e',
        scene: [GameScene],
        scale: {
            mode:         Phaser.Scale.RESIZE,  // responsivo ao redimensionar janela
            autoCenter:   Phaser.Scale.CENTER_BOTH,
        },
        render: {
            antialias:     true,
            pixelArt:      false,
        },
    };

    return new Phaser.Game(config);
}