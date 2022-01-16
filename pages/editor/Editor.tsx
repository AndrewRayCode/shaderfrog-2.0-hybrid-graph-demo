import styles from './editor.module.css';
import 'litegraph.js/css/litegraph.css';

import throttle from 'lodash.throttle';
import { SplitPane } from 'react-multi-split-pane';
import cx from 'classnames';
import LiteGraph from 'litegraph.js';
import { generate } from '@shaderfrog/glsl-parser';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import React, {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as three from 'three';
import {
  outputNode,
  Graph,
  shaderSectionsToAst,
  Node,
  addNode,
  multiplyNode,
  ShaderType,
  Edge,
} from '../../src/nodestuff';
import {
  compileGraph,
  computeGraphContext,
  EngineContext,
  NodeInputs,
} from '../../src/graph';

import {
  phongNode,
  toonNode,
  threngine,
  RuntimeContext,
} from '../../src/threngine';
import purpleNoiseNode from '../../src/purpleNoiseNode';
import colorShaderNode from '../../src/colorShaderNode';
import fluidCirclesNode from '../../src/fluidCirclesNode';
import solidColorNode from '../../src/solidColorNode';
import {
  heatShaderFragmentNode,
  heatShaderVertexNode,
} from '../../src/heatmapShaderNode';
import { fireFrag, fireVert } from '../../src/fireNode';
import { outlineShaderF, outlineShaderV } from '../../src/outlineShader';

import contrastNoise from '..';
import { useAsyncExtendedState } from '../../src/useAsyncExtendedState';
import { usePromise } from '../../src/usePromise';

import ReactFlow, {
  Background,
  BackgroundVariant,
  Handle,
  Position,
} from 'react-flow-renderer';
import { useThree } from './hork';

const flowStyles = { height: 500 };

let counter = 0;
const id = () => '' + counter++;
const outputF = outputNode(id(), 'Output F', {}, 'fragment');
const outputV = outputNode(id(), 'Output V', {}, 'vertex', outputF.id);
const phongF = phongNode(id(), 'Phong F', {}, 'fragment');
const phongV = phongNode(id(), 'Phong V', {}, 'vertex', phongF.id);
const toonF = toonNode(id(), 'Toon F', {}, 'fragment');
const toonV = toonNode(id(), 'Toon V', {}, 'vertex', toonF.id);
const fluidF = fluidCirclesNode(id());
const colorShader = colorShaderNode(id());
const purpleNoise = purpleNoiseNode(id());
const heatShaderF = heatShaderFragmentNode(id());
const heatShaderV = heatShaderVertexNode(id());
const fireF = fireFrag(id());
const fireV = fireVert(id());
const add = addNode(id(), {});
const add2 = addNode(id(), {});
const multiply = multiplyNode(id(), {});
const outlineF = outlineShaderF(id());
const outlineV = outlineShaderV(id(), outlineF.id);
const solidColorF = solidColorNode(id());

const graph: Graph = {
  nodes: [
    outputF,
    outputV,
    phongF,
    phongV,
    toonF,
    fluidF,
    toonV,
    colorShader,
    purpleNoise,
    heatShaderF,
    heatShaderV,
    fireF,
    fireV,
    add,
    add2,
    multiply,
    outlineF,
    outlineV,
    solidColorF,
  ],
  edges: [
    // { from: '2', to: '1', output: 'main', input: 'color' },
    // TODO: Put other images in the graphf like the toon step shader
    // TODO: Could be cool to try outline shader https://shaderfrog.com/app/view/4876
    // TODO: Try pbr node demo from threejs
    // TODO: Support vertex :O
    // TODO: Have uniforms added per shader in the graph
    // TODO: Fix hot reloading breaking the graph
    // TODO: Try plugging into normal map
    // TODO: AnyCode node to try manipulating above shader for normal map
    // TODO: Make uniforms like map: change the uniforms
    // TODO: Add 1.00 / 3.00 switch
    // {
    //   from: '7',
    //   to: '2',
    //   output: 'main',
    //   input: 'texture2d_0',
    //   type: 'fragment',
    // },
    // {
    //   from: '4',
    //   to: '7',
    //   output: 'main',
    //   input: 'a',
    //   type: 'fragment',
    // },
    // {
    //   from: '5',
    //   to: '7',
    //   output: 'main',
    //   input: 'b',
    //   type: 'fragment',
    // },
    {
      from: phongV.id,
      to: outputV.id,
      output: 'main',
      input: 'position',
      type: 'fragment',
    },
    {
      from: phongF.id,
      to: outputF.id,
      output: 'main',
      input: 'color',
      type: 'fragment',
    },
    {
      from: solidColorF.id,
      to: phongF.id,
      output: 'main',
      input: 'texture2d_0',
      type: 'fragment',
    },
    // {
    //   from: add.id,
    //   to: phongF.id,
    //   output: 'color',
    //   input: 'texture2d_0',
    //   type: 'fragment',
    // },
    // {
    //   from: purpleNoise.id,
    //   to: add.id,
    //   output: 'color',
    //   input: 'a',
    //   type: 'fragment',
    // },
    // {
    //   from: heatShaderF.id,
    //   to: add.id,
    //   output: 'color',
    //   input: 'b',
    //   type: 'fragment',
    // },
    // {
    //   from: heatShaderV.id,
    //   to: phongV.id,
    //   output: 'position',
    //   input: 'position',
    //   type: 'vertex',
    // },
    // {
    //   from: fireV.id,
    //   to: heatShaderV.id,
    //   output: 'position',
    //   input: 'position',
    //   type: 'vertex',
    // },
    // {
    //   from: outlineF.id,
    //   to: add.id,
    //   output: 'main',
    //   input: 'c',
    //   type: 'fragment',
    // },
  ],
};

class LOutputNode extends LiteGraph.LGraphNode {
  constructor() {
    super();
  }
}
LiteGraph.LiteGraph.registerNodeType('basic/output', LOutputNode);

class LShaderNode extends LiteGraph.LGraphNode {
  constructor() {
    super();
    this.addOutput('main', 'string');
    this.color = '#fff';
  }
  bgcolor = '#000';
}
LiteGraph.LiteGraph.registerNodeType('basic/shader', LShaderNode);

class LAddNode extends LiteGraph.LGraphNode {
  constructor() {
    super();
    this.addOutput('output', 'string');
  }
}
LiteGraph.LiteGraph.registerNodeType('basic/add', LAddNode);

const customNodeStyles = {
  background: '#9CA8B3',
  color: '#FFF',
  padding: '10px 20px',
};
const CustomNodeComponent = ({ data }: { data: any }) => {
  // TODO: Populate inputs (and eventually outputs) after the graph compiles!
  // console.log('data.inputs', data.inputs);
  return (
    <div style={customNodeStyles}>
      {Object.keys(data.inputs).map((name, index) => (
        <React.Fragment key={name}>
          <div
            style={{ top: `${index * 20}px`, left: 5, position: 'absolute' }}
          >
            {name}
          </div>
          <Handle
            id={name}
            type="target"
            position={Position.Left}
            style={{ top: `${index * 20}px`, borderRadius: 0 }}
          />
        </React.Fragment>
      ))}
      <div>{data.label}</div>
      <Handle
        type="source"
        position={Position.Right}
        id="a"
        style={{ top: '30%', borderRadius: 0 }}
      />
    </div>
  );
};

const nodeTypes = {
  special: CustomNodeComponent,
};

const compileGraphAsync = async (
  ctx: EngineContext<RuntimeContext>,
  lGraph: any
): Promise<{
  compileMs: string;
  fragmentResult: string;
  vertexResult: string;
}> =>
  new Promise((resolve, reject) => {
    setTimeout(() => {
      console.warn(
        'Compiling!',
        graph,
        'from lGraph',
        lGraph,
        'for nodes',
        ctx.nodes
      );

      // const engineContext: EngineContext = {
      //   renderer,
      //   nodes: {},
      // };

      const allStart = performance.now();

      // mesh.material = material;
      // renderer.compile(scene, camera);

      // const compileStart = performance.now();
      // engineContext.nodes['2'] = {
      //   fragment: renderer.properties.get(mesh.material).programs.values().next()
      //     .value.fragmentShader,
      //   vertex: renderer.properties.get(mesh.material).programs.values().next()
      //     .value.vertexShader,
      //   // console.log('vertexProgram', vertexProgram);
      // };
      // console.log('engineContext', engineContext);
      const result = compileGraph(ctx, threngine, graph);
      const fragmentResult = generate(
        shaderSectionsToAst(result.fragment).program
      );
      const vertexResult = generate(shaderSectionsToAst(result.vertex).program);

      const now = performance.now();
      console.log(`Compilation took:
-------------------
total: ${(now - allStart).toFixed(3)}ms
-------------------
`);
      // three renderer compile: ${(compileStart - allStart).toFixed(3)}ms
      // frog compile: ${(now - compileStart).toFixed(3)}ms
      // -------------------`);

      // TODO: Right now the three shader doesn't output vPosition, and it's not
      // supported by shaderfrog to merge outputs in vertex shaders yet

      const { renderer, threeTone, mesh } = ctx.runtime;
      const vertex = renderer
        .getContext()
        .getShaderSource(ctx.runtime.cache.nodes['2'].vertexRef)
        ?.replace(
          'attribute vec3 position;',
          'attribute vec3 position; varying vec3 vPosition;'
        )
        .replace('void main() {', 'void main() {\nvPosition = position;\n');

      console.log('oh hai birfday boi boi boiiiii');

      const os1: any = graph.nodes.find(
        (node) => node.name === 'Outline Shader F'
      )?.id;
      const os2: any = graph.nodes.find(
        (node) => node.name === 'Outline Shader V'
      )?.id;
      const fs1: any = graph.nodes.find(
        (node) => node.name === 'Fireball F'
      )?.id;
      const fs2: any = graph.nodes.find(
        (node) => node.name === 'Fireball V'
      )?.id;
      const fc: any = graph.nodes.find(
        (node) => node.name === 'Fluid Circles'
      )?.id;
      const pu: any = graph.nodes.find(
        (node) => node.name === 'Purple Metal'
      )?.id;
      const edgeId: any = graph.nodes.find(
        (node) => node.name === 'Triplanar'
      )?.id;
      const hs1: any = graph.nodes.find(
        (node) => node.name === 'Fake Heatmap F'
      )?.id;
      const hs2: any = graph.nodes.find(
        (node) => node.name === 'Fake Heatmap V'
      )?.id;

      const uniforms = {
        ...three.ShaderLib.phong.uniforms,
        ...three.ShaderLib.toon.uniforms,
        diffuse: { value: new three.Color(0xffffff) },
        // ambientLightColor: { value: new three.Color(0xffffff) },
        color: { value: new three.Color(0xffffff) },
        gradientMap: { value: threeTone },
        // map: { value: new three.TextureLoader().load('/contrast-noise.png') },
        image: {
          value: new three.TextureLoader().load('/2/contrast-noise.png'),
        },
        [`tExplosion_${fs1}`]: {
          value: new three.TextureLoader().load('/2/explosion.png'),
        },
        [`tExplosion_${fs2}`]: {
          value: new three.TextureLoader().load('/2/explosion.png'),
        },
        time: { value: 0 },
        resolution: { value: 0.5 },
        speed: { value: 3 },
        opacity: { value: 1 },
        lightPosition: { value: new three.Vector3(10, 10, 10) },

        roughness: { value: 0.046 },
        metalness: { value: 0.491 },
        clearcoat: { value: 1 },

        [`brightnessX_${pu}`]: { value: 1.0 },
        [`permutations_${pu}`]: { value: 10 },
        [`iterations_${pu}`]: { value: 1 },
        [`uvScale_${pu}`]: { value: new three.Vector2(1, 1) },
        [`color1_${pu}`]: { value: new three.Vector3(0.7, 0.3, 0.8) },
        [`color2_${pu}`]: { value: new three.Vector3(0.1, 0.2, 0.9) },
        [`color3_${pu}`]: { value: new three.Vector3(0.8, 0.3, 0.8) },

        [`scale_${hs1}`]: { value: 1.2 },
        [`power_${hs1}`]: { value: 1 },
        [`scale_${hs2}`]: { value: 1.2 },
        [`power_${hs2}`]: { value: 1 },

        [`baseRadius_${fc}`]: { value: 1 },
        [`colorVariation_${fc}`]: { value: 0.6 },
        [`brightnessVariation_${fc}`]: { value: 0 },
        [`variation_${fc}`]: { value: 8 },
        [`backgroundColor_${fc}`]: { value: new three.Vector3(0.0, 0.0, 0.5) },

        [`fireSpeed_${fs1}`]: { value: 0.6 },
        [`fireSpeed_${fs2}`]: { value: 0.6 },
        [`pulseHeight_${fs1}`]: { value: 0.1 },
        [`pulseHeight_${fs2}`]: { value: 0.1 },
        [`displacementHeight_${fs1}`]: { value: 0.2 },
        [`displacementHeight_${fs2}`]: { value: 0.2 },
        [`turbulenceDetail_${fs1}`]: { value: 0.8 },
        [`turbulenceDetail_${fs2}`]: { value: 0.8 },
        [`brightness`]: { value: 0.8 },

        [`cel0_${edgeId}`]: { value: 1.0 },
        [`cel1_${edgeId}`]: { value: 1.0 },
        [`cel2_${edgeId}`]: { value: 1.0 },
        [`cel3_${edgeId}`]: { value: 1.0 },
        [`cel4_${edgeId}`]: { value: 1.0 },
        [`celFade_${edgeId}`]: { value: 1.0 },
        [`edgeSteepness_${edgeId}`]: { value: 0.1 },
        [`edgeBorder_${edgeId}`]: { value: 0.1 },
        [`color_${edgeId}`]: { value: 1.0 },

        [`color_${os1}`]: { value: new three.Vector3(1, 1, 1) },
        [`color_${os2}`]: { value: new three.Vector3(1, 1, 1) },
        [`start_${os1}`]: { value: 0 },
        [`start_${os2}`]: { value: 0 },
        [`end_${os1}`]: { value: 1 },
        [`end_${os2}`]: { value: 1 },
        [`alpha_${os1}`]: { value: 1 },
        [`alpha_${os2}`]: { value: 1 },
      };
      console.log('applying uniforms', uniforms);

      // the before code
      const newMat = new three.RawShaderMaterial({
        name: 'ShaderFrog Phong Material',
        lights: true,
        uniforms,
        vertexShader: vertexResult,
        fragmentShader: fragmentResult,
        // onBeforeCompile: () => {
        //   console.log('raw shader precomp');
        // },
      });

      // @ts-ignore
      mesh.material = newMat;

      resolve({
        compileMs: (now - allStart).toFixed(3),
        fragmentResult,
        vertexResult,
      });
    }, 0);
  });

type ChildProps = { children?: React.ReactNode; onSelect?: Function };
const Tabs = ({ children, onSelect }: ChildProps) => {
  const [selected, setSelected] = useState<number>(0);
  return (
    <>
      {React.Children.map<ReactNode, ReactNode>(
        children,
        (child) =>
          React.isValidElement(child) &&
          React.cloneElement(child, {
            selected,
            setSelected,
            onSelect,
          })
      )}
    </>
  );
};

type TabGroupProps = {
  children?: React.ReactNode;
  selected?: number;
  className?: string;
  setSelected?: Function;
  onSelect?: Function;
};
const TabGroup = ({
  children,
  selected,
  setSelected,
  onSelect,
  ...props
}: TabGroupProps) => {
  return (
    <div {...props} className={cx(styles.tabs, props.className)}>
      {React.Children.map<ReactNode, ReactNode>(
        children,
        (child, index) =>
          React.isValidElement(child) &&
          React.cloneElement(child, {
            selected,
            setSelected,
            onSelect,
            index,
          })
      )}
    </div>
  );
};

type TabProps = {
  children?: React.ReactNode;
  selected?: number;
  className?: any;
  setSelected?: Function;
  onSelect?: Function;
  index?: number;
};
const Tab = ({
  children,
  selected,
  setSelected,
  className,
  onSelect,
  index,
  ...props
}: TabProps) => {
  return (
    <div
      {...props}
      className={cx(className, styles.tab, {
        [styles.selected]: selected === index,
      })}
      onClick={(event) => {
        event.preventDefault();
        onSelect && onSelect(index);
        setSelected && setSelected(index);
      }}
    >
      {children}
    </div>
  );
};

type TabPanelsProps = { selected?: number; children: React.ReactNode };
const TabPanels = ({ selected, children }: TabPanelsProps) => (
  <>
    {React.Children.map<ReactNode, ReactNode>(children, (child, index) =>
      selected === index ? child : null
    )}
  </>
);
type TabPanelProps = { children: React.ReactNode; className?: string };
const TabPanel = ({ children, ...props }: TabPanelProps) => {
  return <div {...props}>{children}</div>;
};

type AnyFn = (...args: any) => any;
function useThrottle(callback: AnyFn, delay: number) {
  const cbRef = useRef<AnyFn>(callback);

  // use mutable ref to make useCallback/throttle not depend on `cb` dep
  useEffect(() => {
    cbRef.current = callback;
  }, [callback]);

  return useCallback(
    throttle((...args) => cbRef.current(...args), delay),
    [delay]
  );
}

const ThreeScene: React.FC = () => {
  const graphRef = useRef<HTMLCanvasElement>(null);
  // const threeDomRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{ [key: string]: any }>({});
  const rightSplit = useRef<HTMLDivElement>(null);
  // const [mesh, setMesh] = useState<three.Mesh | undefined>();

  const [lgInitted, setLgInitted] = useState<boolean>(false);
  const [lgNodesAdded, setLgNodesAdded] = useState<boolean>(false);
  // const [lighting, setLighting] = useState<string>('a');
  const [tabIndex, setTabIndex] = useState<number>(0);
  const [compiling, setCompiling] = useState<boolean>(true);

  const [activeShader, setActiveShader] = useState<Node>(graph.nodes[0]);
  const [shaderUnsaved, setShaderUnsaved] = useState<string>(
    activeShader.source
  );
  const [preprocessed, setPreprocessed] = useState<string | undefined>('');
  const [preprocessedVert, setPreprocessedVert] = useState<string | undefined>(
    ''
  );
  const [vertex, setVertex] = useState<string | undefined>('');
  const [original, setOriginal] = useState<string | undefined>('');
  const [originalVert, setOriginalVert] = useState<string | undefined>('');
  const [finalFragment, setFinalFragment] = useState<string | undefined>('');

  const [state, setState, extendState] = useAsyncExtendedState<any>({
    fragError: null,
    vertError: null,
    compileMs: null,
    width: 0,
    height: 0,
    elements: [],
  });

  const [ctx, setCtx] = useState<EngineContext<RuntimeContext>>({
    debuggingNonsense: {},
    nodes: {},
    runtime: {
      lGraph: null,
      three: null,
      renderer: null,
      material: null,
      mesh: null,
      scene: null,
      camera: null,
      index: 0,
      threeTone: null,
      cache: { nodes: {} },
    },
  });

  const { scene, camera, threeDomRef, renderer } = useThree((time) => {
    const { current: mesh } = meshRef;
    if (!mesh) {
      return;
    }
    // renderer.render(scene, camera);
    if (sceneRef.current.shadersUpdated) {
      const gl = renderer.getContext();

      const fragmentRef = renderer.properties
        .get(mesh.material)
        .programs.values()
        .next().value.fragmentShader;
      const vertexRef = renderer.properties
        .get(mesh.material)
        .programs.values()
        .next().value.vertexShader;

      extendState({
        fragError: gl.getShaderInfoLog(fragmentRef).trim(),
        vertError: gl.getShaderInfoLog(vertexRef).trim(),
      });

      sceneRef.current.shadersUpdated = false;
    }
    // mesh.rotation.x = time * 0.0003;
    // mesh.rotation.y = time * -0.0003;
    // mesh.rotation.z = time * 0.0003;
    if (sceneRef.current?.lights) {
      const light = sceneRef.current.lights[0];
      light.position.x = 1.2 * Math.sin(time * 0.001);
      light.position.y = 1.2 * Math.cos(time * 0.001);
      light.lookAt(
        new three.Vector3(Math.cos(time * 0.0015), Math.sin(time * 0.0015), 0)
      );

      if (sceneRef.current.lights.length > 2) {
        const light = sceneRef.current.lights[1];
        light.position.x = 1.3 * Math.cos(time * 0.0015);
        light.position.y = 1.3 * Math.sin(time * 0.0015);

        light.lookAt(
          new three.Vector3(Math.cos(time * 0.0025), Math.sin(time * 0.0025), 0)
        );
      }
    }
    // @ts-ignore
    if (mesh.material?.uniforms?.time) {
      mesh.material.uniforms.time.value = time * 0.001;
    }
  });

  const [previewObject, setPreviewObject] = useState('torusknot');
  const meshRef = useRef<three.Mesh>();
  useMemo(() => {
    if (meshRef.current) {
      scene.remove(meshRef.current);
    }
    if (previewObject === 'torusknot') {
      const geometry = new three.TorusKnotGeometry(0.6, 0.25, 100, 16);
      meshRef.current = new three.Mesh(geometry);
      scene.add(meshRef.current);
    }
  }, [previewObject, scene]);

  const threeTone = useMemo(() => {
    const image = new three.TextureLoader().load('/2/3tone.jpg');
    image.minFilter = three.NearestFilter;
    image.magFilter = three.NearestFilter;
  }, []);

  // Setup?
  useEffect(() => {
    // if (!graphRef.current) {
    //   return;
    // }

    /*
    let lGraph = ctx.runtime.lGraph;
    if (!lgInitted) {
      console.warn('----- LGraph Initting!!! -----');
      setLgInitted(true);
      lGraph = new LiteGraph.LGraph();
      lGraph.onAction = (action: any, params: any) => {
        console.log({ action, params });
      };
      new LiteGraph.LGraphCanvas(graphRef.current, lGraph);
      lGraph.start();
    }
    */

    // const scene = new three.Scene();
    // const camera = new three.PerspectiveCamera(75, 1 / 1, 0.1, 1000);
    // camera.position.set(0, 0, 3);
    // camera.lookAt(0, 0, 0);
    // scene.add(camera);

    // const threeTone = new three.TextureLoader().load('/2/3tone.jpg');
    // threeTone.minFilter = three.NearestFilter;
    // threeTone.magFilter = three.NearestFilter;

    // const material = new three.MeshToonMaterial({
    // const material = new three.MeshPhongMaterial({
    //   color: 0x00ff00,
    //   map: new three.Texture(),
    //   gradientMap: threeTone,
    // });
    // const geometry = new three.SphereBufferGeometry(1, 32, 32);
    // const geometry = new three.TorusKnotGeometry(0.6, 0.25, 100, 16);
    // // const mesh = new three.Mesh(geometry, material);
    // const mesh = new three.Mesh(geometry);
    // scene.add(mesh);

    // sceneRef.current.scene = scene;
    // sceneRef.current.mesh = mesh;

    const ambientLight = new three.AmbientLight(0x020202);
    scene.add(ambientLight);

    // const renderer = new three.WebGLRenderer();

    const ctx = {
      runtime: {
        lGraph: null,
        three,
        renderer,
        material: null,
        mesh,
        scene,
        camera,
        index: 0,
        threeTone,
        cache: { nodes: {} },
      },
      nodes: {},
      debuggingNonsense: {},
    };
    setCtx(ctx);

    console.log('Object.values(ctx.nodes)', Object.values(ctx.nodes));
  }, []);

  const [lights, setlights] = useState<string>('point');
  const lightsRef = useRef<three.Light[]>([]);
  useMemo(() => {
    lightsRef.current.forEach((light) => scene.remove(light));

    if (lights === 'point') {
      const pointLight = new three.PointLight(0xffffff, 1);
      pointLight.position.set(0, 0, 1);
      scene.add(pointLight);
      const helper = new three.PointLightHelper(pointLight, 0.1);
      scene.add(helper);
      sceneRef.current.lights = [pointLight, helper];
    } else {
      const light = new three.SpotLight(0x00ff00, 1, 3, 0.4, 1);
      light.position.set(0, 0, 2);
      scene.add(light);

      const helper = new three.SpotLightHelper(
        light,
        new three.Color(0x00ff00)
      );
      scene.add(helper);

      const light2 = new three.SpotLight(0xff0000, 1, 4, 0.4, 1);
      light2.position.set(0, 0, 2);
      scene.add(light2);

      const helper2 = new three.SpotLightHelper(
        light2,
        new three.Color(0xff0000)
      );
      scene.add(helper2);

      sceneRef.current.lights = [light, light2, helper, helper2];
    }
  }, [lights, scene]);

  useEffect(() => {
    if (!ctx.runtime) {
      return;
    }
    computeGraphContext(ctx, threngine, graph);

    let engines = 0;
    let maths = 0;
    let outputs = 0;
    let shaders = 0;
    const spacing = 200;

    extendState({
      elements: [
        ...graph.nodes.map((node: any, index) => ({
          id: node.id,
          // @ts-ignore
          data: { label: node.name, inputs: ctx.nodes[node.id]?.inputs || [] },
          type: 'special',
          position:
            node.type === ShaderType.output
              ? { x: spacing * 2, y: outputs++ * 100 }
              : node.type === ShaderType.phong || node.type === ShaderType.toon
              ? { x: spacing, y: engines++ * 100 }
              : node.type === ShaderType.add ||
                node.type === ShaderType.multiply
              ? { x: 0, y: maths++ * 100 }
              : { x: -spacing, y: shaders++ * 100 },
        })),
        ...graph.edges.map((edge) => ({
          id: `${edge.to}-${edge.from}`,
          source: edge.from,
          targetHandle: edge.input,
          target: edge.to,
        })),
      ],
    });
  }, [ctx]);

  // useEffect(() => {
  //   if (!ctx.runtime.renderer) {
  //     return;
  //   }
  //   const { renderer, scene, camera, mesh } = ctx.runtime;
  //   let controls: OrbitControls;

  //   if (threeDomRef.current) {
  //     threeDomRef.current.appendChild(renderer.domElement);
  //     controls = new OrbitControls(camera, renderer.domElement);
  //     controls.update();
  //     sceneRef.current.controls = controls;
  //     // setControls(controls);
  //   }

  //   // const animate = (time: number) => {
  //   //   // sceneRef.current.frame = requestAnimationFrame(animate);
  //   // };
  //   // animate(0);

  //   // return () => {
  //   //   // const { current } = threeDomRef;
  //   //   // console.log('unmounting');
  //   //   // if (current) {
  //   //   //   current.removeChild(renderer.domElement);
  //   //   // }
  //   //   if (sceneRef.current) {
  //   //     sceneRef.current.controls.dispose();
  //   //     console.log('cancel');
  //   //     cancelAnimationFrame(sceneRef.current.frame);
  //   //   }
  //   // };
  // }, [ctx, tabIndex]);

  // Compile
  useEffect(() => {
    if (!ctx.runtime.renderer) {
      return;
    }
    const { mesh, renderer, threeTone, lGraph } = ctx.runtime;

    setCompiling(true);
    if (lgNodesAdded) {
      graph.edges = Object.values(lGraph.links).reduce<Edge[]>(
        (edges: any, link: any) => {
          const input = Object.keys(ctx.nodes[link.target_id]?.inputs || {})[
            link.target_slot
          ];
          if (input) {
            return [
              ...edges,
              {
                from: link.origin_id.toString(),
                to: link.target_id.toString(),
                output: 'main',
                input,
                type: 'fragment',
              },
            ];
          } else {
            console.warn(
              `For link {from: ${link.origin_id.toString()}, to: ${link.target_id.toString()}} there is no input ${
                link.target_slot
              } in target id ${link.target_id}. Nodes:`,
              ctx.nodes,
              'Links: ',
              lGraph.links
            );
            return edges;
          }
        },
        []
      );
    }

    compileGraphAsync(ctx, lGraph).then(
      ({ compileMs, vertexResult, fragmentResult }) => {
        sceneRef.current.shadersUpdated = true;
        setCompiling(false);
        setFinalFragment(fragmentResult);
        setVertex(vertexResult);
        // Mutated from the processAst call for now
        setPreprocessed(ctx.debuggingNonsense.fragmentPreprocessed);
        setPreprocessedVert(ctx.debuggingNonsense.vertexPreprocessed);
        setOriginal(ctx.debuggingNonsense.fragmentSource);
        setOriginalVert(ctx.debuggingNonsense.vertexSource);
        extendState({ compileMs });
      }
    );
  }, [ctx, lighting]);

  // useEffect(() => {
  //   if (!ctx.runtime || !ctx.runtime.lGraph || !originalVert || lgNodesAdded) {
  //     return;
  //   }
  //   console.warn('creating lgraph nodes!');
  //   const { lGraph } = ctx.runtime;
  //   lGraph.clear();
  //   let engines = 0;
  //   let maths = 0;
  //   let outputs = 0;
  //   let shaders = 0;
  //   const spacing = 200;
  //   const lNodes: { [key: string]: LiteGraph.LGraphNode } = {};
  //   graph.nodes.forEach((node) => {
  //     let x = 0;
  //     let y = 0;
  //     let lNode: LiteGraph.LGraphNode;
  //     if (node.type === ShaderType.output) {
  //       x = spacing * 2;
  //       y = outputs * 100;
  //       lNode = LiteGraph.LiteGraph.createNode('basic/output');
  //       outputs++;
  //     } else if (
  //       node.type === ShaderType.phong ||
  //       node.type === ShaderType.toon
  //     ) {
  //       x = spacing;
  //       y = engines * 100;
  //       lNode = LiteGraph.LiteGraph.createNode('basic/shader');
  //       engines++;
  //     } else if (
  //       node.type === ShaderType.add ||
  //       node.type === ShaderType.multiply
  //     ) {
  //       x = 0;
  //       y = maths * 100;
  //       lNode = LiteGraph.LiteGraph.createNode('basic/add');
  //       maths++;
  //     } else {
  //       x = -spacing;
  //       y = shaders * 100;
  //       lNode = LiteGraph.LiteGraph.createNode('basic/shader');
  //       shaders++;
  //     }
  //     lNode.pos = [x, y];
  //     lNode.title = node.name;
  //     // lNode.properties = { id: node.id };
  //     if (ctx.nodes[node.id]) {
  //       Object.keys(ctx.nodes[node.id].inputs || {}).forEach((input) => {
  //         lNode.addInput(input, 'string');
  //       });
  //     }
  //     lNode.id = parseInt(node.id, 10);
  //     lGraph.add(lNode);
  //     lNode.onSelected = () => {
  //       setActiveShader(node);
  //       setShaderUnsaved(node.source);
  //     };
  //     // lNode.onConnectionsChange = (
  //     //   type,
  //     //   slotIndex,
  //     //   isConnected,
  //     //   link,
  //     //   ioSlot
  //     // ) => {
  //     //   console.log({ type, slotIndex, isConnected, link, ioSlot });
  //     // };
  //     // lNode.setValue(4.5);
  //     lNodes[node.id] = lNode;
  //   });

  //   graph.edges.forEach((edge) => {
  //     lNodes[edge.from].connect(0, lNodes[edge.to], edge.input);
  //   });
  //   setLgNodesAdded(true);

  //   console.log(lGraph);

  //   // Note that after changing the lighting, a recompile needs to happen before
  //   // the next render, or what seems to happen is the shader has either the
  //   // spotLights or pointLights uniform, and three tries to "upload" them in
  //   // StructuredUniform.prototype.setValue, because there's a
  //   // StructuredUniform.map.position/coneCos etc, but there's no
  //   // pointLights/spotLights present in the uniforms array maybe?
  // }, [ctx, originalVert]);

  const resizeThree = useThrottle(() => {
    if (rightSplit.current && ctx.runtime?.camera) {
      const { camera, renderer } = ctx.runtime;
      const { width, height } = rightSplit.current.getBoundingClientRect();
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      extendState({ width, height });
    }
  }, 100);

  useEffect(resizeThree, [ctx.runtime?.camera]);

  return (
    <div className={styles.container}>
      <SplitPane split="vertical" onChange={resizeThree}>
        <div className={styles.splitInner}>
          {/* <canvas ref={graphRef}></canvas> */}
          <ReactFlow
            elements={state.elements}
            style={flowStyles}
            nodeTypes={nodeTypes}
          >
            <Background variant={BackgroundVariant.Lines} gap={25} size={0.5} />
          </ReactFlow>
          <button
            className={styles.button}
            onClick={() => {
              setCompiling(true);
              // @ts-ignore
              setCtx({ ...ctx, index: ctx.index + 1 });
            }}
          >
            Save Graph
          </button>

          <CodeEditor
            className={styles.shader}
            onChange={(event: any) => setShaderUnsaved(event.target.value)}
          >
            {shaderUnsaved}
          </CodeEditor>
          <button
            className={styles.button}
            onClick={() => {
              const found = graph.nodes.find(
                ({ id }) => activeShader.id === id
              );
              if (found) {
                setCompiling(true);
                found.source = shaderUnsaved;
                // @ts-ignore
                setCtx({ ...ctx, index: ctx.index + 1 });
              }
            }}
          >
            Save Shader
          </button>
        </div>
        {/* other pane */}
        <div ref={rightSplit} className={styles.splitInner}>
          <Tabs onSelect={setTabIndex}>
            <TabGroup>
              <Tab>Scene</Tab>
              <Tab
                className={{
                  [styles.errored]: state.fragError || state.vertError,
                }}
              >
                Final Shader Source
              </Tab>
            </TabGroup>
            <TabPanels>
              <TabPanel className={styles.scene}>
                <div ref={threeDomRef}></div>
                <div className={styles.sceneLabel}>
                  {compiling && 'Compiling...'}
                  {!compiling && `Complile took ${state.compileMs}ms`}
                </div>
                <div className={styles.sceneControls}>
                  Preview with:
                  <button
                    className={styles.button}
                    onClick={() => setLighting('a')}
                    disabled={lighting === 'a'}
                  >
                    Point Light
                  </button>
                  <button
                    className={styles.button}
                    onClick={() => setLighting('b')}
                    disabled={lighting === 'b'}
                  >
                    Spot Lights
                  </button>
                </div>
              </TabPanel>
              <TabPanel>
                <Tabs>
                  <TabGroup className={styles.secondary}>
                    <Tab>3Frag</Tab>
                    <Tab>3Vert</Tab>
                    <Tab>Pre 3Frag</Tab>
                    <Tab>Pre 3Vert</Tab>
                    <Tab className={{ [styles.errored]: state.vertError }}>
                      Vert
                    </Tab>
                    <Tab className={{ [styles.errored]: state.fragError }}>
                      Frag
                    </Tab>
                  </TabGroup>
                  <TabPanels>
                    <TabPanel>
                      <CodeEditor className={styles.code} readOnly>
                        {original}
                      </CodeEditor>
                    </TabPanel>
                    <TabPanel>
                      <CodeEditor className={styles.code} readOnly>
                        {originalVert}
                      </CodeEditor>
                    </TabPanel>
                    <TabPanel>
                      <CodeEditor className={styles.code} readOnly>
                        {preprocessed}
                      </CodeEditor>
                    </TabPanel>
                    <TabPanel>
                      <CodeEditor className={styles.code} readOnly>
                        {preprocessedVert}
                      </CodeEditor>
                    </TabPanel>
                    <TabPanel>
                      {state.vertError && (
                        <div className={styles.codeError}>
                          {state.vertError}
                        </div>
                      )}
                      <CodeEditor readOnly>{vertex}</CodeEditor>
                    </TabPanel>
                    <TabPanel>
                      {state.fragError && (
                        <div className={styles.codeError}>
                          {state.fragError}
                        </div>
                      )}
                      <CodeEditor readOnly>{finalFragment}</CodeEditor>
                    </TabPanel>
                  </TabPanels>
                </Tabs>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </div>
      </SplitPane>
    </div>
  );
};

const CodeEditor = (props: any) => (
  <div className={styles.editor}>
    <div className={styles.sidebar}>
      {props.children
        .toString()
        .split('\n')
        .map((_: any, index: number) => `${index + 1}\n`)}
    </div>
    <textarea
      className={styles.code}
      {...props}
      value={props.children}
    ></textarea>
  </div>
);

export default ThreeScene;
