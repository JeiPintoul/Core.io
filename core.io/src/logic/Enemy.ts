import { Entity } from "./Entity";

export class Enemy extends Entity {
    public damage: number; 

    constructor(id:string, x:number, y:number, health:number, maxHealth: number, speed:number, damage: number){

        super(id, x, y, health, maxHealth, speed);
        this.damage = damage;
    }

    //Aqui vai a logica do swarm, e o bagulho de perseguir o jogador usando os vetores 
    public update(targetX: number, targetY: number, deltaTime: number): void {
        //Calculo de vetor 
        const dx = targetX - this.x; 
        const dy = targetY - this.y;

        //Distância usando Pitágoras
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 1) return;

        //Normalizar o vetor e aplicar velocidade
        const moveX = (dx / distance) * this.speed * deltaTime;
        const moveY = (dy / distance) * this.speed * deltaTime;

        //Aturaliza posição do inimigo
        this.x += moveX;
        this.y += moveY;
    }
}
