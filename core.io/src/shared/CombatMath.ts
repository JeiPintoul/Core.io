import { MAX_RELOAD_POINTS } from './Types';

export const PLAYER_BASE_SHOT_COOLDOWN_SECONDS = 1;
export const MIN_COOLDOWN_SECONDS = 0.08;
export const PLAYER_RELOAD_POINT_FACTOR = 0.85;

export function calculateCooldown(baseCooldown: number, reloadPoints: number): number {
    const clamped = Math.min(Math.max(0, reloadPoints), MAX_RELOAD_POINTS);
    return Math.max(MIN_COOLDOWN_SECONDS, baseCooldown * Math.pow(PLAYER_RELOAD_POINT_FACTOR, clamped));
}

export function calculatePlayerShotCooldownSeconds(reloadPoints: number): number {
    return calculateCooldown(PLAYER_BASE_SHOT_COOLDOWN_SECONDS, reloadPoints);
}
