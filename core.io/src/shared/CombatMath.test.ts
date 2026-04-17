import { describe, expect, it } from 'vitest';
import {
    calculatePlayerShotCooldownSeconds,
    PLAYER_BASE_SHOT_COOLDOWN_SECONDS
} from './CombatMath';

describe('calculatePlayerShotCooldownSeconds', () => {
    it('keeps base cooldown when reload is zero', () => {
        expect(calculatePlayerShotCooldownSeconds(0)).toBe(PLAYER_BASE_SHOT_COOLDOWN_SECONDS);
    });

    it('treats negative reload as zero', () => {
        expect(calculatePlayerShotCooldownSeconds(-5)).toBe(PLAYER_BASE_SHOT_COOLDOWN_SECONDS);
    });

    it('reduces cooldown as reload points increase', () => {
        const lowReloadCooldown = calculatePlayerShotCooldownSeconds(1);
        const highReloadCooldown = calculatePlayerShotCooldownSeconds(8);

        expect(highReloadCooldown).toBeLessThan(lowReloadCooldown);
    });
});
