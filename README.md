# Core.io

**Core.io** é um roguelike de arena web estilo *.io*, focado em sobrevivência contra hordas de inimigos. O jogador evolui seu tanque adquirindo novas habilidades a cada nível para suportar ondas progressivamente mais difíceis.

O projeto segue uma arquitetura **online-ready** (cliente e lógica desacoplados) para facilitar evolução futura para multiplayer.

## Visão Geral (Estado Atual)

- Arena: **5000 x 5000**
- Loop de lógica próprio (60 FPS) no `GameEngine`
- Renderização no Phaser (cliente) via estado emitido no EventBus
- Input desacoplado da lógica
- Progressão com XP e level up automático

## Tecnologias

- **TypeScript**
- **Phaser 3**
- **EventEmitter3**
- **Vite**
- **HTML/CSS** para HUD e menus

## Arquitetura (Resumo)

Separação clara por domínio:

- `src/logic`: regras de jogo (movimento, spawn, colisão, dano, XP)
- `src/client`: renderização, câmera, input, HUD e animações visuais
- `src/shared`: tipos e contratos de evento

Comunicação entre lógica e cliente feita por **EventBus** (Pub/Sub), sem acoplamento direto.

## Estrutura de Pastas

```text
core.io/
├── src/
│   ├── client/
│   │   ├── PhaserGame.ts
│   │   ├── scenes/GameScene.ts
│   │   ├── render/
│   │   │   ├── GameRenderer.ts
│   │   │   └── HealthBarRenderer.ts
│   │   ├── input/InputHandler.ts
│   │   └── constants/GameConstants.ts
│   ├── logic/
│   │   ├── GameEngine.ts
│   │   ├── Entity.ts
│   │   ├── Player.ts
│   │   └── Enemy.ts
│   ├── shared/
│   │   ├── EventBus.ts
│   │   └── Types.ts
│   ├── main.ts
│   └── style.css
└── README.md
```

## Mecânicas Implementadas

### Movimento, Mira e Câmera

- Movimento em 8 direções com normalização de diagonal
- Mira do tanque baseada estritamente em:
  `Math.atan2(mouse.y - player.y, mouse.x - player.x)`
- Câmera com `startFollow` suave
- Escala responsiva com `Phaser.Scale.RESIZE` e centralização

### Combate e Colisão

- Tiro contínuo com projétil saindo da ponta do cano
- Colisão por raio (círculos)
- Sistema **Soft/Hard Collision**:
  - **Enemy x Enemy (soft):** só correção posicional suave
  - **Player x Enemy (hard):** correção posicional + impulso de knockback
- Knockback com velocidade dedicada (`knockbackVelocity`) + damping por tick
- Dano de contato com **micro-cooldown por alvo e por atacante** (100ms), sem i-frame global

### Dano e Progressão

- Dano de projétil com penetração
- XP por inimigo derrotado
- Level up automático
- Burst de XP pode gerar múltiplos level ups seguidos

## Game Feel e Feedback Visual

- Barra de HP com suavização por tween (sem “salto seco”)
- Animação de morte de entidade com tween
- Duração da animação de morte centralizada em constante:
  `DEATH_ANIMATION_DURATION_MS = 800`
- Ao morrer:
  - input é bloqueado imediatamente
  - engine é pausada imediatamente
  - menu de Game Over aparece após o delay da animação

## Fluxo Simplificado

```text
InputHandler -> EventBus(player_input)
GameEngine.tick/update -> EventBus(state_update)
GameScene/GameRenderer -> desenha frame

Colisão:
- soft (mesma facção): empurra
- hard (facções diferentes): empurra + knockback + dano com micro-cooldown
```

## Como Rodar

1. Instale dependências:

```bash
npm install
```

2. Rode em desenvolvimento:

```bash
npm run dev
```

3. Abra no navegador:

```text
http://localhost:5173
```

## Fluxo de Git da Equipe

- Não commitar direto na `main`
- Trabalhar em branch de feature/correção
- Abrir PR para revisão

Padrão de branch:

- `feat/nome-da-feature`
- `fix/nome-do-bug`

## Roadmap Curto

- UI de progressão (XP/nível/upgrades)
- Balanceamento fino de combate
- Novos tipos de inimigo
- Multiplayer (futuro)

---

Projeto acadêmico da equipe **Core.io**.
