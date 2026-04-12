import { Entity } from './Entity';
import { emitGameEvent, GameEvents, onGameEvent } from '../shared/EventBus';

export class Player extends Entity {
    public level: number;
    public currentXp: number;
    public xpToNextLevel: number;
    private unsubscribeEnemyDestroyed: (() => void) | null = null;

    constructor(id: string, x: number, y: number, health: number, maxHealth: number, speed: number) {

        super(id, x, y, health, maxHealth, speed);
        this.level = 1;
        this.currentXp = 0;
        this.xpToNextLevel = 100; // base pro nivel 2

        this.setupListeners(); 
    }

    private setupListeners(): void {
        //Aqui quando ouvir que o inimmigo dropa xp, ele vai la e coleta 
        this.unsubscribeEnemyDestroyed = onGameEvent(GameEvents.ENEMY_DESTROYED, (data) => {
            this.gainXp(data.xpDropped);
        });
    }

    public destroy(): void {
        if (this.unsubscribeEnemyDestroyed) {
            this.unsubscribeEnemyDestroyed();
            this.unsubscribeEnemyDestroyed = null;
        }
    }

    //Logica do ganho de xp 
    public gainXp(amount: number): void {
        this.currentXp += amount; 

        // Resolve all pending level transitions when a large XP burst is received.
        while (this.currentXp >= this.xpToNextLevel) {
            this.levelUp();
        }

        // Avisa a UI com os valores já estabilizados pós-level-up.
        emitGameEvent(GameEvents.XP_UPDATE, {
            currentXp: this.currentXp,
            requires: this.xpToNextLevel
        });
    }

    // Gatilho de subida de nível
  private levelUp(): void {
    this.level++;

    //Aqui eu vou dxa acumular o xp que aguardou e vou aumentar em uns 50% de xp proproximo nivel 
    this.currentXp -= this.xpToNextLevel; 
    this.xpToNextLevel = Math.floor(this.xpToNextLevel * 1.5);

    // Dispara o evento que vai fazer o motor do jogo pausar e abrir o menu
        emitGameEvent(GameEvents.LEVEL_UP, { newLevel: this.level });
  }


    

   
}