import type { AnomalyAbility } from './AnomalyAbility';
import type { Anomaly } from '../Anomaly';
import type { Player } from '../../player/Player';
import { emitGameEvent, GameEvents } from '../../../../shared/EventBus';

export class TeleportAbility implements AnomalyAbility {
    public readonly name = 'Teleport';

    private readonly cooldownMs = 6000;
    private readonly offsetRadius = 160;
    private lastUsedMs = -Infinity;

    execute(anomaly: Anomaly, player: Player, _dt: number, currentTimeMs: number): void {
        if (currentTimeMs - this.lastUsedMs < this.cooldownMs) return;
        this.lastUsedMs = currentTimeMs;

        const angle = Math.random() * Math.PI * 2;
        anomaly.x = player.x + Math.cos(angle) * this.offsetRadius;
        anomaly.y = player.y + Math.sin(angle) * this.offsetRadius;
        anomaly.knockbackVelocity.x = 0;
        anomaly.knockbackVelocity.y = 0;

        emitGameEvent(GameEvents.ANOMALY_TELEPORT, { id: anomaly.id, x: anomaly.x, y: anomaly.y });
    }
}
