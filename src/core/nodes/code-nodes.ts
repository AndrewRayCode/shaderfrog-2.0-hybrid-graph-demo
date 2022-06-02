import { ShaderStage } from '../graph';
import { Strategy } from '../strategy';
import { DataType } from './data-nodes';
import { CoreNode, NodeInput } from './core-node';

export const mapInputName = (node: CodeNode, { name }: NodeInput): string =>
  node.config?.inputMapping?.[name] || name;

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
