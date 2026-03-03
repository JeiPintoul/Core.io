import './style.css';
import { eventBus, GameEvents } from './shared/EventBus';

console.log('Inicializando Core.io...');

// Testando o EventBus para garantir que a arquitetura funciona
eventBus.on(GameEvents.STATE_UPDATE, (data) => {
    console.log('Sinal recebido da Lógica:', data);
});

// Simulando um evento (Você pode apagar isso depois)
eventBus.emit(GameEvents.STATE_UPDATE, { mensagem: 'O EventBus está operacional!' });

// TODO
// 1. Importar o GameState da src/logic
// 2. Importar o Phaser Game da src/client