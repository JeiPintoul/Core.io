/**
 * Minimal RNG seam. Local play uses MathRng (Math.random); when online coop
 * lands, the server can swap in a seeded/deterministic implementation without
 * touching call sites.
 */
export interface Rng {
    random(): number;
}

export class MathRng implements Rng {
    public random(): number {
        return Math.random();
    }
}
