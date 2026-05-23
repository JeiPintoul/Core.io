export function normalizeColorHex(value: string | undefined, fallbackHex: string): string {
    if (typeof value !== 'string') {
        return fallbackHex;
    }

    const trimmed = value.trim();
    if (!/^#?[0-9a-fA-F]{6}$/.test(trimmed)) {
        return fallbackHex;
    }

    return trimmed.startsWith('#') ? trimmed.toLowerCase() : `#${trimmed.toLowerCase()}`;
}
