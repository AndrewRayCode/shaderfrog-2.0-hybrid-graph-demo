import { CoreNode, NodeInput, NodeOutput, NodePosition } from './core-node';

type ArrayType = 'array';
type Vector = 'vector2' | 'vector3' | 'vector4';
type Color = 'rgb' | 'rgba';
type Mat =
  | 'mat2'
  | 'mat3'
  | 'mat4'
  | 'mat2x2'
  | 'mat2x3'
  | 'mat2x4'
  | 'mat3x2'
  | 'mat3x3'
  | 'mat3x4'
  | 'mat4x2'
  | 'mat4x3'
  | 'mat4x4';

export type GraphDataType =
  | Vector
  | Color
  | Mat
  | 'texture'
  | 'samplerCube'
  | 'number'
  | ArrayType;

export interface NumberNode extends CoreNode {
  type: 'number';
  value: string;
  range?: [number, number];
  stepper?: number;
}
export const numberNode = (
  id: string,
  name: string,
  position: NodePosition,
  value: string,
  optionals?: {
    range?: [number, number];
    stepper?: number;
    inputs?: NodeInput[];
    outputs?: NodeOutput[];
  }
): NumberNode => ({
  type: 'number',
  id,
  name,
  position,
  value,
  inputs: optionals?.inputs || [],
  outputs: optionals?.outputs || [
    {
      name: 'float',
      id: '1',
      category: 'data',
    },
  ],
  range: optionals?.range,
  stepper: optionals?.stepper,
});

export type NumberDataUniform = Omit<
  NumberNode,
  'id' | 'inputs' | 'outputs' | 'position'
>;

export const numberUniformData = (
  name: string,
  value: string,
  range?: [number, number],
  stepper?: number
): NumberDataUniform => ({
  type: 'number',
  name,
  value,
  range,
  stepper,
});

export interface TextureNode extends CoreNode {
  type: 'texture';
  value: string;
}
export const textureNode = (
  id: string,
  name: string,
  position: NodePosition,
  value: string
): TextureNode => ({
  type: 'texture',
  id,
  name,
  position,
  value,
  inputs: [],
  outputs: [
    {
      name: 'texture',
      id: '1',
      category: 'data',
    },
  ],
});

export type TextureDataUniform = Omit<
  TextureNode,
  'id' | 'inputs' | 'outputs' | 'position'
>;

export const textureUniformData = (
  name: string,
  value: string
): TextureDataUniform => ({ type: 'texture', name, value });

export interface SamplerCubeNode extends CoreNode {
  type: 'samplerCube';
  value: string;
}
export const samplerCubeNode = (
  id: string,
  name: string,
  position: NodePosition,
  value: string
): SamplerCubeNode => ({
  type: 'samplerCube',
  id,
  name,
  position,
  value,
  inputs: [],
  outputs: [
    {
      name: 'samplerCube',
      id: '1',
      category: 'data',
    },
  ],
});

export type SamplerCubeDataUniform = Omit<
  SamplerCubeNode,
  'id' | 'inputs' | 'outputs' | 'position'
>;

export const samplerCubeUniformData = (
  name: string,
  value: string
): SamplerCubeDataUniform => ({ type: 'samplerCube', name, value });

export type ArrayValue = string[];

export interface ArrayNode extends CoreNode {
  type: 'array';
  dimensions: number;
  value: ArrayValue;
}

export function arrayNode(
  id: string,
  name: string,
  position: NodePosition,
  value: ArrayValue
): ArrayNode {
  return {
    id,
    name,
    position,
    inputs: [],
    outputs: [
      {
        name: 'array',
        id: '1',
        category: 'data',
      },
    ],
    value,
    dimensions: value.length,
    type: 'array',
  };
}

export type Vector2 = [string, string];
export type Vector3 = [string, string, string];
export type Vector4 = [string, string, string, string];

export interface Vector2Node extends CoreNode {
  type: 'vector2';
  dimensions: 2;
  value: Vector2;
}
export interface Vector3Node extends CoreNode {
  type: 'vector3';
  dimensions: 3;
  value: Vector3;
}
export interface Vector4Node extends CoreNode {
  type: 'vector4';
  dimensions: 4;
  value: Vector4;
}

export function vectorNode(
  id: string,
  name: string,
  position: NodePosition,
  value: Vector2 | Vector3 | Vector4
): Vector2Node | Vector3Node | Vector4Node {
  return {
    id,
    name,
    position,
    inputs: [],
    outputs: [
      {
        name: `vector${value.length}`,
        id: '1',
        category: 'data',
      },
    ],
    ...(value.length === 2
      ? { value, dimensions: 2, type: 'vector2' }
      : value.length === 3
      ? { value, dimensions: 3, type: 'vector3' }
      : { value, dimensions: 4, type: 'vector4' }),
  };
}

export type ArrayDataUniform = Omit<
  ArrayNode,
  'id' | 'inputs' | 'outputs' | 'position'
>;

export const arrayUniformData = (
  name: string,
  value: ArrayValue
): ArrayDataUniform => ({
  name,
  value,
  dimensions: value.length,
  type: 'array',
});

export type Vector2DataUniform = Omit<
  Vector2Node,
  'id' | 'inputs' | 'outputs' | 'position'
>;
export type Vector3DataUniform = Omit<
  Vector3Node,
  'id' | 'inputs' | 'outputs' | 'position'
>;
export type Vector4DataUniform = Omit<
  Vector4Node,
  'id' | 'inputs' | 'outputs' | 'position'
>;

export const vectorUniformData = (
  name: string,
  value: Vector2 | Vector3 | Vector4
): Vector2DataUniform | Vector3DataUniform | Vector4DataUniform => ({
  name,
  ...(value.length === 2
    ? { value, dimensions: 2, type: 'vector2' }
    : value.length === 3
    ? { value, dimensions: 3, type: 'vector3' }
    : { value, dimensions: 4, type: 'vector4' }),
});

export interface RgbNode extends CoreNode {
  type: 'rgb';
  dimensions: 3;
  value: Vector3;
}
export interface RgbaNode extends CoreNode {
  type: 'rgba';
  dimensions: 4;
  value: Vector4;
}

export function colorNode(
  id: string,
  name: string,
  position: NodePosition,
  value: Vector3 | Vector4
): RgbNode | RgbaNode {
  return {
    id,
    name,
    position,
    inputs: [],
    outputs: [
      {
        name: value.length === 3 ? 'rgb' : 'rgba',
        id: '1',
        category: 'data',
      },
    ],
    ...(value.length === 3
      ? { value, dimensions: 3, type: 'rgb' }
      : { value, dimensions: 4, type: 'rgba' }),
  };
}

export type RgbDataUniform = Omit<
  RgbNode,
  'id' | 'inputs' | 'outputs' | 'position'
>;
export type RgbaDataUniform = Omit<
  RgbaNode,
  'id' | 'inputs' | 'outputs' | 'position'
>;

export const colorUniformData = (
  name: string,
  value: Vector3 | Vector4
): RgbDataUniform | RgbaDataUniform => ({
  name,
  ...(value.length === 3
    ? { value, dimensions: 3, type: 'rgb' }
    : { value, dimensions: 4, type: 'rgba' }),
});

// When defining nodes, these are the types allowed in uniforms
export type UniformDataType =
  | TextureDataUniform
  | SamplerCubeDataUniform
  | NumberDataUniform
  | Vector2DataUniform
  | Vector3DataUniform
  | Vector4DataUniform
  | RgbDataUniform
  | RgbaDataUniform;

export type DataNode =
  | TextureNode
  | SamplerCubeNode
  | NumberNode
  | Vector2Node
  | Vector3Node
  | Vector4Node
  | ArrayNode
  | RgbNode
  | RgbaNode;
