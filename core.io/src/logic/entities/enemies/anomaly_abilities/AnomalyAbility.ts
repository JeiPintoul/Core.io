import type { Anomaly } from '../Anomaly';
import type { Player } from '../../player/Player';

export interface AnomalyAbility {
    readonly name: string;
    execute(anomaly: Anomaly, player: Player, dt: number, currentTimeMs: number): void;
}
