import { Entity } from '../Entity';
import { emitGameEvent, GameEvents } from '../../../shared/EventBus';
import type { EntityStats, InputState, StatModifiers } from '../../../shared/Types';
import { MAX_RELOAD_POINTS } from '../../../shared/Types';
import { getColorDefinition } from '../../constants/ColorConfig';

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

const COLOR_STAT_KEYS: Array<keyof EntityStats> = [
    'maxHealth',
    'healthRegen',
    'bodyDamage',
    'bulletSpeed',
    'bulletPenetration',
    'bulletDamage',
    'reloadPoints',
    'movementSpeed'
];

const COLOR_BONUS_CAPS: Record<keyof EntityStats, number> = {
    maxHealth: 85,
    healthRegen: 4.5,
    bodyDamage: 18,
    bulletSpeed: 165,
    bulletPenetration: 3.5,
    bulletDamage: 20,
    reloadPoints: 4.2,
    movementSpeed: 60
};

export class Player extends Entity {
    private static readonly OUT_OF_COMBAT_REGEN_DELAY_MS = 10000;
    private static readonly OUT_OF_COMBAT_BONUS_REGEN_PER_SECOND = 5;
    private static readonly UPGRADE_COLOR_BASE_SCALE = 0.38;
    private static readonly UPGRADE_COLOR_DIMINISHING_FACTOR = 0.8;

    public name: string;
    public color: number;
    public isUpgrading: boolean;
    public spinAngle = 0;
    public aimAngle = 0;
    private static readonly SPIN_RATE = 2.5;
    public level: number;
    public currentXp: number;
    public xpToNextLevel: number;
    public pendingUpgrades: number;
    public coins: number;
    public readonly appliedUpgradeColors: number[];
    public bonusStats: StatModifiers;
    public colorBonusStats: StatModifiers;
    private readonly progressionEnabled: boolean;
    private primaryColorHex: string | null = null;
    private selectedUpgradeColorHexes: string[] = [];
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

    constructor(
        id: string,
        x: number,
        y: number,
        name: string,
        color: number = 0x4488ff,
        progressionEnabled: boolean = true
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
        this.progressionEnabled = progressionEnabled;
        this.level = 1;
        this.currentXp = 0;
        this.xpToNextLevel = 100;
        this.pendingUpgrades = 0;
        this.coins = 0;
        this.appliedUpgradeColors = [];
        this.bonusStats = { ...ZERO_BONUS_STATS };
        this.colorBonusStats = {};
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
    }

    public override get contactDamage(): number {
        return this.currentStats.bodyDamage;
    }

    protected override get healthRegen(): number {
        return this.currentStats.healthRegen;
    }

    public get currentStats(): EntityStats {
        const rawReloadPoints = (this.bonusStats.reloadPoints ?? 0) + (this.colorBonusStats.reloadPoints ?? 0);
        const clampedReloadPoints = Math.min(rawReloadPoints, MAX_RELOAD_POINTS);
        const excessReloadPoints = Math.max(0, rawReloadPoints - MAX_RELOAD_POINTS);
        const overflowBodyDamage = excessReloadPoints * 5;

        return {
            maxHealth: this.baseStats.maxHealth + (this.bonusStats.maxHealth ?? 0) + (this.colorBonusStats.maxHealth ?? 0),
            healthRegen: this.baseStats.healthRegen + (this.bonusStats.healthRegen ?? 0) + (this.colorBonusStats.healthRegen ?? 0),
            bodyDamage: this.baseStats.bodyDamage + (this.bonusStats.bodyDamage ?? 0) + (this.colorBonusStats.bodyDamage ?? 0) + overflowBodyDamage,
            bulletSpeed: this.baseStats.bulletSpeed + (this.bonusStats.bulletSpeed ?? 0) + (this.colorBonusStats.bulletSpeed ?? 0),
            bulletPenetration: this.baseStats.bulletPenetration + (this.bonusStats.bulletPenetration ?? 0) + (this.colorBonusStats.bulletPenetration ?? 0),
            bulletDamage: this.baseStats.bulletDamage + (this.bonusStats.bulletDamage ?? 0) + (this.colorBonusStats.bulletDamage ?? 0),
            reloadPoints: clampedReloadPoints,
            movementSpeed: this.baseStats.movementSpeed + (this.bonusStats.movementSpeed ?? 0) + (this.colorBonusStats.movementSpeed ?? 0)
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
        if (input.autoSpin) {
            this.spinAngle += Player.SPIN_RATE * dt;
            this.aimAngle = this.spinAngle;
        }

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

        if (!input.autoSpin) {
            const targetX = isControlsInverted ? (2 * this.x) - input.targetX : input.targetX;
            const targetY = isControlsInverted ? (2 * this.y) - input.targetY : input.targetY;
            const aimDx = targetX - this.x;
            const aimDy = targetY - this.y;
            if (Math.hypot(aimDx, aimDy) > 0.0001) {
                this.aimAngle = Math.atan2(aimDy, aimDx);
            }
        }
    }

    public applyStatModifiers(modifiers: StatModifiers): void {
        for (const key of COLOR_STAT_KEYS) {
            const modifier = modifiers[key];
            if (modifier === undefined) {
                continue;
            }

            this.bonusStats[key] = (this.bonusStats[key] ?? 0) + modifier;
        }
    }

    public setPrimaryColorBuff(colorHex: string): void {
        this.primaryColorHex = colorHex.toLowerCase();
        this.selectedUpgradeColorHexes = [];
        this.rebuildColorBonuses();
    }

    public applyUpgradeColorBuff(colorHex: string): void {
        this.selectedUpgradeColorHexes.push(colorHex.toLowerCase());
        this.rebuildColorBonuses();
    }

    public applyColorBuff(colorHex: string): void {
        if (!this.primaryColorHex) {
            this.setPrimaryColorBuff(colorHex);
            return;
        }

        this.applyUpgradeColorBuff(colorHex);
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

    private rebuildColorBonuses(): void {
        const nextBonus: StatModifiers = {};
        const primaryColor = this.primaryColorHex ? getColorDefinition(this.primaryColorHex) : undefined;

        if (primaryColor) {
            this.mergeScaledModifiers(nextBonus, primaryColor.modifiers, 1);
        }

        const colorStackCounts = new Map<string, number>();
        for (const hex of this.selectedUpgradeColorHexes) {
            const color = getColorDefinition(hex);
            if (!color) {
                continue;
            }

            const previousStacks = colorStackCounts.get(color.id) ?? 0;
            colorStackCounts.set(color.id, previousStacks + 1);

            const stackScale = Player.UPGRADE_COLOR_BASE_SCALE * Math.pow(Player.UPGRADE_COLOR_DIMINISHING_FACTOR, previousStacks);
            const tierScale = color.tier === 'TERTIARY' ? 1.25 : color.tier === 'SECONDARY' ? 1 : 0.85;
            this.mergeScaledModifiers(nextBonus, color.modifiers, stackScale * tierScale);
        }

        this.colorBonusStats = this.clampColorBonuses(nextBonus);
    }

    private mergeScaledModifiers(target: StatModifiers, source: StatModifiers, scale: number): void {
        for (const key of COLOR_STAT_KEYS) {
            const value = source[key];
            if (value === undefined || value === 0) {
                continue;
            }

            target[key] = (target[key] ?? 0) + value * scale;
        }
    }

    private clampColorBonuses(modifiers: StatModifiers): StatModifiers {
        const result: StatModifiers = {};

        for (const key of COLOR_STAT_KEYS) {
            const value = modifiers[key];
            if (value === undefined) {
                continue;
            }

            const cap = COLOR_BONUS_CAPS[key];
            result[key] = Math.max(-cap, Math.min(cap, value));
        }

        return result;
    }

    public consumePendingUpgrade(): void {
        this.pendingUpgrades = Math.max(0, this.pendingUpgrades - 1);
    }

    public addCoins(amount: number): void {
        this.coins = Math.max(0, this.coins + Math.max(0, Math.round(amount)));
    }

    public spendCoins(amount: number): boolean {
        const cost = Math.max(0, Math.round(amount));
        if (this.coins < cost) return false;
        this.coins -= cost;
        return true;
    }

    public gainXp(amount: number): void {
        if (!this.progressionEnabled) {
            return;
        }

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
