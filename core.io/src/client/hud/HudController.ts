import { emitGameEvent, GameEvents, onGameEvent } from '../../shared/EventBus';
import { calculatePlayerShotCooldownSeconds } from '../../shared/CombatMath';
import type { EntityStats, GameState, ObjectiveState, StatModifiers } from '../../shared/Types';
import { type ColorDefinition, getColorDefinition } from '../../logic/constants/ColorConfig';

interface StoredStats {
    maxWave: number;
    totalKills: number;
    totalAnomalies: number;
}

const EMPTY_STATS: StoredStats = { maxWave: 0, totalKills: 0, totalAnomalies: 0 };

const DEFAULT_PLAYER_STATS: EntityStats = {
    maxHealth: 0,
    healthRegen: 0,
    bodyDamage: 0,
    bulletSpeed: 0,
    bulletPenetration: 0,
    bulletDamage: 0,
    reloadPoints: 0,
    movementSpeed: 0
};

export class HudController {
    private readonly unsubscribers: Array<() => void> = [];
    private readonly waveTransitionTimeoutIds: number[] = [];

    private currentLevel = 1;
    private currentXp = 0;
    private xpRequired = 100;
    private currentPlayerHealth = 0;
    private currentPlayerStats: EntityStats = { ...DEFAULT_PLAYER_STATS };
    private activePreviewModifiers: StatModifiers | null = null;

    private readonly waveInfoTitleEl = this.getEl<HTMLElement>('hud-wave-info-title');
    private readonly waveInfoSubEl = this.getEl<HTMLElement>('hud-wave-info-sub');
    private readonly waveTransitionEl = this.getEl<HTMLElement>('hud-wave-transition');
    private readonly enemyCounterEl = this.getEl<HTMLElement>('hud-enemy-counter');
    private readonly objectiveEl = this.getEl<HTMLElement>('hud-objective');
    private readonly statsTriggerEl = this.getEl<HTMLElement>('hud-stats');
    private readonly levelLabelEl = this.getEl<HTMLElement>('hud-level-label');
    private readonly xpProgressEl = this.getEl<HTMLElement>('hud-xp-progress');
    private readonly xpFillEl = this.getEl<HTMLElement>('hud-xp-fill');

    private readonly statHealthEl = this.getEl<HTMLElement>('stat-health');
    private readonly statHealthRegenEl = this.getEl<HTMLElement>('stat-health-regen');
    private readonly statBodyDamageEl = this.getEl<HTMLElement>('stat-body-damage');
    private readonly statBulletDamageEl = this.getEl<HTMLElement>('stat-bullet-damage');
    private readonly statBulletSpeedEl = this.getEl<HTMLElement>('stat-bullet-speed');
    private readonly statBulletPenetrationEl = this.getEl<HTMLElement>('stat-bullet-penetration');
    private readonly statReloadEl = this.getEl<HTMLElement>('stat-reload');
    private readonly statMoveSpeedEl = this.getEl<HTMLElement>('stat-move-speed');

    private readonly globalMaxWaveEl = this.getEl<HTMLElement>('stat-max-wave');
    private readonly globalTotalKillsEl = this.getEl<HTMLElement>('stat-total-kills');
    private readonly globalTotalAnomaliesEl = this.getEl<HTMLElement>('stat-total-anomalies');
    private readonly toastEl = this.getEl<HTMLElement>('hud-toast');
    private readonly colorBadgeEl = this.getEl<HTMLElement>('hud-color-badge');
    private toastTimeoutId: number | null = null;
    private activeColorDef: ColorDefinition | null = null;

    constructor() {
        this.bindColorSelectionScreen();
        this.bindEvents();
        this.renderLevel();
        this.renderWaveInfo(1, 'CLEAR', 0, 0);
        this.renderXpBar();
        this.renderXpProgress();
        this.renderEnemyCount(0);
        this.renderObjective(null);
        this.renderStats(this.currentPlayerHealth, this.currentPlayerStats);
        this.renderGlobalStats(this.loadStats());
    }

    private bindColorSelectionScreen(): void {
        const screen = this.getEl<HTMLElement>('color-selection-screen');
        if (!screen) return;

        const cards = screen.querySelectorAll<HTMLElement>('.color-card');
        const colorMap: Record<string, string> = {
            red: '#ff4444',
            blue: '#4488ff',
            yellow: '#ffcc00',
        };

        for (const card of cards) {
            const colorHex = colorMap[card.dataset.color ?? ''] ?? '#4488ff';
            const colorDef = getColorDefinition(colorHex);
            const mods: StatModifiers = colorDef?.modifiers ?? {};

            card.addEventListener('mouseenter', () => {
                this.previewStatModifiers(mods);
            });

            card.addEventListener('mouseleave', () => {
                this.clearStatPreview();
            });

            card.addEventListener('click', () => {
                this.clearStatPreview();

                for (const other of cards) {
                    if (other !== card) other.classList.add('faded');
                }
                card.classList.add('selected');

                window.setTimeout(() => {
                    screen.classList.add('fade-out');

                    window.setTimeout(() => {
                        screen.classList.add('hidden');
                        screen.classList.remove('fade-out');
                        for (const c of cards) {
                            c.classList.remove('faded', 'selected');
                        }
                        emitGameEvent(GameEvents.START_RUN_WITH_COLOR, { colorHex });
                    }, 400);
                }, 800);
            });
        }
    }

    public getInitialAudioPrefs(): { volume: number; muted: boolean } {
        try {
            const raw = localStorage.getItem('coreio_audio');
            if (!raw) return { volume: 0.32, muted: false };
            const parsed = JSON.parse(raw) as { volume?: unknown; muted?: unknown };
            return {
                volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : 0.32,
                muted: typeof parsed.muted === 'boolean' ? parsed.muted : false,
            };
        } catch {
            return { volume: 0.32, muted: false };
        }
    }

    public resetForNewRun(): void {
        this.currentLevel = 1;
        this.currentXp = 0;
        this.xpRequired = 100;
        this.currentPlayerHealth = 0;
        this.currentPlayerStats = { ...DEFAULT_PLAYER_STATS };
        this.activeColorDef = null;
        this.updateColorBadge();

        this.clearWaveTransitionTimers();
        this.hideWaveTransition();
        this.setStatsPinned(false);
        this.clearStatPreview();
        this.renderLevel();
        this.renderWaveInfo(1, 'CLEAR', 0, 0);
        this.renderXpBar();
        this.renderXpProgress();
        this.renderEnemyCount(0);
        this.renderObjective(null);
        this.renderStats(this.currentPlayerHealth, this.currentPlayerStats);
    }

    public destroy(): void {
        this.clearWaveTransitionTimers();

        for (const unsubscribe of this.unsubscribers) {
            unsubscribe();
        }

        this.unsubscribers.length = 0;
    }

    public setStatsPinned(pinned: boolean): void {
        this.statsTriggerEl?.classList.toggle('is-pinned', pinned);
    }

    public previewStatModifiers(modifiers: StatModifiers): void {
        this.activePreviewModifiers = { ...modifiers };
        this.renderStatsPreview(this.activePreviewModifiers);
    }

    public clearStatPreview(): void {
        this.activePreviewModifiers = null;
        this.renderStats(this.currentPlayerHealth, this.currentPlayerStats);
    }

    private bindEvents(): void {
        this.unsubscribers.push(
            onGameEvent(GameEvents.STATE_UPDATE, (state) => {
                this.handleStateUpdate(state);
            })
        );

        this.unsubscribers.push(
            onGameEvent(GameEvents.XP_UPDATE, ({ currentXp, requires }) => {
                this.currentXp = Math.max(0, currentXp);
                this.xpRequired = Math.max(1, requires);
                this.renderXpBar();
                this.renderXpProgress();
            })
        );

        this.unsubscribers.push(
            onGameEvent(GameEvents.LEVEL_UP, ({ newLevel }) => {
                this.currentLevel = Math.max(1, newLevel);
                this.renderLevel();
                this.renderXpProgress();
            })
        );

        this.unsubscribers.push(
            onGameEvent(GameEvents.WAVE_CLEAR_ANIMATION_START, ({ waveCleared, nextWave, durationMs }) => {
                this.playWaveMessage(`ONDA ${waveCleared} CONCLUIDA`, true, durationMs);
                void nextWave;
            })
        );

        this.unsubscribers.push(
            onGameEvent(GameEvents.WAVE_STARTING_ANIMATION_START, ({ wave, durationMs }) => {
                this.playWaveMessage(`ONDA ${wave} INICIANDO...`, false, durationMs);
            })
        );

        this.unsubscribers.push(
            onGameEvent(GameEvents.WAVE_SPAWNING_RESUMED, () => {
                this.hideWaveTransition();
            })
        );

        this.unsubscribers.push(
            onGameEvent(GameEvents.AUDIO_SETTINGS_CHANGED, (prefs) => {
                localStorage.setItem('coreio_audio', JSON.stringify(prefs));
            })
        );

        this.unsubscribers.push(
            onGameEvent(GameEvents.GAME_OVER, ({ waveReached, enemiesKilled, anomaliesMet }) => {
                this.clearWaveTransitionTimers();
                this.hideWaveTransition();
                this.setStatsPinned(false);
                this.clearStatPreview();
                this.renderObjective(null);

                const current = this.loadStats();
                const updated: StoredStats = {
                    maxWave: Math.max(current.maxWave, waveReached),
                    totalKills: current.totalKills + enemiesKilled,
                    totalAnomalies: current.totalAnomalies + anomaliesMet,
                };
                this.saveStats(updated);
            })
        );

        this.unsubscribers.push(
            onGameEvent(GameEvents.OBJECTIVE_COMPLETED, ({ title, rewardUpgrades }) => {
                this.playWaveMessage(`${title}: +${rewardUpgrades} aprimoramento`, false, 1600);
            })
        );

        this.unsubscribers.push(
            onGameEvent(GameEvents.AUTO_FIRE_TOGGLED, ({ enabled }) => {
                this.showToast(enabled ? 'Auto-Fire ON' : 'Auto-Fire OFF');
            })
        );

        this.unsubscribers.push(
            onGameEvent(GameEvents.AUTO_SPIN_TOGGLED, ({ enabled }) => {
                this.showToast(enabled ? 'Auto-Spin ON' : 'Auto-Spin OFF');
            })
        );
    }

    private handleStateUpdate(state: GameState): void {
        this.currentPlayerHealth = state.player.health;
        this.currentPlayerStats = { ...state.player.stats };

        if (state.player.color !== undefined) {
            const colorHex = `#${state.player.color.toString(16).padStart(6, '0')}`;
            const colorDef = getColorDefinition(colorHex) ?? null;
            if (colorDef !== this.activeColorDef) {
                this.activeColorDef = colorDef;
                this.updateColorBadge();
            }
        }

        this.renderLevel();
        this.renderWaveInfo(
            state.currentWave,
            state.waveType,
            state.remainingToKill,
            state.surviveTimeRemainingSeconds
        );
        this.renderXpBar();
        this.renderXpProgress();
        this.renderEnemyCount(state.activeEnemyCount);
        this.renderObjective(state.objective);

        if (this.activePreviewModifiers) {
            this.renderStatsPreview(this.activePreviewModifiers);
            return;
        }

        this.renderStats(this.currentPlayerHealth, this.currentPlayerStats);
    }

    private renderLevel(): void {
        if (!this.levelLabelEl) return;
        this.levelLabelEl.textContent = `Nivel ${this.currentLevel}`;
    }

    private renderWaveInfo(
        wave: number,
        waveType: 'CLEAR' | 'SURVIVE',
        remainingToKill: number,
        surviveTimeRemaining: number
    ): void {
        if (this.waveInfoTitleEl) {
            const typeLabel = waveType === 'SURVIVE' ? 'Sobrevivência' : 'Eliminação';
            this.waveInfoTitleEl.textContent = `Onda ${wave} — ${typeLabel}`;
        }

        if (this.waveInfoSubEl) {
            if (waveType === 'SURVIVE') {
                this.waveInfoSubEl.textContent = `Tempo: ${this.formatCountdown(surviveTimeRemaining)}`;
                this.waveInfoSubEl.classList.toggle('is-danger', surviveTimeRemaining <= 10);
            } else {
                this.waveInfoSubEl.textContent = `Restam: ${Math.max(0, remainingToKill)}`;
                this.waveInfoSubEl.classList.remove('is-danger');
            }
        }
    }

    private renderXpBar(): void {
        if (!this.xpFillEl) return;
        const ratio = this.currentXp / Math.max(1, this.xpRequired);
        const clampedRatio = Math.max(0, Math.min(1, ratio));
        this.xpFillEl.style.width = `${(clampedRatio * 100).toFixed(2)}%`;
    }

    private renderXpProgress(): void {
        if (!this.xpProgressEl) return;
        this.xpProgressEl.textContent = `Nivel ${this.currentLevel} - ${this.fmt0(this.currentXp)}/${this.fmt0(this.xpRequired)} XP`;
    }

    private renderEnemyCount(activeCount: number): void {
        if (!this.enemyCounterEl) return;
        this.enemyCounterEl.textContent = `Inimigos: ${Math.max(0, activeCount)}`;
    }

    private renderObjective(objective: ObjectiveState | null): void {
        if (!this.objectiveEl) return;

        if (!objective) {
            this.objectiveEl.textContent = 'Objetivo: --';
            this.objectiveEl.classList.remove('is-complete', 'is-failed');
            return;
        }

        const progressText = `${Math.floor(objective.progress)}/${Math.floor(objective.target)}`;
        this.objectiveEl.textContent = `Objetivo: ${objective.description} (${progressText})`;
        this.objectiveEl.classList.toggle('is-complete', objective.completed);
        this.objectiveEl.classList.toggle('is-failed', objective.failed);
    }

    private renderStats(health: number, stats: EntityStats): void {
        this.clearStatRowHighlights();

        this.setText(this.statHealthEl, `${this.fmt0(health)} / ${this.fmt0(stats.maxHealth)}`);
        this.setText(this.statHealthRegenEl, this.fmt1(stats.healthRegen));
        this.setText(this.statBodyDamageEl, this.fmt1(stats.bodyDamage));
        this.setText(this.statBulletDamageEl, this.fmt1(stats.bulletDamage));
        this.setText(this.statBulletSpeedEl, this.fmt1(stats.bulletSpeed));
        this.setText(this.statBulletPenetrationEl, this.fmt1(stats.bulletPenetration));
        this.setText(this.statReloadEl, this.formatReloadValue(stats.reloadPoints));
        this.setText(this.statMoveSpeedEl, this.fmt1(stats.movementSpeed));

        this.renderColorBuffHighlights();
    }

    private renderColorBuffHighlights(): void {
        if (!this.activeColorDef) return;

        const statElementMap: Partial<Record<keyof EntityStats, HTMLElement | null>> = {
            maxHealth: this.statHealthEl,
            healthRegen: this.statHealthRegenEl,
            bodyDamage: this.statBodyDamageEl,
            bulletDamage: this.statBulletDamageEl,
            bulletSpeed: this.statBulletSpeedEl,
            bulletPenetration: this.statBulletPenetrationEl,
            reloadPoints: this.statReloadEl,
            movementSpeed: this.statMoveSpeedEl,
        };

        for (const [stat, value] of Object.entries(this.activeColorDef.modifiers) as Array<[keyof EntityStats, number]>) {
            if (value === 0) continue;
            const el = statElementMap[stat];
            const row = el?.parentElement;
            if (!row) continue;
            row.classList.add(value > 0 ? 'is-color-buff' : 'is-color-nerf');
        }
    }

    private updateColorBadge(): void {
        if (!this.colorBadgeEl) return;

        if (!this.activeColorDef) {
            this.colorBadgeEl.textContent = '';
            this.colorBadgeEl.removeAttribute('style');
            this.colorBadgeEl.classList.remove('is-visible');
            return;
        }

        this.colorBadgeEl.textContent = this.activeColorDef.name;
        this.colorBadgeEl.style.setProperty('--badge-color', this.activeColorDef.hex);
        this.colorBadgeEl.classList.add('is-visible');
    }

    private renderStatsPreview(modifiers: StatModifiers): void {
        const previewStats = this.getPreviewStats(modifiers);

        this.setPreviewHealth(modifiers.maxHealth ?? 0, previewStats.maxHealth);
        this.setPreviewNumber(this.statHealthRegenEl, this.currentPlayerStats.healthRegen, previewStats.healthRegen, modifiers.healthRegen ?? 0);
        this.setPreviewNumber(this.statBodyDamageEl, this.currentPlayerStats.bodyDamage, previewStats.bodyDamage, modifiers.bodyDamage ?? 0);
        this.setPreviewNumber(this.statBulletDamageEl, this.currentPlayerStats.bulletDamage, previewStats.bulletDamage, modifiers.bulletDamage ?? 0);
        this.setPreviewNumber(this.statBulletSpeedEl, this.currentPlayerStats.bulletSpeed, previewStats.bulletSpeed, modifiers.bulletSpeed ?? 0);
        this.setPreviewNumber(this.statBulletPenetrationEl, this.currentPlayerStats.bulletPenetration, previewStats.bulletPenetration, modifiers.bulletPenetration ?? 0);
        this.setPreviewReload(modifiers.reloadPoints ?? 0, previewStats.reloadPoints);
        this.setPreviewNumber(this.statMoveSpeedEl, this.currentPlayerStats.movementSpeed, previewStats.movementSpeed, modifiers.movementSpeed ?? 0);
    }

    private setPreviewHealth(maxHealthDelta: number, previewMaxHealth: number): void {
        if (!this.statHealthEl) return;

        const baseText = `${this.fmt0(this.currentPlayerHealth)} / ${this.fmt0(this.currentPlayerStats.maxHealth)}`;
        if (maxHealthDelta === 0) {
            this.statHealthEl.textContent = baseText;
            this.applyPreviewStyle(this.statHealthEl, 0);
            return;
        }

        const signedDelta = maxHealthDelta > 0
            ? `+${maxHealthDelta.toFixed(0)}`
            : maxHealthDelta.toFixed(0);

        this.statHealthEl.textContent = `${this.fmt0(this.currentPlayerHealth)} / ${this.fmt0(previewMaxHealth)} (${signedDelta} max)`;
        this.applyPreviewStyle(this.statHealthEl, maxHealthDelta);
    }

    private setPreviewNumber(
        element: HTMLElement | null,
        currentValue: number,
        previewValue: number,
        delta: number
    ): void {
        if (!element) return;

        if (delta === 0) {
            element.textContent = this.fmt1(currentValue);
            this.applyPreviewStyle(element, 0);
            return;
        }

        const sign = delta > 0 ? '+' : '';
        element.textContent = `${this.fmt1(previewValue)} (${sign}${this.fmt1(delta)})`;
        this.applyPreviewStyle(element, delta);
    }

    private setPreviewReload(delta: number, previewReloadPoints: number): void {
        if (!this.statReloadEl) return;

        if (delta === 0) {
            this.statReloadEl.textContent = this.formatReloadValue(this.currentPlayerStats.reloadPoints);
            this.applyPreviewStyle(this.statReloadEl, 0);
            return;
        }

        const previewCooldown = calculatePlayerShotCooldownSeconds(previewReloadPoints);
        const sign = delta > 0 ? '+' : '';
        this.statReloadEl.textContent = `${this.fmt1(previewReloadPoints)} pts (${this.fmt2(previewCooldown)}s) (${sign}${this.fmt1(delta)} pts)`;
        this.applyPreviewStyle(this.statReloadEl, delta);
    }

    private getPreviewStats(modifiers: StatModifiers): EntityStats {
        return {
            maxHealth: this.currentPlayerStats.maxHealth + (modifiers.maxHealth ?? 0),
            healthRegen: this.currentPlayerStats.healthRegen + (modifiers.healthRegen ?? 0),
            bodyDamage: this.currentPlayerStats.bodyDamage + (modifiers.bodyDamage ?? 0),
            bulletSpeed: this.currentPlayerStats.bulletSpeed + (modifiers.bulletSpeed ?? 0),
            bulletPenetration: this.currentPlayerStats.bulletPenetration + (modifiers.bulletPenetration ?? 0),
            bulletDamage: this.currentPlayerStats.bulletDamage + (modifiers.bulletDamage ?? 0),
            reloadPoints: Math.max(0, this.currentPlayerStats.reloadPoints + (modifiers.reloadPoints ?? 0)),
            movementSpeed: this.currentPlayerStats.movementSpeed + (modifiers.movementSpeed ?? 0)
        };
    }

    private formatReloadValue(reloadPoints: number): string {
        const cooldown = calculatePlayerShotCooldownSeconds(reloadPoints);
        return `${this.fmt1(reloadPoints)} pts (${this.fmt2(cooldown)}s)`;
    }

    private formatCountdown(seconds: number): string {
        const s = Math.max(0, Math.ceil(seconds));
        const m = Math.floor(s / 60);
        const rem = s % 60;
        return `${m}:${rem.toString().padStart(2, '0')}`;
    }

    private applyPreviewStyle(element: HTMLElement | null, delta: number): void {
        if (!element) return;

        const row = element.parentElement;
        if (!row) return;

        row.classList.remove('is-preview-positive', 'is-preview-negative');

        if (delta > 0) {
            row.classList.add('is-preview-positive');
            return;
        }

        if (delta < 0) {
            row.classList.add('is-preview-negative');
        }
    }

    private clearStatRowHighlights(): void {
        const statElements: Array<HTMLElement | null> = [
            this.statHealthEl,
            this.statHealthRegenEl,
            this.statBodyDamageEl,
            this.statBulletDamageEl,
            this.statBulletSpeedEl,
            this.statBulletPenetrationEl,
            this.statReloadEl,
            this.statMoveSpeedEl
        ];

        for (const element of statElements) {
            element?.parentElement?.classList.remove(
                'is-preview-positive', 'is-preview-negative',
                'is-color-buff', 'is-color-nerf'
            );
        }
    }

    private playWaveMessage(text: string, isDanger: boolean, durationMs: number): void {
        this.clearWaveTransitionTimers();
        this.showWaveTransition(text, isDanger);

        this.waveTransitionTimeoutIds.push(
            window.setTimeout(() => {
                this.hideWaveTransition();
            }, Math.max(250, durationMs))
        );
    }

    private showWaveTransition(text: string, isDanger: boolean): void {
        if (!this.waveTransitionEl) return;

        this.waveTransitionEl.hidden = false;
        this.waveTransitionEl.textContent = text;
        this.waveTransitionEl.classList.toggle('is-danger', isDanger);
        this.waveTransitionEl.classList.remove('show');

        void this.waveTransitionEl.offsetWidth;
        this.waveTransitionEl.classList.add('show');
    }

    private hideWaveTransition(): void {
        if (!this.waveTransitionEl) return;
        this.waveTransitionEl.classList.remove('show', 'is-danger');
        this.waveTransitionEl.hidden = true;
    }

    private showToast(text: string): void {
        if (!this.toastEl) return;

        if (this.toastTimeoutId !== null) {
            window.clearTimeout(this.toastTimeoutId);
            this.toastTimeoutId = null;
        }

        this.toastEl.textContent = text;
        this.toastEl.classList.remove('toast-visible');
        void this.toastEl.offsetWidth;
        this.toastEl.classList.add('toast-visible');

        this.toastTimeoutId = window.setTimeout(() => {
            this.toastEl?.classList.remove('toast-visible');
            this.toastTimeoutId = null;
        }, 1800);
    }

    private clearWaveTransitionTimers(): void {
        for (const timeoutId of this.waveTransitionTimeoutIds) {
            window.clearTimeout(timeoutId);
        }
        this.waveTransitionTimeoutIds.length = 0;
    }

    private loadStats(): StoredStats {
        try {
            const raw = localStorage.getItem('coreio_stats');
            if (!raw) return { ...EMPTY_STATS };
            return { ...EMPTY_STATS, ...(JSON.parse(raw) as Partial<StoredStats>) };
        } catch {
            return { ...EMPTY_STATS };
        }
    }

    private saveStats(stats: StoredStats): void {
        localStorage.setItem('coreio_stats', JSON.stringify(stats));
        this.renderGlobalStats(stats);
    }

    private renderGlobalStats(stats: StoredStats): void {
        this.setText(this.globalMaxWaveEl, String(stats.maxWave));
        this.setText(this.globalTotalKillsEl, String(stats.totalKills));
        this.setText(this.globalTotalAnomaliesEl, String(stats.totalAnomalies));
    }

    private setText(element: HTMLElement | null, value: string): void {
        if (!element) return;
        element.textContent = value;
    }

    private getEl<T extends HTMLElement>(id: string): T | null {
        return document.getElementById(id) as T | null;
    }

    private fmt0(value: number): string {
        return Math.max(0, value).toFixed(0);
    }

    private fmt1(value: number): string {
        return value.toFixed(1);
    }

    private fmt2(value: number): string {
        return value.toFixed(2);
    }
}
