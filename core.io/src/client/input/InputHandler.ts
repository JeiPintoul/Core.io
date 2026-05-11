import Phaser from 'phaser';
import type { InputState } from '../../shared/Types';
import { emitGameEvent, GameEvents } from '../../shared/EventBus';

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
        e: Phaser.Input.Keyboard.Key;
        c: Phaser.Input.Keyboard.Key;
    };
    private isEnabled = false;
    private autoFireEnabled = false;
    private autoSpinEnabled = false;

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
            e: kb.addKey(Phaser.Input.Keyboard.KeyCodes.E),
            c: kb.addKey(Phaser.Input.Keyboard.KeyCodes.C),
        };

        this.keys.e.on('down', () => {
            if (!this.isEnabled) return;
            this.autoFireEnabled = !this.autoFireEnabled;
            emitGameEvent(GameEvents.AUTO_FIRE_TOGGLED, { enabled: this.autoFireEnabled });
        });
        this.keys.c.on('down', () => {
            if (!this.isEnabled) return;
            this.autoSpinEnabled = !this.autoSpinEnabled;
            emitGameEvent(GameEvents.AUTO_SPIN_TOGGLED, { enabled: this.autoSpinEnabled });
        });
    }

    handleInput(): void {
        if (!this.isEnabled) {
            return;
        }

        const k = this.keys;

        const worldPoint = this.camera.getWorldPoint(
            this.scene.input.activePointer.x,
            this.scene.input.activePointer.y
        );

        const input: InputState = {
            up: k.up.isDown || k.w.isDown,
            down: k.down.isDown || k.s.isDown,
            left: k.left.isDown || k.a.isDown,
            right: k.right.isDown || k.d.isDown,
            targetX: worldPoint.x,
            targetY: worldPoint.y,
            isShooting: this.scene.input.activePointer.isDown,
            autoFire: this.autoFireEnabled,
            autoSpin: this.autoSpinEnabled,
        };

        emitGameEvent(GameEvents.PLAYER_INPUT, input);
    }

    public disable(): void {
        if (!this.isEnabled) {
            return;
        }

        this.isEnabled = false;

        emitGameEvent(GameEvents.PLAYER_INPUT, {
            up: false,
            down: false,
            left: false,
            right: false,
            targetX: this.scene.input.activePointer.worldX,
            targetY: this.scene.input.activePointer.worldY,
            isShooting: false,
            autoFire: false,
            autoSpin: false,
        });
    }

    public enable(): void {
        this.isEnabled = true;
    }
}
