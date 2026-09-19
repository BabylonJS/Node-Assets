# Babylon loader gaps

This is the upstream follow-up list for the standard-loader refactor, based on
Babylon 9.21.2. Node-Assets no longer patches these behaviors. The old OBJ/MTL
preparation, texture placeholders, rebinding, and image conversion have been
deleted rather than preserved in a compatibility module.

## Dependency roots after redirects

- Upstream target: `packages/dev/core/src/Loading/sceneLoader.ts`,
  `appendSceneCoreAsync` / `LoadSceneAsync`.
- Missing behavior: `loadDataAsync` returns `responseURL`, but the append path
  discards it. Relative dependencies keep the originally requested directory.
  The import-mesh path has a `rewriteRootURL` hook; the append path does not use it.
- Previous local workaround: fetch the main file first and pass a root derived
  from the final response URL.
- Completion case: an FBX or OBJ redirected into another directory loads its
  relative dependencies from the final location through `LoadSceneAsync`.

## OBJ material-library and texture locations

- Upstream targets: `packages/dev/loaders/src/OBJ/objFileLoader.pure.ts`,
  `_loadMTL` / `_parseSolidAsync`, and `packages/dev/loaders/src/OBJ/mtlFileLoader.ts`,
  `_GetTexture`.
- Missing behavior: the MTL parser receives the OBJ root, not the MTL's own
  location. Dependency paths are concatenated with that root rather than
  consistently resolved as URIs.
- Previous local workaround: fetch and rewrite the MTL and its texture references.
- Completion case: `scene.obj` references `materials/scene.mtl`, which references
  `textures/color.png`; the image resolves under `materials/textures/`, including
  after an MTL redirect. Absolute dependency URIs should remain absolute.

## FBX texture filename escaping

- Upstream target: `packages/dev/loaders/src/FBX/fbxFileLoader.pure.ts`,
  `_getExternalTextureUrls`.
- Missing behavior: external texture filenames are concatenated with the root
  URL. A literal `?` in a filename becomes a query delimiter rather than part of
  the filename.
- Current limitation: an FBX reference to `diffuse?1.png` must use
  `diffuse%3F1.png`. The generic file transport retains standard URL semantics;
  it does not reinterpret query strings as filename characters.
- Completion case: an FBX referencing a local `textures/diffuse?1.png` preserves
  the image without requiring an escaped reference in the FBX.

## Encoded-image MIME handling in headless export

- Upstream targets: `packages/dev/serializers/src/exportImageUtils.ts`,
  `GetCachedImageAsync`, and
  `packages/dev/serializers/src/glTF/2.0/glTFMaterialExporter.ts`.
- Missing behavior: image retrieval does not preserve the response Content-Type
  for the serializer's encoded-image path. An extensionless PNG can fall through
  to pixel readback even though usable encoded bytes were downloaded.
- Previous local workaround: detect the MIME type and rebind a typed data URI.
- Completion case: an extensionless PNG served as `image/png` exports from
  NullEngine without image decoding or GPU readback.

## OBJ/MTL material-name parsing

- Upstream targets: `packages/dev/loaders/src/OBJ/solidParser.ts` and
  `packages/dev/loaders/src/OBJ/mtlFileLoader.ts`.
- Follow-up: normalize names consistently between `usemtl` and `newmtl`.
  OBJ preprocessing and MTL parsing handle whitespace and comments differently.
- Previous local workaround: replace names with generated tokens and restore them
  after loading.
- Completion case: supported material names are matched and preserved without
  rewriting the source into synthetic identifiers.

## Not Babylon workarounds

`src/helpers/nodeXmlHttpRequest.ts` is permanent Node transport setup: xhr2 handles
HTTP(S), and the adapter adds asynchronous filesystem reads for models and their
sidecars. `src/helpers/inputLocation.ts` normalizes paths and file URLs. Neither
contains format parsing or texture handling.

`src/helpers/xhr2Workarounds.ts` contains a transport dependency workaround, not a
Babylon patch. xhr2 0.2.1 does not resolve relative redirect locations against the
current request by default. The adapter updates its base URL after each parsed
request/redirect through xhr2's `_parseUrl` hook and `nodejsSet` configuration.
Remove this adapter when xhr2 resolves relative redirect chains itself. Following
HTTP redirects does not repair Babylon's separate dependency-root issue above.

TGA/BMP/GIF-to-PNG conversion was also removed. That is an image-conversion
capability requiring a CPU encoding strategy, not something an XHR implementation
can provide. It is separate from preserving already-supported encoded images.
