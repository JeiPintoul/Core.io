export const PLAYER_BASE_SHOT_COOLDOWN_SECONDS = 0.6;
export const PLAYER_RELOAD_POINT_FACTOR = 0.85;

export function calculatePlayerShotCooldownSeconds(reloadPoints: number): number {
    const safeReloadPoints = Math.max(0, reloadPoints);
    return PLAYER_BASE_SHOT_COOLDOWN_SECONDS * Math.pow(PLAYER_RELOAD_POINT_FACTOR, safeReloadPoints);
}
