import type { AnomalyAbility } from './AnomalyAbility';
import type { Anomaly } from '../Anomaly';
import type { Player } from '../../player/Player';

const CLONE_COUNT = 4;
const SPAWN_RADIUS = 90;

export class SwarmAbility implements AnomalyAbility {
    public readonly name = 'Swarm';

    private readonly cooldownMs = 9000;
    private lastUsedMs = -Infinity;

    execute(anomaly: Anomaly, _player: Player, _dt: number, currentTimeMs: number): void {
        if (currentTimeMs - this.lastUsedMs < this.cooldownMs) return;
        this.lastUsedMs = currentTimeMs;

        for (let i = 0; i < CLONE_COUNT; i++) {
            const angle = (i / CLONE_COUNT) * Math.PI * 2;
            anomaly.pendingSpawns.push({
                type: 'KAMIKAZE',
                x: anomaly.x + Math.cos(angle) * SPAWN_RADIUS,
                y: anomaly.y + Math.sin(angle) * SPAWN_RADIUS
            });
        }
    }
}
