import { PLAYER_IDS, type ControlPreference, type PlayerId } from '../../shared/Types';

const STORAGE_KEY = 'coreio_lobby';

export interface PersistedSlot {
    enabled: boolean;
    name: string;
    primaryColorHex: string;
    control: ControlPreference;
}

export type PersistedLobby = Record<PlayerId, PersistedSlot>;

function isValidHex(value: unknown): value is string {
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function loadLobby(): PersistedLobby | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<Record<PlayerId, Partial<PersistedSlot>>>;
        const result = {} as PersistedLobby;

        for (const playerId of PLAYER_IDS) {
            const entry = parsed[playerId];
            if (!entry || typeof entry.name !== 'string' || !isValidHex(entry.primaryColorHex)) {
                return null;
            }
            result[playerId] = {
                enabled: Boolean(entry.enabled),
                name: entry.name.slice(0, 16),
                primaryColorHex: entry.primaryColorHex,
                control: entry.control === 'GAMEPAD' ? 'GAMEPAD' : 'KEYBOARD',
            };
        }

        return result;
    } catch {
        return null;
    }
}

export function saveLobby(lobby: PersistedLobby): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lobby));
    } catch {
        // localStorage may be unavailable (privacy modes) — fail silently.
    }
}
