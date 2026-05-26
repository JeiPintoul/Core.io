import type { GameEngine } from '../logic/GameEngine';

interface DebugCommand {
    key: string;
    title: string;
    description: string;
    action: () => void;
}

export class GodMode {
    private isActive = false;
    private readonly panel: HTMLElement;
    private statusLabel!: HTMLElement;
    private lastActionLabel!: HTMLElement;

    private readonly commands: DebugCommand[];

    constructor(private readonly engine: GameEngine) {
        this.commands = [
            {
                key: 'I',
                title: 'Invencibilidade',
                description: 'Ativa ou desativa invencibilidade dos jogadores',
                action: () => {
                    this.engine.setDebugInvincibility(!this.engine.debugIsInvincible());
                }
            },
            {
                key: 'W',
                title: 'Passar de onda',
                description: 'Avanca imediatamente para a proxima onda ou derrota o boss atual',
                action: () => this.engine.debugForceAdvanceWave()
            },
            {
                key: 'H',
                title: 'Recuperar vida',
                description: 'Restaura a vida dos jogadores para o maximo',
                action: () => this.engine.debugHealPlayer()
            },
            {
                key: 'C',
                title: 'Pegar carta',
                description: 'Concede uma carta de aprimoramento aleatoria',
                action: () => this.engine.debugGrantRandomCard()
            },
            {
                key: 'E',
                title: 'Spawnar inimigo',
                description: 'Cria um inimigo extra proximo dos jogadores',
                action: () => this.engine.debugSpawnEnemy()
            },
            {
                key: 'B',
                title: 'Spawnar boss',
                description: 'Inicia um duelo contra o proximo boss',
                action: () => this.engine.debugSpawnBoss()
            },
            {
                key: 'L',
                title: 'Upar nivel',
                description: 'Concede um nivel extra e um aprimoramento pendente',
                action: () => this.engine.debugLevelUpPlayer()
            },
            {
                key: 'M',
                title: 'Adicionar dinheiro',
                description: 'Adiciona 500 moedas ao saldo atual',
                action: () => this.engine.debugGrantCoins(500)
            },
            {
                key: 'K',
                title: 'Matar inimigos',
                description: 'Elimina todos os inimigos vivos',
                action: () => this.engine.debugKillAllEnemies()
            }
        ];

        this.panel = this.createPanel();
        (document.getElementById('ui-layer') ?? document.body).appendChild(this.panel);
        globalThis.addEventListener('keydown', this.handleKeyDown);
    }

    private createPanel(): HTMLElement {
        const panel = document.createElement('div');
        panel.id = 'debug-mode-panel';
        panel.className = 'hidden';

        const title = document.createElement('div');
        title.className = 'debug-mode-title';
        title.textContent = 'GOD MODE';

        const subtitle = document.createElement('div');
        subtitle.className = 'debug-mode-subtitle';
        subtitle.textContent = 'Shift+G abre | Shift+tecla executa';

        this.statusLabel = document.createElement('div');
        this.statusLabel.className = 'debug-mode-status';
        this.statusLabel.textContent = 'Status: DESATIVADO';

        this.lastActionLabel = document.createElement('div');
        this.lastActionLabel.className = 'debug-mode-last-action';
        this.lastActionLabel.textContent = 'Ultima acao: nenhuma';

        const table = document.createElement('table');
        table.className = 'debug-mode-table';

        const body = document.createElement('tbody');
        for (const command of this.commands) {
            const row = document.createElement('tr');
            row.innerHTML = `<td><kbd>${command.key}</kbd></td><td>${command.title}</td>`;
            body.appendChild(row);
        }

        table.appendChild(body);
        panel.append(title, subtitle, this.statusLabel, table, this.lastActionLabel);

        return panel;
    }

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (event.shiftKey && event.code === 'KeyG') {
            event.preventDefault();
            this.toggle();
            return;
        }

        if (!this.isActive) {
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            this.hide();
            return;
        }

        const command = this.commands.find((item) => item.key === event.key.toUpperCase());
        if (!command || !event.shiftKey) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        command.action();
        this.lastActionLabel.textContent = `Ultima acao: ${command.title}`;
        this.refreshStatus();
    };

    private toggle(): void {
        this.isActive = !this.isActive;
        this.engine.toggleDebugGodMode();
        this.panel.classList.toggle('hidden', !this.isActive);
        this.refreshStatus();
    }

    private hide(): void {
        if (!this.isActive) {
            return;
        }

        this.isActive = false;
        this.engine.toggleDebugGodMode();
        this.panel.classList.add('hidden');
        this.refreshStatus();
    }

    private refreshStatus(): void {
        const invincibleText = this.engine.debugIsInvincible() ? 'SIM' : 'NAO';
        this.statusLabel.textContent = `Status: ${this.isActive ? 'ATIVADO' : 'DESATIVADO'} - Invencivel: ${invincibleText}`;
    }
}
