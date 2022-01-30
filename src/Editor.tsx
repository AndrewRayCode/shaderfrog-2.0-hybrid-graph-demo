import styles from '../pages/editor/editor.module.css';

import MonacoEditor, { Monaco } from '@monaco-editor/react';
import throttle from 'lodash.throttle';
import { SplitPane } from 'react-multi-split-pane';
import cx from 'classnames';
import { generate } from '@shaderfrog/glsl-parser';
import React, {
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as three from 'three';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  Node as FlowNode,
  Edge as FlowEdge,
  Connection,
  // FlowElement,
} from 'react-flow-renderer';

import {
  outputNode,
  Graph,
  shaderSectionsToAst,
  Node,
  addNode,
  multiplyNode,
  ShaderType,
  Edge,
  ShaderStage,
} from './nodestuff';
import {
  compileGraph,
  computeAllContexts,
  computeGraphContext,
  EngineContext,
  NodeInputs,
} from './graph';

import {
  physicalNode,
  phongNode,
  toonNode,
  threngine,
  RuntimeContext,
} from './threngine';
import purpleNoiseNode from './purpleNoiseNode';
import staticShaderNode from './staticShaderNode';
import fluidCirclesNode from './fluidCirclesNode';
import solidColorNode from './solidColorNode';
import {
  heatShaderFragmentNode,
  heatShaderVertexNode,
} from './heatmapShaderNode';
import { fireFrag, fireVert } from './fireNode';
import { outlineShaderF, outlineShaderV } from './outlineShader';

// import contrastNoise from '..';
import { useAsyncExtendedState } from './useAsyncExtendedState';
// import { usePromise } from './usePromise';
import { useThree } from './useThree';
import FlowEdgeComponent from './FlowEdge';
import ConnectionLine from './ConnectionLine';
import { monacoGlsl } from './monaco-glsl';
import { Tabs, Tab, TabGroup, TabPanel, TabPanels } from './Tabs';

const flowStyles = { height: '100vh', background: '#111' };

let counter = 0;
const id = () => '' + counter++;
const outputF = outputNode(id(), 'Output F', {}, 'fragment');
const outputV = outputNode(id(), 'Output V', {}, 'vertex', outputF.id);
const phongF = phongNode(id(), 'Phong F', {}, 'fragment');
const phongV = phongNode(id(), 'Phong V', {}, 'vertex', phongF.id);
const physicalF = physicalNode(id(), 'Physical F', {}, 'fragment');
const physicalV = physicalNode(id(), 'Physical V', {}, 'vertex', physicalF.id);
const toonF = toonNode(id(), 'Toon F', {}, 'fragment');
const toonV = toonNode(id(), 'Toon V', {}, 'vertex', toonF.id);
const fluidF = fluidCirclesNode(id());
const staticShader = staticShaderNode(id());
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

const loadingMaterial = new three.MeshBasicMaterial({ color: 'pink' });

const graph: Graph = {
  nodes: [
    outputF,
    outputV,
    phongF,
    phongV,
    physicalF,
    physicalV,
    toonF,
    fluidF,
    toonV,
    staticShader,
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
    // TODO: Put other images in the graphf like the toon step shader
    // TODO: Could be cool to try outline shader https://shaderfrog.com/app/view/4876
    // TODO: Have uniforms added per shader in the graph
    // TODO: Try plugging into normal map
    // TODO: AnyCode node to try manipulating above shader for normal map
    // TODO: Make uniforms like map: change the uniforms
    // TODO: Add 1.00 / 3.00 switch
    // TODO: Fix adding / changing edges not auto-removing previous edges
    // TOOD: Highlight drop targets on drag
    // TOOD: Name inputs, nomralmap/roughnessMap based on uniform name?
    // TODO: Here we hardcode "out" for the inputs which needs to line up with
    //       the custom handles.
    // TODO: Fix moving add node inputs causing missing holes
    // TODO: Colorize nodes based on if they're going through frag or vert
    {
      from: phongV.id,
      to: outputV.id,
      output: 'out',
      input: 'position',
      stage: 'vertex',
    },
    {
      from: phongF.id,
      to: outputF.id,
      output: 'out',
      input: 'color',
      stage: 'fragment',
    },
    {
      from: add.id,
      to: phongF.id,
      output: 'out',
      input: 'texture2d_0',
      stage: 'fragment',
    },
    {
      from: purpleNoise.id,
      to: add.id,
      output: 'out',
      input: 'a',
      stage: 'fragment',
    },
    {
      from: heatShaderF.id,
      to: add.id,
      output: 'out',
      input: 'b',
      stage: 'fragment',
    },
    {
      from: heatShaderV.id,
      to: phongV.id,
      output: 'out',
      input: 'position',
      stage: 'vertex',
    },
  ],
};

const handleTop = 40;
const textHeight = 10;
type NodeHandle = {
  validTarget: boolean;
  name: string;
};
type FlowNodeData = {
  label: string;
  stage?: ShaderStage;
  biStage: boolean;
  outputs: NodeHandle[];
  inputs: NodeHandle[];
};
type FlowEdgeData = {
  stage?: ShaderStage;
};
type NodeProps = {
  data: FlowNodeData;
};
type FlowElement = FlowNode<FlowNodeData> | FlowEdge<FlowEdgeData>;

const CustomNodeComponent = ({ data }: NodeProps) => {
  return (
    <div
      className={'flownode ' + data.stage}
      style={{
        height: `${handleTop + Math.max(data.inputs.length, 1) * 20}px`,
      }}
    >
      <div className="flowlabel">{data.label}</div>
      <div className="flowInputs">
        {data.inputs.map((input, index) => (
          <React.Fragment key={input.name}>
            <div
              className="react-flow_handle_label"
              style={{
                top: `${handleTop - textHeight + index * 20}px`,
                left: 15,
              }}
            >
              {input.name}
            </div>
            <Handle
              id={input.name}
              className={cx({ validTarget: input.validTarget })}
              type="target"
              position={Position.Left}
              style={{ top: `${handleTop + index * 20}px` }}
            />
          </React.Fragment>
        ))}

        {data.outputs.map((output, index) => (
          <React.Fragment key={output.name}>
            <div
              className="react-flow_handle_label"
              style={{
                top: `${handleTop - textHeight + index * 20}px`,
                right: 15,
              }}
            >
              {output.name}
            </div>
            <Handle
              id={output.name}
              className={cx({ validTarget: output.validTarget })}
              type="source"
              position={Position.Right}
              style={{ top: `${handleTop + index * 20}px` }}
            />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

const nodeTypes = {
  special: CustomNodeComponent,
};

// Not currently used but keeping around in case I want to try it again
const edgeTypes = {
  special: FlowEdgeComponent,
};

const compileGraphAsync = async (
  ctx: EngineContext<RuntimeContext>
): Promise<{
  compileMs: string;
  fragmentResult: string;
  vertexResult: string;
}> =>
  new Promise((resolve, reject) => {
    setTimeout(() => {
      console.warn('Compiling!', graph, 'for nodes', ctx.nodes);

      const allStart = performance.now();

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

      const { renderer, threeTone, meshRef } = ctx.runtime;
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
          value: new three.TextureLoader().load('/contrast-noise.png'),
        },
        [`tExplosion_${fs1}`]: {
          value: new three.TextureLoader().load('/explosion.png'),
        },
        [`tExplosion_${fs2}`]: {
          value: new three.TextureLoader().load('/explosion.png'),
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

      meshRef.current.material = newMat;

      resolve({
        compileMs: (now - allStart).toFixed(3),
        fragmentResult,
        vertexResult,
      });
    }, 0);
  });

const findInputStage = (
  byIds: IndexedByTarget,
  node: FlowNode<FlowNodeData>
): ShaderStage | undefined => {
  return (
    (!node.data?.biStage && node.data?.stage) ||
    (byIds.targets[node.id] || []).reduce<ShaderStage | undefined>(
      (found, edge) => {
        return (
          found ||
          edge.data?.stage ||
          findInputStage(byIds, byIds.ids[edge.source])
        );
      },
      undefined
    )
  );
};

type IndexedByTarget = {
  targets: Record<string, FlowEdge<FlowEdgeData>[]>;
  ids: Record<string, FlowNode<FlowNodeData>>;
};
// Some nodes, like add, can be used for either fragment or vertex stage. When
// we connect edges in the graph, update it to figure out which stage we should
// set the add node to based on inputs to the node.
const setBiStages = (elements: FlowElement[]) => {
  const byIds = elements.reduce(
    (acc, element) => ({
      ...acc,
      ...('target' in element
        ? {
            targets: {
              ...acc.targets,
              [element.target]: [
                ...(acc.targets[element.target] || []),
                element,
              ],
            },
          }
        : {
            ids: {
              ...acc.ids,
              [element.id]: element,
            },
          }),
    }),
    { targets: {}, ids: {} } as IndexedByTarget
  );

  const updatedSides: Record<string, FlowElement> = {};
  // Update the node stages by looking at their inputs
  return (
    elements
      .map((element) => {
        if (!element.data || !('biStage' in element.data)) {
          return element;
        }
        if (!element.data.biStage && element.data.stage) {
          return element;
        }
        return (updatedSides[element.id] = {
          ...element,
          data: {
            ...element.data,
            stage: findInputStage(byIds, element as FlowNode<FlowNodeData>),
          },
        });
      })
      // Set the stage for edges connected to nodes whose stage changed
      .map((element) => {
        if (!('source' in element) || !(element.source in updatedSides)) {
          return element;
        }
        const { stage } = updatedSides[element.source].data as FlowNodeData;
        return {
          ...element,
          className: stage,
          data: {
            ...element.data,
            stage,
          },
        };
      })
  );
};

type AnyFn = (...args: any) => any;
function useThrottle(callback: AnyFn, delay: number) {
  const cbRef = useRef<AnyFn>(callback);

  // use mutable ref to make useCallback/throttle not depend on `cb` dep
  useEffect(() => {
    cbRef.current = callback;
  }, [callback]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(
    throttle((...args) => cbRef.current(...args), delay),
    [delay]
  );
}

const ThreeScene: React.FC = () => {
  const sceneRef = useRef<{ [key: string]: any }>({});
  const rightSplit = useRef<HTMLDivElement>(null);
  const [pauseCompile, setPauseCompile] = useState(false);

  // tabIndex may still be needed to pause rendering
  const [tabIndex, setTabIndex] = useState<number>(0);
  const [sceneTabIndex, setSceneTabIndex] = useState<number>(0);
  const [editorTabIndex, setEditorTabIndex] = useState<number>(0);
  const [compiling, setCompiling] = useState<boolean>(false);

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

  const [state, setState, extendState] = useAsyncExtendedState<{
    fragError: string | null;
    vertError: string | null;
    programError: string | null;
    compileMs: string | null;
    width: number;
    height: number;
    elements: FlowElement[];
  }>({
    fragError: null,
    vertError: null,
    programError: null,
    compileMs: null,
    width: 0,
    height: 0,
    elements: [],
  });

  const { scene, camera, threeDomRef, renderer } = useThree((time) => {
    const { current: mesh } = meshRef;
    if (!mesh) {
      return;
    }

    if (sceneRef.current.shadersUpdated) {
      const gl = renderer.getContext();

      const { fragmentShader, vertexShader, program } = renderer.properties
        .get(mesh.material)
        .programs.values()
        .next().value;

      const compiled = gl.getProgramParameter(program, gl.LINK_STATUS);
      if (!compiled) {
        const log = gl.getProgramInfoLog(program)?.trim();

        extendState({
          fragError: gl.getShaderInfoLog(fragmentShader)?.trim() || log,
          vertError: gl.getShaderInfoLog(vertexShader)?.trim() || log,
          programError: log,
        });
      } else {
        extendState({
          fragError: null,
          vertError: null,
          programError: null,
        });
      }

      sceneRef.current.shadersUpdated = false;
    }

    if (lightsRef.current) {
      const light = lightsRef.current[0];
      light.position.x = 1.2 * Math.sin(time * 0.001);
      light.position.y = 1.2 * Math.cos(time * 0.001);
      light.lookAt(
        new three.Vector3(Math.cos(time * 0.0015), Math.sin(time * 0.0015), 0)
      );

      if (lightsRef.current.length > 2) {
        const light = lightsRef.current[1];
        light.position.x = 1.3 * Math.cos(time * 0.0015);
        light.position.y = 1.3 * Math.sin(time * 0.0015);

        light.lookAt(
          new three.Vector3(Math.cos(time * 0.0025), Math.sin(time * 0.0025), 0)
        );
      }
    }

    // @ts-ignore
    if (mesh.material?.uniforms?.time && !Array.isArray(mesh.material)) {
      // @ts-ignore
      mesh.material.uniforms.time.value = time * 0.001;
    }
  });

  const [previewObject, setPreviewObject] = useState('torusknot');
  const meshRef = useRef<three.Mesh>();
  useMemo(() => {
    if (meshRef.current) {
      scene.remove(meshRef.current);
    }

    let mesh;
    if (previewObject === 'torusknot') {
      const geometry = new three.TorusKnotGeometry(0.6, 0.25, 100, 16);
      mesh = new three.Mesh(geometry);
    } else if (previewObject === 'sphere') {
      const geometry = new three.SphereBufferGeometry(1, 32, 32);
      mesh = new three.Mesh(geometry);
    } else {
      throw new Error('fffffff');
    }
    if (meshRef.current) {
      mesh.material = meshRef.current.material;
    }
    meshRef.current = mesh;
    scene.add(mesh);
  }, [previewObject, scene]);

  const threeTone = useMemo(() => {
    const image = new three.TextureLoader().load('/3tone.jpg');
    image.minFilter = three.NearestFilter;
    image.magFilter = three.NearestFilter;
  }, []);

  /// TODO:
  // - Consolidate todos in this file
  // - Look into why the linked vertex node is no longer found
  // - Related to above - highlight nodes in use by graph, maybe edges too
  // - Switching to spotlights causes a frame of scene.render() to error

  const [ctx, setCtx] = useState<EngineContext<RuntimeContext>>({
    runtime: {
      three,
      renderer,
      material: null,
      // I'm refactoring the hooks, is this an issue, where meshRef won't
      // be set? I put previewObject in the deps array to try to ensure this
      // hook is called when that's changed
      meshRef: meshRef,
      scene,
      camera,
      index: 0,
      threeTone,
      cache: { nodes: {} },
    },
    nodes: {},
    debuggingNonsense: {},
  });

  // Compile function, meant to be called manually in places where we want to
  // trigger a compile. I tried making this a useEffect, however this function
  // needs to update "elements" at the end, which leads to an infinite loop
  const compile = useCallback(
    (
      ctx: EngineContext<RuntimeContext>,
      pauseCompile: boolean,
      elements: any[]
    ) => {
      if (!ctx.runtime.renderer || pauseCompile || !elements.length) {
        return;
      }

      graph.edges = elements
        .filter((element: any) => element.source)
        .map((element: any) => ({
          from: element.source,
          to: element.target,
          output: 'out',
          input: element.targetHandle,
          stage: element.data.stage,
        }));

      setCompiling(true);

      compileGraphAsync(ctx).then(
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
          extendState((state) => ({
            compileMs,
            elements: (state.elements || []).map((node) =>
              node.data && 'inputs' in node.data
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      inputs: Object.keys(ctx.nodes[node.id]?.inputs || []).map(
                        (name) => ({
                          validTarget: false,
                          name,
                        })
                      ),
                    },
                  }
                : node
            ),
          }));
        }
      );
    },
    [extendState]
  );

  const [lights, setLights] = useState<string>('point');
  const lightsRef = useRef<three.Object3D[]>([]);
  useMemo(() => {
    // Hack to let this hook get the latest state like ctx, but only update
    // if a certain dependency has changed
    // @ts-ignore
    if (scene.lights === lights) {
      return;
    }
    lightsRef.current.forEach((light) => scene.remove(light));

    if (lights === 'point') {
      const pointLight = new three.PointLight(0xffffff, 1);
      pointLight.position.set(0, 0, 1);
      scene.add(pointLight);
      const helper = new three.PointLightHelper(pointLight, 0.1);
      scene.add(helper);
      lightsRef.current = [pointLight, helper];
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

      lightsRef.current = [light, light2, helper, helper2];
    }

    if (meshRef.current) {
      meshRef.current.material = loadingMaterial;
    }

    // @ts-ignore
    if (scene.lights) {
      compile(ctx, pauseCompile, state.elements);
    }
    // @ts-ignore
    scene.lights = lights;
  }, [ctx, pauseCompile, state.elements, compile, lights, scene]);

  // Create the graph
  useEffect(() => {
    if (
      !Object.keys(ctx.nodes) ||
      !ctx.runtime.three ||
      state.elements.length
    ) {
      return;
    }

    computeAllContexts(ctx, threngine, graph);

    let engines = 0;
    let maths = 0;
    let outputs = 0;
    let shaders = 0;
    const spacing = 200;
    const maxHeight = 4;

    const elements = setBiStages([
      ...graph.nodes.map((node: any, index) => ({
        id: node.id,
        data: {
          label: node.name,
          stage: node.stage,
          biStage: node.biStage,
          inputs: Object.keys(ctx.nodes[node.id]?.inputs || []).map((name) => ({
            name,
            validTarget: false,
          })),
          outputs: [
            {
              validTarget: false,
              name: 'out',
            },
          ],
        },
        type: 'special',
        position:
          node.type === ShaderType.output
            ? { x: spacing * 2, y: outputs++ * 100 }
            : node.type === ShaderType.phong || node.type === ShaderType.toon
            ? { x: spacing, y: engines++ * 100 }
            : node.type === ShaderType.add || node.type === ShaderType.multiply
            ? { x: 0, y: maths++ * 100 }
            : {
                x: -Math.floor(index / maxHeight) * spacing,
                y: (shaders++ % maxHeight) * 100,
              },
      })),
      ...graph.edges.map((edge) => ({
        id: `${edge.to}-${edge.from}`,
        source: edge.from,
        sourceHandle: edge.output,
        targetHandle: edge.input,
        target: edge.to,
        data: { stage: edge.stage },
        className: edge.stage,
        type: 'special',
      })),
    ]);
    compile(ctx, pauseCompile, elements);
    extendState({ elements });
  }, [ctx, extendState, pauseCompile, compile, state.elements.length]);

  const resizeThree = useThrottle(() => {
    if (rightSplit.current && ctx.runtime?.camera) {
      const { camera, renderer } = ctx.runtime;
      const { width, height } = rightSplit.current.getBoundingClientRect();
      let heightMinusTab = height - 25;
      camera.aspect = width / heightMinusTab;
      camera.updateProjectionMatrix();
      renderer.setSize(width, heightMinusTab);
      extendState({ width, height: heightMinusTab });
    }
  }, 100);

  const beforeMount = (monaco: Monaco) => {
    monaco.editor.defineTheme('myCustomTheme', {
      base: 'vs-dark', // can also be vs-dark or hc-black
      inherit: true, // can also be false to completely replace the builtin rules
      rules: [
        {
          token: 'comment',
          foreground: 'ffa500',
          fontStyle: 'italic underline',
        },
        { token: 'comment.js', foreground: '008800', fontStyle: 'bold' },
        { token: 'comment.css', foreground: '0000ff' }, // will inherit fontStyle from `comment` above
      ],
      colors: {
        'editor.background': '#000000',
      },
    });

    monacoGlsl(monaco);

    monaco.languages.registerCompletionItemProvider('glsl', {
      provideCompletionItems: (model, position) => {
        return {
          suggestions: [...threngine.preserve.values()].map((keyword) => ({
            label: keyword,
            kind: monaco.languages.CompletionItemKind.Text,
            insertText: keyword,
            range: {
              startLineNumber: 0,
              endLineNumber: 0,
              startColumn: 0,
              endColumn: 0,
            },
          })),
        };
      },
    });
  };

  const onMount = (editor: any, monaco: Monaco) => {
    editor.addAction({
      // An unique identifier of the contributed action.
      id: 'my-unique-id',

      // A label of the action that will be presented to the user.
      label: 'My Label!!!',

      // An optional array of keybindings for the action.
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyE,
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL,
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        // monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyT,
        // chord
        // monaco.KeyMod.chord(
        //   monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        //   monaco.KeyMod.Cmd | monaco.KeyCode.KeyS
        // ),
      ],

      // A precondition for this action.
      precondition: null,

      // A rule to evaluate on top of the precondition in order to dispatch the keybindings.
      keybindingContext: null,

      contextMenuGroupId: 'navigation',

      contextMenuOrder: 1.5,

      // Method that will be executed when the action is triggered.
      // @param editor The editor instance is passed in as a convenience
      run: function (ed: any) {
        console.log('wtf');
        console.log("i'm running => " + ed.getPosition());
      },
    });
  };

  const addConnection = (edge: FlowEdge | Connection) => {
    const stage = state.elements.find((elem) => elem.id === edge.source)?.data
      ?.stage;

    const elements = setBiStages([
      ...state.elements.filter(
        (element) =>
          // Prevent one input handle from having multiple inputs
          !(
            (
              'targetHandle' in element &&
              element.targetHandle === edge.targetHandle &&
              element.target === edge.target
            )
            // Prevent one output handle from having multiple lines out
          ) &&
          !(
            'sourceHandle' in element &&
            element.sourceHandle === edge.sourceHandle &&
            element.source === edge.source
          )
      ),
      {
        ...edge,
        id: `${edge.source}-${edge.target}`,
        data: { stage },
        className: stage,
        type: 'special',
      } as FlowEdge<FlowEdgeData>,
    ]);
    extendState({ elements });
    compile(ctx, pauseCompile, elements);
  };

  const onConnect = (edge: FlowEdge | Connection) => addConnection(edge);

  const onEdgeUpdate = (oldEdge: FlowEdge, newConnection: Connection) =>
    addConnection(newConnection);

  const onElementsRemove = (params: any) => {
    const ids = new Set(params.map(({ id }: any) => id));

    const elements: any = setBiStages([
      ...state.elements.filter(({ id }: any) => !ids.has(id)),
    ]);
    extendState({ elements });
    compile(ctx, pauseCompile, elements);
  };

  const onNodeDoubleClick = (event: any, node: any) => {
    setActiveShader(graph.nodes.find((n) => n.id === node.id) as Node);
    setEditorTabIndex(1);
  };

  const [defaultMainSplitSize, setDefaultMainSplitSize] = useState<
    number[] | undefined
  >();
  useLayoutEffect(() => {
    const DEFAULT_SPLIT_PERCENT = 30;
    const width = window.innerWidth;
    const sizes = [
      0.1 * (100 - DEFAULT_SPLIT_PERCENT) * width,
      0.1 * DEFAULT_SPLIT_PERCENT * width,
    ];
    setDefaultMainSplitSize(sizes);
  }, []);
  useEffect(() => resizeThree(), [defaultMainSplitSize]);

  const setTargets = (nodeId: string, handleType: string) => {
    extendState(({ elements }) => {
      const source = graph.nodes.find(({ id }) => id === nodeId) as Node;
      return {
        elements: (elements || []).map((element) => {
          if (
            element.data &&
            'label' in element.data &&
            (element.data.stage === source.stage ||
              !source.stage ||
              !element.data.stage) &&
            element.id !== nodeId
          ) {
            return {
              ...element,
              data: {
                ...element.data,
                inputs: element.data.inputs.map((input) => ({
                  ...input,
                  validTarget: handleType === 'source',
                })),
                outputs: element.data.outputs.map((output) => ({
                  ...output,
                  validTarget: handleType === 'target',
                })),
              },
            };
          }
          return element;
        }),
      };
    });
  };
  const resetTargets = () => {
    extendState(({ elements }) => {
      return {
        elements: (elements || []).map((element) => {
          if (element.data && 'label' in element.data) {
            return {
              ...element,
              data: {
                ...element.data,
                inputs: element.data.inputs.map((input) => ({
                  ...input,
                  validTarget: false,
                })),
                outputs: element.data.outputs.map((output) => ({
                  ...output,
                  validTarget: false,
                })),
              },
            };
          }
          return element;
        }),
      };
    });
  };

  useEffect(() => {
    const listener = () => resizeThree();
    window.addEventListener('resize', listener);
    return () => {
      window.removeEventListener('resize', listener);
    };
  }, [resizeThree]);

  const onEdgeUpdateStart = (event: any, edge: any) => {
    const g = event.target.parentElement;
    const handleType =
      [...g.parentElement.children].indexOf(g) === 3 ? 'source' : 'target';
    const nodeId = handleType === 'source' ? edge.source : edge.target;
    setTargets(nodeId, handleType);
  };
  const onConnectStart = (params: any, { nodeId, handleType }: any) => {
    console.log({ nodeId, handleType });
    setTargets(nodeId, handleType);
  };
  const onEdgeUpdateEnd = () => resetTargets();
  const onConnectStop = () => resetTargets();

  return (
    <div className={styles.container}>
      <SplitPane
        split="vertical"
        onChange={resizeThree}
        defaultSizes={defaultMainSplitSize}
      >
        <div className={styles.splitInner}>
          <Tabs onSelect={setEditorTabIndex} selected={editorTabIndex}>
            <TabGroup className={styles.tabs}>
              <Tab>Graph</Tab>
              <Tab>
                Editor ({activeShader.name} - {activeShader.stage})
              </Tab>
            </TabGroup>
            <TabPanels>
              <TabPanel>
                <ReactFlow
                  elements={state.elements}
                  style={flowStyles}
                  onConnect={onConnect}
                  onEdgeUpdate={onEdgeUpdate}
                  onElementsRemove={onElementsRemove}
                  onNodeDoubleClick={onNodeDoubleClick}
                  connectionLineComponent={ConnectionLine}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  onConnectStart={onConnectStart}
                  onEdgeUpdateStart={onEdgeUpdateStart}
                  onEdgeUpdateEnd={onEdgeUpdateEnd}
                  onConnectStop={onConnectStop}
                >
                  <Background
                    variant={BackgroundVariant.Lines}
                    gap={25}
                    size={0.5}
                    color="#444444"
                  />
                </ReactFlow>
              </TabPanel>
              <TabPanel>
                <div className={styles.editorControls}>
                  <button
                    className={styles.button}
                    onClick={() => compile(ctx, pauseCompile, state.elements)}
                    disabled={compiling}
                  >
                    Save
                  </button>
                </div>
                <MonacoEditor
                  height="100vh"
                  language="glsl"
                  theme="myCustomTheme"
                  defaultValue={activeShader.source}
                  onChange={(value, event) => {
                    if (value) {
                      (
                        graph.nodes.find(
                          ({ id }) => id === activeShader.id
                        ) as Node
                      ).source = value;
                    }
                  }}
                  options={{
                    minimap: { enabled: false },
                  }}
                  onMount={onMount}
                  beforeMount={beforeMount}
                />
              </TabPanel>
            </TabPanels>
          </Tabs>
        </div>
        {/* 3d display split */}
        <div ref={rightSplit} className={styles.splitInner}>
          <Tabs selected={tabIndex} onSelect={setTabIndex}>
            <TabGroup className={styles.tabs}>
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
                  {!compiling &&
                    state.compileMs &&
                    `Complile took ${state.compileMs}ms`}
                </div>
                <div className={styles.sceneControls}>
                  <button
                    className={styles.button}
                    onClick={() => setLights('point')}
                    disabled={lights === 'point'}
                  >
                    Point Light
                  </button>
                  <button
                    className={styles.button}
                    onClick={() => setLights('spot')}
                    disabled={lights === 'spot'}
                  >
                    Spot Lights
                  </button>
                  <button
                    className={styles.button}
                    onClick={() =>
                      setPreviewObject(
                        previewObject === 'sphere' ? 'torusknot' : 'sphere'
                      )
                    }
                  >
                    {previewObject === 'sphere' ? 'Torus Knot' : 'Sphere'}
                  </button>
                  <button
                    className={styles.button}
                    onClick={() => setPauseCompile(!pauseCompile)}
                  >
                    {pauseCompile ? 'Unpause' : 'Pause'}
                  </button>
                </div>
              </TabPanel>
              <TabPanel>
                <Tabs onSelect={setSceneTabIndex} selected={sceneTabIndex}>
                  <TabGroup className={cx(styles.tabs, styles.secondary)}>
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
