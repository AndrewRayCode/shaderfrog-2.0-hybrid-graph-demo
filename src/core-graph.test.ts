import util from 'util';

import { parser } from '@shaderfrog/glsl-parser';
import { visit, AstNode } from '@shaderfrog/glsl-parser/ast';
import { generate } from '@shaderfrog/glsl-parser';

import {
  applyStrategy,
  strategyRunners,
  StrategyType,
  texture2DStrategy,
} from './core/strategy';
import * as graphModule from './core/graph';
import {
  Graph,
  evaluateNode,
  ShaderStage,
  compileGraph,
  computeAllContexts,
} from './core/graph';
import { shaderSectionsToProgram } from './ast/shader-sections';
import { addNode, outputNode, sourceNode } from './core/nodes/engine-node';
import { makeExpression, returnGlPositionVec3Right } from './ast/manipulate';

import { mergeShaderSections, findShaderSections } from './ast/shader-sections';
import { Program } from '@shaderfrog/glsl-parser/ast';
import { numberNode } from './core/nodes/data-nodes';
import { makeEdge } from './core/nodes/edge';
import { SourceNode } from './core/nodes/code-nodes';
import { threngine } from './plugins/three/threngine';
import { Engine, EngineContext } from './core/engine';
import { outputs } from './site/components/flow/flownode.module.css';

const inspect = (thing: any): void =>
  console.log(util.inspect(thing, false, null, true));

const mergeBlocks = (ast1: Program, ast2: Program): string => {
  const s1 = findShaderSections(ast1);
  const s2 = findShaderSections(ast2);
  const merged = mergeShaderSections(s1, s2);
  return generate(
    shaderSectionsToProgram(merged, {
      includePrecisions: true,
      includeVersion: true,
    })
  );
};

const dedupe = (code: string) =>
  generate(
    shaderSectionsToProgram(findShaderSections(parser.parse(code)), {
      includePrecisions: true,
      includeVersion: true,
    })
  );

let counter = 0;
const p = { x: 0, y: 0 };
const id = () => '' + counter++;

const engine: Engine = {
  name: 'three',
  evaluateNode: () => {},
  constructors: {
    physical: () => ({
      config: {
        version: 3,
        preprocess: false,
        strategies: [],
      },
      id: '1',
      name: '1',
      type: '',
      inputs: [],
      outputs: [],
      position: { x: 0, y: 0 },
      source: '',
    }),
  },
  mergeOptions: {
    includePrecisions: true,
    includeVersion: true,
  },
  importers: {},
  preserve: new Set<string>(),
  parsers: {},
};

it('helo', () => {
  const graph: Graph = {
    nodes: [
      outputNode('0', 'Output v', p, 'vertex'),
      outputNode('1', 'Output f', p, 'fragment'),
      makeSourceNode(
        '2',
        `uniform sampler2D image1;
uniform sampler2D image2;
void main() {
  vec3 col = texture2D(image1, posTurn - 0.4 * time).rgb + 1.0;
  vec3 col = texture2D(image2, negTurn - 0.4 * time).rgb + 2.0;
}
`,
        'fragment'
      ),
      makeSourceNode(
        '3',
        `void main() {
    return vec4(0.0);
}
`,
        'fragment'
      ),
      makeSourceNode(
        '4',
        `void main() {
    return vec4(1.0);
}
`,
        'fragment'
      ),
    ],
    edges: [
      makeEdge(id(), '2', '1', 'out', 'filler_frogFragOut', 'fragment'),
      makeEdge(id(), '3', '2', 'out', 'filler_image1', 'fragment'),
      makeEdge(id(), '4', '2', 'out', 'filler_image2', 'fragment'),
    ],
  };
  const engineContext: EngineContext = {
    engine: 'three',
    nodes: {},
    runtime: {},
    debuggingNonsense: {},
  };

  const result = compileGraph(engineContext, engine, graph);
  const built = generate(
    shaderSectionsToProgram(result.fragment, {
      includePrecisions: true,
      includeVersion: true,
    }).program
  );
  expect(built).toBe('hi');
});

describe('evaluateNode()', () => {
  it('should do the thing', () => {
    const finalAdd = addNode(id(), p);
    const add2 = addNode(id(), p);
    const num1 = numberNode(id(), 'number', p, '3');
    const num2 = numberNode(id(), 'number', p, '5');
    const num3 = numberNode(id(), 'number', p, '7');
    const graph: Graph = {
      nodes: [num1, num2, num3, finalAdd, add2],
      edges: [
        makeEdge(id(), num1.id, finalAdd.id, 'out', 'a'),
        makeEdge(id(), add2.id, finalAdd.id, 'out', 'b'),
        makeEdge(id(), num2.id, add2.id, 'out', 'a'),
        makeEdge(id(), num3.id, add2.id, 'out', 'b'),
      ],
    };
    expect(evaluateNode(engine, graph, finalAdd)).toBe(15);
  });
});

test('It should merge uniforms with interface blocks', () => {
  let astX = parser.parse(`uniform vec2 x;`);
  let astY = parser.parse(`uniform vec2 y, z;
uniform vec3 a;`);
  expect(mergeBlocks(astX, astY)).toEqual(`uniform vec2 x, y, z;
uniform vec3 a;
`);

  const astL01 = parser.parse(`uniform Light0 { vec4 y; } x;`);
  const astL02 = parser.parse(`uniform Light0 { vec4 y; } x;`);
  expect(mergeBlocks(astL01, astL02)).toEqual(`uniform Light0 { vec4 y; } x;
`);

  const astL001 = parser.parse(`uniform Light0 { vec4 y; } x;`);
  const astL002 = parser.parse(`uniform Light0 x;`);
  expect(mergeBlocks(astL001, astL002)).toEqual(`uniform Light0 { vec4 y; } x;
`);

  const astLo01 = parser.parse(`uniform Light0 x;`);
  const astLo02 = parser.parse(`uniform Light0 { vec4 y; } x;`);
  expect(mergeBlocks(astLo01, astLo02)).toEqual(`uniform Light0 { vec4 y; } x;
`);

  // This may be a bug, look at how the uniforms are merged. I at least want to
  // note its current behavior in this test
  const vec2Arr1 = parser.parse(`uniform vec2 y[5];`);
  const vec2Arr2 = parser.parse(`uniform vec2 y[10];`);
  expect(mergeBlocks(vec2Arr1, vec2Arr2)).toEqual(`uniform vec2 y[10];
`);

  const block1 = parser.parse(`uniform Scene { mat4 view; };`);
  const block2 = parser.parse(`uniform Scene { mat4 view; };`);
  expect(mergeBlocks(block1, block2)).toEqual(`uniform Scene { mat4 view; };
`);

  // Verify these lines are preserved (they go through dedupeUniforms)
  expect(dedupe(`layout(std140,column_major) uniform;`)).toEqual(
    `layout(std140,column_major) uniform;`
  );
});

describe('strategies', () => {
  let orig: any;
  beforeEach(() => {
    orig = graphModule.mangleName;
    // Terrible hack. in the real world, strategies are applied after mangling
    // @ts-ignore
    graphModule.mangleName = (name) => name;
  });
  afterEach(() => {
    // @ts-ignore
    graphModule.mangleName = orig;
  });

  test('uniform strategy', () => {
    const orig = graphModule.mangleName;
    // Terrible hack. in the real world, strategies are applied after mangling
    // @ts-ignore
    graphModule.mangleName = (name) => name;

    const ast = parser.parse(`
layout(std140,column_major) uniform;
uniform sampler2D image;
uniform vec4 input, output, other;
uniform vec4 zenput;
uniform Light0 { vec4 y; } x;
void main() {
  vec4 computed = texture2D(image, uvPow * 1.0);
  vec4 x = input;
  vec4 y = output;
  vec4 z = zenput;
}`);
    const fillers = applyStrategy(
      { type: StrategyType.UNIFORM, config: {} },
      {} as SourceNode,
      ast
    );

    // It should find uniforms with simple types, excluding sampler2D
    expect(fillers.map(([{ displayName: name }]) => name)).toEqual([
      'image',
      'input',
      'output',
      'other',
      'zenput',
    ]);

    fillers.find(([{ displayName: name }]) => name === 'input')?.[1](
      makeExpression('a')
    );
    fillers.find(([{ displayName: name }]) => name === 'output')?.[1](
      makeExpression('b')
    );
    fillers.find(([{ displayName: name }]) => name === 'zenput')?.[1](
      makeExpression('c')
    );
    const result = generate(ast);

    // Expect the filling of references happened
    expect(result).toContain('vec4 x = a;');
    expect(result).toContain('vec4 y = b;');
    expect(result).toContain('vec4 z = c;');

    // Expect it preserved things it shouldn't touch
    expect(result).toContain('layout(std140,column_major) uniform;');
    expect(result).toContain('uniform sampler2D image;');
    expect(result).toContain('uniform Light0 { vec4 y; } x;');

    // Expect it removed uniforms from declarator list
    expect(result).toContain('uniform vec4 other;');
    // Expect it removed uniform lines
    expect(result).not.toContain('uniform vec4 zenput');
  });

  test('uses name without suffix for single call', () => {
    const ast = parser.parse(`
void main() {
  vec4 computed = texture2D(noiseImage, uvPow * 1.0);
}`);
    expect(
      applyStrategy(
        { type: StrategyType.TEXTURE_2D, config: {} },
        {} as SourceNode,
        ast
      ).map(([{ displayName: name }]) => name)
    ).toEqual(['noiseImage']);
  });

  test('finds multiple texture2D inputs for one uniform', () => {
    const ast = parser.parse(`
void main() {
  vec4 computed = texture2D(noiseImage, uvPow * 1.0);
  computed += texture2D(noiseImage, uvPow * 2.0);
}`);
    expect(
      applyStrategy(
        { type: StrategyType.TEXTURE_2D, config: {} },
        {} as SourceNode,
        ast
      ).map(([{ displayName: name }]) => name)
    ).toEqual(['noiseImage_0', 'noiseImage_1']);
  });
});

// const sourceToGraphWithOutputHelper = (fragment: string): Graph => ({
//   nodes: [
//     outputNode('1', 'Output f', {}, 'fragment'),
//     sourceNode(
//       '2',
//       'Shader',
//       {
//         modifiesPosition: true,
//       },
//       fragment,
//       'fragment'
//     ),
//   ],
//   edges: [
//     {
//       from: '2',
//       to: '1',
//       output: 'main',
//       input: 'color',
//       type: 'fragment',
//     },
//   ],
// });

// const graph: Graph = {
//   nodes: [
//     outputNode('output_id', 'output f', {}, 'fragment'),
//     {
//       name: 'shader 2',
//       id: 'shader_2_id',
//       type: ShaderType.shader,
//       options: {},
//       inputs: [],
//       source: `
// uniform sampler2D image;
// varying vec2 vUv;
// void main() {
//     vec4 color = texture2D(image, vUv);
//     gl_FragColor = vec4(2.0);
// }
// `,
//     },
//     {
//       name: 'shader 4',
//       id: 'shader_4_id',
//       type: ShaderType.shader,
//       options: {},
//       inputs: [],
//       source: `
// void main() {
//     gl_FragColor = vec4(4.0);
// }
// `,
//     },
//     {
//       name: 'shader 5',
//       id: 'shader_5_id',
//       type: ShaderType.shader,
//       options: {},
//       inputs: [],
//       source: `
// void main() {
//     gl_FragColor = vec4(5.0);
// }
// `,
//     },
//     addNode('add_3_id', {}),
//     addNode('add_4_id', {}),
//   ],
//   edges: [
//     {
//       from: 'shader_2_id',
//       to: 'add_3_id',
//       output: 'main',
//       input: 'a',
//       type: 'fragment',
//     },
//     {
//       from: 'shader_4_id',
//       to: 'add_3_id',
//       output: 'main',
//       input: 'b',
//       type: 'fragment',
//     },
//     {
//       from: 'add_3_id',
//       to: 'output_id',
//       output: 'expression',
//       input: 'color',
//       type: 'fragment',
//     },
//     {
//       from: 'add_4_id',
//       to: 'add_3_id',
//       output: 'expression',
//       input: 'c',
//       type: 'fragment',
//     },
//     {
//       from: 'shader_5_id',
//       to: 'add_4_id',
//       output: 'main',
//       input: 'a',
//       type: 'fragment',
//     },
//   ],
// };

// test('horrible jesus help me', () => {
//   const threeVertexMain = `
//   void main() {
//     texture2D(main, uv);
//   }
// `;

//   // Happens in produceAST step during compile
//   const vertexAst = parser.parse(threeVertexMain);
//   inspect(vertexAst);
//   /**
//    * This takes the gl position right side vec4(____, 1.0) in our case
//    * "position" and builds a new line vec3 frogOut = **position**; and then when
//    * we call position() below it's based on the scope bindings of the shader in
//    * which we haven't updated the position
//    *
//    * If instead of generating a literal, we generated a real ast, we could visit
//    * it in the replace instead of using bindings.
//    *
//    * TODO: Wait why does this work out of the box after only updating the ASTs
//    * to remove literals? The binding shouldn't work LOL
//    * TODO: Also it's hard to tell but the fireball shader might make the light
//    * position off?
//    *
//    * In addition to the above, what I need to do now isn't technically a vertex
//    * transformation, it's simply to get the varyings set.
//    */
//   returnGlPositionVec3Right(vertexAst);

//   // Happens at replacing inputs during compile
//   parsers[ShaderType.shader]?.vertex
//     .findInputs(null, null, vertexAst)
//     .position({
//       type: 'literal',
//       literal: 'hi',
//     });
//   console.log(generate(vertexAst));
//   // inspect(vertexAst);

//   let found;
//   visit(vertexAst, {
//     function_call: {
//       enter: (path) => {
//         const { node } = path;
//         if (
//           node?.identifier?.specifier?.token === 'vec4' &&
//           node?.args?.[2]?.token?.includes('1.')
//         ) {
//           found = node.args[0];
//         }
//       },
//     },
//   });
//   expect(generate(found)).toBe('hi');
// });

/*
test('horrible jesus help me', () => {
  // Some shaders have positional transforms. An advanced technique is
  // extracting the transforms and applying them.
  // Also don't want to lock people out of writing real shader source code
  // to plug into threejs
  // Replace the position attribute in upstream systems...
  const result = compileGraph(
    {
      nodes: {},
      runtime: {},
      debuggingNonsense: {},
    },
    { preserve: new Set<string>(), parsers: {} },
    sourceToGraphWithOutputHelper(
      `
precision highp float;
precision highp int;

// Default THREE.js uniforms available to both fragment and vertex shader
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat3 normalMatrix;

// Default uniforms provided by ShaderFrog.
uniform vec3 cameraPosition;
uniform float time;

// Default attributes provided by THREE.js. Attributes are only available in the
// vertex shader. You can pass them to the fragment shader using varyings
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
attribute vec2 uv2;

// Examples of variables passed from vertex to fragment shader
varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying vec2 vUv2;

void main() {
    vUv = uv;
    vUv2 = uv2;
    vPosition = position;
    vPosition = vec3(
            r * sin(theta) * cos(gamma),
            r * sin(theta) * sin(gamma),
            r * cos(theta)
        );
    
    // This sets the position of the vertex in 3d space. The correct math is
    // provided below to take into account camera and object data.
    gl_Position = projectionMatrix * modelViewMatrix * vec4( vPosition, 1.0 );
}
`
    )
  );
  const built = generate(shaderSectionsToAst(result.vertex).program);
  expect(built).toBe('hi');
});
*/

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

const makeSourceNode = (
  id: string,
  source: string,
  stage: ShaderStage,
  strategies = [texture2DStrategy()]
) =>
  sourceNode(
    id,
    `Shader ${id}`,
    p,
    {
      version: 2,
      preprocess: false,
      strategies,
    },
    source,
    stage
  );
