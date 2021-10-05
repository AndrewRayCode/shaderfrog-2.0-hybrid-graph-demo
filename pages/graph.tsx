import { FunctionComponent } from 'react';
import util from 'util';

import preprocess from '@shaderfrog/glsl-parser/dist/preprocessor';
import { generate, parser } from '@shaderfrog/glsl-parser';
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
  convertMainToReturn,
  renameBindings,
  renameFunctions,
  makeExpression,
  from2To3,
  Edge,
} from './nodestuff';

const inspect = (thing: any): void =>
  console.log(util.inspect(thing, false, null, true));

export interface Engine {
  preserve: Set<string>;
  Component: FunctionComponent<{ engine: Engine; parsers: NodeParsers }>;
  nodes: NodeParsers;
}

export type NodeFiller = (node: Node, ast: AstNode) => AstNode | void;
export const emptyFiller: NodeFiller = () => {};

export type NodeParsers = {
  [key in ShaderType]?: {
    parse: (node: Node) => ProgramAst;
  };
};

export type Parsers = {
  [key in ShaderType]?: {
    produceAst: (node: Node, inputEdges: Edge[]) => AstNode | ParserProgram;
    findInputs: (
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
  output: {
    produceAst: (node: Node, inputEdges: Edge[]): AstNode => {
      const fragmentPreprocessed = preprocess(node.fragmentSource, {
        preserve: {
          version: () => true,
        },
      });
      const fragmentAst = parser.parse(fragmentPreprocessed);
      return fragmentAst;
    },
    findInputs: (node: Node, ast: AstNode) => {
      const assignNode = findVec4(ast);
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
  shader: {
    produceAst: (node: Node, inputEdges: Edge[]): AstNode => {
      const fragmentPreprocessed = preprocess(node.fragmentSource, {
        preserve: {
          version: () => true,
        },
      });
      const fragmentAst = parser.parse(fragmentPreprocessed);
      from2To3(fragmentAst);

      convertMainToReturn(fragmentAst);
      renameBindings(fragmentAst.scopes[0], new Set<string>(), node.id);
      renameFunctions(fragmentAst.scopes[0], node.id, {
        main: nodeName(node),
      });
      return fragmentAst;
    },
    findInputs: (node: Node, ast: AstNode) => {
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
  add: {
    produceAst: (node: Node, inputEdges: Edge[]) => {
      const alphabet = 'abcdefghijklmnopqrstuvwxyz';
      const fragmentAst: AstNode = {
        type: 'program',
        program: [
          makeExpression(
            inputEdges.map((_, index) => alphabet.charAt(index)).join(' + ')
          ),
        ],
        scopes: [],
      };
      inspect(fragmentAst);
      return fragmentAst;
    },
    findInputs: (node: Node, ast: AstNode, nodeContext: NodeContext) => {
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

const findVec4 = (ast: AstNode): AstNode | undefined => {
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

export const emptyShaderSections = (): ShaderSections => ({
  precision: [],
  preprocessor: [],
  version: [],
  program: [],
  inStatements: [],
  existingIns: new Set<string>(),
});

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
  graphContext: GraphContext,
  node: Node
): GraphCompileResult => {
  const ctx = graphContext[node.id];
  const { ast, inputs } = ctx;

  const inputEdges = graph.edges.filter((edge) => edge.to === node.id);
  if (inputEdges.length) {
    let continuation = emptyShaderSections();
    inputEdges.forEach((edge) => {
      const fromNode = graph.nodes.find((node) => edge.from === node.id);
      if (!fromNode) {
        throw new Error(`Node for edge ${edge.from} not found`);
      }
      const [nextSections, fillerAst] = compileNode(
        engine,
        graph,
        graphContext,
        fromNode
      );

      continuation = mergeShaderSections(continuation, nextSections);

      // TODO: The output generated here doesn't have the filled in asts, is that
      // because the algorithm is wrong? or is it because the shadersections
      // don't get updated since we're mutating the ast?
      if (!fillerAst) {
        throw new Error(
          `Expected a filler ast for ${edge.from} but none was returned`
        );
      }
      inputs[edge.input](fillerAst);
      // console.log(generate(ast.program));
    });
    const sections = mergeShaderSections(
      node.expressionOnly ? emptyShaderSections() : findShaderSections(ast),
      continuation
    );
    // console.log(
    //   'the sections so far for',
    //   node.type,
    //   node.id,
    //   node.expressionOnly,
    //   generate(shaderSectionsToAst(sections).program)
    // );
    return [sections, parsers[node.type]?.produceFiller(node, ast)];
  } else {
    const sections = node.expressionOnly
      ? emptyShaderSections()
      : findShaderSections(ast);
    console.log(
      'the sections so far for',
      node.type,
      node.id,
      node.expressionOnly,
      generate(shaderSectionsToAst(sections).program)
    );
    return [sections, parsers[node.type]?.produceFiller(node, ast)];
  }
};

export const compileGraph = (engine: Engine, graph: Graph) => {
  const graphContext: GraphContext = graph.nodes.reduce((context, node) => {
    const nodeContext: any = {};

    const inputEdges = graph.edges.filter((edge) => edge.to === node.id);

    if (!parsers[node.type]) {
      throw new Error(`No parser for ${node.type}`);
    }
    nodeContext.ast = parsers[node.type]?.produceAst(node, inputEdges);
    nodeContext.inputs = parsers[node.type]?.findInputs(
      node,
      nodeContext.ast,
      nodeContext
    );

    return {
      ...context,
      [node.id]: nodeContext,
    };
  }, {});

  const outputNode = graph.nodes.find((node) => node.type === 'output');
  if (!outputNode) {
    throw new Error('No output in graph');
  }

  return compileNode(engine, graph, graphContext, outputNode);
};
