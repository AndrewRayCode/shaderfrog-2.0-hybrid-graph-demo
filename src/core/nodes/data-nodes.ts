import { CoreNode } from './core-node';

type Vec = 'vec2' | 'vec3' | 'vec4';
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

export type GraphDataType = Vec | Mat | 'sampler2D' | 'number' | 'array';

export interface NumberNode extends CoreNode {
  type: 'number';
  value: string;
  range?: [number, number];
  stepper?: number;
}
export const numberNode = (
  id: string,
  name: string,
  value: string,
  optionals?: {
    range?: [number, number];
    stepper?: number;
    inputs?: Object[];
    outputs?: Object[];
  }
): NumberNode => ({
  type: 'number',
  id,
  name,
  value,
  inputs: optionals?.inputs || [],
  outputs: optionals?.outputs || ['out'],
  range: optionals?.range,
  stepper: optionals?.stepper,
});

export type NumberData = Omit<NumberNode, 'id' | 'inputs' | 'outputs'>;

export const numberData = (
  name: string,
  value: string,
  range?: [number, number],
  stepper?: number
): NumberData => ({ type: 'number', name, value, range, stepper });

export type DataType = NumberData;
export type DataNode = NumberNode;
