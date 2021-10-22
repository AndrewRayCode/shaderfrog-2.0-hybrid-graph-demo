import { generate } from '@shaderfrog/glsl-parser';
import util from 'util';

import { compileGraph } from './src/graph';

import {
  ShaderType,
  outputNode,
  Graph,
  shaderSectionsToAst,
  addNode,
} from './src/nodestuff';

const graph: Graph = {
  nodes: [
    outputNode('output_id', {}),
    {
      name: 'shader 2',
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
      name: 'shader 4',
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
      name: 'shader 5',
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

test('horrible jesus help me', () => {
  const result = compileGraph(
    {},
    { preserve: new Set<string>(), parsers: {} },
    graph
  );
  const built = generate(shaderSectionsToAst(result[0]).program);
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
    (accumulator, node, edge, fromNode, graph): GraphCompileResult => {
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

/*
test('previous attempt to use reduceGraph', () => {
  const graphContext: GraphContext = graph.nodes.reduce((context, node) => {
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
    (accumulator, node, edge, fromNode, graph): GraphCompileResult => {
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
*/
