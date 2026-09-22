import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BabylonRelease = "8b086dc2b313b61918b0dc3854d3a1d0aff4530e"; // 9.27.1
const ImporterRelease = "2baa7a087bad28498378dacf50d22f46c54eacc3"; // protocol 5
const BabylonRuntimeUrl = `https://raw.githubusercontent.com/BabylonJS/Babylon.js/${BabylonRelease}/packages/tools/babylonServer/public/babylonUsdImporter/5/`;
const ImporterUrl = `https://raw.githubusercontent.com/BabylonJS/babylon-usd-importer/${ImporterRelease}/`;

export const UsdRuntimeAssets = [
    { name: "babylon-usd-importer.worker.js", option: "workerUrl", sha256: "caaf962049c25a16ed15745508d1dd547580e36edf36f7a9ebc0f27759de2dc5" },
    { name: "babylon-usd-importer.js", option: "glueUrl", sha256: "ccd71ba966d27b1b08aa540915cb983ece00262b440f519d94c2505e2b88c120" },
    { name: "babylon-usd-importer.wasm", option: "wasmUrl", sha256: "72f0d5a1ce2476566b9455dc16f19738d6b4c03776e2e103027e0c7a096d98d2" },
    { name: "babylon-usd-importer.data", option: "dataUrl", sha256: "ededef6a1ecbc5aa112ffa0f4e2713a13bca316ae005b3d95b91fd8dad240225" },
] as const;

export const UsdRuntimeNotices = [
    { name: "usd-importer.license", source: `${ImporterUrl}LICENSE`, sha256: "5c9817c129b98e7bb966bca028c43c19107102ef8e03fe799bffb4354f4ef015" },
    { name: "openusd.license", source: `${BabylonRuntimeUrl}openusd.license`, sha256: "4d6e8e3a9bd0104e10c48e3bc6af2f0976448a70a377d20cef674740f96f4452" },
    { name: "tbb.license", source: `${BabylonRuntimeUrl}tbb.license`, sha256: "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4" },
    { name: "zlib.license", source: `${BabylonRuntimeUrl}zlib.license`, sha256: "e32ff4e00d9d94930537635291da39e7e612703334bf6fde8c7f1686fe8a45a2" },
] as const;

export async function prepareUsdRuntimeAsync(cacheDirectory: string): Promise<Map<string, string>> {
    const files = await Promise.all(
        [...UsdRuntimeAssets.map((asset) => ({ ...asset, source: `${BabylonRuntimeUrl}${asset.name}` })), ...UsdRuntimeNotices].map(async ({ name, source, sha256 }) => {
            const path = join(cacheDirectory, name);
            let bytes: Uint8Array | undefined;
            try {
                bytes = await readFile(path);
            } catch (error) {
                if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
                    throw error;
                }
            }
            if (bytes === undefined) {
                const response = await fetch(source);
                if (!response.ok) {
                    throw new Error(`Unable to download USD runtime asset "${name}": ${response.status} ${response.statusText}`);
                }
                bytes = new Uint8Array(await response.arrayBuffer());
                verifyChecksum(name, bytes, sha256);
                await mkdir(cacheDirectory, { recursive: true });
                const temporaryPath = `${path}.${randomUUID()}.tmp`;
                try {
                    await writeFile(temporaryPath, bytes);
                    await rename(temporaryPath, path);
                } finally {
                    await rm(temporaryPath, { force: true });
                }
            }
            verifyChecksum(name, bytes, sha256);
            return [name, path] as const;
        })
    );
    return new Map(files);
}

function verifyChecksum(name: string, bytes: Uint8Array, expected: string): void {
    if (createHash("sha256").update(bytes).digest("hex") !== expected) {
        throw new Error(`USD runtime asset "${name}" does not match its pinned SHA-256 checksum.`);
    }
}
