import { emitGameEvent, GameEvents } from '../../../shared/EventBus';
import type { EnemyType, EntityData, EntityStats } from '../../../shared/Types';
import { HostileEntity, type EnemyUpdateContext } from './HostileEntity';

export class TrainingDummyEnemy extends HostileEntity {
    public readonly enemyType: EnemyType = 'BRUTE';
    public readonly stats: EntityStats = {
        maxHealth: 9999,
        healthRegen: 120,
        bodyDamage: 0,
        bulletSpeed: 0,
        bulletPenetration: 0,
        bulletDamage: 0,
        reloadPoints: 0,
        movementSpeed: 0
    };
    public damage = 0;
    public aimAngle = 0;

    constructor(id: string, x: number, y: number) {
        super(id, x, y, 9999, 9999, 0, 44);
        this.xpDrop = 0;
    }

    public tick(context: EnemyUpdateContext): void {
        void context;
        this.health = Math.max(1, this.health);
    }

    public override takeDamage(amount: number): void {
        this.health = Math.max(1, this.health - amount);
        emitGameEvent(GameEvents.ENTITY_DAMAGE, { id: this.id, currentHealth: this.health });
    }

    public override toData(): EntityData {
        return { ...super.toData(), aimAngle: this.aimAngle };
    }
}
