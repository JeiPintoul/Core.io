import type { AnomalyAbility, AnomalyAbilityResult } from './AnomalyAbility';
import type { Anomaly } from '../Anomaly';
import type { Player } from '../../../player/Player';

const MIN_DECOYS = 3;
const MAX_TOTAL_SLOTS = 11; // real + up to 10 decoys
const INITIAL_COOLDOWN_MS = 5000;
const COOLDOWN_MS = 15000;
const ORBIT_RADIUS = 260;

export class SwarmAbility implements AnomalyAbility {
    public readonly name = 'Swarm';
    public readonly priority = 100;

    private isActive = false;
    private cooldownUntilMs = 0;
    private hasStartedCooldown = false;
    private trueSlot = 0;
    private totalSlots = 0;

    execute(anomaly: Anomaly, player: Player, _dt: number, currentTimeMs: number): AnomalyAbilityResult | void {
        if (!this.hasStartedCooldown) {
            this.hasStartedCooldown = true;
            this.cooldownUntilMs = currentTimeMs + INITIAL_COOLDOWN_MS;
        }

        if (this.isActive) {
            this.snapAnomalyToSlot(anomaly, player);
            return { skipBaseBehavior: true };
        }

        if (currentTimeMs < this.cooldownUntilMs) return;

        // Scales with the anomaly's spawn count for that run, regardless of which abilities
        // were rolled previously. spawnCount=1 → 3 decoys, spawnCount=2 → 4, etc.
        const decoyCount = Math.min(MAX_TOTAL_SLOTS - 1, MIN_DECOYS + Math.max(0, anomaly.spawnCount - 1));
        this.start(anomaly, player, decoyCount);
        this.snapAnomalyToSlot(anomaly, player);
        return { skipBaseBehavior: true };
    }

    public onOwnerHit(anomaly: Anomaly, currentTimeMs: number): void {
        if (!this.isActive) return;

        this.isActive = false;
        this.totalSlots = 0;
        this.cooldownUntilMs = currentTimeMs + COOLDOWN_MS;
        anomaly.clearOwnedDecoysRequested = true;
    }

    public onOwnerRepositioned(): void {
        // When dash/teleport fires while swarm is active, shuffle the real slot so
        // the player has to re-identify the true anomaly among the decoys.
        if (!this.isActive || this.totalSlots <= 1) return;
        this.trueSlot = Math.floor(Math.random() * this.totalSlots);
    }

    public suppressesPhysics(): boolean {
        return this.isActive;
    }

    private start(anomaly: Anomaly, player: Player, decoyCount: number): void {
        this.isActive = true;
        this.totalSlots = decoyCount + 1;
        this.trueSlot = Math.floor(Math.random() * this.totalSlots);

        for (let slot = 0; slot < this.totalSlots; slot++) {
            if (slot === this.trueSlot) continue;

            const { x, y } = this.getOrbitPosition(player, slot, this.totalSlots);
            anomaly.pendingSpawns.push({
                enemyType: 'ANOMALY_DECOY',
                x,
                y,
                orbitSlot: slot,
                orbitTotal: this.totalSlots,
                orbitRadius: ORBIT_RADIUS,
                ownerEnemyId: anomaly.id,
                assignedPlayerId: anomaly.assignedPlayerId ?? undefined,
                mirrorStats: anomaly.stats
            });
        }
    }

    private snapAnomalyToSlot(anomaly: Anomaly, player: Player): void {
        const { x, y } = this.getOrbitPosition(player, this.trueSlot, this.totalSlots);
        anomaly.x = x;
        anomaly.y = y;
        anomaly.knockbackVelocity = { x: 0, y: 0 };
        anomaly.aimAngle = Math.atan2(player.y - anomaly.y, player.x - anomaly.x);
    }

    private getOrbitPosition(player: Player, slot: number, total: number): { x: number; y: number } {
        const angle = (slot / Math.max(1, total)) * Math.PI * 2;
        return {
            x: player.x + Math.cos(angle) * ORBIT_RADIUS,
            y: player.y + Math.sin(angle) * ORBIT_RADIUS
        };
    }
}
