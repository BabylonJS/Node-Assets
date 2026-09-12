import { vi } from "vitest";

export async function runWithoutBase64EncodingAsync<T>(action: () => Promise<T>): Promise<T> {
    const originalToString = Buffer.prototype.toString;
    const toStringSpy = vi.spyOn(Buffer.prototype, "toString").mockImplementation(function (this: Buffer, ...args: unknown[]): string {
        if (args[0] === "base64") {
            throw new Error("HTTP asset payload was base64 encoded.");
        }
        const result: unknown = Reflect.apply(originalToString, this, args);
        if (typeof result !== "string") {
            throw new TypeError("Buffer.toString returned a non-string value.");
        }
        return result;
    });

    try {
        return await action();
    } finally {
        toStringSpy.mockRestore();
    }
}
