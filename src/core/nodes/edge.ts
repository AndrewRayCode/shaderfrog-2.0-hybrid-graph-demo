import { ShaderStage } from '../graph';
import { InputCategory } from './code-nodes';
import { GraphDataType } from './data-nodes';

export type EdgeType = ShaderStage | GraphDataType;
export type Edge = {
  from: string;
  to: string;
  output: string;
  input: string;
  type?: EdgeType;
};

export const makeEdge = (
  from: string,
  to: string,
  output: string,
  input: string,
  type?: EdgeType
): Edge => ({ from, to, output, input, type });
