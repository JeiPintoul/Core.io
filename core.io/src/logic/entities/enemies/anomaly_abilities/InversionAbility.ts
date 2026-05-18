import type { AnomalyAbility } from './AnomalyAbility';
import type { Anomaly } from '../Anomaly';
import type { Player } from '../../player/Player';

export class InversionAbility implements AnomalyAbility {
    public readonly name = 'Inversion';

    execute(anomaly: Anomaly, player: Player, dt: number, currentTimeMs: number): void {
        void player;
        void dt;
        void currentTimeMs;
        anomaly.isInverted = true;
    }
}
