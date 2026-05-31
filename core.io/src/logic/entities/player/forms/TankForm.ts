import type { BarrelConfig, TankFireMode, TankFormId } from '../../../../shared/Types';

export interface TankForm {
    id: TankFormId;
    name: string;
    description: string;
    fireMode: TankFireMode;
    barrels: BarrelConfig[];
}
