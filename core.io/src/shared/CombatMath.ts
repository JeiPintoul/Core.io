export const PLAYER_BASE_SHOT_COOLDOWN_SECONDS = 1;
export const MIN_COOLDOWN_SECONDS = 0.08;
export const PLAYER_RELOAD_POINT_FACTOR = 0.85;

/**
 * Returns the minimum reload points needed to hit MIN_COOLDOWN_SECONDS for a
 * given base cooldown.  Derived by solving:
 *   MIN = base * factor^n  →  n = log(MIN/base) / log(factor)
 * This replaces the old hardcoded MAX_RELOAD_POINTS = 12, which broke when
 * PLAYER_BASE_SHOT_COOLDOWN_SECONDS was increased (e.g. 0.6 → 1.0 requires
 * ~16 points to reach the 0.08 s floor).
 */
export function calculateMaxReloadPoints(baseCooldown: number): number {
    return Math.ceil(Math.log(MIN_COOLDOWN_SECONDS / baseCooldown) / Math.log(PLAYER_RELOAD_POINT_FACTOR));
}

export function calculateCooldown(baseCooldown: number, reloadPoints: number): number {
    const maxPoints = calculateMaxReloadPoints(baseCooldown);
    const clamped = Math.min(Math.max(0, reloadPoints), maxPoints);
    return Math.max(MIN_COOLDOWN_SECONDS, baseCooldown * Math.pow(PLAYER_RELOAD_POINT_FACTOR, clamped));
}

export function calculatePlayerShotCooldownSeconds(reloadPoints: number): number {
    return calculateCooldown(PLAYER_BASE_SHOT_COOLDOWN_SECONDS, reloadPoints);
}
