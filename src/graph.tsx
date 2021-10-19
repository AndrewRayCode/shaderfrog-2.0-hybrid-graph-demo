import util from 'util';

import preprocess from '@shaderfrog/glsl-parser/dist/preprocessor';
import { parser } from '@shaderfrog/glsl-parser';
import {
  renameBindings,
  renameFunctions,
} from '@shaderfrog/glsl-parser/dist/parser/utils';
import { ParserProgram } from '@shaderfrog/glsl-parser/dist/parser/parser';
import { visit, AstNode, NodeVisitors } from '@shaderfrog/glsl-parser/dist/ast';

import {
  ProgramAst,
  ShaderType,
  Graph,
  Node,
  ShaderSections,
  findShaderSections,
  mergeShaderSections,
  shaderSectionsToAst,
  convert300MainToReturn,
  makeExpression,
  from2To3,
  Edge,
  emptyShaderSections,
} from './nodestuff';

const inspect = (thing: any): void =>
  console.log(util.inspect(thing, false, null, true));

export interface Engine {
  preserve: Set<string>;
  // Component: FunctionComponent<{ engine: Engine; parsers: NodeParsers }>;
  // nodes: NodeParsers;
  parsers: Parsers;
}

export type NodeFiller = (node: Node, ast: AstNode) => AstNode | void;
export const emptyFiller: NodeFiller = () => {};

export type NodeParsers = {
  [key in ShaderType]?: {
    parse: <T>(engineContext: T, node: Node) => ProgramAst;
  };
};

export type Parsers = {
  [key in ShaderType]?: {
    produceAst: <T>(
      engineContext: T,
      engine: Engine,
      node: Node,
      inputEdges: Edge[]
    ) => AstNode | ParserProgram;
    findInputs: <T>(
      engineContext: T,
      node: Node,
      ast: AstNode,
      nodeContext: NodeContext
    ) => NodeInputs;
    produceFiller: NodeFiller;
  };
};

export const nodeName = (node: Node): string =>
  'main_' + node.name.replace(/[^a-zA-Z0-9]/g, ' ').replace(/ +/g, '_');

export const parsers: Parsers = {
  [ShaderType.output]: {
    produceAst: (
      engineContext,
      engine,
      node: Node,
      inputEdges: Edge[]
    ): AstNode => {
      const fragmentPreprocessed = preprocess(node.fragmentSource, {
        preserve: {
          version: () => true,
        },
      });
      const fragmentAst = parser.parse(fragmentPreprocessed);
      return fragmentAst;
    },
    findInputs: (engineContext, node: Node, ast: AstNode) => {
      const assignNode = findVec4Constructo4(ast);
      if (!assignNode) {
        throw new Error(`Impossible error, no assign node in output`);
      }
      return {
        color: (fillerAst: AstNode) => {
          assignNode.right = fillerAst;
        },
      };
    },
    produceFiller: emptyFiller,
  },
  [ShaderType.shader]: {
    produceAst: (
      engineContext,
      engine,
      node: Node,
      inputEdges: Edge[]
    ): AstNode => {
      const fragmentPreprocessed = preprocess(node.fragmentSource, {
        preserve: {
          version: () => true,
        },
      });
      const fragmentAst = parser.parse(fragmentPreprocessed);
      from2To3(fragmentAst);

      convert300MainToReturn(fragmentAst);
      renameBindings(fragmentAst.scopes[0], engine.preserve, node.id);
      renameFunctions(fragmentAst.scopes[0], node.id, {
        main: nodeName(node),
      });
      return fragmentAst;
    },
    findInputs: (engineContext, node: Node, ast: AstNode) => {
      // console.log(util.inspect(ast.program, false, null, true));

      let texture2Dcalls: [AstNode, string][] = [];
      const visitors: NodeVisitors = {
        function_call: {
          enter: (path) => {
            if (
              path.node.identifier?.specifier?.identifier === 'texture2D' &&
              path.key
            ) {
              texture2Dcalls.push([path.node, path.key]);
            }
          },
        },
      };
      visit(ast, visitors);
      return texture2Dcalls.reduce(
        (inputs, [parent, key], index) => ({
          ...inputs,
          [`texture2d_${index}`]: (fillerAst: AstNode) => {
            parent[key] = fillerAst;
          },
        }),
        {}
      );
    },
    produceFiller: (node: Node, ast: AstNode): AstNode => {
      return makeExpression(`${nodeName(node)}()`);
    },
  },
  [ShaderType.add]: {
    produceAst: (engineContext, engine, node, inputEdges) => {
      const alphabet = 'abcdefghijklmnopqrstuvwxyz';
      const fragmentAst: AstNode = {
        type: 'program',
        program: [
          makeExpression(
            inputEdges.length
              ? inputEdges.map((_, index) => alphabet.charAt(index)).join(' + ')
              : 'a + b'
          ),
        ],
        scopes: [],
      };
      return fragmentAst;
    },
    findInputs: (engineContext, node, ast, nodeContext) => {
      let inputs: any[][] = [];
      const visitors: NodeVisitors = {
        identifier: {
          enter: (path) => {
            inputs.push([path.parent, path.key, path.node.identifier]);
          },
        },
      };
      visit(ast, visitors);
      return inputs.reduce(
        (inputs, [parent, key, identifier], index) => ({
          ...inputs,
          [identifier]: (fillerAst: AstNode) => {
            if (parent) {
              parent[key] = fillerAst;
            } else {
              nodeContext.ast = fillerAst;
            }
          },
        }),
        {}
      );
    },
    produceFiller: (node: Node, ast: AstNode): AstNode => {
      return ast.program;
    },
  },
  [ShaderType.multiply]: {
    produceAst: (engineContext, engine, node, inputEdges) => {
      const alphabet = 'abcdefghijklmnopqrstuvwxyz';
      const fragmentAst: AstNode = {
        type: 'program',
        program: [
          makeExpression(
            inputEdges.length
              ? inputEdges.map((_, index) => alphabet.charAt(index)).join(' * ')
              : 'a * b'
          ),
        ],
        scopes: [],
      };
      return fragmentAst;
    },
    findInputs: (engineContext, node, ast, nodeContext) => {
      let inputs: any[][] = [];
      const visitors: NodeVisitors = {
        identifier: {
          enter: (path) => {
            inputs.push([path.parent, path.key, path.node.identifier]);
          },
        },
      };
      visit(ast, visitors);
      return inputs.reduce(
        (inputs, [parent, key, identifier], index) => ({
          ...inputs,
          [identifier]: (fillerAst: AstNode) => {
            if (parent) {
              parent[key] = fillerAst;
            } else {
              nodeContext.ast = fillerAst;
            }
          },
        }),
        {}
      );
    },
    produceFiller: (node: Node, ast: AstNode): AstNode => {
      return ast.program;
    },
  },
};

const findVec4Constructo4 = (ast: AstNode): AstNode | undefined => {
  let parent: AstNode | undefined;
  const visitors: NodeVisitors = {
    function_call: {
      enter: (path) => {
        if (path.node.identifier?.specifier?.token === 'vec4') {
          parent = path.findParent((p) => 'right' in p.node)?.node;
          path.skip();
        }
      },
    },
  };
  visit(ast, visitors);
  return parent;
};

export type NodeInputs = {
  [inputName: string]: (a: AstNode) => void;
};

export type NodeContext = {
  ast: AstNode;
  inputs: NodeInputs;
};

export type GraphContext = {
  [nodeId: string]: NodeContext;
};

export type GraphCompileResult = [ShaderSections, AstNode | void];

export const compileNode = (
  engine: Engine,
  graph: Graph,
  engineContext: any,
  // graphContext: GraphContext,
  node: Node
): GraphCompileResult => {
  const parser = engine.parsers[node.type] || parsers[node.type];

  // Will I one day get good enough at typescript to be able to remove this
  // check? Or will I learn that I need it?
  if (!parser) {
    throw new Error(`No parser found for ${node.type}`);
  }

  const nodeContext = engineContext.nodes[node.id];
  // const nodeContext = computeNodeContext(engineContext, engine, graph, node); // graphContext[node.id];
  // engineContext.nodes[node.id] = {
  //   ...(engineContext.nodes[node.id] || {}),
  //   ...nodeContext,
  // };
  const { ast, inputs } = nodeContext;

  const inputEdges = graph.edges.filter((edge) => edge.to === node.id);
  if (inputEdges.length) {
    let continuation = emptyShaderSections();
    inputEdges.forEach((edge) => {
      const fromNode = graph.nodes.find((node) => edge.from === node.id);
      if (!fromNode) {
        throw new Error(`Node for edge ${edge.from} not found`);
      }

      const [inputSections, fillerAst] = compileNode(
        engine,
        graph,
        engineContext,
        // graphContext,
        fromNode
      );
      if (!fillerAst) {
        throw new Error(
          `Expected a filler ast from node ID ${fromNode.id} (${fromNode.type}) but none was returned`
        );
      }

      continuation = mergeShaderSections(continuation, inputSections);

      inputs[edge.input](fillerAst);
      // console.log(generate(ast.program));
    });

    // Order matters here! *Prepend* the input nodes to this one, because
    // you have to declare functions in order of use in GLSL
    const sections = mergeShaderSections(
      continuation,
      node.expressionOnly ? emptyShaderSections() : findShaderSections(ast)
    );
    // console.log(
    //   'the sections so far for',
    //   node.type,
    //   node.id,
    //   node.expressionOnly,
    //   generate(shaderSectionsToAst(sections).program)
    // );
    return [sections, parser.produceFiller(node, ast)];
  } else {
    const sections = node.expressionOnly
      ? emptyShaderSections()
      : findShaderSections(ast);
    // console.log(
    //   'the sections so far for',
    //   node.type,
    //   node.id,
    //   node.expressionOnly,
    //   generate(shaderSectionsToAst(sections).program)
    // );
    return [sections, parser.produceFiller(node, ast)];
  }
};

export const computeGraphContext = (
  engineContext: any,
  engine: Engine,
  graph: Graph
) =>
  graph.nodes.reduce((context, node) => {
    const nodeContext: any = {};

    const inputEdges = graph.edges.filter((edge) => edge.to === node.id);
    const parser = engine.parsers[node.type] || parsers[node.type];

    if (!parser) {
      throw new Error(`No parser for ${node.type}`);
    }

    nodeContext.ast = parser.produceAst(
      engineContext,
      engine,
      node,
      inputEdges
    );
    nodeContext.inputs = parser.findInputs(
      engineContext,
      node,
      nodeContext.ast,
      nodeContext
    );
    context[node.id] = {
      ...(context[node.id] || {}),
      ...nodeContext,
    };
    return context;
  }, engineContext.nodes);

export const compileGraph = (
  engineContext: any,
  engine: Engine,
  graph: Graph
): ShaderSections => {
  computeGraphContext(engineContext, engine, graph);

  const outputNode = graph.nodes.find((node) => node.type === 'output');
  if (!outputNode) {
    throw new Error('No output in graph');
  }

  // Every compileNode returns the AST so far, as well as the filler for the
  // next node with inputs. On the final step, we discard the filler, as it
  // *should* be the
  return compileNode(engine, graph, engineContext, outputNode)[0];
};
