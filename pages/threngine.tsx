import { generate, parser } from '@shaderfrog/glsl-parser';
import { visit } from '@shaderfrog/glsl-parser/core/ast.js';
import preprocess from '@shaderfrog/glsl-parser/preprocessor';
import { useEffect, useRef, useState } from 'react';
import * as three from 'three';
import {
  Engine,
  ShaderType,
  ProgramAst,
  compile,
  outputNode,
  Graph,
  Node,
  NodeParsers,
} from './nodestuff';

export const phongNode = (id: string, options: Object): Node => {
  return {
    id: id,
    type: ShaderType.phong,
    options,
    vertexSource: '',
    fragmentSource: '',
  };
};

const parsePhong = (context: Object, node: Node): ProgramAst => {
  const { scene, camera, renderer, mesh } = context;
  const material = new three.MeshPhongMaterial({
    color: 0x222222,
    map: new three.Texture(),
    normalMap: new three.Texture(),
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

const width = 600;
const height = 600;

const graph: Graph = {
  nodes: [outputNode('1', {}), phongNode('2', {})],
  edges: [{ from: '2', to: '1', output: 'main', input: 'color' }],
};

type Prorps = {
  engine: Engine;
  parsers: NodeParsers;
};

const ThreeScene = ({ engine, parsers }: Prorps) => {
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

    // Start on the output node
    const output = graph.nodes.find((node) => node.type === 'output');

    if (!output) {
      throw new Error('No output in graph');
    }
    const inputEdges = graph.edges.filter((edge) => edge.to === output.id);
    if (inputEdges.length !== 1) {
      throw new Error('No input to output in');
    }
    const { vertex, fragment } = compile(
      threngine,
      { renderer, scene, camera, mesh },
      parsers,
      graph,
      output,
      inputEdges[0]
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
    <div>
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

export const threngine: Engine = {
  preserve: new Set<string>([
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
  ]),
  nodes: {
    [ShaderType.phong]: {
      create: phongNode,
      parse: parsePhong,
    },
  },
  Component: ThreeScene,
};
