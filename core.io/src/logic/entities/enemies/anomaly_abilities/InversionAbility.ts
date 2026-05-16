import type { AnomalyAbility } from './AnomalyAbility';
import type { Anomaly } from '../Anomaly';
import type { Player } from '../../player/Player';

export class InversionAbility implements AnomalyAbility {
    public readonly name = 'Inversion';

    execute(anomaly: Anomaly, _player: Player, _dt: number, _currentTimeMs: number): void {
        anomaly.isInverted = true;
    }
}
