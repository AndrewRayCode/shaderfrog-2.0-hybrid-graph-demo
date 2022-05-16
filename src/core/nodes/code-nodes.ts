import { AstNode } from '@shaderfrog/glsl-parser/dist/ast';
import { ShaderStage } from '../graph';
import { Strategy } from '../strategy';
import { DataType } from './data-nodes';
import { CoreNode } from './node';

export type InputCategory = 'data' | 'code';
export type NodeInput = {
  name: string;
  id: string;
  category: InputCategory;
  // I don't like filler being on the *data* produced by the input finders.
  // Later, look into making a separate filler cache object, by ID or something
  filler: (a: AstNode) => void;
};
// export type NodeInputs = Record<string, (a: AstNode) => void>;

export const mapInputs = (
  mappings: InputMapping,
  inputs: NodeInput[]
): NodeInput[] =>
  inputs.map(({ name, ...input }) => ({
    ...input,
    name: mappings[name] || name,
  }));

export type InputMapping = { [original: string]: string };
export type NodeConfig = {
  version: 2 | 3;
  preprocess: boolean;
  inputMapping?: InputMapping;
  strategies: Strategy[];
  uniforms?: DataType[];
};

export interface CodeNode extends CoreNode {
  config: NodeConfig;
  source: string;
  expressionOnly?: boolean;
  stage?: ShaderStage;
  biStage?: boolean;
  nextStageNodeId?: string;
  originalEngine?: string;
}

export interface BinaryNode extends CodeNode {
  operator: string;
}

export type SourceNode = BinaryNode | CodeNode;
