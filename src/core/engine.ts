import { Program } from '@shaderfrog/glsl-parser/ast';
import { AstNode } from '@shaderfrog/glsl-parser/ast';
import { MergeOptions } from '../ast/shader-sections';
import { Graph, NodeParser } from './graph';
import preprocess from '@shaderfrog/glsl-parser/preprocessor';
import { generate, parser } from '@shaderfrog/glsl-parser';
import { ShaderStage, GraphNode, NodeType } from './graph';
import { CoreNode, NodeInput, NodePosition } from './nodes/core-node';
import { DataNode, UniformDataType } from './nodes/data-nodes';
import { CodeNode, SourceNode } from './nodes/code-nodes';
import { Edge } from './nodes/edge';
import groupBy from 'lodash.groupby';

const log = (...args: any[]) =>
  console.log.call(console, '\x1b[32m(core)\x1b[0m', ...args);

export enum EngineNodeType {
  toon = 'toon',
  phong = 'phong',
  physical = 'physical',
  shader = 'shader',
  binary = 'binary',
}

export type PhysicalNodeConstructor = (
  id: string,
  name: string,
  groupId: string | null | undefined,
  position: NodePosition,
  uniforms: UniformDataType[],
  stage: ShaderStage | undefined,
  nextStageNodeId?: string
) => CodeNode;

export type ToonNodeConstructor = (
  id: string,
  name: string,
  groupId: string | null | undefined,
  position: NodePosition,
  uniforms: UniformDataType[],
  stage: ShaderStage | undefined,
  nextStageNodeId?: string
) => CodeNode;

export interface Engine {
  name: string;
  preserve: Set<string>;
  mergeOptions: MergeOptions;
  // Component: FunctionComponent<{ engine: Engine; parsers: NodeParsers }>;
  // nodes: NodeParsers;
  parsers: Record<string, NodeParser>;
  importers: EngineImporters;
  evaluateNode: (node: DataNode) => any;
  constructors: {
    [EngineNodeType.physical]: PhysicalNodeConstructor;
    [EngineNodeType.toon]: ToonNodeConstructor;
  };
}

export type NodeContext = {
  ast: AstNode | Program;
  source?: string;
  // Inputs are determined at parse time and should probably be in the graph,
  // not here on the runtime context for the node
  inputs?: NodeInput[];
  id?: string;
  name?: string;
};

// The context an engine builds as it evaluates. It can manage its own state
// as the generic "RuntimeContext" which is passed to implemented engine methods
export type EngineContext = {
  engine: string;
  nodes: Record<string, NodeContext>;
  runtime: any;
  debuggingNonsense: {
    vertexSource?: string;
    vertexPreprocessed?: string;
    fragmentPreprocessed?: string;
    fragmentSource?: string;
  };
};

export type EngineImporter = {
  convertAst(ast: Program, type?: ShaderStage): void;
  nodeInputMap: Partial<Record<EngineNodeType, Record<string, string | null>>>;
  edgeMap: { [oldInput: string]: string };
};
export type EngineImporters = {
  [engine: string]: EngineImporter;
};

type EdgeUpdates = { [edgeId: string]: { oldInput: string; newInput: string } };

export const convertNode = (
  node: SourceNode,
  converter: EngineImporter
): SourceNode => {
  log(`Converting ${node.name} (${node.id})`);
  const preprocessed = preprocess(node.source, {
    preserveComments: true,
    preserve: {
      version: () => true,
      define: () => true,
    },
  });
  const ast = parser.parse(preprocessed);
  converter.convertAst(ast, node.stage);
  const source = generate(ast);

  return {
    ...node,
    source,
  };
};

export const convertToEngine = (
  oldEngine: Engine,
  newEngine: Engine,
  graph: Graph
): Graph => {
  const converter = newEngine.importers[oldEngine.name];
  if (!converter) {
    throw new Error(
      `The engine ${newEngine.name} has no importer for ${oldEngine.name}`
    );
  }

  log(`Attempting to convert from ${newEngine.name} to ${oldEngine.name}`);

  // const edgeUpdates: EdgeUpdates = {};

  const edgesByNodeId = groupBy(graph.edges, 'to');
  const edgeUpdates: Record<string, Edge | null> = {};
  const nodeUpdates: Record<string, GraphNode | null> = {};

  graph.nodes.forEach((node) => {
    // Convert engine nodes
    if (node.type in EngineNodeType) {
      if (node.type in newEngine.constructors) {
        const source = node as SourceNode;
        nodeUpdates[source.id] = // @ts-ignore
        (newEngine.constructors[source.type] as PhysicalNodeConstructor)(
          source.id,
          source.name,
          source.groupId,
          source.position,
          source.config.uniforms,
          source.stage,
          source.nextStageNodeId
        );
        // Bail if no conversion
      } else {
        throw new Error(
          `Can't convert ${oldEngine.name} to ${newEngine.name} because ${newEngine.name} does not have a "${node.type}" constructor`
        );
      }
    } else if (NodeType.SOURCE === node.type) {
      nodeUpdates[node.id] = convertNode(node, converter);
    }

    // Then update input edges. We only care about engine nodes
    if (node.type in converter.nodeInputMap) {
      const map = converter.nodeInputMap[node.type as EngineNodeType]!;

      (edgesByNodeId[node.id] || []).forEach((edge) => {
        if (edge.input in map) {
          const mapped = map[edge.input]!;
          log('Converting edge', edge.input, 'to', map[edge.input]);
          edgeUpdates[edge.id] = {
            ...edge,
            input: mapped,
          };
        } else {
          log(
            'Discarding',
            edge.input,
            'as there is no edge mapping in the',
            newEngine.name,
            'importer'
          );
          edgeUpdates[edge.id] = null;
        }
      });
    }
  });

  graph.edges = graph.edges.reduce<Edge[]>((edges, edge) => {
    if (edge.id in edgeUpdates) {
      const res = edgeUpdates[edge.id];
      if (res === null) {
        return edges;
      } else {
        return [...edges, res];
      }
    }
    return [...edges, edge];
  }, []);

  graph.nodes = graph.nodes.reduce<GraphNode[]>((nodes, node) => {
    if (node.id in nodeUpdates) {
      const res = nodeUpdates[node.id];
      if (res === null) {
        return nodes;
      } else {
        return [...nodes, res];
      }
    }
    return [...nodes, node];
  }, []);

  log('Created converted graph', graph);
  return graph;
};
