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

export const collectUniformsFromNode = (
  graph: Graph,
  node: GraphNode
): IndexedInputs => {
  console.log('looking at node:', node);
  const { inputs } = node;

  const inputEdges = graph.edges.filter((edge) => edge.to === node.id);

  return inputs.reduce<IndexedInputs>((acc, input) => {
    console.log('looking at input', input);
    if (input.category === 'data') {
      return {
        ...acc,
        [node.id]: [...(acc[node.id] || []), input],
      };
    }
    console.log('searching', inputEdges, 'for', input);
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
    } else {
      console.log('no dice');
    }
    return acc;
  }, {});
};
