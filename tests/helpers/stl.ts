export function generateStlData(): string {
    return `solid triangle
facet normal 0 0 1
    outer loop
        vertex 0 0 0
        vertex 1 0 0
        vertex 0 1 0
    endloop
endfacet
endsolid triangle`;
}

export function generateBinaryStlData(): Uint8Array {
    const data = new Uint8Array(84 + 50);
    const view = new DataView(data.buffer);
    view.setUint32(80, 1, true);

    const values = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0];
    values.forEach((value, index) => view.setFloat32(84 + index * 4, value, true));
    view.setUint16(84 + 48, 0, true);
    return data;
}
