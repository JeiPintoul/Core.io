import type { AnomalyAbility, AnomalyAbilityResult } from './AnomalyAbility';
import type { Anomaly } from '../Anomaly';
import type { Player } from '../../player/Player';
import type { EnemyType } from '../../../../shared/Types';

export class SwarmAbility implements AnomalyAbility {
    public readonly name = 'Swarm';
    public readonly priority = 100;

    private static readonly COOLDOWN_MS = 15000;
    private static readonly ORBIT_RADIUS = 260;

    private isActive = false;
    private cooldownUntilMs = 0;
    private trueSlot = 0;
    private totalSlots = 0;

    execute(anomaly: Anomaly, player: Player, _dt: number, currentTimeMs: number): AnomalyAbilityResult | void {
        if (this.isActive) {
            this.updateAnomalyPosition(anomaly, player);
            return { skipBaseBehavior: true };
        }

        if (currentTimeMs < this.cooldownUntilMs) return;

        const copyCount = Math.min(10, 3 + Math.floor(Math.max(0, anomaly.spawnWave - 5) / 2));
        this.start(anomaly, player, copyCount);
        this.updateAnomalyPosition(anomaly, player);
        return { skipBaseBehavior: true };
    }

    public onOwnerHit(currentTimeMs: number): EnemyType[] {
        if (!this.isActive) return [];

        this.isActive = false;
        this.totalSlots = 0;
        this.cooldownUntilMs = currentTimeMs + SwarmAbility.COOLDOWN_MS;
        return ['ANOMALY_DECOY'];
    }

    public suppressesPhysics(): boolean {
        return this.isActive;
    }

    private start(anomaly: Anomaly, player: Player, copyCount: number): void {
        this.isActive = true;
        this.totalSlots = copyCount + 1;
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
                orbitRadius: SwarmAbility.ORBIT_RADIUS
            });
        }
    }

    private updateAnomalyPosition(anomaly: Anomaly, player: Player): void {
        const { x, y } = this.getOrbitPosition(player, this.trueSlot, this.totalSlots);
        anomaly.x = x;
        anomaly.y = y;
        anomaly.knockbackVelocity = { x: 0, y: 0 };
        anomaly.aimAngle = Math.atan2(player.y - anomaly.y, player.x - anomaly.x);
    }

    private getOrbitPosition(player: Player, slot: number, total: number): { x: number; y: number } {
        const angle = (slot / Math.max(1, total)) * Math.PI * 2;
        return {
            x: player.x + Math.cos(angle) * SwarmAbility.ORBIT_RADIUS,
            y: player.y + Math.sin(angle) * SwarmAbility.ORBIT_RADIUS
        };
    }
}
