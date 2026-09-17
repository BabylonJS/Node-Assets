const PNG_DATA = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWP4z8DwH4QZYAwAR8oH+Xm0fdIAAAAASUVORK5CYII=";

export function generateObjData(): string {
    return `o Triangle
v 0 0 0
v 1 0 0
v 0 1 0
vt 0 0
vt 1 0
vt 0 1
vn 0 0 1
usemtl None
f 1/1/1 2/2/1 3/3/1`;
}

export function generateTexturedObjData(mtlPath = "materials/model.mtl", materialName = "Textured"): string {
    return `mtllib ${mtlPath}
o Triangle
v 0 0 0
v 1 0 0
v 0 1 0
vt 0 0
vt 1 0
vt 0 1
vn 0 0 1
usemtl ${materialName}
f 1/1/1 2/2/1 3/3/1`;
}

export function generateMtlData(texturePath = "textures/diffuse.png", materialName = "Textured"): string {
    return `newmtl ${materialName}
Kd 1 1 1
MAP_KD ${texturePath}
map_bump -bm 0.5 ${texturePath}`;
}

export function generateTextureData(): Uint8Array {
    return Uint8Array.from(atob(PNG_DATA), (character) => character.charCodeAt(0));
}
