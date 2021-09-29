import preprocess from '@shaderfrog/glsl-parser/preprocessor';
import { generate, parser } from '@shaderfrog/glsl-parser';
import { visit } from '@shaderfrog/glsl-parser/core/ast.js';
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
  Ast,
  findShaderSections,
  mergeShaderSections,
  shaderSectionsToAst,
  convertMainToReturn,
  renameBindings,
  renameFunctions,
  makeExpression,
  from2To3,
} from './pages/nodestuff';

const graph: Graph = {
  nodes: [
    outputNode('1', {}),
    {
      id: '2',
      type: ShaderType.shader,
      options: {},
      inputs: [],
      vertexSource: ``,
      fragmentSource: `
uniform sampler2D image;
varying vec2 vUv;
void main() {
    vec4 color = texture2D(image, vUv);
    gl_FragColor = vec4(1.0);
}
`,
    },
  ],
  edges: [{ from: '2', to: '1', output: 'main', input: 'color' }],
};

type GraphReduceResult = [ShaderSections, ProgramAst];

const parsers = {
  output: {
    produceAst: (node: Node): Ast => {
      const fragmentPreprocessed = preprocess(node.fragmentSource, {
        preserve: {
          version: () => true,
        },
      });
      const fragmentAst = parser.parse(fragmentPreprocessed);
      return fragmentAst;
    },
    findInputs: (node: Node, ast: Ast) => {
      const assignNode = findVec4(ast);
      return {
        color: (fillerAst) => {
          assignNode.right = fillerAst;
        },
      };
    },
    produceFiller: (node: Node, ast: Ast) => {},
  },
  shader: {
    produceAst: (node: Node): Ast => {
      const fragmentPreprocessed = preprocess(node.fragmentSource, {
        preserve: {
          version: () => true,
        },
      });
      const fragmentAst = parser.parse(fragmentPreprocessed);
      from2To3(fragmentAst);
      convertMainToReturn(fragmentAst);
      return fragmentAst;
    },
    findInputs: (node: Node, ast: Ast) => {
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
    produceFiller: (node: Node, ast: Ast) => {
      return makeExpression(`main_${node.id}()`);
    },
  },
};

const findVec4 = (ast: Ast) => {
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

test('it does the thing', () => {
  const graphContext = graph.nodes.reduce((context, node) => {
    const ast = parsers[node.type].produceAst(node);
    const inputs = parsers[node.type].findInputs(node, ast);

    return {
      ...context,
      [node.id]: {
        ast,
        inputs,
      },
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
    (accumulator, node, edge, graph): GraphReduceResult => {
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

      const newSections = findShaderSections(ast);

      return [
        mergeShaderSections(sections, newSections),
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
  expect(built).toEqual('0,1,2');
});
