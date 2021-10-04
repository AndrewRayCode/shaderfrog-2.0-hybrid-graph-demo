import preprocess from '@shaderfrog/glsl-parser/dist/preprocessor';
import { generate, parser } from '@shaderfrog/glsl-parser';
import { visit, AstNode } from '@shaderfrog/glsl-parser/dist/ast';
import util from 'util';

import {
  Engine,
  ShaderType,
  ProgramAst,
  NodeParsers,
  outputNode,
  Graph,
  Node,
  reduceGraph,
  ShaderSections,
  findShaderSections,
  mergeShaderSections,
  shaderSectionsToAst,
  convertMainToReturn,
  renameBindings,
  renameFunctions,
  makeExpression,
  from2To3,
  addNode,
  Edge,
} from './pages/nodestuff';

const inspect = (thing: any): void =>
  console.log(util.inspect(thing, false, null, true));

const graph: Graph = {
  nodes: [
    outputNode('output_id', {}),
    {
      id: 'shader_2_id',
      type: ShaderType.shader,
      options: {},
      inputs: [],
      vertexSource: ``,
      fragmentSource: `
uniform sampler2D image;
varying vec2 vUv;
void main() {
    vec4 color = texture2D(image, vUv);
    gl_FragColor = vec4(2.0);
}
`,
    },
    {
      id: 'shader_4_id',
      type: ShaderType.shader,
      options: {},
      inputs: [],
      vertexSource: ``,
      fragmentSource: `
void main() {
    gl_FragColor = vec4(4.0);
}
`,
    },
    {
      id: 'shader_5_id',
      type: ShaderType.shader,
      options: {},
      inputs: [],
      vertexSource: ``,
      fragmentSource: `
void main() {
    gl_FragColor = vec4(5.0);
}
`,
    },
    addNode('add_3_id', {}),
    addNode('add_4_id', {}),
  ],
  edges: [
    { from: 'shader_2_id', to: 'add_3_id', output: 'main', input: 'a' },
    { from: 'shader_4_id', to: 'add_3_id', output: 'main', input: 'b' },
    { from: 'add_3_id', to: 'output_id', output: 'expression', input: 'color' },
    { from: 'add_4_id', to: 'add_3_id', output: 'expression', input: 'c' },
    { from: 'shader_5_id', to: 'add_4_id', output: 'main', input: 'a' },
  ],
};

type GraphReduceResult = [ShaderSections, ProgramAst];

type Parsers = {
  [key in ShaderType]?: {
    produceAst: (node: Node, inputEdges: Edge[]) => AstNode;
    findInputs: (node: Node, ast: AstNode, nodeContext: object) => object;
    produceFiller: (node: Node, ast: AstNode) => AstNode;
  };
};

const parsers: Parsers = {
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
      return {
        color: (fillerAst) => {
          assignNode.right = fillerAst;
        },
      };
    },
    produceFiller: (node: Node, ast: AstNode): AstNode => {},
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

      // TODO: Indicies are wrong, also how do I do this lol
      convertMainToReturn(fragmentAst);
      renameBindings(fragmentAst.scopes[0], new Set<string>(), 0);
      renameFunctions(fragmentAst.scopes[0], 0);
      return fragmentAst;
    },
    findInputs: (node: Node, ast: AstNode) => {
      // console.log(util.inspect(ast.program, false, null, true));

      let texture2Dcalls: any[][] = [];
      const visitors = {
        function_call: {
          enter: (path) => {
            if (path.node.identifier?.specifier?.identifier === 'texture2D') {
              texture2Dcalls.push([path.node, path.key]);
            }
          },
        },
      };
      visit(ast, visitors);
      return texture2Dcalls.reduce(
        (inputs, [parent, key], index) => ({
          ...inputs,
          [`texture2d_${index}`]: (fillerAst) => {
            parent[key] = fillerAst;
          },
        }),
        {}
      );
    },
    produceFiller: (node: Node, ast: AstNode): AstNode => {
      return makeExpression(`main_${node.id}()`);
    },
  },
  add: {
    produceAst: (node: Node, inputEdges: Edge[]) => {
      // TODO: The tests fail. this is the wrong abstraction for dynamic asts
      // based on the number of inputs!
      const alphabet = 'abcdefghijklmnopqrstuvwxyz';
      const fragmentAst: AstNode = {
        program: [
          {
            type: 'program',
            program: makeExpression(
              inputEdges.map((_, index) => alphabet.charAt(index)).join(' + ')
            ),
          },
        ],
        scopes: [],
      };
      inspect(fragmentAst);
      return fragmentAst;
    },
    findInputs: (node: Node, ast: AstNode, nodeContext: object) => {
      let inputs: any[][] = [];
      const visitors = {
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
          [identifier]: (fillerAst) => {
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

const findVec4 = (ast: AstNode) => {
  let parent;
  const visitors = {
    function_call: {
      enter: (path) => {
        if (path.node.identifier?.specifier?.token === 'vec4') {
          parent = path.findParent((p) => 'right' in p.node).node;
          path.skip();
        }
      },
    },
  };
  visit(ast, visitors);
  return parent;
};

const makeEmpty = (): ShaderSections => ({
  preprocessor: [],
  version: [],
  program: [],
  inStatements: [],
  existingIns: new Set<string>(),
});

const harf = (graphContext, node) => {
  const ctx = graphContext[node.id];
  const { ast, inputs } = ctx;

  const inputEdges = graph.edges.filter((edge) => edge.to === node.id);
  if (inputEdges.length) {
    let continuation = makeEmpty();
    inputEdges.forEach((edge) => {
      const fromNode = graph.nodes.find((node) => edge.from === node.id);
      const [nextSections, fillerAst] = harf(graphContext, fromNode);

      continuation = mergeShaderSections(continuation, nextSections);

      // TODO: The output generated here doesn't have the filled in asts, is that
      // because the algorithm is wrong? or is it because the shadersections
      // don't get updated since we're mutating the ast?
      inputs[edge.input](fillerAst);
      // console.log(generate(ast.program));
    });
    const sections = mergeShaderSections(
      node.expressionOnly ? makeEmpty() : findShaderSections(ast),
      continuation
    );
    console.log(
      'the sections so far for',
      node.type,
      node.id,
      node.expressionOnly,
      generate(shaderSectionsToAst(sections).program)
    );
    return [sections, parsers[node.type].produceFiller(node, ast)];
  } else {
    const sections = node.expressionOnly
      ? makeEmpty()
      : findShaderSections(ast);
    console.log(
      'the sections so far for',
      node.type,
      node.id,
      node.expressionOnly,
      generate(shaderSectionsToAst(sections).program)
    );
    return [sections, parsers[node.type].produceFiller(node, ast)];
  }
};

test('horrible jesus help me', () => {
  const graphContext = graph.nodes.reduce((context, node) => {
    const nodeContext = {};

    const inputEdges = graph.edges.filter((edge) => edge.to === node.id);

    nodeContext.ast = parsers[node.type].produceAst(node, inputEdges);
    nodeContext.inputs = parsers[node.type].findInputs(
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
  const garph = harf(graphContext, outputNode);

  const built = generate(shaderSectionsToAst(garph[0]).program);

  expect(built).toBe('hi');
});

/*
test('horrible jesus help me', () => {
  const a = reduceGraph(
    graph,
    {},
    // TODO: You're here hard coding the filler node for the output node, to
    // replace the color input for it. The hard coding needs to be made specific
    // to each node so that this reduce fn can be generic to start creating the
    // combined ASTs
    (accumulator, node, edge, fromNode, graph): GraphReduceResult => {
      console.log('visiting', node.id, 'with input', edge?.input);
      if (!edge) {
        return { [node.id]: 'terminal' };
      } else {
        let current;
        // Accumulator is the child parse
        if (!(node.id in accumulator)) {
          console.log('first time seeing', node.id);
          current = {
            [node.id]: accumulator,
          };
          // Accumulator is the current node's parse
        } else {
          console.log(node.id, 'already exists');
          current = accumulator;
        }
        return {
          ...current,
          [fromNode.id]: accumulator,
        };
      }
      // return {
      //   [node.id]: accumulator,
      // };
      // accumulator[node.id] = accumulator;
      // if (fromNode) {
      //   accumulator[node.id][fromNode.id] =
      //     accumulator[node.id][fromNode.id] || {};
      // }
      // return accumulator;
    }
  );

  // TODO: You were here, and see the todo for the reducer fn above, testing out
  // the result of combining everything. You made the mergeShaderSections fn
  // which is not smart at all and needs updating. I think the above reducer is
  // the start of composing the graph. You hard coded the input color node and
  // there's still the question of how inputs are parsed and where they're
  // stored, along with the input finder strategies
  expect(JSON.stringify(a, null, 2)).toEqual('xxx');
});
*/

test('it does the thing', () => {
  const graphContext = graph.nodes.reduce((context, node) => {
    const nodeContext = {};

    const inputEdges = graph.edges.filter((edge) => edge.to === node.id);

    nodeContext.ast = parsers[node.type].produceAst(node, inputEdges);
    nodeContext.inputs = parsers[node.type].findInputs(
      node,
      nodeContext.ast,
      nodeContext
    );

    return {
      ...context,
      [node.id]: nodeContext,
    };
  }, {});
  console.log('graphContext', graphContext);

  let intermediary: ShaderSections = {
    preprocessor: [],
    version: [],
    program: [],
    inStatements: [],
    existingIns: new Set<string>(),
  };

  const [resultSections] = reduceGraph(
    graph,
    [intermediary, null],
    // TODO: You're here hard coding the filler node for the output node, to
    // replace the color input for it. The hard coding needs to be made specific
    // to each node so that this reduce fn can be generic to start creating the
    // combined ASTs
    (accumulator, node, edge, fromNode, graph): GraphReduceResult => {
      const ctx = graphContext[node.id];
      if (!ctx) {
        throw new Error('hi' + node.id);
        // return [
        //   sections,
        //   { vertex: '', fragment: { scopes: [], program: [] } },
        // ];
      }
      const { ast, inputs } = ctx;

      // const ast = parser.parse(
      //   `void main() {
      //   main_1();
      // }`,
      //   { quiet: true }
      // );
      // const fillerAst = ast.program[0].body.statements[0].expression;

      // inputs.color(fillerAst);
      // console.log(generate(fragmentAst));

      console.log('accumulator', accumulator);
      const [sections, fillerAst] = accumulator;
      const newFiller = parsers[node.type].produceFiller(node);

      // TODO: You're here trying to fill in the vec4(1.0) call of the output
      // node, and you're realizing you don't have all the info, in reduceNode()
      // the "node" var isn't used for the reduction
      if (edge !== null) {
        console.log(graphContext[node.id], edge);
        graphContext[node.id].inputs[edge.input](fillerAst);
      }

      let nextSections = sections;
      if (!parsers[node.type].expressionOnly) {
        // TODO: Will findSections get executed EVERY time for the ast?
        const currentSections = findShaderSections(ast);
        nextSections = mergeShaderSections(currentSections, nextSections);
      }
      return [
        nextSections,
        newFiller,
        // { vertex: '', fragment: { scopes: [], program: [] } },
      ];
    }
  );

  // TODO: You were here, and see the todo for the reducer fn above, testing out
  // the result of combining everything. You made the mergeShaderSections fn
  // which is not smart at all and needs updating. I think the above reducer is
  // the start of composing the graph. You hard coded the input color node and
  // there's still the question of how inputs are parsed and where they're
  // stored, along with the input finder strategies
  const built = generate(shaderSectionsToAst(resultSections).program);
  expect(built).toEqual('xxx');
});
