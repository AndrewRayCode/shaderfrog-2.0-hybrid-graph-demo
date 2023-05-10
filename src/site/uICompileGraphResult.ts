import {
  CompileGraphResult,
  Graph,
  GraphNode,
} from '@shaderfrog/core/src/core/graph';
import { NodeInput } from '@shaderfrog/core/src/core/nodes/core-node';

export type IndexedDataInputs = Record<string, NodeInput[]>;

export type UICompileGraphResult = {
  compileMs: string;
  fragmentResult: string;
  vertexResult: string;
  result: CompileGraphResult;
  dataNodes: Record<string, GraphNode>;
  dataInputs: IndexedDataInputs;
  graph: Graph;
};
