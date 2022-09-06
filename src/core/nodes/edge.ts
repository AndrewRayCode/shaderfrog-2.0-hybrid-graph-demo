import { ShaderStage } from '../graph';
import { GraphDataType } from './data-nodes';

export type EdgeType = ShaderStage | GraphDataType;
export type Edge = {
  id: string;
  from: string;
  to: string;
  output: string;
  // The ID of the input of the node this edge connects to
  input: string;
  // Fragment, vertex, or any of the data types
  type?: EdgeType;
};

export const makeEdge = (
  id: string,
  from: string,
  to: string,
  output: string,
  input: string,
  type?: EdgeType
): Edge => ({ id, from, to, output, input, type });
