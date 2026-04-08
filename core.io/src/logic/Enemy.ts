import { Entity } from "./Entity";

export class Enenmy extends Entity {
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

        //Malditop pitagoras 
        const distance =  Math.sqrt(dx * dx + dy * dy);

        if (distance < 1) return;

        //Normalizar o vetor
        const moveX = (dx / distance) / this.speed * deltaTime;
        const moveY = (dy / distance) / this.speed * deltaTime;


        //atualiza posição do inimigo
        this.x += moveX;
        this.y += moveY;
    }
}
/* Como ngm ta fazendo nada, n faço ideia se funciona, se der algum problema, o maldito responsavel pela implementação que se 
vire pra arrumar. 
ass: Ronan */