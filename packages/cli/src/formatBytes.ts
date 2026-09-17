export function formatBytes(bytes: number): string {
    let value = bytes;
    let unit = "B";
    for (const nextUnit of ["KiB", "MiB", "GiB", "TiB", "PiB"]) {
        if (Number(value.toFixed(2)) < 1_024) {
            break;
        }
        value /= 1_024;
        unit = nextUnit;
    }
    return `${unit === "B" ? value : value.toFixed(2)} ${unit}`;
}
