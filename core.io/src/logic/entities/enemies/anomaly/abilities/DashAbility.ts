import type { AnomalyAbility } from './AnomalyAbility';
import type { Anomaly } from '../Anomaly';
import type { Player } from '../../../player/Player';
import { emitGameEvent, GameEvents } from '../../../../../shared/EventBus';

type DashKind = 'through' | 'flank' | 'random';

const DASH_VISUAL_DURATION_MS = 600;
const DASH_ACTIVE_DURATION_MS = 520;
const DASH_DAMAGE_BOOST = 2.6;
const COOLDOWN_MS = 3500;
const LOW_HEALTH_RATIO = 0.5;
const SECOND_DASH_DELAY_MS = 240;
const LONG_RANGE_THRESHOLD = 320;

export class DashAbility implements AnomalyAbility {
    public readonly name = 'Dash';

    private nextDashReadyAtMs = 0;
    private dashActiveUntilMs = 0;
    private pendingFollowUpAtMs = 0;
    private hasFollowUpQueued = false;

    execute(anomaly: Anomaly, player: Player, _dt: number, currentTimeMs: number): void {
        // Swarm pins the anomaly to its orbit slot every tick; firing a dash here would
        // produce a one-frame jitter as the impulse gets clobbered. Hold off until swarm ends.
        if (anomaly.isPhysicsSuppressed()) return;

        if (currentTimeMs < this.dashActiveUntilMs) {
            anomaly.damageBoostMultiplier *= DASH_DAMAGE_BOOST;
        }

        if (this.hasFollowUpQueued && currentTimeMs >= this.pendingFollowUpAtMs) {
            this.hasFollowUpQueued = false;
            this.fireDash(anomaly, player, currentTimeMs, 'through');
            this.nextDashReadyAtMs = currentTimeMs + COOLDOWN_MS;
            return;
        }

        if (currentTimeMs < this.nextDashReadyAtMs) return;

        const kind = this.pickDashKind(anomaly, player);
        this.fireDash(anomaly, player, currentTimeMs, kind);

        const lowHealth = (anomaly.health / Math.max(1, anomaly.maxHealth)) <= LOW_HEALTH_RATIO;
        if (lowHealth) {
            this.hasFollowUpQueued = true;
            this.pendingFollowUpAtMs = currentTimeMs + SECOND_DASH_DELAY_MS;
            this.nextDashReadyAtMs = Infinity; // gated by follow-up completion
        } else {
            this.nextDashReadyAtMs = currentTimeMs + COOLDOWN_MS;
        }
    }

    private pickDashKind(anomaly: Anomaly, player: Player): DashKind {
        const dist = Math.hypot(player.x - anomaly.x, player.y - anomaly.y);
        if (dist > LONG_RANGE_THRESHOLD) return 'through';

        const roll = Math.random();
        if (roll < 0.45) return 'through';
        if (roll < 0.85) return 'flank';
        return 'random';
    }

    private fireDash(anomaly: Anomaly, player: Player, currentTimeMs: number, kind: DashKind): void {
        const dx = player.x - anomaly.x;
        const dy = player.y - anomaly.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.0001) return;

        const fwdX = dx / dist;
        const fwdY = dy / dist;

        let dirX: number;
        let dirY: number;
        let travel: number;

        if (kind === 'flank') {
            const side = Math.random() < 0.5 ? -1 : 1;
            const blend = 0.55;
            dirX = (-fwdY * side) * (1 - blend) + fwdX * blend;
            dirY = (fwdX * side) * (1 - blend) + fwdY * blend;
            travel = Math.max(220, dist * 0.9);
        } else if (kind === 'random') {
            const a = Math.random() * Math.PI * 2;
            dirX = Math.cos(a);
            dirY = Math.sin(a);
            travel = 260 + Math.random() * 160;
        } else {
            dirX = fwdX;
            dirY = fwdY;
            travel = dist + 140; // overshoot the player
        }

        const length = Math.hypot(dirX, dirY) || 1;
        dirX /= length;
        dirY /= length;

        // Calibrated against Entity knockback damping (~0.86 per 60Hz frame):
        // an impulse ~6.5x the desired travel distance settles near that distance.
        const impulse = Math.max(900, Math.min(3600, travel * 6.5));
        anomaly.applyImpulse(dirX * impulse, dirY * impulse);

        this.dashActiveUntilMs = currentTimeMs + DASH_ACTIVE_DURATION_MS;
        anomaly.damageBoostMultiplier *= DASH_DAMAGE_BOOST;
        anomaly.notifyRepositioned();

        emitGameEvent(GameEvents.ANOMALY_DASH, {
            id: anomaly.id,
            x: anomaly.x,
            y: anomaly.y,
            durationMs: DASH_VISUAL_DURATION_MS
        });
    }
}
