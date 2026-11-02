# Core.io

Jogo web de arena com progressão roguelike, inspirado em jogos de sobrevivência a ondas e na estética de jogos .io. O jogador controla um tanque, enfrenta inimigos e chefes e escolhe melhorias para evoluir durante a partida.

**[Jogar no navegador](https://project-4j0xy.vercel.app/)** · **[Código-fonte](https://github.com/JeiPintoul/Core.io)**

## Funcionalidades

- Ondas progressivas com diferentes inimigos, encontros e chefes.
- Melhorias por cartas com raridades e atributos que alteram o tanque.
- Missões e objetivos por onda, recompensas, moedas e loja.
- Configuração para até quatro jogadores locais, com teclado e controles.
- Interface com HUD, minimapa, seleção de melhorias e menus.
- Pausa pelo `Esc`, ajustes de volume e mute pelo menu `AUDIO`, além de música de fundo.

## Tecnologias e arquitetura

Construído com **TypeScript, Phaser 3, Vite, EventEmitter3 e HTML/CSS**.

O código organiza as responsabilidades em três áreas:

| Área | Responsabilidade |
| --- | --- |
| `core.io/src/logic` | Simulação, entidades, combate, ondas, missões, loja e melhorias. |
| `core.io/src/client` | Cenas Phaser, renderização, efeitos, controles e HUD. |
| `core.io/src/shared` | Tipos, eventos e utilitários compartilhados. |

O `GameEngine` coordena a simulação e os sistemas de jogo. Módulos como `EncounterDirector`, `EnemyFactory`, `MissionManager` e `ShopManager` organizam encontros, criação de inimigos, objetivos e compras. A camada visual utiliza cenas, renderizadores e um gerenciador de entrada; eventos fazem a comunicação entre diferentes partes do jogo.

## Liderança e contribuições

Projeto desenvolvido em equipe, com **liderança técnica e desenvolvimento principal de [João Paulo Marcelino Silva](https://github.com/JeiPintoul)**.

Sua atuação incluiu:

- Definição do escopo, ideias, planejamento e roadmap.
- Escolha das tecnologias, definição da arquitetura e criação da estrutura inicial.
- Implementação da maior parte da lógica de jogo e das regras, além de toda a interface.
- Divisão de tarefas e organização do trabalho em branches individuais.
- Definição do fluxo de pull requests, revisão e integração das contribuições da equipe.

Outros integrantes também contribuíram com o projeto, incluindo sua publicação.

## Desenvolvimento assistido por IA

A implementação foi realizada majoritariamente com apoio de IA generativa, utilizada para desenvolver funcionalidades e auxiliar na revisão de pull requests. A definição de requisitos, a organização do trabalho e as decisões técnicas foram conduzidas pela liderança do projeto.

Os comportamentos dos inimigos presentes no código são implementados por regras e estados programados.

## Executar localmente

Os comandos da aplicação devem ser executados dentro da pasta `core.io`, que contém seu `package.json`.

```bash
git clone https://github.com/JeiPintoul/Core.io.git
cd Core.io/core.io
npm ci
npm run dev
```

Abra o endereço informado pelo Vite no terminal.

### Build e verificações

```bash
npm run typecheck
npm run lint
npm run build
```

Para visualizar o build localmente:

```bash
npm run preview
```

O script `npm run check` encadeia a checagem de tipos, o lint e o Vitest. Esta versão do repositório ainda não inclui arquivos de teste versionados.

## Colaboração

- Branches `feat/*` para novas funcionalidades.
- Branches `fix/*` para correções.
- Contribuições propostas por pull request para revisão antes da integração.

## Áudio

A música de fundo é carregada de `core.io/public/audio/bgm.mp3`.
