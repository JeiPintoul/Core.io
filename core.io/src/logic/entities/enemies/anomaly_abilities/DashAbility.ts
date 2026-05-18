import type { AnomalyAbility } from './AnomalyAbility';
import type { Anomaly } from '../Anomaly';
import type { Player } from '../../player/Player';
import { emitGameEvent, GameEvents } from '../../../../shared/EventBus';

const DASH_VISUAL_DURATION_MS = 600;

export class DashAbility implements AnomalyAbility {
    public readonly name = 'Dash';

    private readonly cooldownMs = 3800;
    private readonly impulse = 1650;
    private lastUsedMs = -Infinity;

    execute(anomaly: Anomaly, player: Player, _dt: number, currentTimeMs: number): void {
        if (currentTimeMs - this.lastUsedMs < this.cooldownMs) return;
        this.lastUsedMs = currentTimeMs;

        const dx = player.x - anomaly.x;
        const dy = player.y - anomaly.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.0001) return;

        const forwardX = dx / dist;
        const forwardY = dy / dist;
        const side = Math.random() < 0.35 ? (Math.random() < 0.5 ? -1 : 1) : 0;
        const sideStrength = side === 0 ? 0 : 0.45;
        const targetX = (forwardX * 1.35) + (-forwardY * side * sideStrength);
        const targetY = (forwardY * 1.35) + (forwardX * side * sideStrength);
        const targetMagnitude = Math.hypot(targetX, targetY);

        anomaly.applyImpulse((targetX / targetMagnitude) * this.impulse, (targetY / targetMagnitude) * this.impulse);

        emitGameEvent(GameEvents.ANOMALY_DASH, {
            id: anomaly.id,
            x: anomaly.x,
            y: anomaly.y,
            durationMs: DASH_VISUAL_DURATION_MS
        });
    }
}
