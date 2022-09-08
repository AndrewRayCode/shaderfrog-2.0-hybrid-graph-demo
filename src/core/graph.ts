import { parser, generate } from '@shaderfrog/glsl-parser';
import { ParserProgram } from '@shaderfrog/glsl-parser/dist/parser/parser';
import groupBy from 'lodash.groupby';

import {
  renameBindings,
  renameFunctions,
} from '@shaderfrog/glsl-parser/dist/parser/utils';
import {
  visit,
  AstNode,
  NodeVisitors,
  Path,
} from '@shaderfrog/glsl-parser/dist/ast';
import { Engine, EngineContext } from './engine';
import {
  emptyShaderSections,
  findShaderSections,
  mergeShaderSections,
  ShaderSections,
} from '../ast/shader-sections';
import preprocess from '@shaderfrog/glsl-parser/dist/preprocessor';
import {
  convert300MainToReturn,
  from2To3,
  makeExpression,
  makeExpressionWithScopes,
  makeFnStatement,
} from '../ast/manipulate';
import { ensure } from '../util/ensure';
import { applyStrategy } from './strategy';
import { DataNode } from './nodes/data-nodes';
import { Edge } from './nodes/edge';
import {
  BinaryNode,
  CodeNode,
  mapInputName,
  NodeProperty,
  SourceNode,
} from './nodes/code-nodes';
import { InputCategory, nodeInput, NodeInput } from './nodes/core-node';
import { Color, Vector2, Vector3, Vector4 } from 'three';
import { makeId } from '../util/id';

export type ShaderStage = 'fragment' | 'vertex';

export enum NodeType {
  OUTPUT = 'output',
  BINARY = 'binary',
  SOURCE = 'source',
}

export type GraphNode = SourceNode | DataNode;

export interface Graph {
  nodes: GraphNode[];
  edges: Edge[];
}

export const alphabet = 'abcdefghijklmnopqrstuvwxyz';

export type NodeFiller = (node: SourceNode, ast: AstNode) => AstNode | void;
export const emptyFiller: NodeFiller = () => {};

export const isDataNode = (node: GraphNode): node is DataNode =>
  'value' in node;

export const isSourceNode = (node: GraphNode): node is SourceNode =>
  !isDataNode(node);

export const MAGIC_OUTPUT_STMTS = 'mainStmts';

export type InputFiller = (a: AstNode) => AstNode;
export type InputFillers = Record<string, InputFiller>;
export type NodeContext = {
  ast: AstNode | ParserProgram;
  source?: string;
  id: string;
  inputFillers: InputFillers;
  errors?: NodeErrors;
};

export type ComputedInput = [NodeInput, InputFiller];

export type FindInputs = (
  engineContext: EngineContext,
  node: SourceNode,
  ast: AstNode,
  inputEdges: Edge[]
) => ComputedInput[];

export type OnBeforeCompile = (
  graph: Graph,
  engineContext: EngineContext,
  node: SourceNode,
  sibling?: SourceNode
) => void;

export type ProduceAst = (
  engineContext: EngineContext,
  engine: Engine,
  graph: Graph,
  node: SourceNode,
  inputEdges: Edge[]
) => AstNode | ParserProgram;

export type Evaluator = (node: GraphNode) => any;
export type Evaluate = (
  node: SourceNode,
  inputEdges: Edge[],
  inputNodes: GraphNode[],
  evaluate: Evaluator
) => any;

type CoreNodeParser = {
  produceAst: ProduceAst;
  findInputs: FindInputs;
  produceFiller: NodeFiller;
  evaluate?: Evaluate;
};

export type ManipulateAst = (
  engineContext: EngineContext,
  engine: Engine,
  graph: Graph,
  node: SourceNode,
  ast: AstNode | ParserProgram,
  inputEdges: Edge[]
) => AstNode | ParserProgram;

export type NodeParser = {
  // cacheKey?: (graph: Graph, node: GraphNode, sibling?: GraphNode) => string;
  onBeforeCompile?: OnBeforeCompile;
  manipulateAst?: ManipulateAst;
  findInputs?: FindInputs;
  produceFiller?: NodeFiller;
};

export const findNode = (graph: Graph, id: string): GraphNode =>
  ensure(graph.nodes.find((node) => node.id === id));

export const doesLinkThruShader = (graph: Graph, node: GraphNode): boolean => {
  const edges = graph.edges.filter((edge) => edge.from === node.id);
  if (edges.length === 0) {
    return false;
  }
  return edges.reduce<boolean>((foundShader, edge: Edge) => {
    const upstreamNode = ensure(
      graph.nodes.find((node) => node.id === edge.to)
    );
    return (
      foundShader ||
      // TODO: LARD this probably will introduce some insidius hard to track
      // down bug, as I try to pull toon and phong up out of core, I need to
      // know if a graph links through a "shader" which now means somehting
      // different... does a config object need isShader? Can we compute it from
      // inputs/ outputs/source?
      (!(upstreamNode as CodeNode).expressionOnly &&
        upstreamNode.type !== NodeType.OUTPUT) ||
      doesLinkThruShader(graph, upstreamNode)
    );
  }, false);
};

type CoreParser = { [key: string]: CoreNodeParser };

export const nodeName = (node: GraphNode): string =>
  'main_' + node.name.replace(/[^a-zA-Z0-9]/g, ' ').replace(/ +/g, '_');

export const mangleName = (name: string, node: GraphNode) => {
  // Mangle names by using the next stage id, if present
  const id = ('nextStageNodeId' in node && node.nextStageNodeId) || node.id;
  return `${name}_${id}`;
};

export const mangleVar = (name: string, engine: Engine, node: GraphNode) =>
  engine.preserve.has(name) ? name : mangleName(name, node);

export const mangle = (
  ast: ParserProgram,
  node: SourceNode,
  engine: Engine
) => {
  renameBindings(ast.scopes[0], (name) => mangleVar(name, engine, node));
  renameFunctions(ast.scopes[0], (name) =>
    name === 'main' ? nodeName(node) : mangleName(name, node)
  );
};

export const coreParsers: CoreParser = {
  [NodeType.SOURCE]: {
    produceAst: (engineContext, engine, graph, node, inputEdges) => {
      let ast;
      if (node.expressionOnly) {
        ast = makeExpressionWithScopes(node.source);
      } else {
        const preprocessed = preprocess(node.source, {
          preserve: {
            version: () => true,
          },
        });

        ast = parser.parse(preprocessed);

        if (node.config.version === 2 && node.stage) {
          from2To3(ast, node.stage);
        }

        // This assumes that expressionOnly nodes don't have a stage and that all
        // fragment source code shades have main function, which is probably wrong
        if (node.stage === 'fragment') {
          convert300MainToReturn('main', ast);
        }
      }

      return ast;
    },
    findInputs: (engineContext, node, ast) => {
      let seen = new Set<string>();
      return node.config.strategies
        .flatMap((strategy) => applyStrategy(strategy, node, ast))
        .filter(([input, _]) => {
          if (!seen.has(input.id)) {
            seen.add(input.id);
            return true;
          }
          return false;
        });
    },
    produceFiller: (node, ast) => {
      return node.expressionOnly
        ? ast.program
        : makeExpression(`${nodeName(node)}()`);
    },
  },
  // TODO: Output node assumes strategies are still passed in on node creation,
  // which might be a little awkward for graph creators?
  [NodeType.OUTPUT]: {
    produceAst: (engineContext, engine, graph, node, inputEdges) => {
      return parser.parse(node.source);
    },
    findInputs: (engineContext, node, ast) => {
      return [
        ...node.config.strategies.flatMap((strategy) =>
          applyStrategy(strategy, node, ast)
        ),
        [
          nodeInput(
            MAGIC_OUTPUT_STMTS,
            `filler_${MAGIC_OUTPUT_STMTS}`,
            'filler',
            new Set<InputCategory>(['code']),
            false
          ),
          (fillerAst: AstNode) => {
            ast.program
              .find((stmt: AstNode) => stmt.type === 'function')
              .body.statements.unshift(makeFnStatement(generate(fillerAst)));
            return ast;
          },
        ],
      ];
    },
    produceFiller: (node, ast) => {
      return makeExpression('impossible_call()');
    },
  },
  [NodeType.BINARY]: {
    produceAst: (engineContext, engine, graph, iNode, inputEdges) => {
      const node = iNode as BinaryNode;
      const fragmentAst: AstNode = {
        type: 'program',
        program: [
          makeExpression(
            '(' +
              (inputEdges.length
                ? inputEdges
                    .map((_, index) => alphabet.charAt(index))
                    .join(` ${node.operator} `)
                : `a ${node.operator} b`) +
              ')'
          ),
        ],
        scopes: [],
      };
      return fragmentAst;
    },
    findInputs: (engineContext, node, ast, inputEdges) => {
      return new Array(Math.max(inputEdges.length + 1, 2))
        .fill(0)
        .map((_, index) => {
          const letter = alphabet.charAt(index);
          return [
            nodeInput(
              letter,
              letter,
              'filler',
              new Set<InputCategory>(['data', 'code']),
              false
            ),
            (fillerAst: AstNode) => {
              let foundPath: Path | undefined;
              const visitors: NodeVisitors = {
                identifier: {
                  enter: (path) => {
                    if (path.node.identifier === letter) {
                      foundPath = path;
                    }
                  },
                },
              };
              visit(ast, visitors);
              if (!foundPath) {
                throw new Error(
                  `Im drunk and I think this case is impossible, no "${letter}" found in binary node?`
                );
              }

              if (foundPath.parent && foundPath.key) {
                foundPath.parent[foundPath.key] = fillerAst;
                return ast;
              } else {
                return fillerAst;
              }
            },
          ];
        });
    },
    produceFiller: (node, ast) => {
      return ast.program;
    },
    evaluate: (node, inputEdges, inputNodes, evaluateNode) => {
      const operator = (node as BinaryNode).operator;
      return inputNodes.map<number>(evaluateNode).reduce((num, next) => {
        if (operator === '+') {
          return num + next;
        } else if (operator === '*') {
          return num * next;
        } else if (operator === '-') {
          return num - next;
        } else if (operator === '/') {
          return num / next;
        }
        throw new Error(
          `Don't know how to evaluate ${operator} for node ${node.name} (${node.id})`
        );
      });
    },
  },
};

export const toGlsl = (node: DataNode): string => {
  const { type, value } = node;
  if (type === 'vector2') {
    return `vec2(${value[0]}, ${value[1]})`;
  }
  if (type === 'vector3' || type === 'rgb') {
    return `vec3(${value[0]}, ${value[1]}, ${value[2]})`;
  }
  if (type === 'vector4' || type === 'rgba') {
    return `vec4(${value[0]}, ${value[1]}, ${value[2]}, ${value[3]})`;
  }
  throw new Error(`Unknown GLSL inline type: "${node.type}"`);
};

export const evaluateNode = (graph: Graph, node: GraphNode): any => {
  // TODO: Data nodes themselves should have evaluators
  if ('value' in node) {
    if (node.type === 'number') {
      return parseFloat(node.value);
    }

    // HARD CODED THREE.JS HACK for testing meshpshysicalmaterial uniforms
    if (node.type === 'vector2') {
      return new Vector2(parseFloat(node.value[0]), parseFloat(node.value[1]));
    } else if (node.type === 'vector3') {
      return new Vector3(
        parseFloat(node.value[0]),
        parseFloat(node.value[1]),
        parseFloat(node.value[2])
      );
    } else if (node.type === 'vector4') {
      return new Vector4(
        parseFloat(node.value[0]),
        parseFloat(node.value[1]),
        parseFloat(node.value[2]),
        parseFloat(node.value[3])
      );
    } else if (node.type === 'rgb') {
      return new Color(
        parseFloat(node.value[0]),
        parseFloat(node.value[1]),
        parseFloat(node.value[2])
      );
    } else if (node.type === 'rgba') {
      return new Color(
        parseFloat(node.value[0]),
        parseFloat(node.value[1]),
        parseFloat(node.value[2])
      );
    } else {
      return node.value;
    }
  }

  const { evaluate } = coreParsers[node.type];
  if (!evaluate) {
    throw new Error(`No evaluator for node ${node.name} (${node.id})`);
  }
  const inputEdges = graph.edges.filter((edge) => edge.to === node.id);
  const inputNodes = inputEdges.map(
    (edge) => graph.nodes.find((node) => node.id === edge.from) as GraphNode
  );

  return evaluate(
    node as SourceNode,
    inputEdges,
    inputNodes,
    evaluateNode.bind(null, graph)
  );
};

type Predicates = {
  node?: (node: GraphNode, inputEdges: Edge[]) => boolean;
  input?: (
    input: NodeInput,
    node: GraphNode,
    inputEdge: Edge | undefined,
    fromNode: GraphNode | undefined
  ) => boolean;
};
export type SearchResult = {
  nodes: Record<string, GraphNode>;
  inputs: Record<string, NodeInput[]>;
};

/**
 * Recursively filter the graph, starting from a specific node, looking for
 * nodes and edges that match predicates. This function returns the inputs for
 * matched edges, not the edges themselves, as a convenience for the only
 * consumer of this function, which is finding input names to use as uniforms
 */
export const filterGraphFromNode = (
  graph: Graph,
  node: GraphNode,
  predicates: Predicates
): SearchResult => {
  const { inputs } = node;
  const inputEdges = graph.edges.filter((edge) => edge.to === node.id);

  const nodeAcc = {
    ...(predicates.node && predicates.node(node, inputEdges)
      ? { [node.id]: node }
      : {}),
  };

  return inputs.reduce<SearchResult>(
    (acc, input) => {
      const inputEdge = inputEdges.find(
        (inputEdge) => inputEdge.input == input.id
      );
      const fromNode = inputEdge
        ? ensure(graph.nodes.find(({ id }) => id === inputEdge.from))
        : undefined;

      const inputAcc = {
        ...acc.inputs,
        ...(predicates.input &&
        predicates.input(input, node, inputEdge, fromNode)
          ? { [node.id]: [...(acc.inputs[node.id] || []), input] }
          : {}),
      };

      if (inputEdge && fromNode) {
        const result = filterGraphFromNode(graph, fromNode, predicates);
        return {
          nodes: { ...acc.nodes, ...result.nodes },
          inputs: { ...acc.inputs, ...inputAcc, ...result.inputs },
        };
      }
      return {
        ...acc,
        inputs: {
          ...acc.inputs,
          ...inputAcc,
        },
      };
    },
    { inputs: {}, nodes: nodeAcc }
  );
};

export const collectConnectedNodes = (graph: Graph, node: GraphNode): NodeIds =>
  filterGraphFromNode(graph, node, { node: () => true }).nodes;

type NodeIds = Record<string, GraphNode>;
export type CompileNodeResult = [ShaderSections, AstNode | void, NodeIds];

// before data inputs were known by the input.category being node or data. I
// tried updating inputs to have acepts: [code|data] and "baked" now is there a
// way to know if we're plugging in code or data?
export const isDataInput = (input: NodeInput) =>
  (input.type === 'uniform' || input.type === 'property') && !input.baked;

export const compileNode = (
  engine: Engine,
  graph: Graph,
  edges: Edge[],
  engineContext: EngineContext,
  node: GraphNode,
  activeIds: NodeIds = {}
): CompileNodeResult => {
  // THIS DUPLICATES OTHER LINE
  const parser = {
    ...(coreParsers[node.type] || coreParsers[NodeType.SOURCE]),
    ...(engine.parsers[node.type] || {}),
  };

  const { inputs } = node;

  // Removing this seems to prevent normal map shader source code updating from
  // affecting the three.js shader. Why?
  const { onBeforeCompile } = parser;
  if (onBeforeCompile) {
    const { groupId } = node as SourceNode;
    const sibling = graph.nodes.find(
      (n) =>
        n !== node && 'groupId' in n && (n as SourceNode).groupId === groupId
    );
    onBeforeCompile(
      graph,
      engineContext,
      node as SourceNode,
      sibling as SourceNode
    );
  }

  // Will I one day get good enough at typescript to be able to remove this
  // check? Or will I learn that I need it?
  if (!parser) {
    console.error(node);
    throw new Error(
      `No parser found for ${node.name} (${node.type}, id ${node.id})`
    );
  }

  const nodeContext = isDataNode(node)
    ? null
    : ensure(
        engineContext.nodes[node.id],
        `No node context found for "${node.name}" (id ${node.id})!`
      );
  const { ast, inputFillers } = (nodeContext || {}) as NodeContext;
  if (!inputs) {
    throw new Error("I'm drunk and I think this case should be impossible");
  }

  let compiledIds = activeIds;

  const inputEdges = edges.filter((edge) => edge.to === node.id);
  if (inputEdges.length) {
    let continuation = emptyShaderSections();
    inputEdges
      .map((edge) => ({
        edge,
        fromNode: ensure(
          graph.nodes.find((node) => edge.from === node.id),
          `GraphNode for edge ${edge.from} not found`
        ),
        input: ensure(
          inputs.find(({ id }) => id == edge.input),
          `GraphNode "${node.name}" has no input ${
            edge.input
          }!\nAvailable:${inputs.map(({ id }) => id).join(', ')}`
        ),
      }))
      .filter(({ input }) => !isDataInput(input))
      .forEach(({ fromNode, edge, input }) => {
        const [inputSections, fillerAst, childIds] = compileNode(
          engine,
          graph,
          edges,
          engineContext,
          fromNode,
          activeIds
        );
        if (!fillerAst) {
          throw new TypeError(
            `Expected a filler ast from node ID ${fromNode.id} (${fromNode.type}) but none was returned`
          );
        }

        continuation = mergeShaderSections(continuation, inputSections);
        compiledIds = { ...compiledIds, ...childIds };

        let filler, fillerName;
        if (nodeContext) {
          if (input.property) {
            fillerName = ensure(
              ((node as CodeNode).config.properties || []).find(
                (p) => p.property === input.property
              )?.fillerName,
              `Node "${node.name}" has no property named "${input.property}" to find the filler for`
            );
            filler = inputFillers[fillerName];
          } else {
            filler = inputFillers[input.id];
          }
          if (!filler) {
            console.error('No filler for property', {
              input,
              node,
              inputFillers,
              fillerName,
            });
            throw new Error(
              `Node "${node.name}" has no filler for input "${input.displayName}" named ${fillerName}`
            );
          }
          nodeContext.ast = filler(fillerAst);
        }
        // console.log(generate(ast.program));
      });

    // Order matters here! *Prepend* the input nodes to this one, because
    // you have to declare functions in order of use in GLSL
    const sections = mergeShaderSections(
      continuation,
      isDataNode(node) || (node as SourceNode).expressionOnly
        ? emptyShaderSections()
        : findShaderSections(ast as ParserProgram)
    );

    const filler = isDataNode(node)
      ? makeExpression(toGlsl(node))
      : parser.produceFiller(node, ast);

    return [sections, filler, { ...compiledIds, [node.id]: node }];
  } else {
    // TODO: This duplicates the above branch, and also does this mean we
    // recalculate the shader sections and filler for every edge? Can I move
    // these lines above the loop?
    const sections =
      isDataNode(node) || (node as SourceNode).expressionOnly
        ? emptyShaderSections()
        : findShaderSections(ast as ParserProgram);

    const filler = isDataNode(node)
      ? makeExpression(toGlsl(node))
      : parser.produceFiller(node, ast);

    return [sections, filler, { ...compiledIds, [node.id]: node }];
  }
};

// Merge existing node inputs, and inputs based on properties, with new ones
// found from the source code, using the *id* as the uniqueness key
const collapseNodeInputs = (
  node: CodeNode,
  updatedInputs: NodeInput[]
): NodeInput[] => {
  // Convert the properties into inputs. Maybe it would be good to cache these
  // rather than compute them every context generation?
  const propertyInputs = (node.config.properties || []).map((property) =>
    nodeInput(
      property.displayName,
      `property_${property.property}`,
      'property',
      new Set<InputCategory>(['data']),
      !!property.fillerName,
      property.property
    )
  );

  // Merge any duplicate nodes into each other by id. Any filler input gets
  // merged into property inputs with the same id. This preserves the
  // "baked" property on node inputs which is toggle-able in the graph
  return Object.values(
    groupBy([...propertyInputs, ...updatedInputs, ...node.inputs], (i) => i.id)
  ).map((dupes) => dupes.reduce((node, dupe) => ({ ...node, ...dupe })));
};

type NodeErrors = { type: 'errors'; errors: any[] };
const makeError = (...errors: any[]): NodeErrors => ({
  type: 'errors',
  errors,
});
const isError = (test: any): test is NodeErrors => test?.type === 'errors';

const computeNodeContext = (
  engineContext: EngineContext,
  engine: Engine,
  graph: Graph,
  node: SourceNode
): NodeContext | NodeErrors => {
  // THIS DUPLICATES OTHER LINE
  const parser = {
    ...(coreParsers[node.type] || coreParsers[NodeType.SOURCE]),
    ...(engine.parsers[node.type] || {}),
  };

  const { onBeforeCompile, manipulateAst } = parser;
  if (onBeforeCompile) {
    const { groupId } = node as SourceNode;
    const sibling = graph.nodes.find(
      (n) =>
        n !== node && 'groupId' in n && (n as SourceNode).groupId === groupId
    );
    onBeforeCompile(
      graph,
      engineContext,
      node as SourceNode,
      sibling as SourceNode
    );
  }

  const inputEdges = graph.edges.filter((edge) => edge.to === node.id);

  let ast;
  try {
    ast = parser.produceAst(engineContext, engine, graph, node, inputEdges);
    if (manipulateAst) {
      ast = manipulateAst(engineContext, engine, graph, node, ast, inputEdges);
    }
  } catch (error) {
    return makeError(error);
  }

  // Find the combination if inputs (data) and fillers (runtime context data)
  // and copy the input data onto the node, and the fillers onto the context
  const updatedInputs = parser.findInputs(engineContext, node, ast, inputEdges);

  node.inputs = collapseNodeInputs(
    node,
    updatedInputs.map(([i]) => ({
      ...i,
      displayName: mapInputName(node, i),
    }))
  );

  const nodeContext: NodeContext = {
    ast,
    id: node.id,
    inputFillers: updatedInputs.reduce<InputFillers>(
      (acc, [input, filler]) => ({ ...acc, [input.id]: filler }),
      {}
    ),
  };

  // Tricky code warning: We only want to mangle the AST if this is a source
  // code node like "physical" or a user shader, and (probably?) not an
  // expression like "a + b" since those are local names;
  if (
    !node.expressionOnly &&
    node.type !== NodeType.BINARY &&
    node.type !== NodeType.OUTPUT
  ) {
    mangle(ast as ParserProgram, node, engine);
  }

  return nodeContext;
};

export const computeContextForNodes = (
  engineContext: EngineContext,
  engine: Engine,
  graph: Graph,
  nodes: GraphNode[]
) =>
  nodes.filter(isSourceNode).reduce((context, node) => {
    console.log('computing context for', `${node.name} (${node.id})`);

    let result = computeNodeContext(engineContext, engine, graph, node);
    let nodeContext = isError(result)
      ? {
          errors: result,
        }
      : result;

    context[node.id] = {
      ...(context[node.id] || {}),
      ...nodeContext,
    };
    return context;
  }, engineContext.nodes);

export type CompileGraphResult = {
  fragment: ShaderSections;
  vertex: ShaderSections;
  outputFrag: GraphNode;
  outputVert: GraphNode;
  orphanNodes: GraphNode[];
  activeNodeIds: Set<string>;
};

/**
 * Compute the context for every node in the graph, done on initial graph load
 * to compute the inputs/outputs for every node
 */
export const computeAllContexts = (
  engineContext: EngineContext,
  engine: Engine,
  graph: Graph
) => {
  computeContextForNodes(engineContext, engine, graph, graph.nodes);
};

/**
 * Compute the contexts for nodes starting from the outputs, working backwards.
 * Used to only (re)-compute context for any actively used nodes
 */
export const computeGraphContext = (
  engineContext: EngineContext,
  engine: Engine,
  graph: Graph
) => {
  const outputFrag = graph.nodes.find(
    (node) => node.type === 'output' && node.stage === 'fragment'
  );
  if (!outputFrag) {
    throw new Error('No fragment output in graph');
  }
  const outputVert = graph.nodes.find(
    (node) => node.type === 'output' && node.stage === 'vertex'
  );
  if (!outputVert) {
    throw new Error('No vertex output in graph');
  }

  const vertexIds = collectConnectedNodes(graph, outputVert);
  const fragmentIds = collectConnectedNodes(graph, outputFrag);
  const additionalIds = graph.nodes.filter(
    (node) =>
      isSourceNode(node) &&
      node.stage === 'vertex' &&
      node.nextStageNodeId &&
      fragmentIds[node.nextStageNodeId] &&
      !vertexIds[node.id]
  );

  computeContextForNodes(engineContext, engine, graph, [
    outputVert,
    ...Object.values(vertexIds).filter((node) => node.id !== outputVert.id),
    ...additionalIds,
  ]);
  computeContextForNodes(engineContext, engine, graph, [
    outputFrag,
    ...Object.values(fragmentIds).filter((node) => node.id !== outputFrag.id),
  ]);
};

export const compileGraph = (
  engineContext: EngineContext,
  engine: Engine,
  graph: Graph
): CompileGraphResult => {
  computeGraphContext(engineContext, engine, graph);

  const outputFrag = graph.nodes.find(
    (node) => node.type === 'output' && node.stage === 'fragment'
  );
  if (!outputFrag) {
    throw new Error('No fragment output in graph');
  }

  const [fragment, , fragmentIds] = compileNode(
    engine,
    graph,
    graph.edges,
    engineContext,
    outputFrag
  );

  const outputVert = graph.nodes.find(
    (node) => node.type === 'output' && node.stage === 'vertex'
  );
  if (!outputVert) {
    throw new Error('No vertex output in graph');
  }

  const vertexIds = collectConnectedNodes(graph, outputVert);

  // Some fragment shaders reference vertex shaders which may not have been
  // given edges in the graph. Build invisible edges from these vertex nodes to
  // the hidden "mainStmts" input on the output node, which inlines the function
  // calls to those vertex main() statements and includes them in the output
  const orphanNodes = graph.nodes.filter(
    (node) =>
      isSourceNode(node) &&
      node.stage === 'vertex' &&
      node.nextStageNodeId &&
      fragmentIds[node.nextStageNodeId] &&
      !vertexIds[node.id]
  );

  const orphanEdges: Edge[] = orphanNodes.map((node) => ({
    id: makeId(),
    from: node.id,
    to: outputVert.id,
    output: 'main',
    input: `filler_${MAGIC_OUTPUT_STMTS}`,
    stage: 'vertex',
    category: 'code',
  }));

  const [vertex, ,] = compileNode(
    engine,
    graph,
    [...graph.edges, ...orphanEdges],
    engineContext,
    outputVert
  );

  // Imperative hack :( to allow engines to know some unique id of compilation
  engineContext.compileCount++;

  // Every compileNode returns the AST so far, as well as the filler for the
  // next node with inputs. On the final step, we discard the filler
  return {
    fragment,
    vertex,
    outputFrag,
    outputVert,
    orphanNodes,
    activeNodeIds: new Set<string>([
      ...Object.keys(vertexIds),
      ...Object.keys(fragmentIds),
      ...orphanNodes.map((node) => node.id),
    ]),
  };
};
