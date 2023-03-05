import { parser, generate } from '@shaderfrog/glsl-parser';
import groupBy from 'lodash.groupby';

import {
  renameBindings,
  renameFunctions,
} from '@shaderfrog/glsl-parser/parser/utils';
import {
  visit,
  AstNode,
  NodeVisitors,
  Path,
  Program,
  FunctionNode,
} from '@shaderfrog/glsl-parser/ast';
import { Engine, EngineContext } from './engine';
import {
  emptyShaderSections,
  findShaderSections,
  mergeShaderSections,
  ShaderSections,
} from '../ast/shader-sections';
import preprocess from '@shaderfrog/glsl-parser/preprocessor';
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

export type NodeFiller = (
  node: SourceNode,
  ast: Program | AstNode
) => AstNode | void;
export const emptyFiller: NodeFiller = () => {};

export const isDataNode = (node: GraphNode): node is DataNode =>
  'value' in node;

export const isSourceNode = (node: GraphNode): node is SourceNode =>
  !isDataNode(node);

export const MAGIC_OUTPUT_STMTS = 'mainStmts';

export type InputFiller = (a: AstNode | Program) => AstNode | Program;
export type InputFillerGroup = {
  filler: InputFiller;
  args?: AstNode[];
};
export type InputFillers = Record<string, InputFillerGroup>;
export type NodeContext = {
  ast: AstNode | Program;
  source?: string;
  id: string;
  inputFillers: InputFillers;
  errors?: NodeErrors;
};

type FillerArguments = AstNode[];
export type ComputedInput = [NodeInput, InputFiller, FillerArguments?];

export type FindInputs = (
  engineContext: EngineContext,
  node: SourceNode,
  ast: Program | AstNode,
  inputEdges: Edge[]
) => ComputedInput[];

export type OnBeforeCompile = (
  graph: Graph,
  engineContext: EngineContext,
  node: SourceNode,
  sibling?: SourceNode
) => Promise<void>;

export type ProduceAst = (
  engineContext: EngineContext,
  engine: Engine,
  graph: Graph,
  node: SourceNode,
  inputEdges: Edge[]
) => AstNode | Program;

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
  ast: AstNode | Program,
  inputEdges: Edge[]
) => AstNode | Program;

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

export const mangleEntireProgram = (
  ast: Program,
  node: SourceNode,
  engine: Engine
) => {
  renameBindings(ast.scopes[0], (name, n) =>
    // @ts-ignore
    n.doNotDescope ? name : mangleVar(name, engine, node)
  );
  mangleMainFn(ast, node);
};

export const mangleMainFn = (ast: Program, node: SourceNode) => {
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
        const preprocessed =
          node.config.preprocess === false
            ? node.source
            : preprocess(node.source, {
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
        ? (ast as Program).program[0]
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
            'rgba',
            new Set<InputCategory>(['code']),
            false
          ),
          (fillerAst) => {
            const fn = (ast as Program).program.find(
              (stmt): stmt is FunctionNode => stmt.type === 'function'
            );
            fn?.body.statements.unshift(makeFnStatement(generate(fillerAst)));
            return ast;
          },
        ] as ComputedInput,
      ];
    },
    produceFiller: (node, ast) => {
      return makeExpression('impossible_call()');
    },
  },
  [NodeType.BINARY]: {
    produceAst: (engineContext, engine, graph, iNode, inputEdges) => {
      const node = iNode as BinaryNode;
      const fragmentAst: Program = {
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
              undefined,
              new Set<InputCategory>(['data', 'code']),
              false
            ),
            (fillerAst) => {
              let foundPath: Path<any> | undefined;
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
                // @ts-ignore
                foundPath.parent[foundPath.key] = fillerAst;
                return ast;
              } else {
                return fillerAst;
              }
            },
          ] as ComputedInput;
        });
    },
    produceFiller: (node, ast) => {
      return (ast as Program).program[0];
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

export const evaluateNode = (
  engine: Engine,
  graph: Graph,
  node: GraphNode
): any => {
  // TODO: Data nodes themselves should have evaluators
  if ('value' in node) {
    return engine.evaluateNode(node);
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
    evaluateNode.bind(null, engine, graph)
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
 * Create the inputs on a node from the properties. This used to be done at
 * context time. Doing it at node creation time lets us auto-bake edges into
 * the node at initial graph creation time.
 */
export const prepopulatePropertyInputs = (node: CodeNode): CodeNode => ({
  ...node,
  inputs: [
    ...node.inputs,
    ...(node.config.properties || []).map((property) =>
      nodeInput(
        property.displayName,
        `property_${property.property}`,
        'property',
        property.type,
        new Set<InputCategory>(['data']),
        !!property.fillerName, // bakeable
        property.property
      )
    ),
  ],
});

/**
 * Recursively filter the graph, starting from a specific node, looking for
 * nodes and edges that match predicates. This function returns the inputs for
 * matched edges, not the edges themselves, as a convenience for the only
 * consumer of this function, which is finding input names to use as uniforms.
 *
 * Inputs can only be filtered if the graph context has been computed, since
 * inputs aren't created until then.
 */
export const filterGraphFromNode = (
  graph: Graph,
  node: GraphNode,
  predicates: Predicates,
  depth = Infinity
): SearchResult => {
  const { inputs } = node;
  const inputEdges = graph.edges.filter((edge) => edge.to === node.id);

  const nodeAcc = {
    ...(predicates.node && predicates.node(node, inputEdges)
      ? { [node.id]: node }
      : {}),
  };

  return inputEdges.reduce<SearchResult>(
    (acc, inputEdge) => {
      const input = inputs.find((i) => i.id === inputEdge.input);
      const fromNode = inputEdge
        ? ensure(graph.nodes.find(({ id }) => id === inputEdge.from))
        : undefined;

      const inputAcc = {
        ...acc.inputs,
        ...(input &&
        predicates.input &&
        predicates.input(input, node, inputEdge, fromNode)
          ? { [node.id]: [...(acc.inputs[node.id] || []), input] }
          : {}),
      };

      if (inputEdge && fromNode && depth > 1) {
        const result = filterGraphFromNode(
          graph,
          fromNode,
          predicates,
          depth - 1
        );
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

export const filterGraphNodes = (
  graph: Graph,
  nodes: GraphNode[],
  filter: Predicates,
  depth = Infinity
) =>
  nodes.reduce<SearchResult>(
    (acc, node) => {
      const result = filterGraphFromNode(graph, node, filter, depth);
      return {
        nodes: { ...acc.nodes, ...result.nodes },
        inputs: { ...acc.inputs, ...result.inputs },
      };
    },
    {
      nodes: {},
      inputs: {},
    }
  );

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

        let filler: InputFillerGroup;
        let fillerName: string | undefined;
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

          /**
           *      +------+    +------+
           * a -- o add  o -- o tex  |
           * b -- o      |    +------+
           *      +------+
           *
           * This could produce:
           *     main_a(v1) + main_b(v2)
           * I guess it has to? or it could produce
           *     function add(v1) { return main_a(v1) + main_b(v2); }
           * It can't replace the arg _expression_ in the from shaders, because
           * the expression isn't available there.
           */
          // TODO: This is a hard coded hack for vUv backfilling. It works in
          // the simple case. Doesn't work for hell (based on world position).
          if (filler.args && fillerAst.type === 'function_call') {
            // Object.values(filterGraphFromNode(graph, node, {
            //   node: (n) => n.type === 'source'
            // }).nodes).forEach(sourceNode => {
            if (fromNode.type === 'source') {
              // @ts-ignore
              fillerAst.args = filler.args;
              // const fc = engineContext.nodes[sourceNode.id];
              const fc = engineContext.nodes[fromNode.id];
              // @ts-ignore
              fc.ast.scopes[0].functions.main.references[0].prototype.parameters =
                ['vec2 vv'];
              // @ts-ignore
              const scope = fc.ast.scopes[0];
              renameBindings(scope, (name, node) => {
                console.log('renaming binding', name);
                return node.type !== 'declaration' && name === 'vUv'
                  ? 'vv'
                  : name;
              });
            }
            // })
          }

          // Fill in the input! The return value is the new AST of the filled in
          // fromNode.
          nodeContext.ast = filler.filler(fillerAst);
        }
        // console.log(generate(ast.program));
      });

    // Order matters here! *Prepend* the input nodes to this one, because
    // you have to declare functions in order of use in GLSL
    const sections = mergeShaderSections(
      continuation,
      isDataNode(node) || (node as SourceNode).expressionOnly
        ? emptyShaderSections()
        : findShaderSections(ast as Program)
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
        : findShaderSections(ast as Program);

    const filler = isDataNode(node)
      ? makeExpression(toGlsl(node))
      : parser.produceFiller(node, ast);

    return [sections, filler, { ...compiledIds, [node.id]: node }];
  }
};

// Merge existing node inputs, and inputs based on properties, with new ones
// found from the source code, using the *id* as the uniqueness key. Any filler input gets
// merged into property inputs with the same id. This preserves the
// "baked" property on node inputs which is toggle-able in the graph
const collapseNodeInputs = (
  node: CodeNode,
  updatedInputs: NodeInput[]
): NodeInput[] =>
  Object.values(groupBy([...updatedInputs, ...node.inputs], (i) => i.id)).map(
    (dupes) => dupes.reduce((node, dupe) => ({ ...node, ...dupe }))
  );

type NodeErrors = { type: 'errors'; errors: any[] };
const makeError = (...errors: any[]): NodeErrors => ({
  type: 'errors',
  errors,
});
const isError = (test: any): test is NodeErrors => test?.type === 'errors';

const computeNodeContext = async (
  engineContext: EngineContext,
  engine: Engine,
  graph: Graph,
  node: SourceNode
): Promise<NodeContext | NodeErrors> => {
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
    await onBeforeCompile(
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
    console.error('Error parsing source code!', error);
    return makeError(error);
  }

  // Find all the inputs of this node where a "source" code node flows into it,
  // to auto-bake it. This handles the case where a graph is instantiated with
  // a shader plugged into a texture property. The property on the intial node
  // doesn't know if it's baked or not
  const dataInputs = groupBy(
    filterGraphFromNode(
      graph,
      node,
      {
        input: (input, b, c, fromNode) =>
          input.bakeable && fromNode?.type === 'source',
      },
      1
    ).inputs[node.id] || [],
    'id'
  );

  // Find the combination if inputs (data) and fillers (runtime context data)
  // and copy the input data onto the node, and the fillers onto the context
  const computedInputs = parser.findInputs(
    engineContext,
    node,
    ast,
    inputEdges
  );

  node.inputs = collapseNodeInputs(
    node,
    computedInputs.map(([i]) => ({
      ...i,
      displayName: mapInputName(node, i),
    }))
  ).map((input) => ({
    // Auto-bake
    ...input,
    ...(input.id in dataInputs ? { baked: true } : {}),
  }));

  const nodeContext: NodeContext = {
    ast,
    id: node.id,
    inputFillers: computedInputs.reduce<InputFillers>(
      (acc, [input, filler, args]) => ({
        ...acc,
        [input.id]: {
          filler,
          args,
        },
      }),
      {}
    ),
  };

  // Skip mangling if the node tells us to, which probably means it's an engine
  // ndoe where we don't care about renaming all the variables, or if it's
  // an expression, where we want to be in the context of other variables
  if (node.config.mangle !== false && !node.expressionOnly) {
    mangleEntireProgram(ast as Program, node, engine);
  }

  return nodeContext;
};

export const computeContextForNodes = async (
  engineContext: EngineContext,
  engine: Engine,
  graph: Graph,
  nodes: GraphNode[]
) =>
  nodes.filter(isSourceNode).reduce(async (ctx, node) => {
    const context = await ctx;

    let result = await computeNodeContext(engineContext, engine, graph, node);
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
  }, Promise.resolve(engineContext.nodes));

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
) => computeContextForNodes(engineContext, engine, graph, graph.nodes);

/**
 * Compute the contexts for nodes starting from the outputs, working backwards.
 * Used to only (re)-compute context for any actively used nodes
 */
export const computeGraphContext = async (
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

  await computeContextForNodes(engineContext, engine, graph, [
    outputVert,
    ...Object.values(vertexIds).filter((node) => node.id !== outputVert.id),
    ...additionalIds,
  ]);
  await computeContextForNodes(engineContext, engine, graph, [
    outputFrag,
    ...Object.values(fragmentIds).filter((node) => node.id !== outputFrag.id),
  ]);
};

export const compileGraph = (
  engineContext: EngineContext,
  engine: Engine,
  graph: Graph
): CompileGraphResult => {
  // computeGraphContext(engineContext, engine, graph);

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
