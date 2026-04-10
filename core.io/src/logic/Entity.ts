
import {eventBus} from '../shared/EventBus';

export class Entity { 
    public id: string; 
    public x : number; 
    public y: number;
    public health: number;
    public maxHealth: number;
    public speed: number; 

  constructor(id:string, x:number, y:number, health:number, maxHealth: number, speed:number ){
    this.id = id;
    this.x = x;
    this.y = y;
    this.health = health;
    this.maxHealth = maxHealth;
    this.speed = speed;
  }

  public tomarDano (amount: number): void { 
    this.health -= amount; 
    // Ai depois tem que fazer a animação em relação ao tomarDano, a gente vai colocar como se fosse rpg, com numeros de dano??? 
    eventBus.emit ('entity_damage', {id: this.id, currentHealth: this.health});

    if(this.health <= 0 ){
        this.die()
    }
  }

  //Logica da morte 
  protected die():void{
    //Aqui quando a gente avisar que o cara morreu com essa logica (A gente troca o som, ou ele sumir da tela sla)
    eventBus.emit('entity_destroyed', {id: this.id});
  }
}