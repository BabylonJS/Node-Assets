export function createByteFormatter(referenceBytes: number): (bytes: number) => string {
    return createFormatter({
        referenceValue: referenceBytes,
        baseUnit: "B",
        basePrecision: 0,
        steps: ["KiB", "MiB", "GiB", "TiB", "PiB"].map((unit) => ({ unit, factor: 1_024 })),
    });
}

export function createDurationFormatter(referenceMilliseconds: number): (milliseconds: number) => string {
    return createFormatter({
        referenceValue: referenceMilliseconds,
        baseUnit: "ms",
        basePrecision: 2,
        steps: [
            { unit: "s", factor: 1_000 },
            { unit: "min", factor: 60 },
            { unit: "h", factor: 60 },
        ],
    });
}

export function formatBytes(bytes: number): string {
    return createByteFormatter(bytes)(bytes);
}

interface FormatterOptions {
    readonly referenceValue: number;
    readonly baseUnit: string;
    readonly basePrecision: number;
    readonly steps: readonly { readonly unit: string; readonly factor: number }[];
}

function createFormatter({ referenceValue, baseUnit, basePrecision, steps }: FormatterOptions): (value: number) => string {
    let divisor = 1;
    let unit = baseUnit;
    for (const step of steps) {
        if (Number((referenceValue / divisor).toFixed(2)) < step.factor) {
            break;
        }
        divisor *= step.factor;
        unit = step.unit;
    }
    const precision = divisor === 1 ? basePrecision : 2;
    return (value) => `${(value / divisor).toFixed(precision)} ${unit}`;
}
