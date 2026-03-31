import './style.css';
import { GameEngine }     from './logic/GameEngine';
import { createPhaserGame } from './client/PhaserGame';

console.log('Inicializando Core.io...');

// 1. Sobe a lógica (física, colisões, state machine)
const engine = new GameEngine();

// 2. Sobe o cliente visual (Phaser 3 + EventBus listeners)
createPhaserGame();

// 3. Dispara o loop da lógica
engine.start();