import { HostileEntity, type EnemyUpdateContext } from './HostileEntity';
import type { EnemyType, EntityData, EntityStats } from '../../../shared/Types';
import type { Player } from '../player/Player';

type MagnetarPhase = 'CHARGING' | 'RELEASING';

/**
 * Gravity-well bruiser. Cycles between two phases:
 *   CHARGING  - slowly drifts in and applies a continuous inward pull on the targeted
 *               player (quadratic falloff inside `pullRadius`).
 *   RELEASING - locks in place and fires a single outward impulse, opening a brief
 *               burst window for the player to retaliate.
 * Carries no bullets; its threat is purely positional + heavy contact damage.
 */
export class BruteEnemy extends HostileEntity {
    public readonly enemyType: EnemyType = 'BRUTE';
    public readonly stats: EntityStats;
    public aimAngle = 0;
    public damage: number;
    public phase: MagnetarPhase = 'CHARGING';

    static readonly BASE_XP_DROP = 90;

    static readonly BASE_STATS: EntityStats = {
        maxHealth: 220,
        healthRegen: 0.4,
        bodyDamage: 18,
        bulletSpeed: 0,
        bulletPenetration: 0,
        bulletDamage: 0,
        reloadPoints: 0,
        movementSpeed: 52
    };

    private readonly pullRadius = 760;
    private readonly pullStrengthAtCenter = 520;
    // Release shockwave shares the pull radius — anyone caught in the well's reach
    // gets blasted, with knockback + damage scaling by proximity to the core.
    private readonly releaseImpulse = 1100;
    private readonly chargeDurationMs = 2400;
    private readonly releaseDurationMs = 520;
    private readonly approachDistance = 220;
    private readonly releaseDamageMax: number;
    private readonly releaseDamageMin: number;

    private phaseStartedAtMs = 0;
    private phaseEndsAtMs = 0;
    private releaseFiredThisPhase = false;

    constructor(id: string, x: number, y: number, multiplier = 1) {
        const stats: EntityStats = {
            maxHealth: BruteEnemy.BASE_STATS.maxHealth * multiplier,
            healthRegen: BruteEnemy.BASE_STATS.healthRegen * multiplier,
            bodyDamage: BruteEnemy.BASE_STATS.bodyDamage * multiplier,
            bulletSpeed: 0,
            bulletPenetration: 0,
            bulletDamage: 0,
            reloadPoints: BruteEnemy.BASE_STATS.reloadPoints,
            movementSpeed: BruteEnemy.BASE_STATS.movementSpeed * multiplier
        };

        super(id, x, y, stats.maxHealth, stats.maxHealth, stats.movementSpeed, 36);
        this.stats = stats;
        this.damage = stats.bodyDamage;
        this.xpDrop = Math.round(BruteEnemy.BASE_XP_DROP * multiplier);
        this.releaseDamageMax = 16 * multiplier;
        this.releaseDamageMin = 4 * multiplier;
    }

    public override toData(): EntityData {
        const total = this.phase === 'CHARGING' ? this.chargeDurationMs : this.releaseDurationMs;
        const elapsed = this.phaseEndsAtMs - this.phaseStartedAtMs > 0
            ? Math.min(1, Math.max(0, 1 - ((this.phaseEndsAtMs - performance.now()) / total)))
            : 0;
        return {
            ...super.toData(),
            aimAngle: this.aimAngle,
            magnetarPhase: this.phase,
            magnetarPhaseProgress: elapsed,
        };
    }

    public tick(context: EnemyUpdateContext): void {
        const { player, dt, currentTime } = context;

        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 0.0001) this.aimAngle = Math.atan2(dy, dx);

        if (this.phaseEndsAtMs === 0) this.enterPhase('CHARGING', currentTime);
        if (currentTime >= this.phaseEndsAtMs) {
            this.enterPhase(this.phase === 'CHARGING' ? 'RELEASING' : 'CHARGING', currentTime);
        }

        if (this.phase === 'CHARGING') {
            this.tickCharging(player, dx, dy, distance, dt);
        } else {
            this.tickReleasing(player, dx, dy, distance);
        }
    }

    private enterPhase(phase: MagnetarPhase, currentTimeMs: number): void {
        this.phase = phase;
        this.phaseStartedAtMs = currentTimeMs;
        this.phaseEndsAtMs = currentTimeMs + (phase === 'CHARGING' ? this.chargeDurationMs : this.releaseDurationMs);
        this.releaseFiredThisPhase = false;
    }

    private tickCharging(player: Player, dx: number, dy: number, distance: number, dt: number): void {
        if (distance > this.approachDistance && distance > 0.0001) {
            this.x += (dx / distance) * this.speed * dt;
            this.y += (dy / distance) * this.speed * dt;
        }

        if (distance >= this.pullRadius || distance < 0.0001) return;

        // Quadratic falloff: punishing at the core, escapable from the rim.
        const falloff = 1 - (distance / this.pullRadius);
        const pull = this.pullStrengthAtCenter * falloff * falloff * dt;
        const inwardX = -dx / distance;
        const inwardY = -dy / distance;
        player.applyImpulse(inwardX * pull, inwardY * pull);
    }

    private tickReleasing(player: Player, dx: number, dy: number, distance: number): void {
        // Single outward burst + shockwave damage at phase entry; the magnetar then
        // stands still until the phase ends, giving the player a clean window to shoot it.
        if (this.releaseFiredThisPhase) return;
        this.releaseFiredThisPhase = true;

        if (distance >= this.pullRadius || distance < 0.0001) return;

        const falloff = 1 - (distance / this.pullRadius);
        const outwardX = dx / distance;
        const outwardY = dy / distance;

        const blast = this.releaseImpulse * (0.5 + 0.5 * falloff);
        player.applyImpulse(outwardX * blast, outwardY * blast);

        const damage = this.releaseDamageMin + (this.releaseDamageMax - this.releaseDamageMin) * falloff;
        if (damage > 0) player.takeDamage(damage);
    }
}
