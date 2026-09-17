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

export function generateBinaryStlData(triangleCount = 1): Uint8Array {
    const data = new Uint8Array(84 + 50 * triangleCount);
    const view = new DataView(data.buffer);
    view.setUint32(80, triangleCount, true);

    const values = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0];
    for (let triangle = 0; triangle < triangleCount; triangle++) {
        const offset = 84 + triangle * 50;
        values.forEach((value, index) => view.setFloat32(offset + index * 4, value, true));
        view.setUint16(offset + 48, 0, true);
    }
    return data;
}
