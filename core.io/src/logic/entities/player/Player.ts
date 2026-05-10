import { Entity } from '../Entity';
import { emitGameEvent, GameEvents, onGameEvent } from '../../../shared/EventBus';
import type { EntityStats, InputState, StatModifiers } from '../../../shared/Types';
import { MAX_RELOAD_POINTS } from '../../../shared/Types';

const ZERO_BONUS_STATS: EntityStats = {
    maxHealth: 0,
    healthRegen: 0,
    bodyDamage: 0,
    bulletSpeed: 0,
    bulletPenetration: 0,
    bulletDamage: 0,
    reloadPoints: 0,
    movementSpeed: 0
};

export class Player extends Entity {
    private static readonly OUT_OF_COMBAT_REGEN_DELAY_MS = 10000;
    private static readonly OUT_OF_COMBAT_BONUS_REGEN_PER_SECOND = 5;

    public name: string;
    public color: number;
    public isUpgrading: boolean;
    public level: number;
    public currentXp: number;
    public xpToNextLevel: number;
    public pendingUpgrades: number;
    public readonly appliedUpgradeColors: number[];
    public bonusStats: StatModifiers;
    private readonly baseStats: EntityStats = {
        maxHealth: 100,
        healthRegen: 1,
        bodyDamage: 5,
        bulletSpeed: 450,
        bulletPenetration: 1,
        bulletDamage: 8,
        reloadPoints: 0,
        movementSpeed: 150
    };
    private unsubscribeEnemyDestroyed: (() => void) | null = null;

    constructor(
        id: string,
        x: number,
        y: number,
        name: string,
        color: number = 0x4488ff
    ) {
        const base = {
            maxHealth: 100,
            healthRegen: 1,
            bodyDamage: 5,
            bulletSpeed: 450,
            bulletPenetration: 5,
            bulletDamage: 8,
            reloadPoints: 0,
            movementSpeed: 150
        };
        super(id, x, y, base.maxHealth, base.maxHealth, base.movementSpeed);
        this.name = name;
        this.color = color;
        this.isUpgrading = false;
        this.level = 1;
        this.currentXp = 0;
        this.xpToNextLevel = 100;
        this.pendingUpgrades = 0;
        this.appliedUpgradeColors = [];
        this.bonusStats = { ...ZERO_BONUS_STATS };
        this.setBarrels([
            {
                id: 'player_front_barrel',
                offsetX: 34,
                offsetY: 0,
                angleOffset: 0,
                recoilForce: 20,
                damageMultiplier: 1,
                speedMultiplier: 1,
                lifespanMultiplier: 1
            }
        ]);

        this.setupListeners();
    }

    public override get contactDamage(): number {
        return this.currentStats.bodyDamage;
    }

    protected override get healthRegen(): number {
        return this.currentStats.healthRegen;
    }

    public get currentStats(): EntityStats {
        const rawReloadPoints = this.bonusStats.reloadPoints ?? 0;
        const clampedReloadPoints = Math.min(rawReloadPoints, MAX_RELOAD_POINTS);
        const excessReloadPoints = Math.max(0, rawReloadPoints - MAX_RELOAD_POINTS);
        const overflowBodyDamage = excessReloadPoints * 5;

        return {
            maxHealth: this.baseStats.maxHealth + (this.bonusStats.maxHealth ?? 0),
            healthRegen: this.baseStats.healthRegen + (this.bonusStats.healthRegen ?? 0),
            bodyDamage: this.baseStats.bodyDamage + (this.bonusStats.bodyDamage ?? 0) + overflowBodyDamage,
            bulletSpeed: this.baseStats.bulletSpeed + (this.bonusStats.bulletSpeed ?? 0),
            bulletPenetration: this.baseStats.bulletPenetration + (this.bonusStats.bulletPenetration ?? 0),
            bulletDamage: this.baseStats.bulletDamage + (this.bonusStats.bulletDamage ?? 0),
            reloadPoints: clampedReloadPoints,
            movementSpeed: this.baseStats.movementSpeed + (this.bonusStats.movementSpeed ?? 0)
        };
    }

    public override updateRegeneration(dt: number, currentTime: number): void {
        if (this.health <= 0) return;
        let regen = this.currentStats.healthRegen * dt;
        if (this.getTimeSinceLastDamage(currentTime) > Player.OUT_OF_COMBAT_REGEN_DELAY_MS) {
            regen += Player.OUT_OF_COMBAT_BONUS_REGEN_PER_SECOND * dt;
        }
        if (regen <= 0) return;
        this.health = Math.min(this.maxHealth, this.health + regen);
    }

    public update(input: InputState, dt: number, isControlsInverted: boolean): void {
        const up    = isControlsInverted ? input.down  : input.up;
        const down  = isControlsInverted ? input.up    : input.down;
        const left  = isControlsInverted ? input.right : input.left;
        const right = isControlsInverted ? input.left  : input.right;

        let movementX = 0;
        let movementY = 0;

        if (up)    movementY -= 1;
        if (down)  movementY += 1;
        if (left)  movementX -= 1;
        if (right) movementX += 1;

        if (movementX !== 0 || movementY !== 0) {
            const magnitude = Math.hypot(movementX, movementY);
            const speedPerFrame = this.speed * dt;
            this.x += (movementX / magnitude) * speedPerFrame;
            this.y += (movementY / magnitude) * speedPerFrame;
        }
    }

    public applyStatModifiers(modifiers: StatModifiers): void {
        const statKeys: Array<keyof EntityStats> = [
            'maxHealth',
            'healthRegen',
            'bodyDamage',
            'bulletSpeed',
            'bulletPenetration',
            'bulletDamage',
            'reloadPoints',
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

    public gainXp(amount: number): void {
        this.currentXp += amount;

        while (this.currentXp >= this.xpToNextLevel) {
            this.levelUp();
        }

        emitGameEvent(GameEvents.XP_UPDATE, {
            currentXp: this.currentXp,
            requires: this.xpToNextLevel
        });
    }

    private levelUp(): void {
        this.level++;
        this.currentXp -= this.xpToNextLevel;
        this.xpToNextLevel = Math.floor(this.xpToNextLevel * 1.25);
        this.pendingUpgrades += 1;
        emitGameEvent(GameEvents.LEVEL_UP, { newLevel: this.level });
    }
}
