import { ShaderStage } from '../graph';
import { Strategy } from '../strategy';
import { UniformDataType } from './data-nodes';
import { CoreNode, NodeInput } from './core-node';

export const mapInputName = (
  node: CodeNode,
  { id, displayName }: NodeInput
): string => node.config?.inputMapping?.[id] || displayName;

export type InputMapping = { [original: string]: string };
export type NodeConfig = {
  version: 2 | 3;
  preprocess: boolean;
  inputMapping?: InputMapping;
  strategies: Strategy[];
  uniforms?: UniformDataType[];
  properties?: NodeProperty[];
  hardCodedProperties?: Record<string, any>;
};

export interface NodeProperty {
  // Display name, like "albedo"
  displayName: string;
  // Type in the engine, like "texture"
  type: string;
  // Property name to apply to the material, like "map"
  property: string;
  // The name of the filler this property introduces, aka the GLSL source code
  // to be replaced, if this property is present.
  fillerName?: string;
}

export const property = (
  displayName: string,
  property: string,
  type: string,
  fillerName?: string
): NodeProperty => ({
  displayName,
  type,
  property,
  fillerName,
});

export interface CodeNode extends CoreNode {
  config: NodeConfig;
  source: string;
  expressionOnly?: boolean;
  stage?: ShaderStage;
  biStage?: boolean;
  groupId?: string;
  nextStageNodeId?: string;
  prevStageNodeId?: string;
  originalEngine?: string;
}

export interface BinaryNode extends CodeNode {
  operator: string;
}

export type SourceNode = BinaryNode | CodeNode;
