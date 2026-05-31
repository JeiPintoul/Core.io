import type { TankForm } from './TankForm';

export const TwinTankForm: TankForm = {
    id: 'twin',
    name: 'Twin',
    description: 'Dois canhoes paralelos com disparo alternado.',
    fireMode: 'ALTERNATE',
    barrels: [
        {
            id: 'twin_left_barrel',
            offsetX: 34,
            offsetY: -11,
            angleOffset: 0,
            recoilForce: 18,
            damageMultiplier: 1,
            speedMultiplier: 1,
            lifespanMultiplier: 1
        },
        {
            id: 'twin_right_barrel',
            offsetX: 34,
            offsetY: 11,
            angleOffset: 0,
            recoilForce: 18,
            damageMultiplier: 1,
            speedMultiplier: 1,
            lifespanMultiplier: 1
        }
    ]
};
