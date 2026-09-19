export function fitImageSize(width: number, height: number, maxSize: number): readonly [number, number] {
    return width >= height ? [maxSize, Math.max(1, Math.round((height * maxSize) / width))] : [Math.max(1, Math.round((width * maxSize) / height)), maxSize];
}
