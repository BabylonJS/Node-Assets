import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

type InputFiles = Readonly<Record<string, string | Uint8Array>>;

export async function withInputFilesAsync<T>(files: InputFiles, run: (directory: string) => Promise<T>): Promise<T> {
    const directory = await mkdtemp(join(tmpdir(), "node-assets-input-"));
    try {
        for (const [name, data] of Object.entries(files)) {
            const path = join(directory, name);
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, data);
        }
        return await run(directory);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

export async function withHttpInputsAsync<T>(files: InputFiles, run: (rootUrl: string) => Promise<T>): Promise<T> {
    const server = createServer((request, response) => {
        const data = files[(request.url ?? "").slice(1)];
        response.writeHead(data === undefined ? 404 : 200);
        response.end(data);
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
        const address = server.address();
        if (address === null || typeof address === "string") {
            throw new Error("Expected an HTTP server address.");
        }
        return await run(`http://127.0.0.1:${address.port}/`);
    } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
}
