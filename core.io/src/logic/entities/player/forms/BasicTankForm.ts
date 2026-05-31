import type { TankForm } from './TankForm';

export const BasicTankForm: TankForm = {
    id: 'basic',
    name: 'Basic',
    description: 'Tanque inicial com canhao frontal unico.',
    fireMode: 'ALL',
    barrels: [
        {
            id: 'basic_front_barrel',
            offsetX: 34,
            offsetY: 0,
            angleOffset: 0,
            recoilForce: 20,
            damageMultiplier: 1,
            speedMultiplier: 1,
            lifespanMultiplier: 1
        }
    ]
};
