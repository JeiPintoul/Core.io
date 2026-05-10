import type { AnomalyAbility } from './AnomalyAbility';
import type { Anomaly } from '../Anomaly';
import type { Player } from '../../player/Player';
import { emitGameEvent, GameEvents } from '../../../../shared/EventBus';

const DASH_VISUAL_DURATION_MS = 600;

export class DashAbility implements AnomalyAbility {
    public readonly name = 'Dash';

    private readonly cooldownMs = 4500;
    private readonly impulse = 900;
    private lastUsedMs = -Infinity;

    execute(anomaly: Anomaly, player: Player, _dt: number, currentTimeMs: number): void {
        if (currentTimeMs - this.lastUsedMs < this.cooldownMs) return;
        this.lastUsedMs = currentTimeMs;

        const dx = player.x - anomaly.x;
        const dy = player.y - anomaly.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.0001) return;

        anomaly.applyImpulse((dx / dist) * this.impulse, (dy / dist) * this.impulse);

        emitGameEvent(GameEvents.ANOMALY_DASH, {
            id: anomaly.id,
            x: anomaly.x,
            y: anomaly.y,
            durationMs: DASH_VISUAL_DURATION_MS
        });
    }
}
