import { emitGameEvent, GameEvents } from '../../shared/EventBus';
import type { EnemyType, PlayerId, WaveMilestone, WaveType } from '../../shared/Types';
import type { Rng } from '../Rng';
import { EngineState } from '../EngineState';
import { HostileEntity } from '../entities/enemies/HostileEntity';
import { Anomaly } from '../entities/enemies/anomaly/Anomaly';
import { AnomalyDecoy } from '../entities/enemies/anomaly/AnomalyDecoy';
import { Player } from '../entities/player/Player';
import { EnemyFactory } from './EnemyFactory';
import {
    ANOMALY_BASE_CHANCE,
    ANOMALY_CHANCE_INCREMENT,
    ANOMALY_COOLDOWN_WAVES,
    ANOMALY_START_WAVE,
    WAVE_SPAWN_INTERVAL_SECONDS,
    type BossKind,
    type BossWaveRule,
    getBossWaveRule,
    getWaveMilestone
} from '../constants/WaveConfig';

const ENCOUNTER_ARENA = { x: 1500, y: 1500, width: 2000, height: 2000 };
const WAVE_TRANSITION_ANIMATION_DURATION_MS = 1500;
const BOSS_EXIT_PORTAL_RADIUS = 62;
const SURVIVE_DURATION_CAP_SECONDS = 60;
const WAVE_TYPE_CLEAR_BIAS = 0.75;
const ANOMALY_SPAWN_TOP_MARGIN = 120;

export interface EncounterDirectorHost {
    getEnemies(): HostileEntity[];
    setEnemies(enemies: HostileEntity[]): void;
    addEnemy(enemy: HostileEntity): void;

    setArena(arena: { x: number; y: number; width: number; height: number }): void;
    restoreMainArena(): void;

    getPlayers(): Player[];
    getPlayerById(id: PlayerId): Player | null;
    positionPlayers(cx: number, cy: number): void;
    reviveDefeatedPlayers(): void;
    reviveDefeatedPlayersForNextWave(): void;

    setEngineState(state: EngineState): void;
    getEngineState(): EngineState;
    isUpgradeSelectionActive(): boolean;
    enterUpgradePhase(now: number): void;
    clearUpgradeSelectionState(): void;

    missionStartBoss(now: number): void;
    missionStartAnomaly(now: number): void;
    missionBossDefeated(): void;
    missionAnomalyDefeated(): void;
    missionRollWave(queue: EnemyType[], waveType: WaveType, milestone: WaveMilestone, now: number): void;

    getDifficultySpawnScale(): number;
    getDifficultyActiveEnemyScale(): number;
}

/**
 * Owns wave progression, spawn cadence, and boss/anomaly encounter flow.
 * Delegates construction to EnemyFactory; uses the host (engine) for arena,
 * enemies, players, missions, and high-level state transitions.
 */
export class EncounterDirector {
    private currentWave = 1;
    private currentWaveType: WaveType = 'CLEAR';
    private spawnQueue: EnemyType[] = [];
    private surviveWaveEndsAtMs = 0;
    private enemiesSpawnedThisWave = 0;
    private enemiesKilledThisWave = 0;
    private waveClearAnimationEndsAtMs = 0;
    private waveStartingAnimationEndsAtMs = 0;
    private lastSpawnTime = 0;

    private bossFightActive = false;
    private bossExitPortalActive = false;
    private anomalyEncounterActive = false;
    private activeBossWaveRule: BossWaveRule | null = null;

    private anomalySpawnCount = 0;
    private anomalyCurrentChance = ANOMALY_BASE_CHANCE;
    private anomalyCooldownWaves = 0;
    private bossEncounterCount = 0;

    constructor(
        private readonly host: EncounterDirectorHost,
        private readonly factory: EnemyFactory,
        private readonly rng: Rng
    ) {
        this.initSpawnQueue(getWaveMilestone(1), this.getCurrentWaveTotalToSpawn());
    }

    // -------------------- public read API --------------------

    public getCurrentWave(): number { return this.currentWave; }
    public getCurrentWaveType(): WaveType { return this.currentWaveType; }
    public isBossFight(): boolean { return this.bossFightActive; }
    public isAnomalyEncounter(): boolean { return this.anomalyEncounterActive; }
    public isBossExitPortal(): boolean { return this.bossExitPortalActive; }

    public getSpawnQueueSnapshot(): EnemyType[] { return this.spawnQueue; }

    public getBossExitPortal(): { x: number; y: number; radius: number } {
        return {
            x: ENCOUNTER_ARENA.x + ENCOUNTER_ARENA.width / 2,
            y: ENCOUNTER_ARENA.y + ENCOUNTER_ARENA.height / 2,
            radius: BOSS_EXIT_PORTAL_RADIUS,
        };
    }

    public getRemainingToKill(): number {
        const state = this.host.getEngineState();
        if (state === EngineState.BOSS_FIGHT) {
            return this.host.getEnemies().some((e) => e.enemyType === 'DREADNOUGHT') ? 1 : 0;
        }
        if (state === EngineState.ANOMALY_ENCOUNTER) {
            return this.host.getEnemies().some((e) => e instanceof Anomaly && !e.isFakeCopy) ? 1 : 0;
        }
        if (this.currentWaveType === 'SURVIVE') return 0;
        return Math.max(0, this.getCurrentWaveTotalToSpawn() - this.enemiesKilledThisWave);
    }

    public getSurviveTimeRemaining(currentTimeMs: number): number {
        if (this.currentWaveType !== 'SURVIVE') return 0;
        return Math.max(0, (this.surviveWaveEndsAtMs - currentTimeMs) / 1000);
    }

    public getActiveAnomalyFor(player: Player): Anomaly | null {
        const enemies = this.host.getEnemies();
        for (const e of enemies) {
            if (e instanceof Anomaly && e.assignedPlayerId === player.id) return e;
        }
        for (const e of enemies) {
            if (e instanceof Anomaly && !e.isFakeCopy) return e;
        }
        return null;
    }

    // -------------------- lifecycle --------------------

    public reset(): void {
        this.currentWave = 1;
        this.currentWaveType = 'CLEAR';
        this.spawnQueue = [];
        this.surviveWaveEndsAtMs = 0;
        this.enemiesSpawnedThisWave = 0;
        this.enemiesKilledThisWave = 0;
        this.waveClearAnimationEndsAtMs = 0;
        this.waveStartingAnimationEndsAtMs = 0;
        this.lastSpawnTime = 0;

        this.bossFightActive = false;
        this.bossExitPortalActive = false;
        this.anomalyEncounterActive = false;
        this.activeBossWaveRule = null;
        this.anomalySpawnCount = 0;
        this.anomalyCurrentChance = ANOMALY_BASE_CHANCE;
        this.anomalyCooldownWaves = 0;
        this.bossEncounterCount = 0;

        this.factory.resetIdCounter();
        this.initSpawnQueue(getWaveMilestone(1), this.getCurrentWaveTotalToSpawn());
    }

    public primeTimers(now: number): void {
        this.lastSpawnTime = now;
    }

    public shiftPausedTimers(pausedDurationMs: number): void {
        if (pausedDurationMs <= 0) return;
        this.lastSpawnTime += pausedDurationMs;
        this.surviveWaveEndsAtMs = this.shiftFuture(this.surviveWaveEndsAtMs, pausedDurationMs);
        this.waveClearAnimationEndsAtMs = this.shiftFuture(this.waveClearAnimationEndsAtMs, pausedDurationMs);
        this.waveStartingAnimationEndsAtMs = this.shiftFuture(this.waveStartingAnimationEndsAtMs, pausedDurationMs);
    }

    private shiftFuture(ts: number, offset: number): number {
        return ts > 0 ? ts + offset : ts;
    }

    public startRun(now: number): void {
        this.lastSpawnTime = now;

        const bossRule = getBossWaveRule(this.currentWave);
        if (bossRule) {
            this.startBossWaveAnimation(bossRule, now);
            return;
        }
        if (this.tryStartAnomalyEncounter(now, this.currentWave)) return;

        this.host.setEngineState(EngineState.WAVE_ACTIVE);
        const milestone = getWaveMilestone(this.currentWave);
        if (this.currentWaveType === 'SURVIVE') {
            this.surviveWaveEndsAtMs = now + Math.min(SURVIVE_DURATION_CAP_SECONDS, milestone.surviveDurationSeconds) * 1000;
        }
        this.host.missionRollWave(this.spawnQueue, this.currentWaveType, milestone, now);
    }

    // -------------------- per-tick hooks --------------------

    public tickSpawn(now: number): void {
        if (this.host.getEngineState() !== EngineState.WAVE_ACTIVE) return;

        const milestone = getWaveMilestone(this.currentWave);
        const baseMaxActive = this.currentWaveType === 'SURVIVE'
            ? milestone.maxActiveEnemiesSurvive
            : milestone.maxActiveEnemies;
        const maxActive = Math.max(1, Math.round(baseMaxActive * this.host.getDifficultyActiveEnemyScale()));

        if (this.host.getEnemies().length >= maxActive) return;
        if ((now - this.lastSpawnTime) / 1000 < WAVE_SPAWN_INTERVAL_SECONDS) return;

        if (this.currentWaveType === 'SURVIVE' && this.spawnQueue.length === 0) {
            const refillTotal = Math.max(
                1,
                Math.round((milestone.maxActiveEnemiesSurvive * 2) * this.host.getDifficultySpawnScale())
            );
            this.initSpawnQueue(milestone, refillTotal);
        }

        if (this.spawnQueue.length === 0) return;

        const enemyType = this.spawnQueue.pop()!;
        this.spawnEnemy(enemyType, now);
        this.enemiesSpawnedThisWave += 1;
        this.lastSpawnTime = now;
    }

    public tickBossExitPortal(now: number): void {
        if (!this.bossExitPortalActive || this.host.isUpgradeSelectionActive()) return;

        const portal = this.getBossExitPortal();
        const entered = this.host.getPlayers().some((p) =>
            p.health > 0 && Math.hypot(p.x - portal.x, p.y - portal.y) < p.radius + portal.radius
        );

        if (entered) this.exitBossArena(now);
    }

    public tickPhase(now: number): void {
        switch (this.host.getEngineState()) {
            case EngineState.BOSS_FIGHT:
                if (!this.host.getEnemies().some((e) => e.enemyType === 'DREADNOUGHT')) {
                    this.endBossFight(now);
                }
                return;
            case EngineState.ANOMALY_ENCOUNTER:
                if (!this.host.getEnemies().some((e) => e instanceof Anomaly && !e.isFakeCopy)) {
                    this.endAnomalyEncounter(now);
                }
                return;
            case EngineState.WAVE_ACTIVE:
                if (this.currentWaveType === 'SURVIVE') this.tryEndSurviveWave(now);
                else this.tryEnterWaveClearAnimation(now);
                return;
            case EngineState.WAVE_CLEAR_ANIMATION:
                if (now >= this.waveClearAnimationEndsAtMs) this.host.enterUpgradePhase(now);
                return;
            case EngineState.UPGRADE_PHASE:
                if (this.bossExitPortalActive) return;
                if (!this.host.isUpgradeSelectionActive()) this.startWaveStartingAnimation(now);
                return;
            case EngineState.WAVE_STARTING_ANIMATION:
                if (now >= this.waveStartingAnimationEndsAtMs) this.resumeWaveSpawning(now);
                return;
            case EngineState.COLOR_SELECTION:
            default:
                return;
        }
    }

    public notifyEnemyKilled(): void {
        if (this.host.getEngineState() === EngineState.WAVE_ACTIVE) {
            this.enemiesKilledThisWave += 1;
        }
    }

    // -------------------- anomaly cleanup (called from engine update) --------------------

    public applyAnomalyCleanup(): void {
        this.reassignOrphanedAnomalies();

        const enemies = this.host.getEnemies();
        const realRevealed = enemies.some(
            (e) => e instanceof Anomaly && !e.isFakeCopy && e.hasBeenRevealed
        );

        const ownersToPurgeDecoys = new Set<string>();
        for (const e of enemies) {
            if (e instanceof Anomaly && e.clearOwnedDecoysRequested) {
                e.clearOwnedDecoysRequested = false;
                ownersToPurgeDecoys.add(e.id);
            }
        }

        if (!realRevealed && ownersToPurgeDecoys.size === 0) return;

        const aliveAnomalyIds = new Set<string>();
        for (const e of enemies) {
            if (e instanceof Anomaly && (!realRevealed || !e.isFakeCopy)) {
                aliveAnomalyIds.add(e.id);
            }
        }

        this.host.setEnemies(enemies.filter((e) => {
            if (e instanceof Anomaly) {
                return !realRevealed || !e.isFakeCopy;
            }
            if (e instanceof AnomalyDecoy) {
                const owner = e.ownerAnomalyId;
                if (owner && ownersToPurgeDecoys.has(owner)) return false;
                if (owner && !aliveAnomalyIds.has(owner)) return false;
            }
            return true;
        }));
    }

    private reassignOrphanedAnomalies(): void {
        const alivePlayers = this.host.getPlayers().filter((p) => p.health > 0);
        const alivePlayerIds = new Set(alivePlayers.map((p) => p.id));
        const droppedIds = new Set<string>();
        const enemies = this.host.getEnemies();

        for (const e of enemies) {
            if (!(e instanceof Anomaly)) continue;
            if (!e.assignedPlayerId || alivePlayerIds.has(e.assignedPlayerId)) continue;

            if (e.isFakeCopy) {
                droppedIds.add(e.id);
                continue;
            }

            const heir = alivePlayers[0];
            if (!heir) continue;

            e.assignedPlayerId = heir.id as PlayerId;
            for (const other of enemies) {
                if (other === e) continue;
                if (other instanceof Anomaly && other.isFakeCopy && other.assignedPlayerId === heir.id) {
                    droppedIds.add(other.id);
                }
            }
        }

        if (droppedIds.size === 0) return;
        this.host.setEnemies(enemies.filter((e) => {
            if (droppedIds.has(e.id)) return false;
            if (e instanceof AnomalyDecoy && e.ownerAnomalyId && droppedIds.has(e.ownerAnomalyId)) return false;
            return true;
        }));
    }

    // -------------------- enemy spawn helpers (used by engine update for child spawns) --------------------

    public spawnEnemyAt(
        enemyType: EnemyType,
        x: number,
        y: number,
        multiplier: number,
        opts: {
            orbitSlot?: number;
            orbitTotal?: number;
            orbitRadius?: number;
            ownerEnemyId?: string;
            assignedPlayerId?: PlayerId;
            mirrorStats?: import('../../shared/Types').EntityStats;
            xpDrop?: number;
            spawnGraceMs?: number;
            spawnedAtMs: number;
        }
    ): void {
        const enemy = this.factory.create(enemyType, this.factory.nextId(), x, y, multiplier, {
            orbitSlot: opts.orbitSlot,
            orbitTotal: opts.orbitTotal,
            orbitRadius: opts.orbitRadius,
            ownerEnemyId: opts.ownerEnemyId,
            assignedPlayerId: opts.assignedPlayerId,
            mirrorStats: opts.mirrorStats,
        });
        if (opts.xpDrop !== undefined) enemy.xpDrop = opts.xpDrop;
        enemy.ownerEnemyId = opts.ownerEnemyId ?? null;
        enemy.spawnedAtMs = opts.spawnedAtMs;
        enemy.spawnCollisionGraceEndsAtMs = opts.spawnedAtMs + (opts.spawnGraceMs ?? 0);
        this.host.addEnemy(enemy);
    }

    public countEnemiesByType(enemyType: EnemyType, ownerEnemyId?: string): number {
        return this.host.getEnemies().filter((e) =>
            e.enemyType === enemyType && (!ownerEnemyId || e.ownerEnemyId === ownerEnemyId)
        ).length;
    }

    // -------------------- debug --------------------

    public debugForceAdvanceWave(now: number): void {
        if (this.host.getEngineState() === EngineState.BOSS_FIGHT) {
            this.host.setEnemies([]);
            this.endBossFight(now);
            return;
        }
        if (this.bossExitPortalActive) {
            this.exitBossArena(now);
            return;
        }
        if (this.host.getEngineState() === EngineState.ANOMALY_ENCOUNTER) {
            this.host.setEnemies([]);
            this.endAnomalyEncounter(now);
            return;
        }

        this.host.setEnemies([]);
        this.spawnQueue = [];
        this.enemiesKilledThisWave = this.getCurrentWaveTotalToSpawn();
        this.triggerWaveClear(now);
    }

    public debugSpawnEnemy(now: number): void {
        const milestone = getWaveMilestone(this.currentWave);
        const enemyType = this.factory.rollEnemyType(milestone.enemyWeights);
        this.spawnEnemy(enemyType, now);
    }

    public debugSpawnBoss(now: number): void {
        if (this.bossFightActive || this.anomalyEncounterActive) return;
        this.enterBossFight('DREADNOUGHT', now);
    }

    public debugSpawnAnomaly(now: number): void {
        if (this.bossFightActive || this.anomalyEncounterActive) return;
        this.anomalySpawnCount += 1;
        this.anomalyCurrentChance = ANOMALY_BASE_CHANCE;
        this.anomalyCooldownWaves = ANOMALY_COOLDOWN_WAVES;
        this.enterAnomalyEncounter(now);
    }

    // -------------------- internal flow --------------------

    private spawnEnemy(enemyType: EnemyType, now: number): void {
        const multiplier = this.factory.buildScaledMultiplier(enemyType);
        const point = this.factory.rollOffscreenSpawnPoint();
        this.spawnEnemyAt(enemyType, point.x, point.y, multiplier, { spawnedAtMs: now });
    }

    private initSpawnQueue(milestone: WaveMilestone, total: number): void {
        this.spawnQueue = [];
        for (let i = 0; i < total; i++) {
            this.spawnQueue.push(this.factory.rollEnemyType(milestone.enemyWeights));
        }
        this.factory.shuffleInPlace(this.spawnQueue);
    }

    private getCurrentWaveTotalToSpawn(): number {
        const rule = getWaveMilestone(this.currentWave);
        const waveOffset = Math.max(0, this.currentWave - rule.startWave);
        const scaled = rule.totalEnemiesToSpawn * (1 + (waveOffset * rule.sizeMultiplier)) * this.host.getDifficultySpawnScale();
        return Math.max(1, Math.round(scaled));
    }

    private tryEnterWaveClearAnimation(now: number): void {
        if (this.enemiesKilledThisWave < this.getCurrentWaveTotalToSpawn()) return;
        if (this.host.getEnemies().length > 0) return;
        this.triggerWaveClear(now);
    }

    private tryEndSurviveWave(now: number): void {
        if (now < this.surviveWaveEndsAtMs) return;
        this.host.setEnemies([]);
        this.spawnQueue = [];
        this.triggerWaveClear(now);
    }

    private triggerWaveClear(now: number): void {
        const waveCleared = this.currentWave;
        const nextWave = waveCleared + 1;

        this.currentWave = nextWave;
        this.enemiesSpawnedThisWave = 0;
        this.enemiesKilledThisWave = 0;
        this.spawnQueue = [];

        emitGameEvent(GameEvents.WAVE_CLEARED, { waveCleared, nextWave });

        if (this.anomalyCooldownWaves > 0) this.anomalyCooldownWaves -= 1;

        const bossRule = getBossWaveRule(nextWave);
        if (bossRule) { this.startBossWaveAnimation(bossRule, now); return; }
        if (this.tryStartAnomalyEncounter(now, nextWave)) return;

        this.host.setEngineState(EngineState.WAVE_CLEAR_ANIMATION);
        this.waveClearAnimationEndsAtMs = now + WAVE_TRANSITION_ANIMATION_DURATION_MS;

        emitGameEvent(GameEvents.WAVE_CLEAR_ANIMATION_START, {
            wave: waveCleared,
            waveCleared,
            nextWave,
            durationMs: WAVE_TRANSITION_ANIMATION_DURATION_MS
        });
    }

    private tryStartAnomalyEncounter(now: number, wave: number): boolean {
        if (wave < ANOMALY_START_WAVE || this.anomalyCooldownWaves > 0) return false;

        if (this.rng.random() >= this.anomalyCurrentChance) {
            this.anomalyCurrentChance += ANOMALY_CHANCE_INCREMENT;
            return false;
        }

        this.anomalyCurrentChance = ANOMALY_BASE_CHANCE;
        this.anomalyCooldownWaves = ANOMALY_COOLDOWN_WAVES;
        this.anomalySpawnCount += 1;
        this.enterAnomalyEncounter(now);
        return true;
    }

    private startBossWaveAnimation(rule: BossWaveRule, now: number): void {
        this.activeBossWaveRule = rule;
        this.currentWaveType = 'BOSS';
        this.spawnQueue = [];
        this.host.setEngineState(EngineState.WAVE_STARTING_ANIMATION);
        this.waveStartingAnimationEndsAtMs = now + WAVE_TRANSITION_ANIMATION_DURATION_MS;

        emitGameEvent(GameEvents.WAVE_STARTING_ANIMATION_START, {
            wave: this.currentWave,
            waveType: 'BOSS',
            durationMs: WAVE_TRANSITION_ANIMATION_DURATION_MS
        });
    }

    private setupEncounterArena(): { spawnX: number; spawnY: number } {
        this.host.setArena({ ...ENCOUNTER_ARENA });
        this.spawnQueue = [];
        this.enemiesSpawnedThisWave = 0;
        this.enemiesKilledThisWave = 0;
        this.host.clearUpgradeSelectionState();
        this.host.reviveDefeatedPlayers();

        const centerX = ENCOUNTER_ARENA.x + ENCOUNTER_ARENA.width / 2;
        const centerY = ENCOUNTER_ARENA.y + ENCOUNTER_ARENA.height / 2;
        this.host.positionPlayers(centerX, centerY);

        return { spawnX: centerX, spawnY: ENCOUNTER_ARENA.y + 220 };
    }

    private buildEncounterArenaPayload() {
        return {
            bossArenaX: ENCOUNTER_ARENA.x,
            bossArenaY: ENCOUNTER_ARENA.y,
            bossArenaWidth: ENCOUNTER_ARENA.width,
            bossArenaHeight: ENCOUNTER_ARENA.height,
        };
    }

    private enterBossFight(_kind: BossKind, now: number): void {
        this.bossFightActive = true;
        this.currentWaveType = 'BOSS';
        this.bossEncounterCount += 1;
        const { spawnX, spawnY } = this.setupEncounterArena();

        this.host.setEnemies([
            this.factory.createDreadnoughtBossWithCoopScaling('dreadnought_boss', spawnX, spawnY, this.bossEncounterCount),
        ]);
        this.host.setEngineState(EngineState.BOSS_FIGHT);
        this.host.missionStartBoss(now);

        emitGameEvent(GameEvents.BOSS_FIGHT_START, this.buildEncounterArenaPayload());
    }

    private endBossFight(now: number): void {
        const bossRule = this.activeBossWaveRule;
        this.bossFightActive = false;
        this.bossExitPortalActive = true;
        this.activeBossWaveRule = null;
        this.host.setEnemies([]);
        this.spawnQueue = [];

        this.host.missionBossDefeated();
        emitGameEvent(GameEvents.BOSS_DEFEATED, undefined);

        if (bossRule) {
            const waveCleared = this.currentWave;
            const nextWave = waveCleared + 1;
            this.currentWave = nextWave;
            this.enemiesSpawnedThisWave = 0;
            this.enemiesKilledThisWave = 0;
            emitGameEvent(GameEvents.WAVE_CLEARED, { waveCleared, nextWave });
        }

        this.host.enterUpgradePhase(now);
    }

    /**
     * Anomalies share encounter arena/setup with bosses but live on their own state,
     * event channel and mission, and do not change wave type.
     */
    private enterAnomalyEncounter(now: number): void {
        this.anomalyEncounterActive = true;
        const { spawnX } = this.setupEncounterArena();
        const spawnY = ENCOUNTER_ARENA.y + ANOMALY_SPAWN_TOP_MARGIN;

        this.host.setEnemies(this.factory.buildAnomalyGroup(spawnX, spawnY, this.anomalySpawnCount));
        this.host.setEngineState(EngineState.ANOMALY_ENCOUNTER);
        this.host.missionStartAnomaly(now);

        emitGameEvent(GameEvents.ANOMALY_ENCOUNTER_START, this.buildEncounterArenaPayload());
    }

    private endAnomalyEncounter(now: number): void {
        this.anomalyEncounterActive = false;
        this.host.restoreMainArena();
        this.host.setEnemies([]);
        this.spawnQueue = [];
        this.bossExitPortalActive = false;

        this.host.missionAnomalyDefeated();
        emitGameEvent(GameEvents.ANOMALY_DEFEATED, undefined);

        this.host.setEngineState(EngineState.WAVE_CLEAR_ANIMATION);
        this.waveClearAnimationEndsAtMs = now + WAVE_TRANSITION_ANIMATION_DURATION_MS;
    }

    public startWaveStartingAnimation(now: number): void {
        if (this.host.getEngineState() === EngineState.WAVE_STARTING_ANIMATION) return;

        if (!getBossWaveRule(this.currentWave)) {
            this.currentWaveType = this.rollWaveType();
        }

        this.host.reviveDefeatedPlayersForNextWave();
        this.host.setEngineState(EngineState.WAVE_STARTING_ANIMATION);
        this.waveStartingAnimationEndsAtMs = now + WAVE_TRANSITION_ANIMATION_DURATION_MS;

        emitGameEvent(GameEvents.WAVE_STARTING_ANIMATION_START, {
            wave: this.currentWave,
            waveType: this.currentWaveType,
            durationMs: WAVE_TRANSITION_ANIMATION_DURATION_MS
        });
    }

    private resumeWaveSpawning(now: number): void {
        const bossRule = this.activeBossWaveRule ?? getBossWaveRule(this.currentWave);
        if (bossRule) {
            this.activeBossWaveRule = bossRule;
            this.enterBossFight(bossRule.bossKind, now);
            return;
        }

        this.host.setEngineState(EngineState.WAVE_ACTIVE);
        this.lastSpawnTime = now;

        const milestone = getWaveMilestone(this.currentWave);

        if (this.currentWaveType === 'SURVIVE') {
            this.surviveWaveEndsAtMs = now + Math.min(SURVIVE_DURATION_CAP_SECONDS, milestone.surviveDurationSeconds) * 1000;
            const surviveTotal = Math.max(
                1,
                Math.round((milestone.maxActiveEnemiesSurvive * 2) * this.host.getDifficultySpawnScale())
            );
            this.initSpawnQueue(milestone, surviveTotal);
        } else {
            this.surviveWaveEndsAtMs = 0;
            this.initSpawnQueue(milestone, this.getCurrentWaveTotalToSpawn());
        }

        this.host.missionRollWave(this.spawnQueue, this.currentWaveType, milestone, now);
        emitGameEvent(GameEvents.WAVE_SPAWNING_RESUMED, { wave: this.currentWave });
    }

    private exitBossArena(now: number): void {
        if (!this.bossExitPortalActive) return;
        this.host.restoreMainArena();
        this.host.setEnemies([]);
        this.spawnQueue = [];
        this.bossExitPortalActive = false;
        emitGameEvent(GameEvents.BOSS_EXIT_PORTAL_USED, undefined);
        this.startWaveStartingAnimation(now);
    }

    private rollWaveType(): WaveType {
        return this.rng.random() < WAVE_TYPE_CLEAR_BIAS ? 'CLEAR' : 'SURVIVE';
    }
}
