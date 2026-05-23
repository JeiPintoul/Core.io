import type { EnemyType, EntityStats, PlayerId } from '../../shared/Types';
import type { Rng } from '../Rng';
import { HostileEntity } from '../entities/enemies/HostileEntity';
import { KamikazeEnemy } from '../entities/enemies/KamikazeEnemy';
import { RangedEnemy } from '../entities/enemies/RangedEnemy';
import { SentinelEnemy } from '../entities/enemies/SentinelEnemy';
import { SkirmisherEnemy } from '../entities/enemies/SkirmisherEnemy';
import { BruteEnemy } from '../entities/enemies/BruteEnemy';
import { Anomaly, type AnomalyAbilityCtor } from '../entities/enemies/anomaly/Anomaly';
import { AnomalyDecoy } from '../entities/enemies/anomaly/AnomalyDecoy';
import { DreadnoughtBoss, type BossCoopScaling } from '../entities/boss/dreadnought/DreadnoughtBoss';
import { Player } from '../entities/player/Player';
import { ENEMY_STAT_MULTIPLIER_PER_WAVE, getEnemyFirstWave } from '../constants/WaveConfig';
import type { DifficultyProfile } from '../constants/GameBalance';

export interface EnemyFactoryHost {
    getArenaSize(): { width: number; height: number };
    getPlayerAnchor(): { x: number; y: number };
    getPlayers(): Player[];
    getMainPlayer(): Player;
    getDifficultyProfile(): DifficultyProfile;
    getCurrentWave(): number;
}

export interface SpawnInstanceOptions {
    orbitSlot?: number;
    orbitTotal?: number;
    orbitRadius?: number;
    ownerEnemyId?: string;
    assignedPlayerId?: PlayerId;
    mirrorStats?: EntityStats;
}

const ANOMALY_GROUP_RING_RADIUS = 110;
const OFFSCREEN_SPAWN_ATTEMPTS = 16;
const ANOMALY_BODY_DAMAGE_MAX_HEALTH_CAP = 0.35;
const ANOMALY_BULLET_DAMAGE_MAX_HEALTH_CAP = 0.30;

export class EnemyFactory {
    private static readonly VIEWPORT_SAFE_SPAWN_RADIUS = Math.max(1100, Math.hypot(1920 / 2, 1080 / 2) + 120);
    private static readonly MINIMUM_SPAWN_DISTANCE = 1100;

    private idCounter = 0;

    constructor(
        private readonly host: EnemyFactoryHost,
        private readonly rng: Rng
    ) {}

    public resetIdCounter(): void {
        this.idCounter = 0;
    }

    public nextId(): string {
        return `enemy_${this.idCounter++}`;
    }

    public create(
        enemyType: EnemyType,
        id: string,
        x: number,
        y: number,
        multiplier: number,
        opts: SpawnInstanceOptions = {}
    ): HostileEntity {
        const { orbitSlot = 0, orbitTotal = 1, orbitRadius = 0, ownerEnemyId, assignedPlayerId, mirrorStats } = opts;

        switch (enemyType) {
            case 'KAMIKAZE': return new KamikazeEnemy(id, x, y, multiplier);
            case 'RANGED': return new RangedEnemy(id, x, y, multiplier);
            case 'SENTINEL': return new SentinelEnemy(id, x, y, multiplier);
            case 'SKIRMISHER': return new SkirmisherEnemy(id, x, y, multiplier);
            case 'BRUTE': return new BruteEnemy(id, x, y, multiplier);
            case 'ANOMALY_DECOY':
                return new AnomalyDecoy(
                    id, x, y, orbitSlot, orbitTotal, orbitRadius,
                    ownerEnemyId ?? null, assignedPlayerId ?? null, mirrorStats ?? null
                );
            case 'ANOMALY':
                return new Anomaly(id, x, y, this.buildAnomalyReferenceStats(), Math.max(1, Math.round(multiplier)));
            case 'DREADNOUGHT':
                return new DreadnoughtBoss(id, x, y, Math.max(1, Math.round(multiplier)));
            default:
                return new KamikazeEnemy(id, x, y, multiplier);
        }
    }

    public rollEnemyType(weights: Partial<Record<EnemyType, number>>): EnemyType {
        const entries = (Object.entries(weights) as Array<[EnemyType, number]>).filter(([, w]) => w > 0);
        if (entries.length === 0) return 'KAMIKAZE';

        const total = entries.reduce((acc, [, w]) => acc + w, 0);
        let roll = this.rng.random() * total;
        for (const [type, weight] of entries) {
            roll -= weight;
            if (roll <= 0) return type;
        }
        return entries[entries.length - 1][0];
    }

    public shuffleInPlace<T>(arr: T[]): void {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(this.rng.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    public rollOffscreenSpawnPoint(): { x: number; y: number } {
        const anchor = this.host.getPlayerAnchor();
        const arena = this.host.getArenaSize();
        let fallbackX = anchor.x;
        let fallbackY = anchor.y;

        for (let attempt = 0; attempt < OFFSCREEN_SPAWN_ATTEMPTS; attempt++) {
            const angle = this.rng.random() * Math.PI * 2;
            const desiredX = anchor.x + Math.cos(angle) * EnemyFactory.VIEWPORT_SAFE_SPAWN_RADIUS;
            const desiredY = anchor.y + Math.sin(angle) * EnemyFactory.VIEWPORT_SAFE_SPAWN_RADIUS;
            const clampedX = Math.max(0, Math.min(desiredX, arena.width));
            const clampedY = Math.max(0, Math.min(desiredY, arena.height));
            const playerDistance = Math.hypot(clampedX - anchor.x, clampedY - anchor.y);

            fallbackX = clampedX;
            fallbackY = clampedY;

            if (playerDistance >= EnemyFactory.MINIMUM_SPAWN_DISTANCE) {
                return { x: clampedX, y: clampedY };
            }
        }

        return { x: fallbackX, y: fallbackY };
    }

    public buildScaledMultiplier(enemyType: EnemyType): number {
        const enemyStartWave = getEnemyFirstWave(enemyType);
        const waveOffset = Math.max(0, this.host.getCurrentWave() - enemyStartWave);
        const statScale = this.host.getDifficultyProfile().enemyStatScale;
        return (1 + (waveOffset * ENEMY_STAT_MULTIPLIER_PER_WAVE)) * statScale;
    }

    public buildAnomalyReferenceStats(): EntityStats {
        const players = this.host.getPlayers().filter((player) => player.health > 0);
        const base = this.buildMedianPlayerStats(players.length > 0 ? players : [this.host.getMainPlayer()]);
        const profile = this.host.getDifficultyProfile();

        const scaledStats = {
            maxHealth: base.maxHealth * profile.bossMaxHealthScale,
            healthRegen: base.healthRegen * profile.bossHealthRegenScale,
            bodyDamage: base.bodyDamage * profile.bossBodyDamageScale,
            bulletSpeed: base.bulletSpeed * profile.bossBulletSpeedScale,
            bulletPenetration: base.bulletPenetration * profile.bossBulletPenetrationScale,
            bulletDamage: base.bulletDamage * profile.bossBulletDamageScale,
            reloadPoints: base.reloadPoints + profile.bossReloadBonus,
            movementSpeed: base.movementSpeed * profile.bossMovementSpeedScale,
        };

        return {
            ...scaledStats,
            bodyDamage: Math.min(scaledStats.bodyDamage, scaledStats.maxHealth * ANOMALY_BODY_DAMAGE_MAX_HEALTH_CAP),
            bulletDamage: Math.min(scaledStats.bulletDamage, scaledStats.maxHealth * ANOMALY_BULLET_DAMAGE_MAX_HEALTH_CAP),
        };
    }

    private buildMedianPlayerStats(players: Player[]): EntityStats {
        const pickMedian = (values: number[]): number => {
            const sorted = [...values].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 === 0
                ? (sorted[mid - 1] + sorted[mid]) / 2
                : sorted[mid];
        };

        const stats = players.map((player) => player.currentStats);
        return {
            maxHealth: pickMedian(stats.map((stat) => stat.maxHealth)),
            healthRegen: pickMedian(stats.map((stat) => stat.healthRegen)),
            bodyDamage: pickMedian(stats.map((stat) => stat.bodyDamage)),
            bulletSpeed: pickMedian(stats.map((stat) => stat.bulletSpeed)),
            bulletPenetration: pickMedian(stats.map((stat) => stat.bulletPenetration)),
            bulletDamage: pickMedian(stats.map((stat) => stat.bulletDamage)),
            reloadPoints: pickMedian(stats.map((stat) => stat.reloadPoints)),
            movementSpeed: pickMedian(stats.map((stat) => stat.movementSpeed)),
        };
    }

    public createDreadnoughtBossWithCoopScaling(id: string, x: number, y: number, encounterCount: number): DreadnoughtBoss {
        return new DreadnoughtBoss(id, x, y, Math.max(1, encounterCount), this.buildBossCoopScaling());
    }

    public buildBossCoopScaling(): BossCoopScaling {
        const profile = this.host.getDifficultyProfile();
        return {
            healthMultiplier: profile.bossMaxHealthScale,
            bodyDamageMultiplier: profile.bossBodyDamageScale,
            bulletSpeedMultiplier: profile.bossBulletSpeedScale,
            bulletPenetrationMultiplier: profile.bossBulletPenetrationScale,
            bulletDamageMultiplier: profile.bossBulletDamageScale,
            movementSpeedMultiplier: profile.bossMovementSpeedScale,
            reloadBonus: profile.bossReloadBonus,
            extraPlayers: Math.max(0, this.host.getPlayers().length - 1),
        };
    }

    /**
     * Coop anomaly: one real copy + N-1 fakes, each glued to a specific player.
     * Single-player keeps the classic single-anomaly behavior.
     */
    public buildAnomalyGroup(
        spawnX: number,
        spawnY: number,
        spawnCount: number
    ): HostileEntity[] {
        const players = this.host.getPlayers().filter((p) => p.health > 0);
        const refStats = this.buildAnomalyReferenceStats();
        const wave = this.host.getCurrentWave();

        if (players.length <= 1) {
            const anomaly = new Anomaly('anomaly_boss', spawnX, spawnY, refStats, spawnCount, wave);
            anomaly.assignedPlayerId = (players[0]?.id ?? this.host.getMainPlayer().id) as PlayerId;
            return [anomaly];
        }

        const sharedAbilityCtors: AnomalyAbilityCtor[] = Anomaly.selectAbilityConstructors(spawnCount);
        const realIndex = Math.floor(this.rng.random() * players.length);

        return players.map((player, i) => {
            const angle = (i / players.length) * Math.PI * 2;
            const x = spawnX + Math.cos(angle) * ANOMALY_GROUP_RING_RADIUS;
            const y = spawnY + Math.sin(angle) * ANOMALY_GROUP_RING_RADIUS;
            const isFake = i !== realIndex;
            const id = isFake ? `anomaly_boss_fake_${i}` : 'anomaly_boss';
            return new Anomaly(id, x, y, refStats, spawnCount, wave, {
                isFakeCopy: isFake,
                assignedPlayerId: player.id as PlayerId,
                abilityCtors: sharedAbilityCtors
            });
        });
    }
}
