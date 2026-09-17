import type { Scene as BabylonScene } from "@babylonjs/core/scene.js";
import type { Document, PlatformIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

export async function convertBabylonSceneToDocumentAsync(scene: BabylonScene, io: PlatformIO): Promise<Document> {
    try {
        const { GLTF2Export } = await import("@babylonjs/serializers/glTF/2.0/index.js");
        const fileName = "scene.glb";
        const result = await GLTF2Export.GLBAsync(scene, fileName);
        const root = result.files[fileName];
        if (!(root instanceof Blob)) {
            throw new Error(`The Babylon glTF serializer did not produce "${fileName}".`);
        }
        // The GLB bytes no longer depend on the scene; release it before awaiting the document.
        return io.registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(await root.arrayBuffer()));
    } finally {
        scene.dispose();
    }
}
