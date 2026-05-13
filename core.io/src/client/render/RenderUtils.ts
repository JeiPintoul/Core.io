export function darkenColor(color: number, percent: number): number {
    const factor = (100 - Math.max(0, Math.min(95, percent))) / 100;
    return (Math.round(((color >> 16) & 0xff) * factor) << 16)
         | (Math.round(((color >> 8)  & 0xff) * factor) << 8)
         |  Math.round((color         & 0xff) * factor);
}
