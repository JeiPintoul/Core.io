import type { AnomalyAbility } from './AnomalyAbility';
import type { Anomaly } from '../Anomaly';
import type { Player } from '../../../player/Player';
import { emitGameEvent, GameEvents } from '../../../../../shared/EventBus';

const BASE_COOLDOWN_MS = 4500;
const LOW_HEALTH_RATIO = 0.5;
const PLAYER_PULL_CHANCE = 0.28;
const PLAYER_PULL_DISTANCE = 180;
const CHAIN_CHANCE = 0.4;
const CHAIN_DELAY_MS = 320;
const OFFSET_MIN = 130;
const OFFSET_MAX = 260;

export class TeleportAbility implements AnomalyAbility {
    public readonly name = 'Teleport';

    private nextTeleportAtMs = 0;
    private chainsRemaining = 0;

    execute(anomaly: Anomaly, player: Player, _dt: number, currentTimeMs: number): void {
        // Swarm locks the anomaly to an orbit slot; teleporting on top of that would
        // produce a visual flash + immediate snap-back. Hold the ability until swarm ends.
        if (anomaly.isPhysicsSuppressed()) return;
        if (currentTimeMs < this.nextTeleportAtMs) return;

        const lowHealth = (anomaly.health / Math.max(1, anomaly.maxHealth)) <= LOW_HEALTH_RATIO;

        if (lowHealth && Math.random() < PLAYER_PULL_CHANCE) {
            this.yankPlayerCloser(anomaly, player);
        } else {
            this.warpAnomaly(anomaly, player);
        }

        if (this.chainsRemaining > 0) {
            this.chainsRemaining -= 1;
            this.nextTeleportAtMs = currentTimeMs + CHAIN_DELAY_MS;
            return;
        }

        const erraticness = lowHealth ? 0.75 : 0.45;
        const cooldown = BASE_COOLDOWN_MS * (0.55 + Math.random() * erraticness);
        this.nextTeleportAtMs = currentTimeMs + cooldown;

        if (lowHealth && Math.random() < CHAIN_CHANCE) {
            this.chainsRemaining = 1;
            this.nextTeleportAtMs = currentTimeMs + CHAIN_DELAY_MS;
        }
    }

    private warpAnomaly(anomaly: Anomaly, player: Player): void {
        const angle = Math.random() * Math.PI * 2;
        const radius = OFFSET_MIN + Math.random() * (OFFSET_MAX - OFFSET_MIN);
        anomaly.x = player.x + Math.cos(angle) * radius;
        anomaly.y = player.y + Math.sin(angle) * radius;
        anomaly.knockbackVelocity.x = 0;
        anomaly.knockbackVelocity.y = 0;

        anomaly.notifyRepositioned();
        emitGameEvent(GameEvents.ANOMALY_TELEPORT, { id: anomaly.id, x: anomaly.x, y: anomaly.y });
    }

    private yankPlayerCloser(anomaly: Anomaly, player: Player): void {
        const dx = anomaly.x - player.x;
        const dy = anomaly.y - player.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.0001) return;

        const pull = Math.min(PLAYER_PULL_DISTANCE, Math.max(0, dist - 80));
        const nx = dx / dist;
        const ny = dy / dist;
        player.x += nx * pull;
        player.y += ny * pull;
        player.knockbackVelocity.x = 0;
        player.knockbackVelocity.y = 0;

        emitGameEvent(GameEvents.ANOMALY_TELEPORT, { id: player.id, x: player.x, y: player.y });
    }
}
