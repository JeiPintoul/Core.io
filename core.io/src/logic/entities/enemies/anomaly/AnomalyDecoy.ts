import { HostileEntity, type EnemyUpdateContext } from '../HostileEntity';
import type { EnemyType, EntityData, EntityStats, PlayerId } from '../../../../shared/Types';
import { calculateCooldown, PLAYER_BASE_SHOT_COOLDOWN_SECONDS } from '../../../../shared/CombatMath';

export class AnomalyDecoy extends HostileEntity {
    public readonly enemyType: EnemyType = 'ANOMALY_DECOY';
    public readonly stats: EntityStats;
    public aimAngle = 0;
    public damage = 0;
    public readonly ownerAnomalyId: string | null;
    public readonly assignedPlayerId: PlayerId | null;

    private lastShotAtMs = 0;

    constructor(
        id: string,
        x: number,
        y: number,
        private readonly orbitSlot: number,
        private readonly orbitTotal: number,
        private readonly orbitRadius: number,
        ownerAnomalyId: string | null = null,
        assignedPlayerId: PlayerId | null = null,
        mirrorStats: EntityStats | null = null
    ) {
        // Mirror the real anomaly's reload + bullet trajectory so the decoy fires at
        // the same cadence and projectile speed. Otherwise late-game reload upgrades
        // make the real one fire noticeably faster, breaking the trick.
        const stats: EntityStats = {
            maxHealth: 1,
            healthRegen: 0,
            bodyDamage: 0,
            bulletSpeed: mirrorStats?.bulletSpeed ?? 430,
            bulletPenetration: mirrorStats?.bulletPenetration ?? 1,
            bulletDamage: 0,
            reloadPoints: mirrorStats?.reloadPoints ?? 0,
            movementSpeed: 0
        };

        super(id, x, y, stats.maxHealth, stats.maxHealth, stats.movementSpeed);
        this.stats = stats;
        this.xpDrop = 0;
        this.ownerAnomalyId = ownerAnomalyId;
        this.assignedPlayerId = assignedPlayerId;
        this.setBarrels([{
            id: 'anomaly_decoy_front_barrel',
            offsetX: 34,
            offsetY: 0,
            angleOffset: 0,
            recoilForce: 0,
            damageMultiplier: 1,
            speedMultiplier: 1,
            lifespanMultiplier: 1
        }]);
    }

    public override toData(): EntityData {
        return { ...super.toData(), aimAngle: this.aimAngle };
    }

    public tick(context: EnemyUpdateContext): void {
        // Context.player is resolved by GameEngine to the assigned player (or nearest as fallback),
        // so positioning stays consistent across coop.
        const angle = (this.orbitSlot / this.orbitTotal) * Math.PI * 2;
        this.x = context.player.x + Math.cos(angle) * this.orbitRadius;
        this.y = context.player.y + Math.sin(angle) * this.orbitRadius;
        this.aimAngle = Math.atan2(context.player.y - this.y, context.player.x - this.x);

        const reloadMs = calculateCooldown(PLAYER_BASE_SHOT_COOLDOWN_SECONDS, this.stats.reloadPoints) * 1000;
        if (context.currentTime - this.lastShotAtMs < reloadMs) return;

        this.lastShotAtMs = context.currentTime;
        context.onShoot(this.aimAngle);
    }

    public override updatePhysics(dt: number): void {
        void dt;
        this.knockbackVelocity = { x: 0, y: 0 };
    }
}
