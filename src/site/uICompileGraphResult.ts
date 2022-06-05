import { CompileGraphResult, Graph, GraphNode } from '../core/graph';
import { NodeInput } from '../core/nodes/core-node';
import { ensure } from '../util/ensure';

export type IndexedInputs = Record<string, NodeInput[]>;

export type UICompileGraphResult = {
  compileMs: string;
  fragmentResult: string;
  vertexResult: string;
  result: CompileGraphResult;
  activeUniforms: IndexedInputs;
  graph: Graph;
};

export const collectUniformsFromActiveNodes = (
  graph: Graph,
  nodes: GraphNode[]
) => {
  return nodes.reduce<IndexedInputs>(
    (acc, node) => ({
      ...acc,
      ...collectUniformsFromNode(graph, node),
    }),
    {}
  );
};

/**
 * Find the inputs to a node that represent uniform data
 */
export const collectUniformsFromNode = (
  graph: Graph,
  node: GraphNode
): IndexedInputs => {
  const { inputs } = node;

  const inputEdges = graph.edges.filter((edge) => edge.to === node.id);

  return inputs.reduce<IndexedInputs>((acc, input) => {
    if (input.category === 'data') {
      return {
        ...acc,
        [node.id]: [...(acc[node.id] || []), input],
      };
    }

    const inputEdge = inputEdges.find(
      (inputEdge) => inputEdge.input == input.id
    );
    if (inputEdge) {
      return {
        ...acc,
        ...collectUniformsFromNode(
          graph,
          ensure(graph.nodes.find(({ id }) => id === inputEdge.from))
        ),
      };
    }
    return acc;
  }, {});
};
