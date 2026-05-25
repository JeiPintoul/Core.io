import Phaser from 'phaser';
import { PLAYER_IDS, type GameState, type InputState, type PlayerId, type RunConfiguration } from '../../shared/Types';
import { emitGameEvent, GameEvents, onGameEvent } from '../../shared/EventBus';
import { DEFAULT_RUN_CONFIGURATION } from '../../logic/constants/GameBalance';

const GAMEPAD_MOVE_DEADZONE = 0.28;
const GAMEPAD_AIM_DEADZONE = 0.2;
const GAMEPAD_AIM_DISTANCE = 340;
const KEYBOARD_AIM_DISTANCE = 320;
const DEFAULT_LEFT_STICK_AXES: readonly [number, number] = [0, 1];
const DEFAULT_RIGHT_STICK_AXES: readonly [number, number] = [2, 3];
const RIGHT_STICK_AXIS_CANDIDATES: ReadonlyArray<readonly [number, number]> = [
    [2, 3],
    [2, 5],
    [3, 4],
    [4, 5],
    [5, 4],
    [3, 2],
];

type StickState = { x: number; y: number };
type ToggleLatch = { leftBumper: boolean; rightBumper: boolean };

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
        i: Phaser.Input.Keyboard.Key;
        j: Phaser.Input.Keyboard.Key;
        k: Phaser.Input.Keyboard.Key;
        l: Phaser.Input.Keyboard.Key;
        u: Phaser.Input.Keyboard.Key;
        o: Phaser.Input.Keyboard.Key;
        enter: Phaser.Input.Keyboard.Key;
        shift: Phaser.Input.Keyboard.Key;
    };

    private isEnabled = false;
    private runConfiguration: RunConfiguration = { ...DEFAULT_RUN_CONFIGURATION };
    private readonly autoFireEnabledByPlayer: Record<PlayerId, boolean> = { player_1: false, player_2: false, player_3: false, player_4: false };
    private readonly autoSpinEnabledByPlayer: Record<PlayerId, boolean> = { player_1: false, player_2: false, player_3: false, player_4: false };
    private readonly aimByPlayer: Record<PlayerId, StickState> = {
        player_1: { x: 1, y: 0 },
        player_2: { x: 1, y: 0 },
        player_3: { x: 1, y: 0 },
        player_4: { x: 1, y: 0 },
    };
    private readonly gamepadToggleLatchByPlayer: Record<PlayerId, ToggleLatch> = {
        player_1: { leftBumper: false, rightBumper: false },
        player_2: { leftBumper: false, rightBumper: false },
        player_3: { leftBumper: false, rightBumper: false },
        player_4: { leftBumper: false, rightBumper: false },
    };
    private readonly preferredGamepadIndexByPlayer = new Map<PlayerId, number>();
    private readonly rightStickAxesByGamepadIndex = new Map<number, readonly [number, number]>();
    private readonly axisNeutralByGamepadIndex = new Map<number, number[]>();
    private unsubscribeRunConfiguration: (() => void) | null = null;

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
            i: kb.addKey(Phaser.Input.Keyboard.KeyCodes.I),
            j: kb.addKey(Phaser.Input.Keyboard.KeyCodes.J),
            k: kb.addKey(Phaser.Input.Keyboard.KeyCodes.K),
            l: kb.addKey(Phaser.Input.Keyboard.KeyCodes.L),
            u: kb.addKey(Phaser.Input.Keyboard.KeyCodes.U),
            o: kb.addKey(Phaser.Input.Keyboard.KeyCodes.O),
            enter: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
            shift: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
        };

        this.keys.e.on('down', () => this.toggleAutoFire('player_1'));
        this.keys.c.on('down', () => this.toggleAutoSpin('player_1'));
        this.keys.u.on('down', () => this.toggleAutoFire('player_2'));
        this.keys.o.on('down', () => this.toggleAutoSpin('player_2'));

        this.unsubscribeRunConfiguration = onGameEvent(GameEvents.RUN_CONFIG_CHANGED, (config) => {
            this.runConfiguration = { ...config };
            this.resetInputModes();
        });
    }

    handleInput(state: GameState | null): void {
        if (!this.isEnabled) {
            return;
        }

        const activePlayerIds = this.getActivePlayerIds();

        const connectedGamepads = this.getConnectedGamepads();
        const gamepadByPlayer = this.resolveGamepadAssignment(activePlayerIds, connectedGamepads);

        for (const playerId of activePlayerIds) {
            const usesKeyboard = this.usesKeyboard(playerId);
            const assignedGamepad = gamepadByPlayer.get(playerId) ?? null;

            let input: InputState;
            if (usesKeyboard) {
                input = this.buildKeyboardInput(playerId, state);
            } else if (assignedGamepad) {
                input = this.buildGamepadInput(playerId, state, assignedGamepad);
            } else {
                input = this.createNeutralInput(state, playerId);
            }

            emitGameEvent(GameEvents.PLAYER_INPUT, { playerId, input });
        }
    }

    public disable(): void {
        if (!this.isEnabled) {
            return;
        }

        this.isEnabled = false;
        this.resetInputModes();

        for (const playerId of PLAYER_IDS) {
            emitGameEvent(GameEvents.PLAYER_INPUT, {
                playerId,
                input: this.createNeutralInput(null, playerId),
            });
        }
    }

    public enable(): void {
        this.isEnabled = true;
    }

    public destroy(): void {
        if (this.unsubscribeRunConfiguration) {
            this.unsubscribeRunConfiguration();
            this.unsubscribeRunConfiguration = null;
        }
    }

    private resetInputModes(): void {
        for (const playerId of PLAYER_IDS) {
            this.autoFireEnabledByPlayer[playerId] = false;
            this.autoSpinEnabledByPlayer[playerId] = false;
            this.gamepadToggleLatchByPlayer[playerId] = { leftBumper: false, rightBumper: false };
            this.aimByPlayer[playerId] = { x: 1, y: 0 };
        }

        this.rightStickAxesByGamepadIndex.clear();
        this.axisNeutralByGamepadIndex.clear();
        this.preferredGamepadIndexByPlayer.clear();
    }

    private getActivePlayerIds(): PlayerId[] {
        return PLAYER_IDS.slice(0, this.runConfiguration.playerCount) as PlayerId[];
    }

    private usesKeyboard(playerId: PlayerId): boolean {
        if (playerId !== 'player_1' && playerId !== 'player_2') {
            return false;
        }

        if (!this.getActivePlayerIds().includes(playerId)) {
            return false;
        }

        return this.runConfiguration.players[playerId].control === 'KEYBOARD';
    }

    private usesGamepad(playerId: PlayerId): boolean {
        if (!this.getActivePlayerIds().includes(playerId)) {
            return false;
        }

        return this.runConfiguration.players[playerId].control === 'GAMEPAD';
    }

    private toggleAutoFire(playerId: PlayerId): void {
        if (!this.isEnabled || !this.usesKeyboard(playerId)) {
            return;
        }

        this.autoFireEnabledByPlayer[playerId] = !this.autoFireEnabledByPlayer[playerId];
        emitGameEvent(GameEvents.AUTO_FIRE_TOGGLED, { enabled: this.autoFireEnabledByPlayer[playerId] });
    }

    private toggleAutoSpin(playerId: PlayerId): void {
        if (!this.isEnabled || !this.usesKeyboard(playerId)) {
            return;
        }

        this.autoSpinEnabledByPlayer[playerId] = !this.autoSpinEnabledByPlayer[playerId];
        emitGameEvent(GameEvents.AUTO_SPIN_TOGGLED, { enabled: this.autoSpinEnabledByPlayer[playerId] });
    }

    private buildKeyboardInput(playerId: PlayerId, state: GameState | null): InputState {
        const k = this.keys;
        const p2KeyboardActive = this.runConfiguration.playerCount >= 2 && this.runConfiguration.players.player_2.control === 'KEYBOARD';
        const allowArrowKeysForP1 = !p2KeyboardActive;

        if (playerId === 'player_1') {
            const worldPoint = this.camera.getWorldPoint(
                this.scene.input.activePointer.x,
                this.scene.input.activePointer.y
            );

            return {
                up: k.w.isDown || (allowArrowKeysForP1 && k.up.isDown),
                down: k.s.isDown || (allowArrowKeysForP1 && k.down.isDown),
                left: k.a.isDown || (allowArrowKeysForP1 && k.left.isDown),
                right: k.d.isDown || (allowArrowKeysForP1 && k.right.isDown),
                targetX: worldPoint.x,
                targetY: worldPoint.y,
                isShooting: this.scene.input.activePointer.isDown,
                autoFire: this.autoFireEnabledByPlayer.player_1,
                autoSpin: this.autoSpinEnabledByPlayer.player_1,
            };
        }

        if (playerId !== 'player_2') {
            return this.createNeutralInput(state, playerId);
        }

        const aimX = (k.l.isDown ? 1 : 0) + (k.j.isDown ? -1 : 0);
        const aimY = (k.k.isDown ? 1 : 0) + (k.i.isDown ? -1 : 0);
        this.updateAimVector('player_2', aimX, aimY);

        const playerPosition = this.getPlayerWorldPosition(state, 'player_2');
        return {
            up: k.up.isDown,
            down: k.down.isDown,
            left: k.left.isDown,
            right: k.right.isDown,
            targetX: playerPosition.x + (this.aimByPlayer.player_2.x * KEYBOARD_AIM_DISTANCE),
            targetY: playerPosition.y + (this.aimByPlayer.player_2.y * KEYBOARD_AIM_DISTANCE),
            isShooting: k.enter.isDown || k.shift.isDown,
            autoFire: this.autoFireEnabledByPlayer.player_2,
            autoSpin: this.autoSpinEnabledByPlayer.player_2,
        };
    }

    private buildGamepadInput(playerId: PlayerId, state: GameState | null, gamepad: Gamepad): InputState {
        const leftStick = this.applyRadialDeadzone(
            this.readStickAxes(gamepad, DEFAULT_LEFT_STICK_AXES),
            GAMEPAD_MOVE_DEADZONE
        );
        const rightStick = this.applyRadialDeadzone(
            this.readRightStickAxes(gamepad),
            GAMEPAD_AIM_DEADZONE
        );

        this.updateAimVector(playerId, rightStick.x, rightStick.y);
        this.updateGamepadToggles(playerId, gamepad);

        const playerPosition = this.getPlayerWorldPosition(state, playerId);
        const aim = this.aimByPlayer[playerId];
        const shootPressed = this.isGamepadButtonPressed(gamepad.buttons[7]) || this.isGamepadButtonPressed(gamepad.buttons[0]);
        const moveActivationThreshold = 0.12;

        return {
            up: leftStick.y < -moveActivationThreshold,
            down: leftStick.y > moveActivationThreshold,
            left: leftStick.x < -moveActivationThreshold,
            right: leftStick.x > moveActivationThreshold,
            targetX: playerPosition.x + (aim.x * GAMEPAD_AIM_DISTANCE),
            targetY: playerPosition.y + (aim.y * GAMEPAD_AIM_DISTANCE),
            isShooting: shootPressed,
            autoFire: this.autoFireEnabledByPlayer[playerId],
            autoSpin: this.autoSpinEnabledByPlayer[playerId],
        };
    }

    private createNeutralInput(state: GameState | null, playerId: PlayerId): InputState {
        const pos = this.getPlayerWorldPosition(state, playerId);
        return {
            up: false,
            down: false,
            left: false,
            right: false,
            targetX: pos.x,
            targetY: pos.y,
            isShooting: false,
            autoFire: false,
            autoSpin: false,
        };
    }

    private getPlayerWorldPosition(state: GameState | null, playerId: PlayerId): { x: number; y: number } {
        if (state?.players?.length) {
            const player = state.players.find((candidate) => candidate.id === playerId);
            if (player) {
                return { x: player.x, y: player.y };
            }
        }

        if (state?.player?.id === playerId) {
            return { x: state.player.x, y: state.player.y };
        }

        const center = this.camera.getWorldPoint(this.camera.width / 2, this.camera.height / 2);
        return { x: center.x, y: center.y };
    }

    private readGamepadAxis(value: number | undefined): number {
        if (value === undefined || Number.isNaN(value)) {
            return 0;
        }
        return Math.max(-1, Math.min(1, value));
    }

    private readStickAxes(gamepad: Gamepad, axes: readonly [number, number]): StickState {
        return {
            x: this.readGamepadAxisWithNeutral(gamepad, axes[0]),
            y: this.readGamepadAxisWithNeutral(gamepad, axes[1]),
        };
    }

    private readRightStickAxes(gamepad: Gamepad): StickState {
        const isStandardMapping = gamepad.mapping === 'standard';
        const defaultStick = this.readStickAxes(gamepad, DEFAULT_RIGHT_STICK_AXES);
        const defaultMagnitude = Math.hypot(defaultStick.x, defaultStick.y);

        if (isStandardMapping && defaultMagnitude >= GAMEPAD_AIM_DEADZONE) {
            return defaultStick;
        }

        const cachedPair = this.rightStickAxesByGamepadIndex.get(gamepad.index);
        if (cachedPair) {
            const cachedStick = this.readStickAxes(gamepad, cachedPair);
            if (Math.hypot(cachedStick.x, cachedStick.y) >= GAMEPAD_AIM_DEADZONE) {
                return cachedStick;
            }
        }

        let bestPair: readonly [number, number] = DEFAULT_RIGHT_STICK_AXES;
        let bestStick: StickState = defaultStick;
        let bestMagnitude = defaultMagnitude;

        for (const candidatePair of RIGHT_STICK_AXIS_CANDIDATES) {
            if (candidatePair[0] >= gamepad.axes.length || candidatePair[1] >= gamepad.axes.length) {
                continue;
            }

            if (this.isLikelyTriggerAxis(gamepad, candidatePair[0]) || this.isLikelyTriggerAxis(gamepad, candidatePair[1])) {
                continue;
            }

            const candidateStick = this.readStickAxes(gamepad, candidatePair);
            const candidateMagnitude = Math.hypot(candidateStick.x, candidateStick.y);
            if (candidateMagnitude > bestMagnitude) {
                bestPair = candidatePair;
                bestStick = candidateStick;
                bestMagnitude = candidateMagnitude;
            }
        }

        if (bestMagnitude >= GAMEPAD_AIM_DEADZONE) {
            this.rightStickAxesByGamepadIndex.set(gamepad.index, bestPair);
        }

        return bestStick;
    }

    private readGamepadAxisWithNeutral(gamepad: Gamepad, axisIndex: number): number {
        const rawValue = this.readGamepadAxis(gamepad.axes[axisIndex]);
        const neutralValue = this.getAxisNeutral(gamepad, axisIndex);
        const adjusted = Math.max(-1, Math.min(1, rawValue - neutralValue));
        if (Math.abs(adjusted) <= 0.035) {
            return 0;
        }

        return adjusted;
    }

    private getAxisNeutral(gamepad: Gamepad, axisIndex: number): number {
        const neutralAxes = this.ensureGamepadNeutralAxes(gamepad);
        const currentNeutral = neutralAxes[axisIndex] ?? 0;
        const currentRaw = this.readGamepadAxis(gamepad.axes[axisIndex]);

        // Atualizacao lenta para compensar drift sem perder calibracao base.
        if (Math.abs(currentRaw - currentNeutral) <= 0.12 || Math.abs(currentRaw) <= 0.18) {
            neutralAxes[axisIndex] = (currentNeutral * 0.97) + (currentRaw * 0.03);
        }

        return neutralAxes[axisIndex] ?? 0;
    }

    private ensureGamepadNeutralAxes(gamepad: Gamepad): number[] {
        const cached = this.axisNeutralByGamepadIndex.get(gamepad.index);
        if (cached && cached.length === gamepad.axes.length) {
            return cached;
        }

        const neutralAxes = new Array<number>(gamepad.axes.length);
        for (let i = 0; i < gamepad.axes.length; i++) {
            neutralAxes[i] = this.readGamepadAxis(gamepad.axes[i]);
        }

        this.axisNeutralByGamepadIndex.set(gamepad.index, neutralAxes);
        return neutralAxes;
    }

    private isLikelyTriggerAxis(gamepad: Gamepad, axisIndex: number): boolean {
        const neutral = this.getAxisNeutral(gamepad, axisIndex);
        return Math.abs(neutral) >= 0.45;
    }

    private updateAimVector(playerId: PlayerId, rawX: number, rawY: number): void {
        const magnitude = Math.hypot(rawX, rawY);
        if (magnitude <= 0.0001) {
            return;
        }

        this.aimByPlayer[playerId] = {
            x: rawX / magnitude,
            y: rawY / magnitude,
        };
    }

    private applyRadialDeadzone(stick: StickState, deadzone: number): StickState {
        const magnitude = Math.hypot(stick.x, stick.y);
        if (magnitude <= deadzone) {
            return { x: 0, y: 0 };
        }

        const normalizedMagnitude = (magnitude - deadzone) / (1 - deadzone);
        const scale = normalizedMagnitude / magnitude;
        return {
            x: stick.x * scale,
            y: stick.y * scale,
        };
    }

    private updateGamepadToggles(playerId: PlayerId, gamepad: Gamepad): void {
        const latch = this.gamepadToggleLatchByPlayer[playerId];
        const leftBumperPressed = this.isGamepadButtonPressed(gamepad.buttons[4]);
        const rightBumperPressed = this.isGamepadButtonPressed(gamepad.buttons[5]);

        if (leftBumperPressed && !latch.leftBumper) {
            this.autoFireEnabledByPlayer[playerId] = !this.autoFireEnabledByPlayer[playerId];
            emitGameEvent(GameEvents.AUTO_FIRE_TOGGLED, { enabled: this.autoFireEnabledByPlayer[playerId] });
        }

        if (rightBumperPressed && !latch.rightBumper) {
            this.autoSpinEnabledByPlayer[playerId] = !this.autoSpinEnabledByPlayer[playerId];
            emitGameEvent(GameEvents.AUTO_SPIN_TOGGLED, { enabled: this.autoSpinEnabledByPlayer[playerId] });
        }

        latch.leftBumper = leftBumperPressed;
        latch.rightBumper = rightBumperPressed;
    }

    private isGamepadButtonPressed(button: GamepadButton | undefined): boolean {
        if (!button) {
            return false;
        }
        return button.pressed || button.value > 0.35;
    }

    private getConnectedGamepads(): Gamepad[] {
        if (!('getGamepads' in navigator)) {
            return [];
        }

        const pads = navigator.getGamepads();
        const connected: Gamepad[] = [];
        for (const pad of pads) {
            if (pad && pad.connected) {
                connected.push(pad);
            }
        }
        return connected;
    }

    private resolveGamepadAssignment(playerIds: PlayerId[], connectedGamepads: Gamepad[]): Map<PlayerId, Gamepad> {
        const assignments = new Map<PlayerId, Gamepad>();
        const gamepadPlayers = playerIds.filter((playerId) => this.usesGamepad(playerId));
        const connectedByIndex = [...connectedGamepads].sort((a, b) => a.index - b.index);
        const connectedByIndexMap = new Map<number, Gamepad>();
        const consumedGamepadIndices = new Set<number>();

        for (const gamepad of connectedByIndex) {
            connectedByIndexMap.set(gamepad.index, gamepad);
        }

        for (const playerId of gamepadPlayers) {
            const preferredIndex = this.preferredGamepadIndexByPlayer.get(playerId);
            if (preferredIndex === undefined) {
                continue;
            }

            const preferredGamepad = connectedByIndexMap.get(preferredIndex);
            if (!preferredGamepad || consumedGamepadIndices.has(preferredIndex)) {
                continue;
            }

            assignments.set(playerId, preferredGamepad);
            consumedGamepadIndices.add(preferredIndex);
        }

        const remainingPlayers = gamepadPlayers.filter((playerId) => !assignments.has(playerId));
        const remainingGamepads = connectedByIndex.filter((gamepad) => !consumedGamepadIndices.has(gamepad.index));

        for (let i = 0; i < remainingPlayers.length; i++) {
            const playerId = remainingPlayers[i];
            const gamepad = remainingGamepads[i];
            if (!playerId || !gamepad) {
                continue;
            }

            assignments.set(playerId, gamepad);
            consumedGamepadIndices.add(gamepad.index);
            this.preferredGamepadIndexByPlayer.set(playerId, gamepad.index);
        }

        for (const [playerId, gamepad] of assignments.entries()) {
            this.preferredGamepadIndexByPlayer.set(playerId, gamepad.index);
        }

        for (const playerId of PLAYER_IDS) {
            if (!gamepadPlayers.includes(playerId)) {
                this.preferredGamepadIndexByPlayer.delete(playerId);
            }
        }

        return assignments;
    }
}
