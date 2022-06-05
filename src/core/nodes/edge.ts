import { ShaderStage } from '../graph';
import { GraphDataType } from './data-nodes';

export type EdgeType = ShaderStage | GraphDataType;
export type Edge = {
  from: string;
  to: string;
  output: string;
  /**
   * The ID of the input of the node this edge connects to
   */
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
