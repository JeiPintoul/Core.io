# Core.io

Core.io é um roguelike de arena desenvolvido para web, inspirado na estética e mecânica de jogos estilo .io. O objetivo central é a sobrevivência contra hordas progressivas de inimigos através da evolução constante do tanque do jogador por meio de um sistema de cartas de upgrade.

O projeto utiliza uma arquitetura desacoplada entre cliente (renderização) e lógica (regras de negócio), preparando o sistema para futuras implementações de modo cooperativo e multiplayer.

## Tecnologias e Ferramentas

* Linguagem: TypeScript
* Engine Gráfica: Phaser 3
* Comunicação: EventEmitter3 (Arquitetura orientada a eventos)
* Bundler: Vite
* Interface: HTML5 e CSS3 para HUD e menus

## Estrutura do Projeto

O código está organizado em domínios isolados para garantir manutenibilidade:

* `src/logic`: Núcleo de regras de jogo, incluindo física de colisão, inteligência artificial e gestão de estado.
    * `src/logic/entities`: Implementação de classes para o jogador e diferentes tipos de inimigos.
    * `src/logic/constants`: Configurações de hordas (WaveConfig) e base de dados de cartas.
* `src/client`: Camada de renderização, entrada de dados do usuário e interface visual.
    * `src/client/render`: Lógica de desenho de entidades, projéteis e efeitos visuais.
    * `src/client/hud`: Controladores para os menus de upgrade, pausa e status.
* `src/shared`: Tipagens globais, contratos de eventos e utilitários matemáticos de combate.

## Mecânicas Implementadas

### Sistema de Hordas e Spawn
O jogo é processado em ondas definidas por dados. Cada horda possui pesos específicos para diferentes tipos de inimigos e multiplicadores de atributos que escalam com o tempo. O spawn ocorre fora do campo de visão do jogador para manter a fluidez do combate.

### Progressão Roguelike
Ao acumular experiência (XP), o jogador sobe de nível e acessa a fase de upgrade. Este sistema apresenta três cartas aleatórias com raridades distintas (Comum, Rara, Épica) e cores independentes que influenciarão a evolução visual futura do tanque.

### Física e Combate
* Movimentação com normalização de vetores e câmera fixa em 1920x1080 para garantir equilíbrio competitivo.
* Sistema de colisão diferenciado (Soft/Hard) para evitar sobreposição excessiva de entidades.
* Lógica de penetração de projéteis baseada em pontos de vida da bala, permitindo que tiros poderosos atravessem múltiplos alvos.

## Instalação e Execução

Para rodar o ambiente de desenvolvimento localmente:

1. Instalar as dependências:
   ```bash
   npm install
   ```

2. Executar o servidor de Desenvolvimento:
   ```bash
   npm run dev
   ```

3. Gerar o build de Produção:
   ```bash
   npm run build
   ```

## Workflow de Desenvolvimento
O projeto segue um fluxo de trabalho baseado em branches de funcionalidade:

* `feat/`: Novas funcionalidades e mecânicas.
* `fix/`: Correções de bugs e ajustes finos.

As contribuições devem ser enviadas via Pull Request para revisão do Tech Lead.