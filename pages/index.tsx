import { generate, parser } from '@shaderfrog/glsl-parser';
import { visit } from '@shaderfrog/glsl-parser/core/ast.js';
import preprocess from '@shaderfrog/glsl-parser/preprocessor';
import type { NextPage } from 'next';
import Head from 'next/head';
import { useEffect, useRef, useState } from 'react';
import * as three from 'three';
import styles from '../styles/Home.module.css';

/**
 * WebGL 1 > 2
 * varying > in
 * texture2D > texture??
 * gl_FragColor > out var
 */
const frag = `
precision highp float;

#define PI 3.141592653589793238462643383279

uniform float time;
uniform float speed;
uniform float resolution;
uniform vec3 color;
uniform sampler2D image;
uniform float brightness;

varying vec2 vUv;

vec3 lig = normalize(vec3(0.9,0.35,-0.2));

void main() {
  vec2 uvMax = ( 2.0 * asin( sin( 2.0 * PI * vUv ) ) ) / PI;
  vec2 position = vUv * resolution;
  
	vec3 nor = vec3( 0.0, 1.0, 0.0 );
	float dif = max(dot(nor,lig),0.0);
	
	vec3 pos = vec3( position.x, 0.0, position.y );
	
	float timeScale = time * speed;
	
	// lights
	vec3 brdf = vec3(0.0);
	float cc  = 0.55*texture( image, 1.8*0.02*pos.xz + 0.007*timeScale*vec2( 1.0, 0.0) ).x;
	cc += 0.25*texture( image, 1.8*0.04*pos.xz + 0.011*timeScale*vec2( 0.0, 1.0) ).x;
	cc += 0.10*texture( image, 1.8*0.08*pos.xz + 0.014*timeScale*vec2(-1.0,-1.0) ).x;
	cc = 0.6*(1.0-smoothstep( 0.0, 0.025, abs(cc-0.4))) + 
		0.4*(1.0-smoothstep( 0.0, 0.150, abs(cc-2.4)));

	vec3 col = color * cc;
    
  gl_FragColor = vec4( color * cc * brightness, 1.0 );
}
`;
const vert = `
precision highp float;
precision highp int;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat3 normalMatrix;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
attribute vec2 uv2;

in vec2 vUv;
in vec3 vPosition;
in vec3 vNormal;

void main() {
  vUv = uv;
  vPosition = position;
  vNormal = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const from2To3 = (ast) => {
  const glOut = 'fragmentColor';
  ast.program.unshift({
    type: 'preprocessor',
    line: '#version 300 es',
    _: '\n',
  });
  ast.program.unshift({
    type: 'declaration_statement',
    declaration: {
      type: 'declarator_list',
      specified_type: {
        type: 'fully_specified_type',
        qualifiers: [{ type: 'keyword', token: 'out', whitespace: ' ' }],
        specifier: {
          type: 'type_specifier',
          specifier: { type: 'keyword', token: 'vec4', whitespace: ' ' },
          quantifier: null,
        },
      },
      declarations: [
        {
          type: 'declaration',
          identifier: {
            type: 'identifier',
            identifier: glOut,
            whitespace: undefined,
          },
          quantifier: null,
          operator: undefined,
          initializer: undefined,
        },
      ],
      commas: [],
    },
    semi: { type: 'literal', literal: ';', whitespace: '\n    ' },
  });
  visit(ast, {
    identifier: {
      enter: (path) => {
        if (path.node.identifier === 'gl_FragColor') {
          path.node.identifier = glOut;
        }
      },
    },
    keyword: {
      enter: (path) => {
        if (
          (path.node.token === 'attribute' || path.node.token === 'varying') &&
          path.findParent((path) => path.node.type === 'declaration_statement')
        ) {
          path.node.token = 'in';
        }
      },
    },
  });
};

// index is a hack because after the descoping, frogOut gets renamed - even
// though it shouldn't because it's not in the global scope, that might be a bug
const convertMainToReturn = (ast: Object): void => {
  const mainReturnVar = `frogOut`;

  let outName: string;
  ast.program.find((line, index) => {
    if (
      line.type === 'declaration_statement' &&
      line.declaration?.specified_type?.qualifiers?.find(
        (n) => n.token === 'out'
      ) &&
      line.declaration.specified_type.specifier.specifier.token === 'vec4'
    ) {
      // Remove the out declaration
      ast.program.splice(index, 1);
      outName = line.declaration.declarations[0].identifier.identifier;
      return true;
    }
  });
  if (!outName) {
    throw new Error('No "out vec4" line found in the fragment shader');
  }

  visit(ast, {
    identifier: {
      enter: (path) => {
        if (path.node.identifier === outName) {
          path.node.identifier = mainReturnVar;
          path.node.doNotDescope = true; // hack because this var is in the scope which gets renamed later
        }
      },
    },
    function: {
      enter: (path) => {
        if (path.node.prototype.header.name.identifier === 'main') {
          path.node.prototype.header.returnType.specifier.specifier.token =
            'vec4';
          path.node.body.statements.unshift({
            type: 'literal',
            literal: `vec4 ${mainReturnVar};\n`,
          });
          path.node.body.statements.push({
            type: 'literal',
            literal: `return ${mainReturnVar};\n`,
          });
        }
      },
    },
  });
};

const noTouchyBindings = new Set([
  'viewMatrix',
  'cameraPosition',
  'isOrthographic',
  'vUv',
  'vViewPosition',
  'vNormal',
  'diffuse',
  'emissive',
  'specular',
  'shininess',
  'opacity',
  'map',
  'receiveShadow',
  'ambientLightColor',
  'lightProbe',
  'pointLights',
  'time',
  'speed',
  'resolution',
  'color',
  'image',
  'brightness',
]);

const renameBindings = (scope, i) => {
  Object.entries(scope.bindings).forEach(([name, binding]) => {
    binding.references.forEach((ref) => {
      if (ref.doNotDescope) {
        return;
      }
      if (ref.type === 'declaration') {
        // both are "in" vars expected in vertex shader
        if (!noTouchyBindings.has(ref.identifier.identifier)) {
          ref.identifier.identifier = `${ref.identifier.identifier}_${i}`;
        }
      } else if (ref.type === 'identifier') {
        // todo toes this block get called anymore??
        if (!noTouchyBindings.has(ref.identifier)) {
          ref.identifier = `${ref.identifier}_${i}`;
        }
      } else if (ref.type === 'parameter_declaration') {
        ref.declaration.identifier.identifier = `${ref.declaration.identifier.identifier}_${i}`;
      } else {
        console.log(ref);
        throw new Error(`Binding for type ${ref.type} not recognized`);
      }
    });
  });
};

const renameFunctions = (scope, i) => {
  Object.entries(scope.functions).forEach(([name, binding]) => {
    binding.references.forEach((ref) => {
      if (ref.type === 'function_header') {
        ref.name.identifier = `${ref.name.identifier}_${i}`;
      } else if (ref.type === 'function_call') {
        if (ref.identifier.type === 'postfix') {
          ref.identifier.expr.identifier.specifier.identifier = `${ref.identifier.expr.identifier.specifier.identifier}_${i}`;
        } else {
          ref.identifier.specifier.identifier = `${ref.identifier.specifier.identifier}_${i}`;
        }
      } else {
        console.log(ref);
        throw new Error(`Function for type ${ref.type} not recognized`);
      }
    });
  });
};

const addMainFunctions = (leftSource, rightSource) => {
  const leftPreprocessed = preprocess(leftSource, {
    preserve: {
      version: () => true,
    },
  });
  const leftAst = parser.parse(leftPreprocessed);
  convertMainToReturn(leftAst);
  renameBindings(leftAst.scopes[0], 0);
  renameFunctions(leftAst.scopes[0], 0);

  const [preprocessorLeft, versionLeft, restLeft, insLeft, existingIns] =
    leftAst.program.reduce(
      (split, node) => {
        if (
          node.type === 'declaration_statement' &&
          node.declaration.type === 'precision'
        ) {
          split[0].push(node);
        } else if (node.type === 'preprocessor') {
          split[1].push(node);
        } else if (
          node.type === 'declaration_statement' &&
          node.declaration?.specified_type?.qualifiers?.find(
            (n) => n.token === 'in'
          )
        ) {
          node.declaration.declarations
            .map((decl) => decl.identifier.identifier)
            .forEach((i) => {
              split[4].add(i);
            });
          split[3].push(node);
        } else {
          split[2].push(node);
        }
        return split;
      },
      [[], [], [], [], new Set()]
    );

  console.log(existingIns);

  console.log('leftAst', leftAst);

  const rightPreprocessed = preprocess(rightSource, {
    preserve: {
      version: () => true,
    },
  });
  const rightAst = parser.parse(rightPreprocessed);
  from2To3(rightAst);
  convertMainToReturn(rightAst, 1);
  renameBindings(rightAst.scopes[0], 1);
  renameFunctions(rightAst.scopes[0], 1);

  const [preprocessorRight, versionRight, restRight] = rightAst.program.reduce(
    (split, node) => {
      if (
        node.type === 'declaration_statement' &&
        node.declaration.type === 'precision'
      ) {
        split[0].push(node);
      } else if (node.type === 'preprocessor') {
        split[1].push(node);
      } else if (
        node.type === 'declaration_statement' &&
        node.declaration?.specified_type?.qualifiers?.find(
          (n) => n.token === 'in'
        ) &&
        node.declaration.declarations
          .map((decl) => decl.identifier.identifier)
          .some((i) => existingIns.has(i))
      ) {
        // Intentionally blank to skip this line
      } else {
        split[2].push(node);
      }
      return split;
    },
    [[], [], []]
  );

  const glOut = 'fragmentColor';

  return (
    (
      generate([
        ...versionRight,
        // ...versionLeft, // only need one
        ...preprocessorRight,
        ...preprocessorLeft,
        {
          type: 'declaration_statement',
          declaration: {
            type: 'declarator_list',
            specified_type: {
              type: 'fully_specified_type',
              qualifiers: [{ type: 'keyword', token: 'out', whitespace: ' ' }],
              specifier: {
                type: 'type_specifier',
                specifier: { type: 'keyword', token: 'vec4', whitespace: ' ' },
                quantifier: null,
              },
            },
            declarations: [
              {
                type: 'declaration',
                identifier: {
                  type: 'identifier',
                  identifier: glOut,
                  whitespace: undefined,
                },
                quantifier: null,
                operator: undefined,
                initializer: undefined,
              },
            ],
            commas: [],
          },
          semi: { type: 'literal', literal: ';', whitespace: '\n    ' },
        },
        ...insLeft,
        ...restRight,
        ...restLeft,
      ]) + `void main() {${glOut} = main_0();}`
    )
      // hack: we add map
      .replace(
        'vec4 texelColor = texture( map, vUv );',
        'vec4 texelColor = main_1() + vec4(0.0, 0.1, 0.0, 1.0);'
      )
  );
};

const width = 600;
const height = 600;

interface ProgramSource {
  fragment: string;
  vertex: string;
}

interface ProgramAst {
  fragment: Object;
  vertex: string;
}

interface Node {
  id: string;
  type: string;
  options: Object;
  inputs(): Array<Object>;
  outputs(): Array<Object>;
  source(context: Object, graph: Object): ProgramSource;
}

let id = 0;
const shaderNode = (
  options: Object,
  fragment: string,
  vertex: string
): Node => ({
  id: '' + id++,
  type: 'shader',
  options,
  source: () => {
    return { fragment, vertex };
  },
  inputs: () => [],
  outputs: () => [],
});

const outputNode = (id: string, options: Object): Node => ({
  id,
  type: 'output',
  options,
  source: function (context, graph) {
    const vertex = '';
    const inputNode = graph.inputFor(this.id, 'color');

    const fragment = `
    void main() {
      return ${something};
    }`;
    return { fragment, vertex };
  },
  inputs: () => [
    {
      color: true,
    },
  ],
  outputs: () => [],
});

interface Edge {
  from?: string;
  to: string;
  output?: string;
  input?: string;
}

interface Graph {
  nodes: Array<Node>;
  edges: Array<Edge>;
}

const phongNode = (id: string, options: Object): Node => {
  return {
    id: id,
    type: 'MeshPhongMaterial',
    options,
    inputs: () => [
      {
        map: () => {},
      },
    ],
    outputs: () => [],
    source: () => {
      return { fragment: '', vertex: '' };
    },
  };
};

const parsePhong = (context: Object, node: Node): ProgramAst => {
  const { scene, camera, renderer, mesh } = context;
  const material = new three.MeshPhongMaterial({
    color: 0x222222,
    map: new three.Texture(),
  });
  mesh.material = material;
  renderer.compile(scene, camera);

  const gl = renderer.getContext();
  // As of this PR materials can have multiple programs https://github.com/mrdoob/three.js/pull/20135/files
  // And the programs are stored as a map. This gets the first entry
  const fragmentProgram = renderer.properties
    .get(mesh.material)
    .programs.values()
    .next().value.fragmentShader;
  const vertexProgram = renderer.properties
    .get(mesh.material)
    .programs.values()
    .next().value.vertexShader;

  const fragmentSource = gl.getShaderSource(fragmentProgram);
  const fragmentPreprocessed = preprocess(fragmentSource, {
    preserve: {
      version: () => true,
    },
  });
  const fragment = parser.parse(fragmentPreprocessed);

  const vertexSource = gl.getShaderSource(vertexProgram);

  return {
    fragment,
    vertex: vertexSource,
  };
};

const graph: Graph = {
  nodes: [outputNode('1', {}), phongNode('2', {})],
  edges: [{ from: '2', to: '1', output: 'main', input: 'color' }],
};

interface Something {
  vertex: string;
  fragment: string;
}

interface SomethingInBetween {
  version: Object;
  preprocessor: Array<Object>;
  inStatements: Array<Object>;
  existingIns: Set<string>;
  program: Array<string>;
}

const splorfTheBlorf = (ast: Object): SomethingInBetween => {
  const [preprocessor, version, program, inStatements, existingIns] =
    ast.program.reduce(
      (split, node) => {
        if (
          node.type === 'declaration_statement' &&
          node.declaration.type === 'precision'
        ) {
          split[0].push(node);
        } else if (node.type === 'preprocessor') {
          split[1].push(node);
        } else if (
          node.type === 'declaration_statement' &&
          node.declaration?.specified_type?.qualifiers?.find(
            (n) => n.token === 'in'
          )
        ) {
          node.declaration.declarations
            .map((decl) => decl.identifier.identifier)
            .forEach((i) => {
              split[4].add(i);
            });
          split[3].push(node);
        } else {
          split[2].push(node);
        }
        return split;
      },
      [[], [], [], [], new Set()]
    );
  return {
    preprocessor,
    version,
    program,
    inStatements,
    existingIns,
  };
};

const outDeclaration = (name: string): Object => ({
  type: 'declaration_statement',
  declaration: {
    type: 'declarator_list',
    specified_type: {
      type: 'fully_specified_type',
      qualifiers: [{ type: 'keyword', token: 'out', whitespace: ' ' }],
      specifier: {
        type: 'type_specifier',
        specifier: { type: 'keyword', token: 'vec4', whitespace: ' ' },
        quantifier: null,
      },
    },
    declarations: [
      {
        type: 'declaration',
        identifier: {
          type: 'identifier',
          identifier: name,
          whitespace: undefined,
        },
        quantifier: null,
        operator: undefined,
        initializer: undefined,
      },
    ],
    commas: [],
  },
  semi: { type: 'literal', literal: ';', whitespace: '\n    ' },
});

const compileGraph = (context: Object, graph: Graph): Something => {
  const output = graph.nodes.find((node) => node.type === 'output');
  if (!output) {
    throw new Error('No output in graph');
  }
  const inputEdges = graph.edges.filter(
    (edge) => edge.to === output.id && edge.input === 'color'
  );

  const intermediary: SomethingInBetween = {
    preprocessor: [],
    version: [],
    program: [],
    inStatements: [],
    existingIns: new Set<string>(),
  };

  let vertexResult: string = '';
  inputEdges.forEach((edge) => {
    const from = graph.nodes.find((node) => edge.from === node.id);
    if (!from) {
      throw new Error(`No node with id ${id} in graph`);
    }
    if (from.type === 'MeshPhongMaterial') {
      const asts = parsePhong(context, from);
      const { fragment, vertex } = asts;
      vertexResult = vertex;
      convertMainToReturn(fragment);
      renameBindings(fragment.scopes[0], 0);
      renameFunctions(fragment.scopes[0], 0);
      const { preprocessor, version, program, inStatements, existingIns } =
        splorfTheBlorf(fragment);
      intermediary.preprocessor =
        intermediary.preprocessor.concat(preprocessor);
      intermediary.version = version;
      intermediary.inStatements =
        intermediary.inStatements.concat(inStatements);
      intermediary.existingIns = new Set([
        ...intermediary.existingIns,
        ...existingIns,
      ]);
      intermediary.program = intermediary.program.concat(program);
    }
  });

  const glOut = 'fragmentColor';

  const fragment =
    generate([
      intermediary.version,
      ...intermediary.preprocessor,
      ...intermediary.inStatements,
      // The outvar
      outDeclaration(glOut),
      ...intermediary.program,
    ]) + `void main() {${glOut} = main_0();}`;

  return {
    vertex: vertexResult,
    fragment,
  };
};

const Home: NextPage = () => {
  const domRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>();
  const [text, setText] = useState<string>('');

  useEffect(() => {
    const scene = new three.Scene();
    const camera = new three.PerspectiveCamera(75, 1 / 1, 0.1, 1000);
    camera.position.set(0, 0, 2);
    camera.lookAt(0, 0, 0);
    scene.add(camera);

    let uniforms;
    const material = new three.MeshPhongMaterial({
      color: 0x222222,
      map: new three.Texture(),
      // @ts-ignore
      onBeforeCompile: (shader: Shader) => {
        console.log('shader', shader);
        uniforms = shader.uniforms;
      },
    });
    const geometry = new three.BoxBufferGeometry(1, 1, 1);
    const mesh = new three.Mesh(geometry, material);
    scene.add(mesh);

    const light = new three.PointLight(0x00ff00);
    light.position.set(0, 0, 4);
    scene.add(light);

    const ambientLight = new three.AmbientLight(0xffffff);
    scene.add(ambientLight);

    const renderer = new three.WebGLRenderer();
    renderer.setSize(width, height);
    if (domRef.current) {
      domRef.current.appendChild(renderer.domElement);
    }

    const animate = (time: number) => {
      renderer.render(scene, camera);
      mesh.rotation.x = time * 0.0003;
      mesh.rotation.y = time * -0.0003;
      mesh.rotation.z = time * 0.0003;
      // @ts-ignore
      // if (mesh.material === newMat) {
      //   mesh.material.uniforms.time.value = time * 0.001;
      // }
      requestRef.current = requestAnimationFrame(animate);
    };

    const { vertex, fragment } = compileGraph(
      { renderer, scene, camera, mesh },
      graph
    );

    // renderer.compile(scene, camera);

    // const gl = renderer.getContext();
    // // As of this PR materials can have multiple programs https://github.com/mrdoob/three.js/pull/20135/files
    // // And the programs are stored as a map. This gets the first entry
    // const fragmentProgram = renderer.properties
    //   .get(mesh.material)
    //   .programs.values()
    //   .next().value.fragmentShader;
    // const vertexProgram = renderer.properties
    //   .get(mesh.material)
    //   .programs.values()
    //   .next().value.vertexShader;
    // console.log('vertexProgram', vertexProgram);
    console.log('oh hai birfday boi boi boiiiii');

    // console.log(mesh.material);
    // const fragmentSource = gl.getShaderSource(fragmentProgram);
    // const vertexSource = gl.getShaderSource(vertexProgram);
    // console.log('fragmentSource', fragmentSource);

    // console.log(
    //   preprocess(fragmentSource, {
    //     preserve: {
    //       version: () => true,
    //     },
    //   })
    // );

    const newMat = new three.RawShaderMaterial({
      name: 'ShaderFrog Phong Material',
      lights: true,
      uniforms: {
        ...three.ShaderLib.phong.uniforms,
        diffuse: { value: new three.Color(0x333333) },
        image: { value: new three.TextureLoader().load('/contrast-noise.png') },
        time: { value: 0 },
        color: { value: new three.Color(0xffffff) },
        brightness: { value: 1 },
        resolution: { value: 0.5 },
        speed: { value: 0.1 },
        // opacity: { value: 1 },
      },
      vertexShader: vertex,
      fragmentShader: fragment,

      // @ts-ignore`
      // onBeforeCompile: (shader) => {
      //   shader.uniforms = {
      //     ...three.ShaderLib.phong.uniforms,
      //     ...shader.uniforms,
      //   };

      //   // console.log(
      //   //   'three.ShaderLib.phong.uniforms',
      //   //   three.ShaderLib.phong.uniforms
      //   // );
      //   shader.fragmentShader = addMainFunctions(fragmentSource, frag);
      //   setText(shader.fragmentShader || 'oh god no');
      //   shader.vertexShader = vertexSource;
      // },
    });
    // @ts-ignore
    mesh.material = newMat;
    setText(fragment || 'oh god no');

    const { current } = domRef;
    animate(0);

    return () => {
      if (current) {
        current.removeChild(renderer.domElement);
      }
      if (typeof requestRef.current === 'number') {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [setText]);

  return (
    <div className={styles.container}>
      <Head>
        <title>Create Next App</title>
        <meta name="description" content="Generated by create next app" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <textarea
        readOnly
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: '100%',
          width: '400px',
        }}
        value={text}
      ></textarea>

      <div
        style={{ width: `${width}px`, height: `${height}px` }}
        ref={domRef}
      ></div>
    </div>
  );
};

export default Home;
