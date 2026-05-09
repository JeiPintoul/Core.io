import type { EnemyType, ObjectiveState, WaveMilestone, WaveType } from '../shared/Types';
import { emitGameEvent, GameEvents } from '../shared/EventBus';
import { MISSIONS_DATABASE, type MissionDefinition } from './constants/MissionsDatabase';

interface ActiveObjective {
    definition: MissionDefinition;
    progress: number;
    completed: boolean;
    failed: boolean;
    rewardGranted: boolean;
    createdAtMs: number;
}

export class MissionManager {
    private current: ActiveObjective | null = null;
    private readonly onRewardGranted: (rewardUpgrades: number) => void;

    constructor(onRewardGranted: (rewardUpgrades: number) => void) {
        this.onRewardGranted = onRewardGranted;
    }

    /**
     * Rolls a mission for the current wave.
     * Mutates spawnQueue to inject required enemies when needed (CLEAR waves only).
     */
    public roll(spawnQueue: EnemyType[], waveType: WaveType, milestone: WaveMilestone, currentTimeMs: number): void {
        const eligible = MISSIONS_DATABASE.filter(m => this.isEligible(m, spawnQueue, waveType, milestone));

        if (eligible.length === 0) {
            this.current = null;
            return;
        }

        const selected = this.weightedRandom(eligible);

        if (waveType === 'CLEAR') {
            this.injectAndShuffle(selected, spawnQueue);
        }

        this.current = {
            definition: selected,
            progress: 0,
            completed: false,
            failed: false,
            rewardGranted: false,
            createdAtMs: currentTimeMs,
        };
    }

    public onEnemyKilled(enemyType: EnemyType): void {
        if (!this.current || this.current.completed || this.current.failed) return;

        const { kind, requiredEnemyType } = this.current.definition;

        if (kind === 'KILL_COUNT') {
            this.current.progress += 1;
        } else if (kind === 'ENEMY_TYPE_KILL_COUNT' && enemyType === requiredEnemyType) {
            this.current.progress += 1;
        } else {
            return;
        }

        this.tryComplete();
    }

    public onPlayerDamaged(): void {
        if (!this.current || this.current.completed || this.current.failed) return;
        if (this.current.definition.kind !== 'NO_DAMAGE_DURATION') return;
        this.current.failed = true;
    }

    public update(currentTimeMs: number): void {
        if (!this.current || this.current.completed || this.current.failed) return;
        if (this.current.definition.kind !== 'NO_DAMAGE_DURATION') return;

        const elapsed = (currentTimeMs - this.current.createdAtMs) / 1000;
        this.current.progress = Math.min(this.current.definition.target, elapsed);
        this.tryComplete();
    }

    public getObjectiveState(): ObjectiveState | null {
        if (!this.current) return null;

        return {
            id: `${this.current.definition.id}_${this.current.createdAtMs}`,
            title: this.current.definition.title,
            description: this.current.definition.description,
            progress: this.current.progress,
            target: this.current.definition.target,
            completed: this.current.completed,
            failed: this.current.failed,
        };
    }

    public reset(): void {
        this.current = null;
    }

    private isEligible(mission: MissionDefinition, spawnQueue: EnemyType[], waveType: WaveType, milestone: WaveMilestone): boolean {
        switch (mission.kind) {
            case 'KILL_COUNT':
                // SURVIVE spawns infinitely; CLEAR needs enough total enemies
                return waveType === 'SURVIVE' || spawnQueue.length >= mission.target;

            case 'ENEMY_TYPE_KILL_COUNT': {
                const hasWeight = (milestone.enemyWeights[mission.requiredEnemyType!] ?? 0) > 0;
                if (!hasWeight) return false;
                // SURVIVE: enemy type can spawn naturally → doable without injection
                if (waveType === 'SURVIVE') return true;
                // CLEAR: queue must be large enough to hold the injected enemies
                return spawnQueue.length >= mission.target;
            }

            case 'NO_DAMAGE_DURATION':
                return true;
        }
    }

    /**
     * Ensures spawnQueue contains at least mission.target entries of the required type.
     * Replaces generic enemies to guarantee feasibility, then re-shuffles.
     */
    private injectAndShuffle(mission: MissionDefinition, spawnQueue: EnemyType[]): void {
        if (!mission.requiredEnemyType) return;

        const required = mission.requiredEnemyType;
        const current = spawnQueue.filter(t => t === required).length;
        let toInject = mission.target - current;

        for (let i = 0; i < spawnQueue.length && toInject > 0; i++) {
            if (spawnQueue[i] !== required) {
                spawnQueue[i] = required;
                toInject--;
            }
        }

        this.shuffle(spawnQueue);
    }

    private tryComplete(): void {
        if (!this.current || this.current.rewardGranted) return;
        if (this.current.progress < this.current.definition.target) return;

        this.current.progress = this.current.definition.target;
        this.current.completed = true;
        this.current.rewardGranted = true;

        const { title, rewardUpgrades } = this.current.definition;
        this.onRewardGranted(rewardUpgrades);
        emitGameEvent(GameEvents.OBJECTIVE_COMPLETED, { title, rewardUpgrades });
    }

    private weightedRandom(missions: MissionDefinition[]): MissionDefinition {
        const total = missions.reduce((acc, m) => acc + m.weight, 0);
        let roll = Math.random() * total;

        for (const mission of missions) {
            roll -= mission.weight;
            if (roll <= 0) return mission;
        }

        return missions[missions.length - 1];
    }

    private shuffle<T>(arr: T[]): void {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }
}
