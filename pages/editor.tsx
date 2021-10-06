import { generate } from '@shaderfrog/glsl-parser';
import { useEffect, useRef, useState } from 'react';
import * as three from 'three';
import { outputNode, Graph, shaderSectionsToAst } from './nodestuff';
import { compileGraph, Engine, NodeParsers } from './graph';

import { phongNode, threngine } from './threngine';

const width = 600;
const height = 600;

type EngineContext = {
  renderer: any;
  nodes: { [nodeId: string]: {} };
};

const graph: Graph = {
  nodes: [outputNode('1', {}), phongNode('2', 'Phong', {})],
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

    const engineContext: EngineContext = {
      renderer,
      nodes: {},
    };

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
    setText(fragmentResult);

    console.log('oh hai birfday boi boi boiiiii');

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
        brightness: { value: 1 },
        resolution: { value: 0.5 },
        speed: { value: 0.1 },
        // opacity: { value: 1 },
      },
      vertexShader: renderer
        .getContext()
        .getShaderSource(engineContext.nodes['2'].vertex),
      fragmentShader: fragmentResult,

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
          left: width,
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

export default ThreeScene;
