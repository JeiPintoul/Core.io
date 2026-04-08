import Phaser from 'phaser';
import type { InputState } from '../../shared/Types';
import { eventBus, GameEvents } from '../../shared/EventBus';

export class InputHandler {
    private keys: {
        up: Phaser.Input.Keyboard.Key;
        down: Phaser.Input.Keyboard.Key;
        left: Phaser.Input.Keyboard.Key;
        right: Phaser.Input.Keyboard.Key;
        w: Phaser.Input.Keyboard.Key;
        s: Phaser.Input.Keyboard.Key;
        a: Phaser.Input.Keyboard.Key;
        d: Phaser.Input.Keyboard.Key;
    };

    constructor(
        private scene: Phaser.Scene,
        private camera: Phaser.Cameras.Scene2D.Camera
    ) {
        const kb = this.scene.input.keyboard!;
        this.keys = {
            up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
            down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
            left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
            right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
            w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            s: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        };
    }

    /**
     * Captura input do teclado e mouse, converte para coordenadas mundiais,
     * e emite evento para a GameEngine processar
     */
    handleInput(): void {
        const k = this.keys;

        const movingUp = k.up.isDown || k.w.isDown;
        const movingDown = k.down.isDown || k.s.isDown;
        const movingLeft = k.left.isDown || k.a.isDown;
        const movingRight = k.right.isDown || k.d.isDown;
        const isShooting = this.scene.input.activePointer.isDown;

        // Converter coordenadas da tela → coordenadas globais
        const worldPoint = this.camera.getWorldPoint(
            this.scene.input.activePointer.x,
            this.scene.input.activePointer.y
        );

        const input: InputState = {
            up: movingUp,
            down: movingDown,
            left: movingLeft,
            right: movingRight,
            targetX: worldPoint.x,
            targetY: worldPoint.y,
            isShooting,
        };

        eventBus.emit(GameEvents.PLAYER_INPUT, input);
    }
}
