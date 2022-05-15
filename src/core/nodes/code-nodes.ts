import { AstNode } from '@shaderfrog/glsl-parser/dist/ast';
import { ShaderStage } from '../graph';
import { Strategy } from '../strategy';
import { DataType } from './data-nodes';
import { CoreNode } from './node';

export type NodeInputs = Record<string, (a: AstNode) => void>;

export const mapInputs = (
  mappings: InputMapping,
  inputs: NodeInputs
): NodeInputs =>
  Object.entries(inputs).reduce<NodeInputs>(
    (acc, [name, fn]) => ({
      ...acc,
      [mappings[name] || name]: fn,
    }),
    {}
  );

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
