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
    │   │   ├── PhaserGame.ts          # Inicializador do Phaser
    │   │   ├── scenes/                # Cenas do Phaser
    │   │   │   └── GameScene.ts       # Orquestração: Lifecycle + Câmera
    │   │   ├── render/                # Renderização modularizada
    │   │   │   ├── GameRenderer.ts    # Lógica de desenho de entidades
    │   │   │   └── HealthBarRenderer.ts # Barras de HP
    │   │   ├── input/                 # Captura de input
    │   │   │   └── InputHandler.ts    # Teclado + Mouse
    │   │   └── constants/
    │   │       └── GameConstants.ts   # Cores, dimensões, config visual
    │   ├── logic/           # Backend Local: Matemática pura. Gerencia colisões, IA e estado.
    │   │   ├── GameEngine.ts          # Núcleo: Update, Colisões, Spawning
    │   │   ├── Player.ts              # Jogador + Sistema de XP
    │   │   ├── Enemy.ts               # Inimigos + IA de Perseguição
    │   │   └── Entity.ts              # Base para entidades
    │   ├── shared/          # Base: Constantes de balanceamento e EventBus.
    │   │   ├── EventBus.ts            # Pub/Sub Central
    │   │   └── Types.ts               # Tipos compartilhados
    │   ├── style.css        # Estilos globais para a UI e contêiner do jogo.
    │   └── main.ts          # Ponto de entrada que inicializa a Lógica e o Cliente.

## Arquitetura Detalhada

### Cliente (src/client/)

O frontend foi **modularizado e segregado por responsabilidade**:

#### GameScene (Orquestrador)
- **Responsabilidade único:** Gerenciar lifecycle do Phaser e câmera
- **Delegation:** Delega renderização para `GameRenderer` e input para `InputHandler`
- **Tamanho:** ~56 linhas (antes: 350 linhas monolíticas)

#### GameRenderer
- Desenha **todas** as entidades (player, inimigos, projéteis)
- Gerencia barras de HP via `HealthBarRenderer`
- Recebe estado puro e renderiza sem efeitos colaterais
- **Testável:** Sem dependências de Phaser Scene

#### InputHandler
- Captura eventos do teclado (Arrow Keys + WASD)
- Captura mouse (posição + clique)
- Converte coordenadas de tela para mundo
- Emite eventos via `EventBus`

#### GameConstants
- **Cores, dimensões e opacidades** centralizadas
- Fácil ajustar visual sem mexer em código de lógica
- Stats de renderização (stroke width, offsets, etc.)

**Benefício:** Código cliente é puro e reutilizável. Fácil de testar sem Phaser.

---

### Engine (src/logic/)

O backend simulado gerencia toda a **lógica de jogo**:

#### GameEngine
- **Spawn automático** de inimigos em waves (configurável)
- **Colisão** entre entidades: Player ↔ Enemy, Projétil ↔ Enemy
- **Damage system:** Dano por contato e penetração
- **EventBus communication:** Nunca acessa diretamente o cliente

#### Player + Enemy AI
- **Player:** Héroe controlável + Sistema de **XP e Level Up**
  - Ganha XP ao derrotar inimigos
  - Automaticamente faz level up (próximo nível requer +50% XP)
  - Emite evento `level_up` para UI pausar e mostrar upgrades
  
- **Enemy:** IA de perseguição usando **Swarm Intelligence**
  - Normaliza vetor em direção ao player
  - Velocidade configurável
  - Respira limites do mapa

#### Fluxo de Atualização (60 FPS)

```
GameEngine.tick()
├── update(deltaTime)
│   ├── Player se move (input validado)
│   ├── Spawn automático de inimigos
│   │   └── SpawnConfig: { maxEnemies, spawnRadius, spawnInterval, xpDrop }
│   ├── enemy.update(playerX, playerY, dt)
│   │   └── IA de perseguição: calcula vetor normalizado
│   ├── Movimento de projéteis
│   └── checkCollisions()
│       ├── Player x Enemy → ambos sofrem dano
│       ├── Projétil x Enemy → dano + penetração
│       └── Inimigos mortos emitem 'enemy_destroyed' com XP
│
└── STATE_UPDATE emitido → Renderer
    └── GameScene e GameRenderer desenham novo frame

❗ Player ouve 'enemy_destroyed'
  └── gainXp() → levelUp() → emite 'level_up' → UI pausa
```

**Benefício:** Lógica é pura e determinística. Fácil de debugar e testar sem UI.

---

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

## ✨ Features Implementadas

### Mecânicas de Jogo ✅
- **Movimento do Player:** Arrow Keys ou WASD (8 direções)
- **Sistema de Tiro:** LMB seguro + Rotação do cano em tempo real
- **Inimigos Inteligentes:** Perseguem o player em horda com IA de Swarm
- **Spawn Automático:** Inimigos spawnam progressivamente (configurável)
- **Colisão Dinâmica:** Detecção com validação de penetração de projéteis
- **Dano por Contato:** Player x Enemy sofrem dano ao colidir

### Progressão & Economia 🎮
- **Sistema de XP:** Inimigos derrotados concedem XP
- **Level Up Automático:** Próximo nível requer +50% XP acumulado
- **Eventos de Level:** Para futura integração com menu de upgrades
- **XP Update em Tempo Real:** UI recebe notificações de ganho

### Renderização Modularizada 🎨
- **Graphics Objects Reutilizáveis:** Grid, arena, HUD separados por Z-order
- **Barras de HP Dinâmicas:** Cor muda com saúde (verde → vermelho)
- **Câmera Responsiva:** Segue o player e faz zoom
- **Canvas & WebGL:** Suporte automático via Phaser

### Arquitetura Limpa 🏗️
- **Separação Client/Logic:** Frontend nunca acessa lógica diretamente
- **EventBus Pub/Sub:** Comunicação assíncrona e desacoplada
- **Componentes Reutilizáveis:** Renderers, Input, Scenes isolados
- **TypeScript Strict:** Tipagem 100% em todo o projeto

---

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

## 🛣️ Roadmap (Próximos Passos)

### MVP (Deve ter) ✅ Parcial
- [x] Renderização modularizada (Phaser desacoplado)
- [x] Input System (Teclado + Mouse)
- [x] Colisão Entity x Projétil x Entity
- [x] IA de Perseguição (Swarm)
- [x] Sistema de XP & Level Up
- [x] Spawn automático de inimigos
- [ ] **UI de Progressão:** Barra de XP, Level display, Upgrades menu
- [ ] **Balanceamento:** Ajustar stats de dano, velocidade, spawn

### Phase 2 (Bom ter) ⏳
- [ ] Sistema de Upgrades: Speed, Damage, Health, Fire Rate
- [ ] Waves progressivas com escalabilidade
- [ ] Efeitos visuais: Explosões, dano, hit feedback
- [ ] Sons e música de fundo
- [ ] Leaderboard local (localStorage)

### Phase 3 (Nice-to-have) 🚀
- [ ] Multiplayer online (Servidor Node + WebSocket)
- [ ] Diferentes tipos de inimigos
- [ ] Power-ups temporários
- [ ] Mini-boss fights
- [ ] Customização de tanque (cores, skins)

---

## 📚 Recursos Adicionais

- **Phaser 3 Docs:** https://photonstorm.github.io/phaser3-docs/
- **EventEmitter3:** https://github.com/primus/eventemitter3
- **TypeScript Handbook:** https://www.typescriptlang.org/docs/

---

**Desenvolvido com ❤️ pela equipe Core.io**