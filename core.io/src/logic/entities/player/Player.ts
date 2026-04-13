import { Entity } from '../../Entity';
import { emitGameEvent, GameEvents, onGameEvent } from '../../../shared/EventBus';
import type { EntityStats, StatModifiers } from '../../../shared/Types';

const ZERO_BONUS_STATS: EntityStats = {
    maxHealth: 0,
    healthRegen: 0,
    bodyDamage: 0,
    bulletSpeed: 0,
    bulletPenetration: 0,
    bulletDamage: 0,
    reload: 0,
    movementSpeed: 0
};

export class Player extends Entity {
    public name: string;
    public color: number;
    public isUpgrading: boolean;
    public level: number;
    public currentXp: number;
    public xpToNextLevel: number;
    public pendingUpgrades: number;
    public readonly appliedUpgradeColors: number[];
    public bonusStats: StatModifiers;
    private readonly baseStats: EntityStats;
    private unsubscribeEnemyDestroyed: (() => void) | null = null;

    constructor(
        id: string,
        x: number,
        y: number,
        name: string,
        baseStats: EntityStats,
        color: number = 0x4488ff
    ) {
        super(id, x, y, baseStats.maxHealth, baseStats.maxHealth, baseStats.movementSpeed);
        this.name = name;
        this.color = color;
        this.isUpgrading = false;
        this.level = 1;
        this.currentXp = 0;
        this.xpToNextLevel = 100; // base pro nivel 2
        this.pendingUpgrades = 0;
        this.appliedUpgradeColors = [];
        this.baseStats = { ...baseStats };
        this.bonusStats = { ...ZERO_BONUS_STATS };

        this.setupListeners();
    }

    public get currentStats(): EntityStats {
        const mergedStats: EntityStats = {
            maxHealth: this.baseStats.maxHealth + (this.bonusStats.maxHealth ?? 0),
            healthRegen: this.baseStats.healthRegen + (this.bonusStats.healthRegen ?? 0),
            bodyDamage: this.baseStats.bodyDamage + (this.bonusStats.bodyDamage ?? 0),
            bulletSpeed: this.baseStats.bulletSpeed + (this.bonusStats.bulletSpeed ?? 0),
            bulletPenetration: this.baseStats.bulletPenetration + (this.bonusStats.bulletPenetration ?? 0),
            bulletDamage: this.baseStats.bulletDamage + (this.bonusStats.bulletDamage ?? 0),
            reload: this.baseStats.reload + (this.bonusStats.reload ?? 0),
            movementSpeed: this.baseStats.movementSpeed + (this.bonusStats.movementSpeed ?? 0)
        };

        return {
            ...mergedStats,
            reload: Math.max(0, mergedStats.reload)
        };
    }

    public applyStatModifiers(modifiers: StatModifiers): void {
        const statKeys: Array<keyof EntityStats> = [
            'maxHealth',
            'healthRegen',
            'bodyDamage',
            'bulletSpeed',
            'bulletPenetration',
            'bulletDamage',
            'reload',
            'movementSpeed'
        ];

        for (const key of statKeys) {
            const modifier = modifiers[key];
            if (modifier === undefined) {
                continue;
            }

            this.bonusStats[key] = (this.bonusStats[key] ?? 0) + modifier;
        }
    }

    public applyUpgradeColor(colorHex: string): void {
        const sanitizedHex = colorHex.replace('#', '');
        const parsedColor = Number.parseInt(sanitizedHex, 16);

        if (Number.isNaN(parsedColor)) {
            return;
        }

        this.appliedUpgradeColors.push(parsedColor);
        this.color = parsedColor;
    }

    public consumePendingUpgrade(): void {
        this.pendingUpgrades = Math.max(0, this.pendingUpgrades - 1);
    }

    private setupListeners(): void {
        //Aqui quando ouvir que o inimmigo dropa xp, ele vai la e coleta 
        this.unsubscribeEnemyDestroyed = onGameEvent(GameEvents.ENEMY_DESTROYED, (data) => {
            this.gainXp(data.xpDropped);
        });
    }

    public destroy(): void {
        if (this.unsubscribeEnemyDestroyed) {
            this.unsubscribeEnemyDestroyed();
            this.unsubscribeEnemyDestroyed = null;
        }
    }

    //Logica do ganho de xp 
    public gainXp(amount: number): void {
        this.currentXp += amount;

        // Resolve all pending level transitions when a large XP burst is received.
        while (this.currentXp >= this.xpToNextLevel) {
            this.levelUp();
        }

        // Avisa a UI com os valores já estabilizados pós-level-up.
        emitGameEvent(GameEvents.XP_UPDATE, {
            currentXp: this.currentXp,
            requires: this.xpToNextLevel
        });
    }

    // Gatilho de subida de nível
    private levelUp(): void {
        this.level++;

        // Aqui eu vou dxa acumular o xp que aguardou e vou aumentar em uns 50% de xp proproximo nivel
        this.currentXp -= this.xpToNextLevel;
        this.xpToNextLevel = Math.floor(this.xpToNextLevel * 1.5);

        this.pendingUpgrades += 1;

        // Dispara o evento que vai fazer o motor do jogo pausar e abrir o menu
        emitGameEvent(GameEvents.LEVEL_UP, { newLevel: this.level });
    }
}