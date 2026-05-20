import type { Anomaly } from '../Anomaly';
import type { Player } from '../../../player/Player';
import type { EnemyType } from '../../../../../shared/Types';

export interface AnomalyAbilityResult {
    readonly skipBaseBehavior?: boolean;
}

export interface AnomalyAbility {
    readonly name: string;
    readonly priority?: number;
    execute(anomaly: Anomaly, player: Player, dt: number, currentTimeMs: number): AnomalyAbilityResult | void;
    onOwnerHit?(currentTimeMs: number): EnemyType[];
    suppressesPhysics?(): boolean;
}
