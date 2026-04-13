
import { emitGameEvent, GameEvents } from '../shared/EventBus';
import type { BarrelConfig } from '../shared/Types';

export class Entity { 
    public id: string; 
    public x : number; 
    public y: number;
    public health: number;
    public maxHealth: number;
    public speed: number; 
  public knockbackVelocity: { x: number; y: number };
  public damageTimers: Map<string, number>;
  public barrels: BarrelConfig[];

  constructor(id:string, x:number, y:number, health:number, maxHealth: number, speed:number ){
    this.id = id;
    this.x = x;
    this.y = y;
    this.health = health;
    this.maxHealth = maxHealth;
    this.speed = speed;
    this.knockbackVelocity = { x: 0, y: 0 };
    this.damageTimers = new Map<string, number>();
    this.barrels = [];
  }

  public setBarrels(barrels: BarrelConfig[]): void {
    this.barrels = barrels.map((barrel) => ({ ...barrel }));
  }

  public applyImpulse(impulseX: number, impulseY: number): void {
    this.knockbackVelocity.x += impulseX;
    this.knockbackVelocity.y += impulseY;
  }

  public canReceiveCollisionDamageFrom(attackerId: string, currentTime: number, cooldownMs: number): boolean {
    const lastDamageTime = this.damageTimers.get(attackerId);

    if (lastDamageTime === undefined) {
        return true;
    }

    return (currentTime - lastDamageTime) >= cooldownMs;
  }

  public registerCollisionDamageFrom(attackerId: string, currentTime: number): void {
    this.damageTimers.set(attackerId, currentTime);
  }

  public getTimeSinceLastDamage(currentTime: number): number {
    if (this.damageTimers.size === 0) {
      return Infinity;
    }

    let mostRecentDamageTime = -Infinity;

    for (const damageTime of this.damageTimers.values()) {
      if (damageTime > mostRecentDamageTime) {
        mostRecentDamageTime = damageTime;
      }
    }

    return currentTime - mostRecentDamageTime;
  }

  public takeDamage(amount: number): void {
    this.health -= amount; 
    // Event consumed by UI/FX systems to display damage feedback.
    emitGameEvent(GameEvents.ENTITY_DAMAGE, { id: this.id, currentHealth: this.health });

    if(this.health <= 0 ){
        this.die()
    }
  }

  // Backward-compatible alias while migrating method names to English.
  public tomarDano(amount: number): void {
    this.takeDamage(amount);
  }

  //Logica da morte 
  protected die():void{
    //Aqui quando a gente avisar que o cara morreu com essa logica (A gente troca o som, ou ele sumir da tela sla)
    emitGameEvent(GameEvents.ENTITY_DESTROYED, { id: this.id });
  }
}