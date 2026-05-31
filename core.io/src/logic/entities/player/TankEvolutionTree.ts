import type { TankEvolutionOption, TankFormId } from '../../../shared/Types';
import type { TankForm } from './forms/TankForm';
import { BasicTankForm } from './forms/BasicTankForm';
import { TwinTankForm } from './forms/TwinTankForm';

interface TankEvolutionDefinition {
    id: TankFormId;
    parentId: TankFormId;
    requiredLevel: number;
}

const FORMS: Record<TankFormId, TankForm> = {
    basic: BasicTankForm,
    twin: TwinTankForm
};

const EVOLUTIONS: TankEvolutionDefinition[] = [
    {
        id: 'twin',
        parentId: 'basic',
        requiredLevel: 10
    }
];

export class TankEvolutionTree {
    public getForm(formId: TankFormId): TankForm {
        return FORMS[formId];
    }

    public getOptions(currentFormId: TankFormId, level: number): TankEvolutionOption[] {
        return EVOLUTIONS
            .filter((evolution) => evolution.parentId === currentFormId)
            .map((evolution) => {
                const form = this.getForm(evolution.id);
                return {
                    id: evolution.id,
                    name: form.name,
                    description: form.description,
                    requiredLevel: evolution.requiredLevel,
                    parentId: evolution.parentId,
                    available: level >= evolution.requiredLevel
                };
            });
    }

    public canEvolve(currentFormId: TankFormId, nextFormId: TankFormId, level: number): boolean {
        return this.getOptions(currentFormId, level).some((option) => option.id === nextFormId && option.available);
    }
}
