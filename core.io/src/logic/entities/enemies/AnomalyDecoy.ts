import { HostileEntity, type EnemyUpdateContext } from './HostileEntity';
import type { EnemyType, EntityData, EntityStats } from '../../../shared/Types';
import { calculateCooldown, PLAYER_BASE_SHOT_COOLDOWN_SECONDS } from '../../../shared/CombatMath';

export class AnomalyDecoy extends HostileEntity {
    public readonly enemyType: EnemyType = 'ANOMALY_DECOY';
    public readonly stats: EntityStats;
    public aimAngle = 0;
    public damage = 0;

    private lastShotAtMs = 0;

    constructor(
        id: string,
        x: number,
        y: number,
        private readonly orbitSlot: number,
        private readonly orbitTotal: number,
        private readonly orbitRadius: number
    ) {
        const stats: EntityStats = {
            maxHealth: 1,
            healthRegen: 0,
            bodyDamage: 0,
            bulletSpeed: 430,
            bulletPenetration: 1,
            bulletDamage: 0,
            reloadPoints: 0,
            movementSpeed: 0
        };

        super(id, x, y, stats.maxHealth, stats.maxHealth, stats.movementSpeed);
        this.stats = stats;
        this.xpDrop = 0;
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
