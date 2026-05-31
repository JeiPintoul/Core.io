import type { BarrelConfig, TankEvolutionOption, TankFormId } from '../../../shared/Types';
import type { Player } from './Player';
import { TankEvolutionTree } from './TankEvolutionTree';

export class PlayerTankFormManager {
    private readonly tree = new TankEvolutionTree();
    private alternateBarrelIndex = 0;
    private readonly lastShotAtByBarrelId = new Map<string, number>();
    private lastAlternateShotAtMs = Number.NEGATIVE_INFINITY;

    public applyInitialForm(player: Player): void {
        this.applyForm(player, 'basic', true);
    }

    public applyForm(player: Player, formId: TankFormId, force = false): boolean {
        if (!force && !this.tree.canEvolve(player.tankFormId, formId, player.level)) return false;
        const form = this.tree.getForm(formId);
        player.tankFormId = form.id;
        player.setBarrels(form.barrels);
        player.lastFiredBarrelId = null;
        this.alternateBarrelIndex = 0;
        this.lastShotAtByBarrelId.clear();
        this.lastAlternateShotAtMs = Number.NEGATIVE_INFINITY;
        return true;
    }

    public getEvolutionOptions(player: Player): TankEvolutionOption[] {
        return this.tree.getOptions(player.tankFormId, player.level);
    }

    public hasAvailableEvolution(player: Player): boolean {
        return this.getEvolutionOptions(player).some((option) => option.available);
    }

    public selectBarrelsForShot(player: Player, currentTimeMs = 0, cooldownMs = 0): BarrelConfig[] {
        const form = this.tree.getForm(player.tankFormId);
        if (form.fireMode === 'ALL' || player.barrels.length <= 1) {
            const selected = player.barrels.filter((barrel) => this.isBarrelReady(barrel.id, currentTimeMs, cooldownMs));
            for (const barrel of selected) this.lastShotAtByBarrelId.set(barrel.id, currentTimeMs);
            player.lastFiredBarrelId = selected[0]?.id ?? null;
            return selected;
        }

        const alternateCadenceMs = cooldownMs / player.barrels.length;
        if (currentTimeMs - this.lastAlternateShotAtMs < alternateCadenceMs) return [];

        for (let attempt = 0; attempt < player.barrels.length; attempt++) {
            const index = (this.alternateBarrelIndex + attempt) % player.barrels.length;
            const selected = player.barrels[index];
            if (!selected || !this.isBarrelReady(selected.id, currentTimeMs, cooldownMs)) continue;
            this.alternateBarrelIndex = index + 1;
            this.lastShotAtByBarrelId.set(selected.id, currentTimeMs);
            this.lastAlternateShotAtMs = currentTimeMs;
            player.lastFiredBarrelId = selected.id;
            return [selected];
        }

        return [];
    }

    private isBarrelReady(barrelId: string, currentTimeMs: number, cooldownMs: number): boolean {
        return currentTimeMs - (this.lastShotAtByBarrelId.get(barrelId) ?? Number.NEGATIVE_INFINITY) >= cooldownMs;
    }
}
