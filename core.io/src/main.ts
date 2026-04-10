import './style.css';
import { GameEngine }     from './logic/GameEngine';
import { createPhaserGame } from './client/PhaserGame';
import { eventBus, GameEvents } from './shared/EventBus'; // <-- Importe o eventBus e GameEvents!

console.log('Inicializando Core.io...');

const engine = new GameEngine();
createPhaserGame();

const menuInicial = document.getElementById('menu-inicial');
const btnJogar = document.getElementById('btn-jogar');
const tituloMenu = menuInicial?.querySelector('h1');

if (btnJogar && menuInicial && tituloMenu) {
    
    // Lógica ao clicar no botão JOGAR / TENTAR NOVAMENTE
    btnJogar.addEventListener('click', () => {
        menuInicial.style.display = 'none';
        
        // Garante que o menu volte a ser azul da próxima vez que abrir
        tituloMenu.innerText = 'CORE.IO';
        tituloMenu.style.textShadow = '0 0 10px #4488ff';
        btnJogar.innerText = 'JOGAR';
        btnJogar.style.backgroundColor = '#4488ff';
        btnJogar.style.boxShadow = 'none';

        // Reseta as variáveis da engine e inicia o loop
        engine.reset();
        engine.start();
        console.log('Jogo iniciado!');
    });

    // Lógica quando o Player morre
    eventBus.on(GameEvents.GAME_OVER, () => {
        console.log('Game Over!');
        
        // Para a lógica do jogo
        engine.stop();
        
        // Mostra o menu com estilo de Game Over (Vermelho)
        menuInicial.style.display = 'flex';
        tituloMenu.innerText = 'GAME OVER';
        tituloMenu.style.textShadow = '0 0 15px #ff4444';
        
        btnJogar.innerText = 'TENTAR NOVAMENTE';
        btnJogar.style.backgroundColor = '#cc0000';
        btnJogar.style.boxShadow = '0 0 15px #ff4444';
    });

} else {
    console.warn("Elementos do menu não encontrados.");
    engine.start();
}