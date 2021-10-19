import styles from './editor.module.css';
import 'litegraph.js/css/litegraph.css';
import cx from 'classnames';
import LiteGraph from 'litegraph.js';
import { generate } from '@shaderfrog/glsl-parser';
import React, {
  FunctionComponent,
  ReactNode,
  useEffect,
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
} from '../nodestuff';
import { compileGraph, NodeInputs } from '../graph';

import { phongNode, toonNode, threngine } from '../threngine';
import purpleNoiseNode from './purpleNoiseNode';
import colorShaderNode from './colorShaderNode';
import fireNode from './fireNode';
import triplanarNode from './triplanarNode';

const width = 600;
const height = 600;

type EngineContext = {
  lGraph: LiteGraph.LGraph;
  index: number;
  three: any;
  threeTone: any;
  mesh: any;
  scene: any;
  camera: any;
  fragmentPreprocessed?: string;
  fragmentSource?: string;
  renderer: any;
  nodes: {
    [nodeId: string]: {
      fragment: string;
      vertex: string;
      inputs: NodeInputs[];
    };
  };
};

const graph: Graph = {
  nodes: [
    outputNode('1', {}),
    phongNode('2', 'Phong', {}),
    toonNode('3', 'Toon', {}),
    colorShaderNode('4'),
    purpleNoiseNode('5'),
    fireNode('6'),
    addNode('7', {}),
    multiplyNode('8', {}),
    triplanarNode('9'),
  ],
  edges: [
    { from: '2', to: '1', output: 'main', input: 'color' },
    // TODO: Could be cool to try outline shader https://shaderfrog.com/app/view/4876
    // TODO: Try pbr node demo from threejs
    // TODO: Support vertex :O
    // TODO: Have uniforms added per shader in the graph
    {
      from: '7',
      to: '2',
      output: 'main',
      input: 'texture2d_0',
    },
    {
      from: '4',
      to: '7',
      output: 'main',
      input: 'a',
    },
    {
      from: '5',
      to: '7',
      output: 'main',
      input: 'b',
    },
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
  setSelected?: Function;
  onSelect?: Function;
};
const TabGroup = ({
  children,
  selected,
  setSelected,
  onSelect,
}: TabGroupProps) => {
  return (
    <div className={styles.tabs}>
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
  setSelected?: Function;
  onSelect?: Function;
  index?: number;
};
const Tab = ({
  children,
  selected,
  setSelected,
  onSelect,
  index,
  ...props
}: TabProps) => {
  return (
    <div
      {...props}
      className={cx(styles.tab, { [styles.selected]: selected === index })}
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
type TabPanelProps = { children: React.ReactNode };
const TabPanel = ({ children }: TabPanelProps) => {
  return <>{children}</>;
};

const ThreeScene: React.FC = () => {
  const graphRef = useRef<HTMLCanvasElement>(null);
  const domRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>();
  const sceneData = useRef<{ [key: string]: any }>({});

  const edgStr = JSON.stringify(graph.edges);
  const [lgInitted, setLgInitted] = useState<boolean>(false);
  const [lgNodesAdded, setLgNodesAdded] = useState<boolean>(false);
  const [lighting, setLighting] = useState<string>('a');
  const [tabIndex, setTabIndex] = useState<number>(0);

  const [activeShader, setActiveShader] = useState<Node>(graph.nodes[0]);
  const [shaderUnsaved, setShaderUnsaved] = useState<string>(
    activeShader.fragmentSource
  );
  const [jsonError, setJsonError] = useState<boolean>(false);
  const [selection, setSelection] = useState<string>('final');
  const [preprocessed, setPreprocessed] = useState<string | undefined>('');
  const [vertex, setVertex] = useState<string | undefined>('');
  const [original, setOriginal] = useState<string | undefined>('');
  const [finalFragment, setFinalFragment] = useState<string | undefined>('');

  const [ctx, setCtx] = useState<EngineContext | undefined>();

  // Setup?
  useEffect(() => {
    if (!graphRef.current) {
      return;
    }

    let lGraph = ctx?.lGraph;
    if (!lgInitted) {
      console.warn('----- LGraph Initting!!! -----');
      setLgInitted(true);
      lGraph = new LiteGraph.LGraph();
      lGraph.onAction = (action, params) => {
        console.log({ action, params });
      };
      new LiteGraph.LGraphCanvas(graphRef.current, lGraph);
      lGraph.start();
    }

    const scene = new three.Scene();
    const camera = new three.PerspectiveCamera(75, 1 / 1, 0.1, 1000);
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);
    scene.add(camera);

    const threeTone = new three.TextureLoader().load('/3tone.jpg');
    threeTone.minFilter = three.NearestFilter;
    threeTone.magFilter = three.NearestFilter;

    // const material = new three.MeshToonMaterial({
    // const material = new three.MeshPhongMaterial({
    //   color: 0x00ff00,
    //   map: new three.Texture(),
    //   gradientMap: threeTone,
    // });
    // const geometry = new three.SphereBufferGeometry(1, 32, 32);
    const geometry = new three.TorusKnotGeometry(0.6, 0.25, 100, 16);
    // const mesh = new three.Mesh(geometry, material);
    const mesh = new three.Mesh(geometry);
    scene.add(mesh);

    sceneData.current.scene = scene;
    sceneData.current.mesh = mesh;

    const ambientLight = new three.AmbientLight(0x000000);
    scene.add(ambientLight);

    const renderer = new three.WebGLRenderer();
    renderer.setSize(width, height);

    setCtx({
      lGraph,
      three,
      renderer,
      // material,
      mesh,
      scene,
      camera,
      index: 0,
      threeTone,
      nodes: {},
    });
  }, []);

  useEffect(() => {
    if (!ctx) {
      return;
    }
    const { renderer, scene, camera, mesh } = ctx;

    if (domRef.current) {
      domRef.current.appendChild(renderer.domElement);
    }

    const animate = (time: number) => {
      renderer.render(scene, camera);
      // mesh.rotation.x = time * 0.0003;
      // mesh.rotation.y = time * -0.0003;
      // mesh.rotation.z = time * 0.0003;
      if (sceneData.current?.lights) {
        const light = sceneData.current.lights[0];
        light.position.x = 1.2 * Math.sin(time * 0.001);
        light.position.y = 1.2 * Math.cos(time * 0.001);
        light.lookAt(
          new three.Vector3(Math.cos(time * 0.0015), Math.sin(time * 0.0015), 0)
        );

        if (sceneData.current.lights.length > 2) {
          const light = sceneData.current.lights[1];
          light.position.x = 1.3 * Math.cos(time * 0.0015);
          light.position.y = 1.3 * Math.sin(time * 0.0015);

          light.lookAt(
            new three.Vector3(
              Math.cos(time * 0.0025),
              Math.sin(time * 0.0025),
              0
            )
          );
        }
      }
      // @ts-ignore
      if (mesh.material?.uniforms?.time) {
        mesh.material.uniforms.time.value = time * 0.001;
      }
      requestRef.current = requestAnimationFrame(animate);
    };
    console.log('mounting');
    animate(0);

    return () => {
      // const { current } = domRef;
      // console.log('unmounting');
      // if (current) {
      //   current.removeChild(renderer.domElement);
      // }
      if (requestRef.current) {
        console.log('cancel');
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [ctx, tabIndex]);

  useEffect(() => {
    const { lights, scene } = sceneData.current;
    (lights || []).forEach((light: any) => {
      scene.remove(light);
    });

    if (lighting === 'a') {
      const pointLight = new three.PointLight(0xffffff, 1);
      pointLight.position.set(0, 0, 1);
      scene.add(pointLight);
      const helper = new three.PointLightHelper(pointLight, 0.1);
      scene.add(helper);
      sceneData.current.lights = [pointLight, helper];
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

      sceneData.current.lights = [light, light2, helper, helper2];
    }
    // TODO: Exploring changing lighting issue
    sceneData.current.mesh.material.needsUpdate = true;
    console.log(sceneData.current.mesh.material);
  }, [lighting]);

  // Compile
  useEffect(() => {
    setJsonError(false);

    if (!ctx) {
      return;
    }
    const { mesh, renderer, threeTone, lGraph } = ctx;

    try {
      if (lgNodesAdded) {
        graph.edges = Object.values(lGraph.links).map((link) => ({
          from: link.origin_id.toString(),
          to: link.target_id.toString(),
          output: 'main',
          input: Object.keys(ctx.nodes[link.target_id].inputs)[
            link.target_slot
          ],
        }));
      }
    } catch (e) {
      console.error(e);
      setJsonError(true);
      return;
    }
    console.log('rendering!', graph);

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
    const fragmentResult = generate(shaderSectionsToAst(result).program);

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
    console.log(ctx.nodes);
    const vertex = renderer
      .getContext()
      .getShaderSource(ctx.nodes['2'].vertex)
      ?.replace(
        'attribute vec3 position;',
        'attribute vec3 position; varying vec3 vPosition;'
      )
      .replace('void main() {', 'void main() {\nvPosition = position;\n');

    console.log('oh hai birfday boi boi boiiiii');

    const pu: any = graph.nodes.find(
      (node) => node.name === 'Noise Shader'
    )?.id;
    const edgeId: any = graph.nodes.find(
      (node) => node.name === 'Triplanar'
    )?.id;

    const uniforms = {
      ...three.ShaderLib.phong.uniforms,
      ...three.ShaderLib.toon.uniforms,
      diffuse: { value: new three.Color(0xffffff) },
      // ambientLightColor: { value: new three.Color(0xffffff) },
      color: { value: new three.Color(0xffffff) },
      gradientMap: { value: threeTone },
      // map: { value: new three.TextureLoader().load('/contrast-noise.png') },
      image: { value: new three.TextureLoader().load('/contrast-noise.png') },
      time: { value: 0 },
      resolution: { value: 0.5 },
      speed: { value: 3 },
      opacity: { value: 1 },
      lightPosition: { value: new three.Vector3(10, 10, 10) },

      [`brightnessX_${pu}`]: { value: 1.0 },
      [`permutations_${pu}`]: { value: 10 },
      [`iterations_${pu}`]: { value: 1 },
      [`uvScale_${pu}`]: { value: new three.Vector2(1, 1) },
      [`color1_${pu}`]: { value: new three.Vector3(0.7, 0.3, 0.8) },
      [`color2_${pu}`]: { value: new three.Vector3(0.1, 0.2, 0.9) },
      [`color3_${pu}`]: { value: new three.Vector3(0.8, 0.3, 0.8) },

      [`cel0_${edgeId}`]: { value: 1.0 },
      [`cel1_${edgeId}`]: { value: 1.0 },
      [`cel2_${edgeId}`]: { value: 1.0 },
      [`cel3_${edgeId}`]: { value: 1.0 },
      [`cel4_${edgeId}`]: { value: 1.0 },
      [`celFade_${edgeId}`]: { value: 1.0 },
      [`edgeSteepness_${edgeId}`]: { value: 0.4 },
      [`edgeBorder_${edgeId}`]: { value: 0.4 },
      [`color_${edgeId}`]: { value: 1.0 },
    };
    console.log('applying uniforms', uniforms);

    // the before code
    const newMat = new three.RawShaderMaterial({
      name: 'ShaderFrog Phong Material',
      lights: true,
      uniforms,
      vertexShader: vertex,
      fragmentShader: fragmentResult,
      // onBeforeCompile: () => {
      //   console.log('raw shader precomp');
      // },
    });

    // @ts-ignore
    mesh.material = newMat;

    setFinalFragment(fragmentResult);
    setVertex(vertex);
    // Mutated from the processAst call for now
    setPreprocessed(ctx.fragmentPreprocessed);
    setOriginal(ctx.fragmentSource);

    lGraph.clear();
    let engines = 1;
    let maths = 0;
    let shaders = 0;
    const spacing = 200;
    const lNodes: { [key: string]: LiteGraph.LGraphNode } = {};
    graph.nodes.forEach((node) => {
      let x = 0;
      let y = 0;
      let lNode: LiteGraph.LGraphNode;
      if (node.type === ShaderType.output) {
        x = spacing * 2;
        lNode = LiteGraph.LiteGraph.createNode('basic/output');
      } else if (
        node.type === ShaderType.phong ||
        node.type === ShaderType.toon
      ) {
        x = spacing;
        y = engines * 100;
        lNode = LiteGraph.LiteGraph.createNode('basic/shader');
        engines++;
      } else if (
        node.type === ShaderType.add ||
        node.type === ShaderType.multiply
      ) {
        x = 0;
        y = maths * 100;
        lNode = LiteGraph.LiteGraph.createNode('basic/add');
        maths++;
      } else {
        x = -spacing;
        y = shaders * 100;
        lNode = LiteGraph.LiteGraph.createNode('basic/shader');
        shaders++;
      }
      lNode.pos = [x, y];
      lNode.title = node.name;
      // lNode.properties = { id: node.id };
      if (ctx.nodes[node.id]) {
        Object.keys(ctx.nodes[node.id].inputs).forEach((input) => {
          lNode.addInput(input, 'string');
        });
      }
      lGraph.add(lNode);
      lNode.onSelected = () => {
        setActiveShader(node);
        setShaderUnsaved(node.fragmentSource);
      };
      lNode.onConnectionsChange = (
        type,
        slotIndex,
        isConnected,
        link,
        ioSlot
      ) => {
        console.log({ type, slotIndex, isConnected, link, ioSlot });
      };
      // lNode.setValue(4.5);
      lNodes[node.id] = lNode;
    });

    graph.edges.forEach((edge) => {
      lNodes[edge.from].connect(0, lNodes[edge.to], edge.input);
    });
    setLgNodesAdded(true);

    console.log(lGraph);

    // const node_const = LiteGraph.LiteGraph.createNode('basic/const');
    // node_const.pos = [200, 200];
    // lGraph.add(node_const);
    // node_const.setValue(4.5);

    // const node_watch = LiteGraph.LiteGraph.createNode('basic/watch');
    // node_watch.pos = [700, 200];
    // lGraph.add(node_watch);

    // node_const.connect(0, node_watch, 0);

    // Note that after changing the lighting, a recompile needs to happen before
    // the next render, or what seems to happen is the shader has either the
    // spotLights or pointLights uniform, and three tries to "upload" them in
    // StructuredUniform.prototype.setValue, because there's a
    // StructuredUniform.map.position/coneCos etc, but there's no
    // pointLights/spotLights present in the uniforms array maybe?
  }, [ctx, lighting, lgNodesAdded]);

  // TODO: You were here, trying to modify the edges in real time,
  // and it fails. Because of mutation of the AST?
  return (
    <div className={styles.container}>
      <div className={styles.leftCol}>
        <canvas
          id="mycanvas"
          width={width}
          height={200}
          ref={graphRef}
        ></canvas>
        <button
          className={styles.button}
          // @ts-ignore
          onClick={() => setCtx({ ...ctx, index: ctx.index + 1 })}
        >
          Save Graph
        </button>

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

        <textarea
          className={styles.shader}
          onChange={(event) => setShaderUnsaved(event.target.value)}
          value={shaderUnsaved}
        ></textarea>
        <button
          className={styles.button}
          onClick={() => {
            const found = graph.nodes.find(({ id }) => activeShader.id === id);
            if (found) {
              found.fragmentSource = shaderUnsaved;
              // @ts-ignore
              setCtx({ ...ctx, index: ctx.index + 1 });
            }
          }}
        >
          Save Shader
        </button>
      </div>
      <div>
        <Tabs onSelect={setTabIndex}>
          <TabGroup>
            <Tab>Scene</Tab>
            <Tab>Final Shader Source</Tab>
          </TabGroup>
          <TabPanels>
            <TabPanel>
              <div
                style={{ width: `${width}px`, height: `${height}px` }}
                ref={domRef}
              ></div>
            </TabPanel>
            <TabPanel>
              <Tabs>
                <TabGroup>
                  <Tab>Vertex</Tab>
                  <Tab>Original</Tab>
                  <Tab>Preprocessed</Tab>
                  <Tab>Final</Tab>
                </TabGroup>
                <TabPanels>
                  <TabPanel>
                    <textarea
                      className={styles.code}
                      readOnly
                      value={vertex}
                    ></textarea>
                  </TabPanel>
                  <TabPanel>
                    <textarea
                      className={styles.code}
                      readOnly
                      value={original}
                    ></textarea>
                  </TabPanel>
                  <TabPanel>
                    <textarea
                      className={styles.code}
                      readOnly
                      value={preprocessed}
                    ></textarea>
                  </TabPanel>
                  <TabPanel>
                    <textarea
                      className={styles.code}
                      readOnly
                      value={finalFragment}
                    ></textarea>
                  </TabPanel>
                </TabPanels>
              </Tabs>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </div>
    </div>
  );
};

export default ThreeScene;
