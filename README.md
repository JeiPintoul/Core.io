# Core.io

Core.io e um roguelike de arena para web, inspirado em jogos estilo .io.
O foco do jogo e sobreviver a ondas de inimigos e evoluir o tanque com cartas de upgrade.

## Tecnologias

- TypeScript
- Phaser 3
- EventEmitter3
- Vite
- HTML5/CSS3

## Estrutura

- `core.io/src/logic`: regras de negocio e simulacao de jogo
- `core.io/src/client`: renderizacao, input e HUD
- `core.io/src/shared`: tipos, eventos e utilitarios comuns

## Funcionalidades atuais

- Ondas progressivas com spawn por configuracao
- Inimigos kamikaze e ranged
- Sistema de upgrade por cartas com raridade
- Objetivos dinamicos por onda com recompensa extra
- Pause com menu (`Esc`)
- Menu de audio dentro do pause (`AUDIO`) com mute e volume
- Musica de fundo com loop e reinicio no `Restart`

## Instalacao e execucao

Importante: os comandos devem ser executados dentro da pasta `core.io`.

```bash
cd core.io
npm install
npm run dev
```

Build de producao:

```bash
npm run build
```

## Qualidade de codigo

Typecheck:

```bash
npm run typecheck
```

Validacao completa:

```bash
npm run check
```

## Musica de fundo

Para usar BGM, coloque o arquivo em:

`core.io/public/audio/bgm.mp3`

## Workflow

- `feat/*`: novas funcionalidades
- `fix/*`: correcoes

Contribuicoes via Pull Request.
