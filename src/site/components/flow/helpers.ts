import {
  Graph,
  GraphNode,
  ShaderStage,
  MAGIC_OUTPUT_STMTS,
  isSourceNode,
  NodeType,
  alphabet,
} from '../../../core/graph';
import { Edge as GraphEdge } from '../../../core/nodes/edge';
import {
  Node as FlowNode,
  Edge as FlowEdge,
  XYPosition,
  applyEdgeChanges,
  EdgeChange,
} from 'react-flow-renderer';
import { FlowEdgeData } from './FlowEdge';
import {
  FlowNodeData,
  FlowNodeDataData,
  FlowNodeSourceData,
  flowOutput,
  InputNodeHandle,
} from './FlowNode';
import { ensure } from '../../../util/ensure';
import { EngineNodeType } from '../../../core/engine';
import { NodeInput } from '../../../core/nodes/core-node';
import { SourceNode } from '../../../core/nodes/code-nodes';

export type FlowElement = FlowNode<FlowNodeData> | FlowEdge<FlowEdgeData>;
export type FlowEdgeOrLink = FlowEdge<FlowEdgeData>;
export type FlowElements = {
  nodes: FlowNode<FlowNodeData>[];
  edges: FlowEdgeOrLink[];
};

// Determine the stage of a node (vertex/fragment) by recursively looking at
// the nodes that feed into this one, until we find one that has a stage set
export const findInputStage = (
  ids: Record<string, FlowNode<FlowNodeData>>,
  edgesByTarget: Record<string, FlowEdge<FlowEdgeData>[]>,
  node: FlowNode<FlowNodeData>
): ShaderStage | undefined => {
  let nodeData = node.data as FlowNodeSourceData;
  return (
    (!nodeData?.biStage && nodeData?.stage) ||
    (edgesByTarget[node.id] || []).reduce<ShaderStage | undefined>(
      (found, edge) => {
        const type = edge.data?.type;
        return (
          found ||
          (type === 'fragment' || type === 'vertex' ? type : false) ||
          findInputStage(ids, edgesByTarget, ids[edge.source])
        );
      },
      undefined
    )
  );
};

export const setFlowNodeCategories = (
  flowElements: FlowElements,
  dataNodes: Record<string, GraphNode>
): FlowElements => ({
  ...flowElements,
  nodes: flowElements.nodes.map((node) => {
    if (node.id in dataNodes) {
      return {
        ...node,
        data: {
          ...node.data,
          category: 'code',
        },
      };
    }
    return node;
  }),
});

// Some nodes, like add, can be used for either fragment or vertex stage. When
// we connect edges in the graph, update it to figure out which stage we should
// set the add node to based on inputs to the node.
export const setFlowNodeStages = (flowElements: FlowElements): FlowElements => {
  const targets = flowElements.edges.reduce<Record<string, FlowEdge[]>>(
    (acc, edge) => ({
      ...acc,
      [edge.target]: [...(acc[edge.target] || []), edge],
    }),
    {}
  );
  const ids = flowElements.nodes.reduce<Record<string, FlowNode>>(
    (acc, node) => ({
      ...acc,
      [node.id]: node,
    }),
    {}
  );

  const updatedSides: Record<string, FlowElement> = {};
  // Update the node stages by looking at their inputs
  return {
    nodes: flowElements.nodes.map((node) => {
      if (!node.data || !('biStage' in node.data)) {
        return node;
      }
      if (!node.data.biStage && node.data.stage) {
        return node;
      }
      return (updatedSides[node.id] = {
        ...node,
        data: {
          ...node.data,
          stage: findInputStage(ids, targets, node),
        },
      });
    }),
    // Set the stage for edges connected to nodes whose stage changed
    edges: flowElements.edges.map((element) => {
      if (!('source' in element) || !(element.source in updatedSides)) {
        return element;
      }
      const { stage } = updatedSides[element.source].data as FlowNodeSourceData;
      return {
        ...element,
        // className: element.data?.type === 'data' ? element.data.type : stage,
        data: {
          ...element.data,
          stage,
        },
      };
    }),
  };
};

export const toFlowInputs = (node: GraphNode): InputNodeHandle[] =>
  (node.inputs || [])
    .filter(({ displayName }) => displayName !== MAGIC_OUTPUT_STMTS)
    .map((input) => ({
      id: input.id,
      name: input.displayName,
      type: input.type,
      baked: input.baked,
      bakeable: input.bakeable,
      validTarget: false,
      accepts: input.accepts,
    }));

export const graphNodeToFlowNode = (
  node: GraphNode,
  onInputBakedToggle: any,
  position: XYPosition
): FlowNode<FlowNodeData> => {
  const data: FlowNodeData = isSourceNode(node)
    ? {
        label: node.name,
        stage: node.stage,
        active: false,
        biStage: node.biStage || false,
        inputs: toFlowInputs(node),
        outputs: node.outputs.map((o) => flowOutput(o.name)),
        onInputBakedToggle,
      }
    : {
        label: node.name,
        type: node.type,
        value: node.value,
        inputs: toFlowInputs(node),
        outputs: node.outputs.map((o) => flowOutput(o.name)),
      };
  return {
    id: node.id,
    data,
    // type: isSourceNode(node) ? 'source' : 'data',
    type: node.type,
    position,
  };
};

export const flowEdgeToGraphEdge = (
  edge: FlowEdge<FlowEdgeData>
): GraphEdge => ({
  from: edge.source,
  to: edge.target,
  output: 'out',
  input: edge.targetHandle as string,
  type: edge.data?.type,
});

export const graphEdgeToFlowEdge = (
  edge: GraphEdge
): FlowEdge<FlowEdgeData> => ({
  id: `${edge.to}-${edge.from}`,
  source: edge.from,
  sourceHandle: edge.output,
  targetHandle: edge.input,
  target: edge.to,
  data: { type: edge.type },
  className: edge.type,
  // Not the edge type, the flow edge component type that renders this edge
  type: 'special',
});

export const updateGraphInput = (
  graph: Graph,
  nodeId: string,
  inputId: string,
  data: Partial<NodeInput>
): Graph => ({
  ...graph,
  nodes: graph.nodes.map((node) =>
    node.id === nodeId
      ? {
          ...node,
          inputs: node.inputs.map((i) =>
            i.id === inputId
              ? {
                  ...i,
                  data,
                }
              : i
          ),
        }
      : node
  ),
});

export const updateGraphNode = (
  graph: Graph,
  nodeId: string,
  data: Partial<GraphNode>
): Graph => ({
  ...graph,
  // @ts-ignore
  nodes: graph.nodes.map((node) =>
    node.id === nodeId
      ? {
          ...node,
          ...data,
        }
      : node
  ),
});

export const updateFlowNodeData = (
  flowElements: FlowElements,
  nodeId: string,
  data: Partial<FlowNodeData>
): FlowElements => ({
  ...flowElements,
  nodes: flowElements.nodes.map((node) =>
    node.id === nodeId
      ? {
          ...node,
          data: {
            ...node.data,
            ...data,
          },
        }
      : node
  ),
});

export const updateFlowInput = (
  flowElements: FlowElements,
  nodeId: string,
  inputId: string,
  data: Partial<InputNodeHandle>
): FlowElements => ({
  ...flowElements,
  nodes: flowElements.nodes.map((node) =>
    node.id === nodeId
      ? {
          ...node,
          data: {
            ...node.data,
            inputs: node.data.inputs.map((i) =>
              i.id === inputId
                ? {
                    ...i,
                    data,
                  }
                : i
            ),
          },
        }
      : node
  ),
});

export const applyFlowEdgeChanges = (
  flowElements: FlowElements,
  changes: EdgeChange[]
): FlowElements => {
  const updatedFlowGraph = setFlowNodeStages({
    nodes: flowElements.nodes,
    edges: applyEdgeChanges(changes, flowElements.edges),
  });
  return collapseBinaryEdges(updatedFlowGraph);
};

export const addFlowEdge = (
  flowElements: FlowElements,
  newEdge: FlowEdge
): FlowElements => {
  const updatedEdges = flowElements.edges.filter(
    (element) =>
      // Prevent one input handle from having multiple inputs
      !(
        (
          'targetHandle' in element &&
          element.targetHandle === newEdge.targetHandle &&
          element.target === newEdge.target
        )
        // Prevent one output handle from having multiple lines out
      ) &&
      !(
        'sourceHandle' in element &&
        element.sourceHandle === newEdge.sourceHandle &&
        element.source === newEdge.source
      )
  );

  const updatedFlowElements = setFlowNodeStages({
    ...flowElements,
    edges: [...updatedEdges, newEdge],
  });
  return collapseBinaryEdges(updatedFlowElements);
};

/**
 * I don't like how this is on the flow graph and not the core...
 *
 * A binary node automatically adds/removes inputs based on how many edges
 * connect to it. If a binary node has edges to "a" and "b", removing the edge
 * to "a" means the edge to "b" needs to be moved down to the "a" one. This
 * function essentially groups edges by target node id, and resets the edge
 * target to its index. This doesn't feel good to do here but I don't have a
 * better idea at the moment. One reason the inputs to binary nodes are
 * automatically updated after compile, but the edges are updated here
 * at the editor layer, before compile. This also hard codes assumptions about
 * (binary) node inputs into the graph, namely they can't have blank inputs.
 */
export const collapseBinaryEdges = (flowGraph: FlowElements): FlowElements => {
  // Find all edges that flow into a binary node, grouped by the target node's
  // id, since we need to know the total number of edges per node first
  const binaryEdges = flowGraph.edges.reduce<Record<string, FlowEdgeOrLink[]>>(
    (acc, edge) => {
      const toNode = flowGraph.nodes.find(({ id }) => id === edge.target);
      return toNode?.type === NodeType.BINARY
        ? {
            ...acc,
            [toNode.id]: [...(acc[toNode.id] || []), edge],
          }
        : acc;
    },
    {}
  );

  // Then collapse them
  const updatedEdges = flowGraph.edges.map((edge) => {
    return edge.target in binaryEdges
      ? {
          ...edge,
          targetHandle: alphabet.charAt(binaryEdges[edge.target].indexOf(edge)),
        }
      : edge;
  });
  return {
    ...flowGraph,
    edges: updatedEdges,
  };
};

/*
// Convert flow elements to graph
export const fromFlowToGraph = (
  graph: Graph,
  flowElements: FlowElements
): Graph => {
  const edges = flowElements.edges.map(flowEdgeToGraphEdge);

  const flowNodesById = flowElements.nodes.reduce<
    Record<string, FlowNode<FlowNodeData>>
  >((acc, node) => ({ ...acc, [node.id]: node }), {});

  const nodes = graph.nodes.map((node) => {
    const fromFlow = flowNodesById[node.id];
    const {
      data: { inputs: flowInputs },
    } = flowNodesById[node.id];

    return {
      ...node,
      inputs: node.inputs.map((i) => {
        // mainStmts is hidden from the graph
        if (i.displayName === MAGIC_OUTPUT_STMTS) {
          return i;
        }

        const inputFromFlow = ensure(
          flowInputs.find((f) => f.id === i.id),
          `While converting flow nodes to graph nodes, flow node ${node.name} has no input ${i.id}, which is present on the graph node.`
        );
        return {
          ...i,
          ...(inputFromFlow.baked ? { baked: inputFromFlow.baked } : null),
        };
      }),
      ...('value' in node
        ? { value: (fromFlow.data as FlowNodeDataData).value }
        : null),
    };
  });

  return {
    ...graph,
    nodes,
    edges,
  };
};
*/

export const initializeFlowElementsFromGraph = (
  graph: Graph,
  onInputBakedToggle: any
): FlowElements => {
  let engines = 0;
  let maths = 0;
  let outputs = 0;
  let shaders = 0;
  const spacing = 200;
  const maxHeight = 4;
  console.log('Initializing flow elements from', { graph });

  const nodes = graph.nodes.map((node) =>
    graphNodeToFlowNode(
      node,
      onInputBakedToggle,
      node.type === EngineNodeType.output
        ? { x: spacing * 2, y: outputs++ * 100 }
        : node.type === EngineNodeType.phong ||
          node.type === EngineNodeType.toon ||
          node.type === EngineNodeType.physical
        ? { x: spacing, y: engines++ * 100 }
        : node.type === EngineNodeType.binary
        ? { x: 0, y: maths++ * 100 }
        : {
            x: -spacing - spacing * Math.floor(shaders / maxHeight),
            y: (shaders++ % maxHeight) * 120,
          }
    )
  );

  const edges: FlowEdgeOrLink[] = graph.edges.map(graphEdgeToFlowEdge);

  return setFlowNodeStages({ nodes, edges });
};
