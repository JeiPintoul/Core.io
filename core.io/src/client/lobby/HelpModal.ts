interface KeybindGroup {
    title: string;
    rows: Array<{ keys: string[]; label: string }>;
}

const KEYBIND_GROUPS: KeybindGroup[] = [
    {
        title: 'Teclado + Mouse',
        rows: [
            { keys: ['W', 'A', 'S', 'D'], label: 'Mover' },
            { keys: ['Mouse'], label: 'Mirar' },
            { keys: ['LMB'], label: 'Atirar' },
            { keys: ['E'], label: 'Auto-Fire' },
            { keys: ['C'], label: 'Auto-Spin' },
            { keys: ['ESC'], label: 'Pausa' },
        ],
    },
    {
        title: 'Controle',
        rows: [
            { keys: ['LS'], label: 'Mover' },
            { keys: ['RS'], label: 'Mirar' },
            { keys: ['RT', 'A'], label: 'Atirar' },
            { keys: ['Start'], label: 'Pausa' },
            { keys: ['D-Pad'], label: 'Navegar menus' },
            { keys: ['A'], label: 'Confirmar' },
            { keys: ['B'], label: 'Voltar' },
        ],
    },
];

export class HelpModal {
    private readonly overlayEl: HTMLDivElement;

    constructor() {
        this.overlayEl = document.createElement('div');
        this.overlayEl.className = 'help-modal-overlay';
        this.overlayEl.hidden = true;
        this.overlayEl.addEventListener('click', (event) => {
            if (event.target === this.overlayEl) {
                this.close();
            }
        });

        const panel = document.createElement('div');
        panel.className = 'help-modal-panel';
        panel.append(this.buildHeader(), this.buildIntro(), this.buildKeybindGrid());
        this.overlayEl.appendChild(panel);

        document.body.appendChild(this.overlayEl);

        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !this.overlayEl.hidden) {
                event.stopPropagation();
                this.close();
            }
        });
    }

    public open(): void {
        this.overlayEl.hidden = false;
    }

    public close(): void {
        this.overlayEl.hidden = true;
    }

    public isOpen(): boolean {
        return !this.overlayEl.hidden;
    }

    private buildHeader(): HTMLElement {
        const header = document.createElement('header');
        header.className = 'help-modal-header';

        const title = document.createElement('h2');
        title.textContent = 'Como Jogar';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'help-modal-close';
        closeBtn.setAttribute('aria-label', 'Fechar');
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => this.close());

        header.append(title, closeBtn);
        return header;
    }

    private buildIntro(): HTMLElement {
        const intro = document.createElement('p');
        intro.className = 'help-modal-intro';
        intro.textContent = 'Sobreviva às ondas em cooperativo local. Elimine inimigos, suba de nível e escolha aprimoramentos para evoluir sua build a cada onda.';
        return intro;
    }

    private buildKeybindGrid(): HTMLElement {
        const grid = document.createElement('div');
        grid.className = 'help-modal-grid';

        for (const group of KEYBIND_GROUPS) {
            const column = document.createElement('section');
            column.className = 'help-modal-column';

            const heading = document.createElement('h3');
            heading.textContent = group.title;
            column.appendChild(heading);

            for (const row of group.rows) {
                const rowEl = document.createElement('div');
                rowEl.className = 'help-modal-row';

                const keysEl = document.createElement('span');
                keysEl.className = 'help-modal-keys';
                for (const key of row.keys) {
                    const kbd = document.createElement('kbd');
                    kbd.textContent = key;
                    keysEl.appendChild(kbd);
                }

                const labelEl = document.createElement('span');
                labelEl.className = 'help-modal-label';
                labelEl.textContent = row.label;

                rowEl.append(keysEl, labelEl);
                column.appendChild(rowEl);
            }

            grid.appendChild(column);
        }

        return grid;
    }
}
