export function generateFbxData(): string {
    return generateAsciiFbxData();
}

export function generateTexturedFbxData(texturePath: string): string {
    return generateAsciiFbxData(texturePath);
}

export function generateTexturedFbxDataWithUvs(texturePath: string): string {
    return generateAsciiFbxData(texturePath, true);
}

export function generateTgaTextureData(): Uint8Array {
    const data = new Uint8Array(21);
    data[2] = 2;
    data[12] = 1;
    data[14] = 1;
    data[16] = 24;
    data[17] = 0x20;
    data.set([0, 0, 255], 18);
    return data;
}

function generateAsciiFbxData(texturePath?: string, includeTextureCoordinates = false): string {
    const textureCoordinates = !includeTextureCoordinates
        ? ""
        : `
        LayerElementUV: 0 {
            MappingInformationType: "ByPolygonVertex"
            ReferenceInformationType: "Direct"
            UV: *6 {
                a: 0,0,1,0,0,1
            }
        }`;
    const materialObjects =
        texturePath === undefined
            ? ""
            : `
    Material: 3, "Material::Textured", "" {
        ShadingModel: "Lambert"
        Properties70:  {
            P: "DiffuseColor", "Color", "", "A",1,1,1
        }
    }
    Texture: 4, "Texture::Diffuse", "TextureVideoClip" {
        Type: "TextureVideoClip"
        FileName: "${texturePath}"
        RelativeFilename: "${texturePath}"
    }`;
    const materialConnections =
        texturePath === undefined
            ? ""
            : `
    C: "OO", 3, 2
    C: "OP", 4, 3, "DiffuseColor"`;

    return `; FBX 7.4.0 project file
GlobalSettings:  {
    Version: 1000
    Properties70:  {
        P: "UpAxis", "int", "Integer", "",1
        P: "UpAxisSign", "int", "Integer", "",1
        P: "FrontAxis", "int", "Integer", "",2
        P: "FrontAxisSign", "int", "Integer", "",1
        P: "CoordAxis", "int", "Integer", "",0
        P: "CoordAxisSign", "int", "Integer", "",1
    }
}
Objects:  {
    Geometry: 1, "Geometry::Triangle", "Mesh" {
        Vertices: *9 {
            a: 0,0,0,1,0,0,0,1,0
        }
        PolygonVertexIndex: *3 {
            a: 0,1,-3
        }
        LayerElementNormal: 0 {
            MappingInformationType: "ByControlPoint"
            ReferenceInformationType: "Direct"
            Normals: *9 {
                a: 0,0,1,0,0,1,0,0,1
            }
        }${textureCoordinates}
    }
    Model: 2, "Model::Triangle", "Mesh" {
    }${materialObjects}
}
Connections:  {
    C: "OO", 1, 2
${materialConnections}
    C: "OO", 2, 0
}`;
}

export function generateBinaryFbxData(): Uint8Array {
    return serializeBinaryFbx([
        {
            name: "Objects",
            children: [
                {
                    name: "Geometry",
                    properties: [int64Property(1), stringProperty("Geometry::Triangle"), stringProperty("Mesh")],
                    children: [
                        { name: "Vertices", properties: [float64ArrayProperty([0, 0, 0, 1, 0, 0, 0, 1, 0])] },
                        { name: "PolygonVertexIndex", properties: [int32ArrayProperty([0, 1, -3])] },
                        {
                            name: "LayerElementNormal",
                            properties: [int32Property(0)],
                            children: [
                                { name: "MappingInformationType", properties: [stringProperty("ByControlPoint")] },
                                { name: "ReferenceInformationType", properties: [stringProperty("Direct")] },
                                { name: "Normals", properties: [float64ArrayProperty([0, 0, 1, 0, 0, 1, 0, 0, 1])] },
                            ],
                        },
                    ],
                },
                {
                    name: "Model",
                    properties: [int64Property(2), stringProperty("Model::Triangle"), stringProperty("Mesh")],
                },
            ],
        },
        {
            name: "Connections",
            children: [
                { name: "C", properties: [stringProperty("OO"), int64Property(1), int64Property(2)] },
                { name: "C", properties: [stringProperty("OO"), int64Property(2), int64Property(0)] },
            ],
        },
    ]);
}

interface BinaryFbxNode {
    readonly children?: readonly BinaryFbxNode[];
    readonly name: string;
    readonly properties?: readonly Uint8Array[];
}

function serializeBinaryFbx(nodes: readonly BinaryFbxNode[]): Uint8Array {
    const header = new Uint8Array(27);
    header.set(new TextEncoder().encode("Kaydara FBX Binary  \0"));
    header[21] = 0x1a;
    new DataView(header.buffer).setUint32(23, 7400, true);

    const serializedNodes: Uint8Array[] = [];
    let offset = header.byteLength;
    for (const node of nodes) {
        const serialized = serializeNode(node, offset);
        serializedNodes.push(serialized);
        offset += serialized.byteLength;
    }
    return concatenate([header, ...serializedNodes, new Uint8Array(13)]);
}

function serializeNode(node: BinaryFbxNode, startOffset: number): Uint8Array {
    const name = new TextEncoder().encode(node.name);
    const properties = concatenate(node.properties ?? []);
    const children: Uint8Array[] = [];
    let childOffset = startOffset + 13 + name.byteLength + properties.byteLength;
    for (const child of node.children ?? []) {
        const serialized = serializeNode(child, childOffset);
        children.push(serialized);
        childOffset += serialized.byteLength;
    }
    const sentinel = children.length === 0 ? new Uint8Array() : new Uint8Array(13);
    const header = new Uint8Array(13);
    const view = new DataView(header.buffer);
    view.setUint32(0, childOffset + sentinel.byteLength, true);
    view.setUint32(4, node.properties?.length ?? 0, true);
    view.setUint32(8, properties.byteLength, true);
    header[12] = name.byteLength;
    return concatenate([header, name, properties, ...children, sentinel]);
}

function int32Property(value: number): Uint8Array {
    const data = new Uint8Array(5);
    data[0] = "I".charCodeAt(0);
    new DataView(data.buffer).setInt32(1, value, true);
    return data;
}

function int64Property(value: number): Uint8Array {
    const data = new Uint8Array(9);
    data[0] = "L".charCodeAt(0);
    const view = new DataView(data.buffer);
    view.setUint32(1, value >>> 0, true);
    view.setInt32(5, Math.floor(value / 0x1_0000_0000), true);
    return data;
}

function stringProperty(value: string): Uint8Array {
    const encoded = new TextEncoder().encode(value);
    const data = new Uint8Array(5 + encoded.byteLength);
    data[0] = "S".charCodeAt(0);
    new DataView(data.buffer).setUint32(1, encoded.byteLength, true);
    data.set(encoded, 5);
    return data;
}

function int32ArrayProperty(values: readonly number[]): Uint8Array {
    return arrayProperty("i", values.length, 4, (view, offset, value) => view.setInt32(offset, value, true), values);
}

function float64ArrayProperty(values: readonly number[]): Uint8Array {
    return arrayProperty("d", values.length, 8, (view, offset, value) => view.setFloat64(offset, value, true), values);
}

function arrayProperty(
    type: string,
    length: number,
    elementByteLength: number,
    write: (view: DataView, offset: number, value: number) => void,
    values: readonly number[]
): Uint8Array {
    const payloadByteLength = length * elementByteLength;
    const data = new Uint8Array(13 + payloadByteLength);
    data[0] = type.charCodeAt(0);
    const view = new DataView(data.buffer);
    view.setUint32(1, length, true);
    view.setUint32(5, 0, true);
    view.setUint32(9, payloadByteLength, true);
    values.forEach((value, index) => write(view, 13 + index * elementByteLength, value));
    return data;
}

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
    const result = new Uint8Array(parts.reduce((length, part) => length + part.byteLength, 0));
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.byteLength;
    }
    return result;
}
