import { onGameEvent, GameEvents } from '../../shared/EventBus';
import { calculatePlayerShotCooldownSeconds } from '../../shared/CombatMath';
import { PLAYER_IDS, type EntityData, type EntityStats, type GameState, type ObjectiveState, type PlayerId, type StatModifiers } from '../../shared/Types';
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

const PLAYER_SLOT_LABELS: Record<PlayerId, string> = {
    player_1: 'P1',
    player_2: 'P2',
    player_3: 'P3',
    player_4: 'P4'
};

const STAT_ROWS: Array<{ key: keyof EntityStats; label: string }> = [
    { key: 'maxHealth', label: 'Vida Maxima' },
    { key: 'healthRegen', label: 'Regeneracao' },
    { key: 'bodyDamage', label: 'Dano Contato' },
    { key: 'bulletDamage', label: 'Dano Projetil' },
    { key: 'bulletSpeed', label: 'Vel. Projetil' },
    { key: 'bulletPenetration', label: 'Penetracao' },
    { key: 'reloadPoints', label: 'Recarga' },
    { key: 'movementSpeed', label: 'Velocidade' }
];

export class HudController {
    private readonly unsubscribers: Array<() => void> = [];
    private readonly waveTransitionTimeoutIds: number[] = [];
    private readonly playerPanelEls = new Map<PlayerId, HTMLElement>();
    private readonly playerPanelHtml = new Map<PlayerId, string>();

    private currentPlayers: EntityData[] = [];
    private activePreviewModifiers: StatModifiers | null = null;
    private activeStatsPlayerId: PlayerId = 'player_1';
    private activeUpgradePlayerId: PlayerId | null = null;
    private openedStatsPlayerId: PlayerId | null = null;
    private readonly closedUpgradeStatsPlayerIds = new Set<PlayerId>();
    private statsInteractionMode: 'wave' | 'pause' | 'upgrade' = 'wave';
    private toastTimeoutId: number | null = null;

    private readonly waveInfoTitleEl = this.getEl<HTMLElement>('hud-wave-info-title');
    private readonly waveInfoSubEl = this.getEl<HTMLElement>('hud-wave-info-sub');
    private readonly waveTransitionEl = this.getEl<HTMLElement>('hud-wave-transition');
    private readonly enemyCounterEl = this.getEl<HTMLElement>('hud-enemy-counter');
    private readonly coinCounterEl = this.getEl<HTMLElement>('hud-coin-counter');
    private readonly objectiveEl = this.getEl<HTMLElement>('hud-objective');
    private readonly objectiveLabelEl = this.getEl<HTMLElement>('hud-objective-label');
    private readonly objectiveFillEl = this.getEl<HTMLElement>('hud-objective-fill');
    private readonly bossBarEl = this.getEl<HTMLElement>('hud-boss-bar');
    private readonly bossNameEl = this.getEl<HTMLElement>('hud-boss-name');
    private readonly bossFillEl = this.getEl<HTMLElement>('hud-boss-fill');
    private readonly bossValueEl = this.getEl<HTMLElement>('hud-boss-value');
    private readonly statsRootEl = this.getEl<HTMLElement>('hud-stats');
    private readonly levelLabelEl = this.getEl<HTMLElement>('hud-level-label');
    private readonly xpProgressEl = this.getEl<HTMLElement>('hud-xp-progress');
    private readonly xpFillEl = this.getEl<HTMLElement>('hud-xp-fill');
    private readonly upgradeBankEl = this.getEl<HTMLButtonElement>('hud-upgrade-bank');
    private readonly globalMaxWaveEl = this.getEl<HTMLElement>('stat-max-wave');
    private readonly globalTotalKillsEl = this.getEl<HTMLElement>('stat-total-kills');
    private readonly globalTotalAnomaliesEl = this.getEl<HTMLElement>('stat-total-anomalies');
    private readonly toastEl = this.getEl<HTMLElement>('hud-toast');

    constructor() {
        this.bindEvents();
        this.bindStatsRoot();
        this.renderWaveInfo(1, 'CLEAR', 0, 0, false, false);
        this.renderEnemyCount(0);
        this.renderCoinCount(0);
        this.renderObjective(null);
        this.renderBossBar(null);
        this.renderPrimaryXp(null);
        this.renderGlobalStats(this.loadStats());
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
        this.currentPlayers = [];
        this.activePreviewModifiers = null;
        this.activeStatsPlayerId = 'player_1';
        this.activeUpgradePlayerId = null;
        this.openedStatsPlayerId = null;
        this.closedUpgradeStatsPlayerIds.clear();
        this.clearWaveTransitionTimers();
        this.hideWaveTransition();
        this.setStatsPinned(false);
        this.clearStatPreview();
        this.renderWaveInfo(1, 'CLEAR', 0, 0, false, false);
        this.renderEnemyCount(0);
        this.renderCoinCount(0);
        this.renderObjective(null);
        this.renderBossBar(null);
        this.renderPrimaryXp(null);
        this.renderPlayerPanels([]);
    }

    public destroy(): void {
        this.clearWaveTransitionTimers();
        for (const unsubscribe of this.unsubscribers) unsubscribe();
        this.unsubscribers.length = 0;
    }

    public setStatsPinned(pinned: boolean, mode: 'pause' | 'upgrade' = 'pause'): void {
        this.statsInteractionMode = pinned ? mode : 'wave';
        this.statsRootEl?.classList.toggle('is-pinned-mode', pinned);
        this.statsRootEl?.classList.toggle('is-upgrade-mode', this.statsInteractionMode === 'upgrade');
        this.statsRootEl?.classList.toggle('is-pause-mode', this.statsInteractionMode === 'pause');
        if (!pinned || mode === 'pause') {
            this.openedStatsPlayerId = null;
        }
        this.syncPlayerPanelState();
    }

    public setActiveUpgradePlayer(playerId: PlayerId | null): void {
        const previousPlayerId = this.activeUpgradePlayerId;
        this.activeUpgradePlayerId = playerId;
        if (playerId) {
            this.activeStatsPlayerId = playerId;
            if (previousPlayerId !== playerId) {
                this.closedUpgradeStatsPlayerIds.delete(playerId);
            }
            this.openedStatsPlayerId = this.closedUpgradeStatsPlayerIds.has(playerId) ? null : playerId;
        } else {
            this.openedStatsPlayerId = null;
            this.closedUpgradeStatsPlayerIds.clear();
        }
        this.syncPlayerPanelState();
    }

    public previewStatModifiers(modifiers: StatModifiers): void {
        this.activePreviewModifiers = { ...modifiers };
        this.renderPlayerPanels(this.currentPlayers);
    }

    public clearStatPreview(): void {
        this.activePreviewModifiers = null;
        this.renderPlayerPanels(this.currentPlayers);
    }

    private bindEvents(): void {
        this.unsubscribers.push(onGameEvent(GameEvents.STATE_UPDATE, (state) => this.handleStateUpdate(state)));

        this.unsubscribers.push(onGameEvent(GameEvents.WAVE_CLEAR_ANIMATION_START, ({ waveCleared, durationMs }) => {
            this.playWaveMessage(`ONDA ${waveCleared} CONCLUIDA`, true, durationMs);
        }));

        this.unsubscribers.push(onGameEvent(GameEvents.WAVE_STARTING_ANIMATION_START, ({ wave, waveType, durationMs }) => {
            const kindLabel = waveType === 'BOSS' ? 'BOSS' : waveType === 'SURVIVE' ? 'SOBREVIVENCIA' : 'ELIMINACAO';
            this.playWaveMessage(`ONDA ${wave} - ${kindLabel}`, waveType === 'BOSS', durationMs);
        }));

        this.unsubscribers.push(onGameEvent(GameEvents.ANOMALY_ENCOUNTER_START, () => {
            this.playWaveMessage('ANOMALIA DETECTADA', true, 1800);
        }));

        this.unsubscribers.push(onGameEvent(GameEvents.WAVE_SPAWNING_RESUMED, () => this.hideWaveTransition()));

        this.unsubscribers.push(onGameEvent(GameEvents.AUDIO_SETTINGS_CHANGED, (prefs) => {
            localStorage.setItem('coreio_audio', JSON.stringify(prefs));
        }));

        this.unsubscribers.push(onGameEvent(GameEvents.GAME_OVER, ({ waveReached, enemiesKilled, anomaliesMet }) => {
            this.clearWaveTransitionTimers();
            this.hideWaveTransition();
            this.setStatsPinned(false);
            this.clearStatPreview();
            this.renderObjective(null);
            this.renderBossBar(null);

            const current = this.loadStats();
            this.saveStats({
                maxWave: Math.max(current.maxWave, waveReached),
                totalKills: current.totalKills + enemiesKilled,
                totalAnomalies: current.totalAnomalies + anomaliesMet,
            });
        }));

        this.unsubscribers.push(onGameEvent(GameEvents.OBJECTIVE_COMPLETED, ({ title, rewardUpgrades }) => {
            this.playWaveMessage(`${title}: +${rewardUpgrades} aprimoramento`, false, 1600);
        }));

        this.unsubscribers.push(onGameEvent(GameEvents.AUTO_FIRE_TOGGLED, ({ enabled }) => {
            this.showToast(enabled ? 'Auto-Fire ON' : 'Auto-Fire OFF');
        }));

        this.unsubscribers.push(onGameEvent(GameEvents.AUTO_SPIN_TOGGLED, ({ enabled }) => {
            this.showToast(enabled ? 'Auto-Spin ON' : 'Auto-Spin OFF');
        }));
    }

    private bindStatsRoot(): void {
        this.statsRootEl?.addEventListener('pointerdown', (event) => {
            if (this.statsInteractionMode === 'wave') return;
            const button = (event.target as HTMLElement).closest<HTMLElement>('.hud-player-stat-button');
            if (!button?.dataset.playerId) return;
            event.preventDefault();
            event.stopPropagation();
            this.toggleStatsPanel(button.dataset.playerId as PlayerId);
        });
    }

    private toggleStatsPanel(playerId: PlayerId): void {
        this.activeStatsPlayerId = playerId;

        if (this.openedStatsPlayerId === playerId) {
            this.openedStatsPlayerId = null;
            if (this.statsInteractionMode === 'upgrade') {
                this.closedUpgradeStatsPlayerIds.add(playerId);
            }
        } else {
            this.openedStatsPlayerId = playerId;
            this.closedUpgradeStatsPlayerIds.delete(playerId);
            if (this.statsInteractionMode === 'upgrade' && this.activeUpgradePlayerId && playerId !== this.activeUpgradePlayerId) {
                this.closedUpgradeStatsPlayerIds.add(this.activeUpgradePlayerId);
            }
        }

        this.syncPlayerPanelState();
    }

    private handleStateUpdate(state: GameState): void {
        this.currentPlayers = state.players?.length ? state.players : [state.player];
        document.documentElement.style.setProperty('--hud-primary-color', this.colorToHex(this.currentPlayers[0]?.color));
        document.documentElement.classList.toggle('is-local-coop', this.currentPlayers.length > 1);
        this.renderWaveInfo(
            state.currentWave,
            state.waveType,
            state.remainingToKill,
            state.surviveTimeRemainingSeconds,
            state.isAnomalyEncounter ?? false,
            state.isShop ?? false
        );
        this.renderEnemyCount(state.activeEnemyCount);
        this.renderCoinCount(state.coins);
        if (this.objectiveEl) this.objectiveEl.hidden = state.isShop ?? false;
        if (!(state.isShop ?? false)) this.renderObjective(state.objective);
        this.renderPrimaryXp(this.currentPlayers[0] ?? null);
        this.renderBossBar(state);
        this.renderPlayerPanels(this.currentPlayers);
        this.renderUpgradeBank(this.currentPlayers);

        if (this.statsInteractionMode === 'upgrade' && this.activeUpgradePlayerId && !this.openedStatsPlayerId && !this.closedUpgradeStatsPlayerIds.has(this.activeUpgradePlayerId)) this.openedStatsPlayerId = this.activeUpgradePlayerId;
        this.syncPlayerPanelState();
    }

    private renderWaveInfo(
        wave: number,
        waveType: 'CLEAR' | 'SURVIVE' | 'BOSS',
        remainingToKill: number,
        surviveTimeRemaining: number,
        isAnomalyEncounter: boolean,
        isShop: boolean
    ): void {
        if (this.waveInfoTitleEl) {
            const typeLabel = isAnomalyEncounter
                ? 'Anomalia'
                : isShop
                ? 'Loja'
                : waveType === 'BOSS'
                ? 'Boss'
                : waveType === 'SURVIVE'
                    ? 'Sobrevivencia'
                    : 'Eliminacao';
            this.setText(this.waveInfoTitleEl, `Onda ${wave.toString().padStart(2, '0')}  ${typeLabel}`);
        }

        if (this.waveInfoSubEl) {
            if (isShop) {
                this.waveInfoSubEl.textContent = 'Compre melhorias antes do boss';
                this.waveInfoSubEl.classList.remove('is-danger');
            } else if (isAnomalyEncounter) {
                this.waveInfoSubEl.textContent = 'Identifique e neutralize a anomalia';
                this.waveInfoSubEl.classList.add('is-danger');
            } else if (waveType === 'BOSS') {
                this.waveInfoSubEl.textContent = 'Derrote o boss';
                this.waveInfoSubEl.classList.remove('is-danger');
            } else if (waveType === 'SURVIVE') {
                this.waveInfoSubEl.textContent = `Tempo: ${this.formatCountdown(surviveTimeRemaining)}`;
                this.waveInfoSubEl.classList.toggle('is-danger', surviveTimeRemaining <= 10);
            } else {
                this.waveInfoSubEl.textContent = `Restam: ${Math.max(0, remainingToKill)}`;
                this.waveInfoSubEl.classList.remove('is-danger');
            }
        }
    }

    private renderEnemyCount(activeCount: number): void {
        this.setText(this.enemyCounterEl, `Inimigos  ${Math.max(0, activeCount).toString().padStart(2, '0')}`);
    }

    private renderCoinCount(coins: number): void {
        if (!this.coinCounterEl) return;
        this.coinCounterEl.textContent = `Moedas: ${Math.max(0, coins)}`;
    }

    private renderObjective(objective: ObjectiveState | null): void {
        if (!objective) {
            this.setText(this.objectiveLabelEl ?? this.objectiveEl, 'Objetivo --');
            this.objectiveFillEl?.style.setProperty('width', '0%');
            this.objectiveEl?.classList.remove('is-complete', 'is-failed');
            return;
        }

        const progress = Math.max(0, Math.min(1, objective.progress / Math.max(1, objective.target)));
        this.setText(
            this.objectiveLabelEl ?? this.objectiveEl,
            `${objective.description}  ${Math.floor(objective.progress)}/${Math.floor(objective.target)}`
        );
        this.objectiveFillEl?.style.setProperty('width', `${(progress * 100).toFixed(2)}%`);
        this.objectiveEl?.classList.toggle('is-complete', objective.completed);
        this.objectiveEl?.classList.toggle('is-failed', objective.failed);
    }

    private renderBossBar(state: GameState | null): void {
        const boss = state?.enemies.find((enemy) => enemy.enemyType === 'DREADNOUGHT' && !enemy.isDead) ?? null;
        if (!this.bossBarEl) return;

        this.bossBarEl.hidden = !boss;
        if (!boss) return;

        const ratio = Math.max(0, Math.min(1, boss.health / Math.max(1, boss.stats.maxHealth)));
        this.setText(this.bossNameEl, 'DREADNOUGHT');
        this.setText(this.bossValueEl, `${this.fmt0(boss.health)} / ${this.fmt0(boss.stats.maxHealth)}`);
        this.bossFillEl?.style.setProperty('width', `${(ratio * 100).toFixed(2)}%`);
    }

    private renderPrimaryXp(player: EntityData | null): void {
        const level = player?.level ?? 1;
        const currentXp = player?.currentXp ?? 0;
        const xpRequired = Math.max(1, player?.xpToNextLevel ?? 100);
        const ratio = Math.max(0, Math.min(1, currentXp / xpRequired));

        this.setText(this.levelLabelEl, `NIVEL ${level.toString().padStart(2, '0')}`);
        this.setText(this.xpProgressEl, `${this.fmt0(currentXp)} / ${this.fmt0(xpRequired)} XP`);
        this.xpFillEl?.style.setProperty('width', `${(ratio * 100).toFixed(2)}%`);
    }

    private renderPlayerPanels(players: EntityData[]): void {
        if (!this.statsRootEl) return;

        const activeIds = new Set(players.map((player) => player.id as PlayerId));
        for (const playerId of PLAYER_IDS) {
            if (!activeIds.has(playerId)) {
                this.playerPanelEls.get(playerId)?.remove();
                this.playerPanelEls.delete(playerId);
                this.playerPanelHtml.delete(playerId);
            }
        }

        for (const player of players) {
            const playerId = player.id as PlayerId;
            let panel = this.playerPanelEls.get(playerId);
            if (!panel) {
                panel = document.createElement('section');
                panel.className = `hud-player-panel hud-player-panel--${playerId}`;
                panel.dataset.playerId = playerId;
                this.playerPanelEls.set(playerId, panel);
                this.statsRootEl.appendChild(panel);
            }
            panel.style.setProperty('--player-color', this.colorToHex(player.color));
            const html = this.getPlayerPanelHtml(player);
            if (this.playerPanelHtml.get(playerId) !== html) {
                panel.innerHTML = html;
                this.playerPanelHtml.set(playerId, html);
            }
        }

        this.syncPlayerPanelState();
    }

    private renderUpgradeBank(players: EntityData[]): void {
        if (!this.upgradeBankEl) return;
        const pendingPlayers = players.filter((player) => Math.max(0, player.pendingUpgrades ?? 0) > 0);
        const totalPending = pendingPlayers.reduce((total, player) => total + Math.max(0, player.pendingUpgrades ?? 0), 0);
        const ownerColor = this.colorToHex(players[0]?.color);
        this.upgradeBankEl.hidden = pendingPlayers.length === 0 || this.activeUpgradePlayerId !== null;
        this.upgradeBankEl.classList.toggle('is-coop-bank', players.length > 1);
        this.upgradeBankEl.innerHTML = players.length > 1
            ? `<span class="hud-upgrade-bank-label">MELHORIAS</span>${pendingPlayers.map((player, index) => {
                const playerId = player.id as PlayerId;
                const separator = index === 0 ? '' : '<span class="hud-upgrade-bank-separator">|</span>';
                return `${separator}<span class="hud-upgrade-bank-item" style="--player-color:${this.colorToHex(player.color)}"><small>${this.escapeHtml(player.name ?? PLAYER_SLOT_LABELS[playerId])}</small><strong>${player.pendingUpgrades ?? 0}</strong></span>`;
            }).join('')}`
            : `<span class="hud-upgrade-bank-label">MELHORIAS</span><span class="hud-upgrade-bank-count">${totalPending}</span>`;
        this.upgradeBankEl.title = `Abrir ${totalPending} melhoria${totalPending === 1 ? '' : 's'} pendente${totalPending === 1 ? '' : 's'}`;
        this.upgradeBankEl.dataset.tooltip = `${totalPending} carta${totalPending === 1 ? '' : 's'} para escolher`;
        this.upgradeBankEl.style.setProperty('--player-color', ownerColor);
    }

    private getPlayerPanelHtml(player: EntityData): string {
        const playerId = player.id as PlayerId;
        const stats = player.stats ?? DEFAULT_PLAYER_STATS;
        const healthRatio = Math.max(0, Math.min(1, player.health / Math.max(1, stats.maxHealth)));
        const xpRatio = Math.max(0, Math.min(1, (player.currentXp ?? 0) / Math.max(1, player.xpToNextLevel ?? 100)));
        const colorDef = this.getColorDefinition(player);
        const tierLabel = colorDef ? this.getTierLabel(colorDef) : 'BASE';
        const previewStats = this.getPreviewStats(player, stats);

        return `
            <button class="hud-player-stat-button" type="button" data-player-id="${playerId}">
                <span class="hud-player-dot"></span>
                <span class="hud-player-id">${PLAYER_SLOT_LABELS[playerId]}</span>
                <strong>${this.escapeHtml(player.name ?? PLAYER_SLOT_LABELS[playerId])}</strong>
                <span class="hud-player-level">LV ${player.level ?? 1}</span>
                <span class="hud-player-button-xp-track"><span style="width:${(xpRatio * 100).toFixed(2)}%"></span></span>
                <span class="hud-player-xp-brief">${this.fmt0(player.currentXp ?? 0)}/${this.fmt0(player.xpToNextLevel ?? 100)} XP</span>
                <span class="hud-player-money">${this.getCoinIconHtml('pair')}<strong>${this.fmt0(player.coins ?? 0)}</strong></span>
            </button>
            <div class="hud-player-stat-panel">
                <header>
                    <span class="hud-player-dot"></span>
                    <div>
                        <small>${PLAYER_SLOT_LABELS[playerId]}  ${tierLabel}</small>
                        <h2>${this.escapeHtml(player.name ?? PLAYER_SLOT_LABELS[playerId])}</h2>
                    </div>
                    <div class="hud-player-money-detail">${this.getCoinIconHtml('stack')}<strong>${this.fmt0(player.coins ?? 0)}</strong></div>
                </header>
                <div class="hud-player-health">
                    <div><span>Vida</span><strong>${this.fmt0(player.health)} / ${this.fmt0(stats.maxHealth)}</strong></div>
                    <span class="hud-player-health-track"><span style="width:${(healthRatio * 100).toFixed(2)}%"></span></span>
                </div>
                <div class="hud-player-xp">
                    <span>Nivel ${player.level ?? 1}</span>
                    <span class="hud-player-xp-track"><span style="width:${(xpRatio * 100).toFixed(2)}%"></span></span>
                    <strong>${this.fmt0(player.currentXp ?? 0)} / ${this.fmt0(player.xpToNextLevel ?? 100)} XP</strong>
                </div>
                <ul>${STAT_ROWS.map((row) => this.getStatRowHtml(row, stats, previewStats, colorDef)).join('')}</ul>
            </div>
        `;
    }

    private getCoinIconHtml(variant: 'pair' | 'stack'): string {
        const coins = variant === 'stack'
            ? '<span class="hud-coin hud-coin--back"></span><span class="hud-coin hud-coin--middle"></span><span class="hud-coin hud-coin--front"></span>'
            : '<span class="hud-coin hud-coin--back"></span><span class="hud-coin hud-coin--front"></span>';

        return `<span class="hud-player-money-icon hud-player-money-icon--${variant}" aria-hidden="true">${coins}<span class="hud-sparkle hud-sparkle--one"></span><span class="hud-sparkle hud-sparkle--two"></span><span class="hud-sparkle hud-sparkle--three"></span><span class="hud-sparkle hud-sparkle--four"></span></span>`;
    }

    private getStatRowHtml(
        row: { key: keyof EntityStats; label: string },
        stats: EntityStats,
        previewStats: EntityStats | null,
        colorDef: ColorDefinition | null
    ): string {
        const value = stats[row.key];
        const previewValue = previewStats?.[row.key] ?? value;
        const delta = previewStats ? previewValue - value : 0;
        const buff = colorDef?.modifiers[row.key] ?? 0;
        const classes = [
            delta > 0 ? 'is-preview-positive' : delta < 0 ? 'is-preview-negative' : '',
            buff > 0 ? 'is-color-buff' : buff < 0 ? 'is-color-nerf' : ''
        ].filter(Boolean).join(' ');
        const displayValue = row.key === 'reloadPoints' ? this.formatReloadValue(value) : this.fmt1(value);
        const previewText = delta === 0 ? '' : ` <em>${delta > 0 ? '+' : ''}${this.fmt1(delta)}</em>`;

        return `<li class="${classes}"><span>${row.label}</span><strong>${displayValue}${previewText}</strong></li>`;
    }

    private syncPlayerPanelState(): void {
        for (const [playerId, panel] of this.playerPanelEls) {
            panel.classList.toggle('is-open', playerId === this.openedStatsPlayerId);
            panel.classList.toggle('is-active-upgrade', playerId === this.activeUpgradePlayerId);
            panel.classList.toggle('is-selected', playerId === this.activeStatsPlayerId);
        }
    }

    private getPreviewStats(player: EntityData, stats: EntityStats): EntityStats | null {
        if (!this.activePreviewModifiers || player.id !== this.activeUpgradePlayerId) return null;
        return {
            maxHealth: stats.maxHealth + (this.activePreviewModifiers.maxHealth ?? 0),
            healthRegen: stats.healthRegen + (this.activePreviewModifiers.healthRegen ?? 0),
            bodyDamage: stats.bodyDamage + (this.activePreviewModifiers.bodyDamage ?? 0),
            bulletSpeed: stats.bulletSpeed + (this.activePreviewModifiers.bulletSpeed ?? 0),
            bulletPenetration: stats.bulletPenetration + (this.activePreviewModifiers.bulletPenetration ?? 0),
            bulletDamage: stats.bulletDamage + (this.activePreviewModifiers.bulletDamage ?? 0),
            reloadPoints: Math.max(0, stats.reloadPoints + (this.activePreviewModifiers.reloadPoints ?? 0)),
            movementSpeed: stats.movementSpeed + (this.activePreviewModifiers.movementSpeed ?? 0)
        };
    }

    private getColorDefinition(player: EntityData): ColorDefinition | null {
        if (player.color === undefined) return null;
        return getColorDefinition(this.colorToHex(player.color)) ?? null;
    }

    private getTierLabel(colorDef: ColorDefinition): string {
        if (colorDef.tier === 'PRIMARY') return `${colorDef.name} Base`;
        if (colorDef.tier === 'SECONDARY') return `${colorDef.name} Core`;
        return `${colorDef.name} Prime`;
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

    private playWaveMessage(text: string, isDanger: boolean, durationMs: number): void {
        this.clearWaveTransitionTimers();
        this.showWaveTransition(text, isDanger);
        this.waveTransitionTimeoutIds.push(window.setTimeout(() => this.hideWaveTransition(), Math.max(250, durationMs)));
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
        if (this.toastTimeoutId !== null) window.clearTimeout(this.toastTimeoutId);
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
        for (const timeoutId of this.waveTransitionTimeoutIds) window.clearTimeout(timeoutId);
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

    private colorToHex(color: number | undefined): string {
        return `#${(color ?? 0x4488ff).toString(16).padStart(6, '0')}`;
    }

    private escapeHtml(value: string): string {
        const replacements: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return value.replace(/[&<>"']/g, (char) => replacements[char] ?? char);
    }

    private setText(element: HTMLElement | null, value: string): void {
        if (element) element.textContent = value;
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
