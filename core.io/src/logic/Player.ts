import { Entity } from './Entity';
import { eventBus } from '../shared/EventBus';

export class Player extends Entity {
    public level: number;
    public currentXp: number;
    public xpToNextLevel: number;

    constructor(id: string, x: number, y: number, health: number, maxHealth: number, speed: number) {

        super(id, x, y, health, maxHealth, speed);
        this.level = 1;
        this.currentXp = 0;
        this.xpToNextLevel = 100; // base pro nivel 2

        this.setupListeners(); 
    }

    private setupListeners(): void {
        //Aqui quando ouvir que o inimmigo dropa xp, ele vai la e coleta 
        eventBus.on('enemy_destroyed', (data: {id: string, xpDropped: number}) => {
            this.gainXp(data.xpDropped);
        });
    }

    //Logica do ganho de xp 
    public gainXp(amount: number): void {
        this.currentXp += amount; 

        //Avisa a UI pra encher a barra de xp na tela
        eventBus.emit('xp_update', {currentXp: this.currentXp, requires: this.xpToNextLevel});

        //Um gatilho automatico so pra checar se pegou a cota
        if (this.currentXp >= this.xpToNextLevel) {
            this.levelUp();
        }
    }

    // Gatilho de subida de nível
  private levelUp(): void {
    this.level++;

    //Aqui eu vou dxa acumular o xp que aguardou e vou aumentar em uns 50% de xp proproximo nivel 
    this.currentXp -= this.xpToNextLevel; 
    this.xpToNextLevel = Math.floor(this.xpToNextLevel * 1.5);

    // Dispara o evento que vai fazer o motor do jogo pausar e abrir o menu
    eventBus.emit('level_up', { newLevel: this.level });
  }


    

   
}