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
<<<<<<< HEAD
                description: 'Ativa ou desativa invencibilidade do jogador',
=======
                description: 'Ativa ou desativa invencibilidade dos jogadores',
>>>>>>> main
                action: () => {
                    this.engine.setDebugInvincibility(!this.engine.debugIsInvincible());
                }
            },
            {
                key: 'W',
                title: 'Passar de onda',
<<<<<<< HEAD
                description: 'Avança imediatamente para a próxima onda ou derrota o boss atual',
=======
                description: 'Avanca imediatamente para a proxima onda ou derrota o boss atual',
>>>>>>> main
                action: () => this.engine.debugForceAdvanceWave()
            },
            {
                key: 'H',
                title: 'Recuperar vida',
<<<<<<< HEAD
                description: 'Restaura a vida do jogador para o máximo',
=======
                description: 'Restaura a vida dos jogadores para o maximo',
>>>>>>> main
                action: () => this.engine.debugHealPlayer()
            },
            {
                key: 'C',
                title: 'Pegar carta',
<<<<<<< HEAD
                description: 'Concede um cartão de aprimoramento aleatório',
=======
                description: 'Concede uma carta de aprimoramento aleatoria',
>>>>>>> main
                action: () => this.engine.debugGrantRandomCard()
            },
            {
                key: 'E',
                title: 'Spawnar inimigo',
<<<<<<< HEAD
                description: 'Cria um inimigo extra próximo do jogador',
=======
                description: 'Cria um inimigo extra proximo dos jogadores',
>>>>>>> main
                action: () => this.engine.debugSpawnEnemy()
            },
            {
                key: 'B',
                title: 'Spawnar boss',
<<<<<<< HEAD
                description: 'Inicia um duelo contra o boss Anomalia',
=======
                description: 'Inicia um duelo contra o proximo boss',
>>>>>>> main
                action: () => this.engine.debugSpawnBoss()
            },
            {
                key: 'L',
<<<<<<< HEAD
                title: 'Upar nível',
                description: 'Concede um nível extra e um aprimoramento pendente',
=======
                title: 'Upar nivel',
                description: 'Concede um nivel extra e um aprimoramento pendente',
>>>>>>> main
                action: () => this.engine.debugLevelUpPlayer()
            }
        ];

        this.panel = this.createPanel();
        document.body.appendChild(this.panel);
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
        subtitle.textContent = 'Shift+G para abrir; Shift + Tecla para executar';

        this.statusLabel = document.createElement('div');
        this.statusLabel.className = 'debug-mode-status';
        this.statusLabel.textContent = 'Status: DESATIVADO';

        this.lastActionLabel = document.createElement('div');
        this.lastActionLabel.className = 'debug-mode-last-action';
<<<<<<< HEAD
        this.lastActionLabel.textContent = 'Última ação: nenhuma';
=======
        this.lastActionLabel.textContent = 'Ultima acao: nenhuma';
>>>>>>> main

        const table = document.createElement('table');
        table.className = 'debug-mode-table';

        const header = document.createElement('thead');
        header.innerHTML = '<tr><th>Tecla</th><th>Comando</th></tr>';
        table.appendChild(header);

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
<<<<<<< HEAD
        if (!command) {
            return;
        }

        // Only execute commands when Shift is held to avoid conflicting with gameplay keys
        if (!event.shiftKey) {
=======
        if (!command || !event.shiftKey) {
>>>>>>> main
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        command.action();
<<<<<<< HEAD
        this.lastActionLabel.textContent = `Última ação: ${command.title}`;
=======
        this.lastActionLabel.textContent = `Ultima acao: ${command.title}`;
>>>>>>> main
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
<<<<<<< HEAD
        const invincibleText = this.engine.debugIsInvincible() ? 'SIM' : 'NÃO';
        this.statusLabel.textContent = `Status: ${this.isActive ? 'ATIVADO' : 'DESATIVADO'} · Invencível: ${invincibleText}`;
=======
        const invincibleText = this.engine.debugIsInvincible() ? 'SIM' : 'NAO';
        this.statusLabel.textContent = `Status: ${this.isActive ? 'ATIVADO' : 'DESATIVADO'} - Invencivel: ${invincibleText}`;
>>>>>>> main
    }
}
