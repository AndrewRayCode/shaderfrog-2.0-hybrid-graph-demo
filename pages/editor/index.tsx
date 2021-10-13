import styles from './editor.module.css';

import { generate } from '@shaderfrog/glsl-parser';
import { useEffect, useRef, useState } from 'react';
import * as three from 'three';
import {
  outputNode,
  shaderNode,
  Graph,
  shaderSectionsToAst,
  ShaderType,
} from '../nodestuff';
import { compileGraph, Engine, NodeParsers } from '../graph';

import { phongNode, threngine } from '../threngine';
import purpleNoiseNode from './purpleNoiseNode';
import colorShaderNode from './colorShaderNode';

const width = 600;
const height = 600;

type EngineContext = {
  fragmentPreprocessed?: string;
  fragmentSource?: string;
  renderer: any;
  nodes: { [nodeId: string]: {} };
};

const graph: Graph = {
  nodes: [
    outputNode('1', {}),
    phongNode('2', 'Phong', {}),
    colorShaderNode('4'),
    purpleNoiseNode('3'),
  ],
  edges: [
    { from: '2', to: '1', output: 'main', input: 'color' },
    {
      from: '3',
      // from: '4',
      to: '2',
      output: 'main',
      input: 'texture2d_0',
    },
  ],
};

type Prorps = {
  engine: Engine;
  parsers: NodeParsers;
};

const ThreeScene = ({ engine, parsers }: Prorps) => {
  const domRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>();

  const edgStr = JSON.stringify(graph.edges);
  const [edges, setEdges] = useState<string>(edgStr);
  const [edgesUnsaved, setEdgesUnsaved] = useState<string>(edgStr);

  const [jsonError, setJsonError] = useState<boolean>(false);
  const [selection, setSelection] = useState<string>('final');
  const [preprocessed, setPreprocessed] = useState<string | undefined>('');
  const [vertex, setVertex] = useState<string | undefined>('');
  const [original, setOriginal] = useState<string | undefined>('');
  const [text, setText] = useState<string | undefined>('');

  const [ctx, setCtx] = useState<any>({});

  useEffect(() => {
    const scene = new three.Scene();
    const camera = new three.PerspectiveCamera(75, 1 / 1, 0.1, 1000);
    camera.position.set(0, 0, 2);
    camera.lookAt(0, 0, 0);
    scene.add(camera);

    const material = new three.MeshPhongMaterial({
      color: 0x222222,
      map: new three.Texture(),
    });
    const geometry = new three.SphereBufferGeometry(0.5, 32, 32);
    const mesh = new three.Mesh(geometry, material);
    scene.add(mesh);

    const light = new three.PointLight(0xffffff);
    light.position.set(0, 0, 4);
    scene.add(light);

    const helper = new three.PointLightHelper(light, 1);
    scene.add(helper);

    const ambientLight = new three.AmbientLight(0x222222);
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
      light.position.x = 4.0 * Math.sin(time * 0.001);
      // @ts-ignore
      if (mesh.material?.uniforms?.time) {
        mesh.material.uniforms.time.value = time * 0.001;
      }
      requestRef.current = requestAnimationFrame(animate);
    };
    const { current } = domRef;
    animate(0);

    setCtx({
      renderer,
      material,
      mesh,
      scene,
      camera,
    });

    return () => {
      if (current) {
        current.removeChild(renderer.domElement);
      }
      if (typeof requestRef.current === 'number') {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setJsonError(false);
    const startFrog = performance.now();

    const { renderer, mesh, scene, camera, material } = ctx;
    if (!renderer || !scene) {
      return;
    }

    try {
      graph.edges = JSON.parse(edges);
    } catch (e) {
      setJsonError(true);
      return;
    }
    console.log('rendering!', graph);

    const engineContext: EngineContext = {
      renderer,
      nodes: {},
    };

    mesh.material = material;
    renderer.compile(scene, camera);
    engineContext.nodes['2'] = {
      fragment: renderer.properties.get(mesh.material).programs.values().next()
        .value.fragmentShader,
      vertex: renderer.properties.get(mesh.material).programs.values().next()
        .value.vertexShader,
      // console.log('vertexProgram', vertexProgram);
    };
    console.log('engineContext', engineContext);
    const result = compileGraph(engineContext, threngine, graph);

    const fragmentResult = generate(shaderSectionsToAst(result).program);

    // TODO: Right now the three shader doesn't output vPosition, and it's not
    // supported by shaderfrog to merge outputs in vertex shaders yet
    const vertex = renderer
      .getContext()
      .getShaderSource(engineContext.nodes['2'].vertex)
      ?.replace(
        'attribute vec3 position;',
        'attribute vec3 position; varying vec3 vPosition;'
      )
      .replace('void main() {', 'void main() {\nvPosition = position;\n');

    console.log('oh hai birfday boi boi boiiiii');

    let startThree = performance.now();

    const pu: any = graph.nodes.find(
      (node) => node.name === 'Noise Shader'
    )?.id;

    // the before code
    const newMat = new three.RawShaderMaterial({
      name: 'ShaderFrog Phong Material',
      lights: true,
      uniforms: {
        ...three.ShaderLib.phong.uniforms,
        diffuse: { value: new three.Color(0x333333) },
        image: { value: new three.TextureLoader().load('/contrast-noise.png') },
        time: { value: 0 },
        color: { value: new three.Color(0xffffff) },
        resolution: { value: 0.5 },
        speed: { value: 3 },
        lightPosition: { value: new three.Vector3(10, 10, 10) },

        [`brightnessX_${pu}`]: { value: 1 },
        [`permutations_${pu}`]: { value: 10 },
        [`iterations_${pu}`]: { value: 1 },
        [`uvScale_${pu}`]: { value: new three.Vector2(1, 1) },
        [`color1_${pu}`]: { value: new three.Vector3(0.7, 0.3, 0.8) },
        [`color2_${pu}`]: { value: new three.Vector3(0.1, 0.2, 0.9) },
        [`color3_${pu}`]: { value: new three.Vector3(0.8, 0.3, 0.8) },
      },
      vertexShader: vertex,
      fragmentShader: fragmentResult,
    });

    // @ts-ignore
    mesh.material = newMat;

    const now = performance.now();
    console.log(`Compilation took:
total: ${(now - startFrog).toFixed(3)}ms
frog: ${(startThree - startFrog).toFixed(3)}ms
three: ${(now - startThree).toFixed(3)}ms
`);
    setText(fragmentResult);
    setVertex(vertex);
    setPreprocessed(engineContext.fragmentPreprocessed);
    setOriginal(engineContext.fragmentSource);
  }, [ctx, edges]);

  // TODO: You were here, trying to modify the edges in real time,
  // and it fails. Because of mutation of the AST?
  return (
    <div className={styles.container}>
      <div>
        <div
          style={{ width: `${width}px`, height: `${height}px` }}
          ref={domRef}
        ></div>
      </div>
      <div>
        <textarea
          className={styles.edges + ' ' + (jsonError ? styles.error : '')}
          onChange={(event) => setEdgesUnsaved(event.target.value)}
          value={edgesUnsaved}
        ></textarea>
        <button
          className={styles.button}
          onClick={() => setEdges(edgesUnsaved)}
        >
          Save Edges
        </button>

        <textarea
          className={styles.code}
          readOnly
          style={{
            display: selection === 'vertex' ? 'block' : 'none',
          }}
          value={vertex}
        ></textarea>
        <textarea
          className={styles.code}
          readOnly
          style={{
            display: selection === 'original' ? 'block' : 'none',
          }}
          value={original}
        ></textarea>
        <textarea
          className={styles.code}
          readOnly
          style={{
            display: selection === 'preprocessed' ? 'block' : 'none',
          }}
          value={preprocessed}
        ></textarea>
        <textarea
          className={styles.code}
          readOnly
          style={{
            display: selection === 'final' ? 'block' : 'none',
          }}
          value={text}
        ></textarea>

        <button
          className={styles.button}
          disabled={selection === 'vertex'}
          onClick={() => setSelection('vertex')}
        >
          Vertex
        </button>
        <button
          className={styles.button}
          disabled={selection === 'original'}
          onClick={() => setSelection('original')}
        >
          Original
        </button>
        <button
          className={styles.button}
          disabled={selection === 'preprocessed'}
          onClick={() => setSelection('preprocessed')}
        >
          Preprocessed
        </button>
        <button
          className={styles.button}
          disabled={selection === 'final'}
          onClick={() => setSelection('final')}
        >
          Final
        </button>
      </div>
    </div>
  );
};

export default ThreeScene;
