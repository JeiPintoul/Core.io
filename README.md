# Core.io

**Core.io** é um roguelike de arena web estilo *.io*, focado em sobrevivência contra hordas de inimigos. O jogador evolui seu tanque adquirindo novas habilidades a cada nível para suportar ondas progressivamente mais difíceis.

Este projeto foi construído com uma arquitetura **"Online-Ready"** (Servidor Simulado), preparando o terreno para futuras implementações de multiplayer cooperativo e competitivo.

## Tecnologias Utilizadas

O ecossistema do projeto foi escolhido para garantir alta performance e manutenibilidade por uma equipe de múltiplos desenvolvedores:

* **Linguagem:** [TypeScript](https://www.typescriptlang.org/) (Tipagem estática e segurança).
* **Game Engine:** [Phaser 3](https://phaser.io/) (Renderização 2D via WebGL/Canvas e Arcade Physics).
* **Mensageria:** [EventEmitter3](https://github.com/primus/eventemitter3) (Padrão Pub/Sub para comunicação assíncrona).
* **Bundler / Dev Server:** [Vite](https://vitejs.dev/) (Build super rápido e Hot Module Replacement).
* **Interface (UI):** HTML5 e CSS3 (Menus, HUD e telas sobrepostas ao jogo).

## Arquitetura: Servidor Simulado (Monorepo)

Para evitar código "espaguete" e garantir uma transição suave para um futuro multiplayer online, o projeto adota uma rigorosa **separação de domínios**. A lógica matemática do jogo nunca interage diretamente com as funções de desenho na tela.

A ponte entre esses dois mundos é feita exclusivamente pelo `EventBus` (Padrão Publish-Subscribe).

### Estrutura de Diretórios

    core.io/
    ├── public/              # Assets estáticos puros.
    │   └── assets/          # Imagens, sprites, sons e arquivos JSON.
    ├── src/
    │   ├── client/          # Frontend: Renderização visual. Exclusivo para Phaser e UI.
    │   ├── logic/           # Backend Local: Matemática pura. Gerencia colisões (AABB), IA e estado.
    │   ├── shared/          # Base: Constantes de balanceamento e a instância do EventBus.
    │   ├── style.css        # Estilos globais para a UI e contêiner do jogo.
    │   └── main.ts          # Ponto de entrada que inicializa a Lógica e o Cliente.

## Como Rodar o Projeto Localmente

Certifique-se de ter o [Node.js](https://nodejs.org/) instalado em sua máquina.

1. **Clone o repositório:**
   `git clone https://github.com/SEU-USUARIO/core.io.git`
   `cd core.io`

2. **Instale as dependências:**
   `npm install`

3. **Inicie o servidor de desenvolvimento:**
   `npm run dev`

4. Acesse `http://localhost:5173` no seu navegador.

## Fluxo de Trabalho (Para a Equipe)

Estamos utilizando o padrão **GitHub Flow** com bloqueio da branch `main`. Todo código deve ser aprovado via Pull Request (PR).

### Regras de Versionamento:
1. **Nunca** faça commits diretos na branch `main`.
2. Antes de iniciar uma tarefa, sempre atualize seu repositório local:
   `git pull origin main`
3. Crie uma branch nomeada de acordo com o escopo da tarefa:
   * Funcionalidades: `feat/nome-da-tarefa` (ex: `feat/menu-inicial`)
   * Correções: `fix/nome-do-bug` (ex: `fix/colisao-inimigo`)
   * Assets/Artes: `assets/novas-texturas`
4. Após finalizar, faça o push da sua branch e abra um **Pull Request** para a `main` solicitando revisão de pelo menos um colega.

### Padronização de Código (Prettier):
Recomendamos o uso da extensão **Prettier** no VS Code. O projeto possui um arquivo `.prettierrc` e as configurações no `.vscode/settings.json` garantem que o código seja formatado automaticamente ao salvar (`Format on Save`).