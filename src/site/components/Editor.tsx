import styles from '../../pages/editor/editor.module.css';
import debounce from 'lodash.debounce';

import FlowEditor, { MouseData, useEditorStore } from './flow/FlowEditor';

import { SplitPane } from 'react-multi-split-pane';
import cx from 'classnames';
import { generate } from '@shaderfrog/glsl-parser';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  MouseEvent,
} from 'react';

import {
  Node as FlowNode,
  Edge as FlowEdge,
  Connection,
  applyNodeChanges,
  applyEdgeChanges,
  Edge,
  ReactFlowProvider,
  useUpdateNodeInternals,
  useReactFlow,
  XYPosition,
  OnConnectStartParams,
  EdgeText,
  // FlowElement,
} from 'reactflow';

import {
  Graph,
  GraphNode,
  compileGraph,
  computeAllContexts,
  collectConnectedNodes,
  findNode,
  computeContextForNodes,
  isDataInput,
  filterGraphNodes,
  CompileGraphResult,
} from '../../core/graph';
import { Edge as GraphEdge, EdgeType } from '../../core/nodes/edge';
import {
  addNode,
  sourceNode,
  multiplyNode,
  phongNode,
  toonNode,
} from '../../core/nodes/engine-node';
import { Engine, EngineContext, convertToEngine } from '../../core/engine';
import { shaderSectionsToAst } from '../../ast/shader-sections';

import useThrottle from '../hooks/useThrottle';

// import contrastNoise from '..';
import { useAsyncExtendedState } from '../hooks/useAsyncExtendedState';
// import { usePromise } from '../usePromise';

import { FlowEdgeData } from './flow/FlowEdge';
import { FlowNodeSourceData, FlowNodeDataData } from './flow/FlowNode';

import { Tabs, Tab, TabGroup, TabPanel, TabPanels } from './tabs/Tabs';
import CodeEditor from './CodeEditor';

import {
  Editor as ThreeComponent,
  engine as threngine,
} from '../../plugins/three';

import {
  Editor as BabylonComponent,
  engine as babylengine,
} from '../../plugins/babylon';
import { Hoisty, useHoisty } from '../hoistedRefContext';
import { UICompileGraphResult } from '../uICompileGraphResult';
import { useLocalStorage } from '../hooks/useLocalStorage';
import {
  declarationOfStrategy,
  Strategy,
  StrategyType,
  texture2DStrategy,
  uniformStrategy,
} from '../../core/strategy';
import { ensure } from '../../util/ensure';
import {
  colorNode,
  numberNode,
  numberUniformData,
  samplerCubeNode,
  textureNode,
  Vector2,
  Vector3,
  Vector4,
  vectorNode,
  vectorUniformData,
} from '../../core/nodes/data-nodes';
import { makeEdge } from '../../core/nodes/edge';
import { CodeNode, SourceNode } from '../../core/nodes/code-nodes';
import { makeId } from '../../util/id';
import { hasParent } from '../../util/hasParent';
import { useWindowSize } from '../hooks/useWindowSize';
import { NodeInput } from '../../core/nodes/core-node';
import {
  FlowElements,
  toFlowInputs,
  setFlowNodeCategories,
  graphToFlowGraph,
  graphNodeToFlowNode,
  graphEdgeToFlowEdge,
  updateFlowInput,
  updateGraphInput,
  updateFlowNodeData,
  updateGraphNode,
  addFlowEdge,
  addGraphEdge,
} from './flow/helpers';
import { Example, makeExampleGraph } from './examples';

import { fireFrag, fireVert } from '../../shaders/fireNode';
import fluidCirclesNode from '../../shaders/fluidCirclesNode';
import {
  heatShaderFragmentNode,
  heatShaderVertexNode,
} from '../../shaders/heatmapShaderNode';
import perlinCloudsFNode from '../../shaders/perlinClouds';
import { hellOnEarthFrag, hellOnEarthVert } from '../../shaders/hellOnEarth';
import { outlineShaderF, outlineShaderV } from '../../shaders/outlineShader';
import purpleNoiseNode from '../../shaders/purpleNoiseNode';
import solidColorNode from '../../shaders/solidColorNode';
import staticShaderNode from '../../shaders/staticShaderNode';
import { checkerboardF, checkerboardV } from '../../shaders/checkboardNode';
import {
  cubemapReflectionF,
  cubemapReflectionV,
} from '../../shaders/cubemapReflectionNode';
import normalMapify from '../../shaders/normalmapifyNode';
import { usePrevious } from '../hooks/usePrevious';

export type PreviewLight = 'point' | '3point' | 'spot';

const SMALL_SCREEN_WIDTH = 500;

const expandUniformDataNodes = (graph: Graph): Graph =>
  graph.nodes.reduce<Graph>((updated, node) => {
    if ('config' in node && node.config.uniforms) {
      const newNodes = node.config.uniforms.reduce<[GraphNode[], GraphEdge[]]>(
        (acc, uniform, index) => {
          const position = {
            x: node.position.x - 250,
            y: node.position.y - 200 + index * 100,
          };
          let n;
          switch (uniform.type) {
            case 'texture': {
              n = textureNode(makeId(), uniform.name, position, uniform.value);
              break;
            }
            case 'number': {
              n = numberNode(makeId(), uniform.name, position, uniform.value, {
                range: uniform.range,
                stepper: uniform.stepper,
              });
              break;
            }
            case 'vector2': {
              n = vectorNode(
                makeId(),
                uniform.name,
                position,
                uniform.value as Vector2
              );
              break;
            }
            case 'vector3': {
              n = vectorNode(
                makeId(),
                uniform.name,
                position,
                uniform.value as Vector3
              );
              break;
            }
            case 'vector4': {
              n = vectorNode(
                makeId(),
                uniform.name,
                position,
                uniform.value as Vector4
              );
              break;
            }
            case 'rgb': {
              n = colorNode(
                makeId(),
                uniform.name,
                position,
                uniform.value as Vector3
              );
              break;
            }
            case 'samplerCube': {
              n = samplerCubeNode(
                makeId(),
                uniform.name,
                position,
                uniform.value as string
              );
              break;
            }
            case 'rgba': {
              n = colorNode(
                makeId(),
                uniform.name,
                position,
                uniform.value as Vector4
              );
              break;
            }
          }
          return [
            [...acc[0], n],
            [
              ...acc[1],
              makeEdge(
                makeId(),
                n.id,
                node.id,
                'out',
                `uniform_${uniform.name}`,
                uniform.type
              ),
            ],
          ];
        },
        [[], []]
      );

      return {
        nodes: [...updated.nodes, ...newNodes[0]],
        edges: [...updated.edges, ...newNodes[1]],
      };
    }
    return updated;
  }, graph);

/**
 * Where was I?
 * - Trying to add examples, while at the same time
 *    - Took random jump-back-in change to make the mobile view a little better
 *    - Fixed bugs and double compiling
 *    - wow like 3 years ago I was trying to make a dropdown to change the
 *      scene background and add additional geometry types, and trying to add
 *      EXAMPLES
 *    - add auto-bake plugging code into data/uniform
 *    - make background toggle-able
 * - Adding empty toon shader and plugging in breaks at least on production
 *   - Can't reproduce
 * - Launch: Feedback, URL sharing, examples
 * - Caching contexts would be helpful
 * - Switching between threejs source code tab and runtime tab re-creates things
 *   not stored on sceneData like the threetone and the mesh and I guess the
 *   scene it self - can I reuse all of that on hoisted ref between switches?
 *
 * ✅ TODO ✅
 *
 * Experimentation ideas
 * - Try SDF image shader https://www.youtube.com/watch?v=1b5hIMqz_wM
 * - Put other images in the graph like the toon step shader
 * - Have uniforms added per shader in the graph
 * - Adding a rim glow to a toon lit mesh is cool - but it would be even cooler
 *   to be able to multiply the rim lighting by the threejs lighting output
 *   specifically.
 *
 * Fundamental Issues
 * - The three.js material has properties like "envMap" and "reflectivity" which
 *   do different things based on shader settings. They are independent of the
 *   uniforms and/or set the uniforms. Right now there's no way to plug into
 *   a property like "map" or "envMap". Should there be a separate "properties"
 *   section on each node? (https://github.com/mrdoob/three.js/blob/e22cb060cc91283d250e704f886528e1be593f45/src/materials/MeshPhysicalMaterial.js#L37)
 * - "displacementMap" on a three.js material is calculated in the vertex
 *   shader, so fundamentally it can't have fragment shaders plugged into it as
 *   images.
 *
 * Polish / Improvements
 * - UX
 *   - ✅ Store graph zoom / pan position between tab switches
 *   - ✅ fix default placement of nodes so they don't overlap and stack better,
 *     and/or save node positions for examples?
 *   - Add more syntax highlighting to the GLSL editor, look at vscode
 *     plugin? https://github.com/stef-levesque/vscode-shader/tree/master/syntaxes
 *   - ✅ Allow dragging uniform edge out backwards to create a data node for it
 *   - ✅ Auto rename the data inputs to uniforms to be that uniform name
 *   - Uniform strategy should be added as default to all shaders
 *   - Add three.js ability to switch lighting megashader
 *   - ✅ Sort node inputs into engine, uniforms, properties
 *   - Show input type by the input
 *   - "Compiling" doesn't show up when (at least) changing number input nodes,
 *     and the compiling indicator could be more obvious
 * - Core
 *   - Recompiling re-parses / re-compiles the entire graph, nothing is memoized.
 *     Can we use immer or something else to preserve and update the original AST
 *     so it can be reused?
 *   - Break up graph.ts into more files, lke core parsers maybe
 *   - onBeforeCompile in threngine mutates the node to add the source - can
 *     we make this an immutable update in graph.ts?
 *   - See TODO on collapseInputs in graph.ts
 *   - Fragment and Vertex nodes should be combined together, because uniforms
 *     are used between both of them (right?). I guess technically you could
 *     set a different value in the fragment vs vertex uniform...
 *   - Make properties "shadow" the uniforms the control to hide the uniforms
 *     on the node inputs
 *
 * Features
 * - Ability to export shaders + use in engine
 * - Enable backfilling of uv param
 * - Allow for shader being duplicated in a main fn to allow it to
 *   be both normal map and albdeo
 * - Add types to the connections (like vec3/float), and show the types on
 *   the inputs/ouputs, and prevent wrong types from being connected
 * - Re-add the three > babylon conversion
 * - ✅ Add image data nodes to the graph
 * - Add persistable shaders to a db!
 * - Shader node editor specific undo history
 *
 * Bugs
 * - UI
 * - Babylon
 *   - Features not backported: material caching, updating material properties
 *     when a new edge is plugged in.
 *   - Babylon.js light doesn't seem to animate
 *   - Babylon.js shader doesn't seem to get re-applied until I leave
 *     and come back to the scene
 *   - Opposite of above, dragging in solid color to albedo, leaving and
 *     coming back to scene, shader is black
 *   - Adding shader inputs like bumpTexture should not require
 *     duplicating that manually into babylengine
 * - Uniforms
 *   - Plugging in a number node to a vec2 uniform (like perlin clouds speed)
 *     causes a crash
 *   - Data nodes hard coded as '1' fail because that's not a valid float, like
 *     hard coding "transmission" uniform.
 * - Nodes / Graph
 *   - Plugging in Shader > Add > Baked Texture Input causes the input to be
 *     unbaked. This is because the auto-bake algorithm only looks one node
 *     level deep, and the "add" node isn't type = "source"
 *   - Deleting a node while it's plugged into the output (maybe any connected
 *     node, i repro'd with the Physical node) node causes crash
 *   - Adding together a three.js phong and physical lighting model fails to
 *     compiles becaues it introduces duplicated structs - structs aren't
 *     suffixed/renamed? Interesting
 *   - "color" is an engine variable but most shaders have their own unique
 *     color uniform. So "color" should only be preserved in engine nodes
 *   - Dragging out a color/vec3 auto-creates a number node, causing webgl
 *     render crash. TODO WIP RIGHT NOW: started adding input datatype - see
 *     type errors in strategy.ts - and then use those types to auto-create
 *     dragged out nodes
 * - Core
 *   - In a source node, if two functions declare a variable, the
 *     current "Variable" strategy will only pick the second one as
 *     an input.
 *   - (same as above?) The variable strategy needs to handle multiple variable
 *     replacements of the same name (looping over references), and
 *     maybe handle if that variable is declared in the program by
 *     removing the declaration line
 *   - Nodes not plugged into the graph don't get their contex computed (like
 *     new inputs)
 *   - Move engine nodes into engine specific constructors
 */

// const loadGraphFromUrl = (): [
//   ...ReturnType<typeof makeExampleGraph>,
//   string | null
// ] => {
//   const query = new URLSearchParams(window.location.search);
//   const example = query.get('example');
//   console.log('Loading example', example);
//   const [graph, a, b] = makeExampleGraph(
//     (example as Example) || Example.DEFAULT
//   );
//   return [expandUniformDataNodes(graph), a, b, example];
// };

const useGraphFromUrl = () => {
  const [flowElements, setFlowElements, resetFlowElements] =
    useLocalStorage<FlowElements>('flow', {
      nodes: [],
      edges: [],
    });

  const [initialGraph, initialPreviewObject, initialBg, initialExample] =
    useMemo(() => {
      const query = new URLSearchParams(window.location.search);
      const example = query.get('example') || '';
      const [graph, a, b] = makeExampleGraph(
        (example as Example) || Example.DEFAULT
      );
      return [expandUniformDataNodes(graph), a, b, example];
    }, []);

  return {
    flowElements,
    setFlowElements,
    resetFlowElements,
    initialGraph,
    initialPreviewObject,
    initialBg,
    initialExample,
  };
};

const compileGraphAsync = async (
  graph: Graph,
  engine: Engine,
  ctx: EngineContext
): Promise<UICompileGraphResult> =>
  new Promise((resolve, reject) => {
    setTimeout(() => {
      console.warn('Compiling!', graph, 'for nodes', ctx.nodes);

      const allStart = performance.now();

      let result;

      try {
        result = compileGraph(ctx, engine, graph);
      } catch (err) {
        return reject(err);
      }
      const fragmentResult = generate(
        shaderSectionsToAst(result.fragment, engine.mergeOptions).program
      );
      const vertexResult = generate(
        shaderSectionsToAst(result.vertex, engine.mergeOptions).program
      );

      const dataInputs = filterGraphNodes(
        graph,
        [result.outputFrag, result.outputVert],
        { input: isDataInput }
      ).inputs;

      // Find which nodes flow up into uniform inputs, for colorizing and for
      // not recompiling when their data changes
      const dataNodes = Object.entries(dataInputs).reduce<
        Record<string, GraphNode>
      >((acc, [nodeId, inputs]) => {
        return inputs.reduce((iAcc, input) => {
          const fromEdge = graph.edges.find(
            (edge) => edge.to === nodeId && edge.input === input.id
          );
          const fromNode =
            fromEdge && graph.nodes.find((node) => node.id === fromEdge.from);
          return fromNode
            ? {
                ...iAcc,
                ...collectConnectedNodes(graph, fromNode),
              }
            : iAcc;
        }, acc);
      }, {});

      const now = performance.now();
      console.log(`Compilation too ${(now - allStart).toFixed(3)}ms`);
      resolve({
        compileMs: (now - allStart).toFixed(3),
        result,
        fragmentResult,
        vertexResult,
        dataNodes,
        dataInputs,
        graph,
      });
    }, 10);
  });

const Editor: React.FC = () => {
  const { getRefData } = useHoisty();

  const updateNodeInternals = useUpdateNodeInternals();

  const [{ lastEngine, engine }, setEngine] = useState<{
    lastEngine: Engine | null;
    engine: Engine;
  }>({
    lastEngine: null,
    engine: threngine,
  });

  // Store the engine context in state. There's a separate function for passing
  // to children to update the engine context, which has more side effects
  const [ctx, setCtxState] = useState<EngineContext>();

  const {
    flowElements,
    setFlowElements,
    initialGraph,
    initialPreviewObject,
    initialBg,
    initialExample,
  } = useGraphFromUrl();

  const [example, setExample] = useState<string | null>(initialExample);
  const [previewObject, setPreviewObject] = useState(initialPreviewObject);
  const [bg, setBg] = useState<string>(initialBg);
  const [graph, setGraph] = useLocalStorage<Graph>('graph', initialGraph);

  const sceneWrapRef = useRef<HTMLDivElement>(null);

  // tabIndex may still be needed to pause rendering
  const [sceneTabIndex, setSceneTabIndex] = useState<number>(0);
  const [editorTabIndex, setEditorTabIndex] = useState<number>(0);
  const [smallScreenEditorTabIndex, setSmallScreenEditorTabIndex] =
    useState<number>(0);
  const [contexting, setContexting] = useState<boolean>(false);
  const [compiling, setCompiling] = useState<boolean>(false);
  const [guiError, setGuiError] = useState<string>('');
  const [lights, setLights] = useState<PreviewLight>('point');
  const [showHelpers, setShowHelpers] = useState<boolean>(false);

  const [activeShader, setActiveShader] = useState<SourceNode>(
    (graph.nodes.find((n) => n.type === 'source') ||
      graph.nodes[0]) as SourceNode
  );

  const [compileResult, setCompileResult] = useState<UICompileGraphResult>();

  // React-flow apparently needs(?) the useState callback to ensure the latest
  // flow elements are in state. We can no longer easily access the "latest"
  // flow elements in react-flow callbacks. To get the latest state, this
  // flag is set, and read in a useEffect
  const [needsCompile, setNeedsCompile] = useState<boolean>(false);

  const debouncedSetNeedsCompile = useMemo(
    () => debounce(setNeedsCompile, 500),
    []
  );

  const setVertexOverride = useCallback(
    (vertexResult: string) => {
      setCompileResult({
        ...compileResult,
        vertexResult,
      } as UICompileGraphResult);
    },
    [compileResult]
  );
  const debouncedSetVertexOverride = useMemo(
    () => debounce(setVertexOverride, 1000),
    [setVertexOverride]
  );
  const setFragmentOverride = useCallback(
    (fragmentResult: string) => {
      setCompileResult({
        ...compileResult,
        fragmentResult,
      } as UICompileGraphResult);
    },
    [compileResult]
  );
  const debouncedSetFragmentOverride = useMemo(
    () => debounce(setFragmentOverride, 1000),
    [setFragmentOverride]
  );

  const [state, setState, extendState] = useAsyncExtendedState<{
    fragError: string | null;
    vertError: string | null;
    programError: string | null;
    compileMs: string | null;
    sceneWidth: number;
    sceneHeight: number;
  }>({
    fragError: null,
    vertError: null,
    programError: null,
    compileMs: null,
    sceneWidth: 0,
    sceneHeight: 0,
  });

  const setGlResult = useCallback(
    (result: {
      fragError: string;
      vertError: string;
      programError: string;
    }) => {
      extendState(result);
    },
    [extendState]
  );

  // Compile function, meant to be called manually in places where we want to
  // trigger a compile. I tried making this a useEffect, however this function
  // needs to update "flowElements" at the end, which leads to an infinite loop
  const compile = useCallback(
    (
      engine: Engine,
      ctx: EngineContext,
      graph: Graph,
      flowElements: FlowElements
    ) => {
      setContexting(false);
      setCompiling(true);

      compileGraphAsync(graph, engine, ctx)
        .then((compileResult) => {
          console.log('comple async complete!', { compileResult });
          setGuiError('');
          setCompileResult(compileResult);

          // const byId = updatedGraph.nodes.reduce<Record<string, GraphNode>>(
          const byId = graph.nodes.reduce<Record<string, GraphNode>>(
            (acc, node) => ({ ...acc, [node.id]: node }),
            {}
          );

          // Update the available inputs from the node after the compile
          const updatedFlowNodes = flowElements.nodes.map((node) => {
            return {
              ...node,
              data: {
                ...node.data,
                inputs: toFlowInputs(byId[node.id]),
                active: compileResult.result.activeNodeIds.has(node.id),
              },
            };
          });

          setFlowElements(
            setFlowNodeCategories(
              {
                ...flowElements,
                nodes: updatedFlowNodes,
              },
              compileResult.dataNodes
            )
          );

          // This is a hack to make the edges update to their handles if they move
          // https://github.com/wbkd/react-flow/issues/2008
          setTimeout(() => {
            updatedFlowNodes.forEach((node) => updateNodeInternals(node.id));
          }, 500);
        })
        .catch((err) => {
          console.error('Error compiling!', err);
          setGuiError(err.message);
        })
        .finally(() => {
          setNeedsCompile(false);
          setCompiling(false);
          setContexting(false);
        });
    },
    [updateNodeInternals, setFlowElements]
  );

  const onNodeValueChange = useCallback(
    (nodeId: string, value: any) => {
      if (!compileResult) {
        return;
      }

      setFlowElements((fe) => updateFlowNodeData(fe, nodeId, { value }));
      setGraph((graph) => updateGraphNode(graph, nodeId, { value }));

      // Only recompile if a non-data-node value changes
      const { dataNodes } = compileResult;
      if (!(nodeId in dataNodes)) {
        debouncedSetNeedsCompile(true);
      }
    },
    [setFlowElements, compileResult, debouncedSetNeedsCompile, setGraph]
  );

  const onInputBakedToggle = useCallback(
    (nodeId: string, inputId: string, baked: boolean) => {
      setFlowElements((fe) => updateFlowInput(fe, nodeId, inputId, { baked }));
      setGraph((graph) => updateGraphInput(graph, nodeId, inputId, { baked }));
      debouncedSetNeedsCompile(true);
    },
    [setGraph, setFlowElements, debouncedSetNeedsCompile]
  );

  // Let child components call compile after, say, their lighting has finished
  // updating. I'm doing this to avoid having to figure out the flow control
  // of: parent updates lights, child gets updates, sets lights, then parent
  // handles recompile
  const childCompile = useCallback(
    (ctx: EngineContext) => {
      return compile(engine, ctx, graph, flowElements);
    },
    [engine, compile, graph, flowElements]
  );

  // Computes and recompiles an entirely new graph
  const initializeGraph = useCallback(
    (initialElements: FlowElements, newCtx: EngineContext, graph: Graph) => {
      setContexting(true);
      setTimeout(() => {
        computeAllContexts(newCtx, engine, graph);
        console.log('Initializing flow nodes and compiling graph!', {
          graph,
          newCtx,
        });

        compile(engine, newCtx, graph, initialElements);
      }, 0);
    },
    [compile, engine]
  );

  const previousExample = usePrevious(example);
  useEffect(() => {
    if (example !== previousExample && previousExample !== undefined) {
      console.log('🧶 Loading new example!', example);
      const [graph, previewObject, bg] = makeExampleGraph(
        (example as Example) || Example.DEFAULT
      );
      const newGraph = expandUniformDataNodes(graph);
      setGraph(newGraph);
      setPreviewObject(previewObject);
      setBg(bg);
      setActiveShader(newGraph.nodes[0] as SourceNode);

      if (ctx) {
        const initFlowElements = graphToFlowGraph(newGraph, onInputBakedToggle);
        initializeGraph(initFlowElements, ctx, newGraph);
      } else {
        console.log('NOT Running initializeGraph from example change!');
      }
    }
  }, [
    example,
    previousExample,
    setGraph,
    setPreviewObject,
    setBg,
    ctx,
    initializeGraph,
    onInputBakedToggle,
  ]);

  // Once we receive a new engine context, re-initialize the graph. This method
  // is passed to engine specific editor components
  const setCtx = useCallback(
    (newCtx: EngineContext) => {
      if (newCtx.engine !== ctx?.engine) {
        ctx?.engine
          ? console.log('🔀 Changing engines!', { ctx, newCtx })
          : console.log('🌟 Initializing engine!', newCtx, '(no old context)', {
              ctx,
            });
        setCtxState(newCtx);
        let newGraph = graph;
        if (lastEngine) {
          const result = convertToEngine(lastEngine, engine, graph);
          newGraph = result[0];

          if (ctx?.engine) {
            const currentScene = getRefData(ctx.engine);
            if (currentScene) {
              // @ts-ignore
              currentScene.destroy(currentScene);
            }
          }
        }
        initializeGraph(
          graphToFlowGraph(newGraph, onInputBakedToggle),
          newCtx,
          newGraph
        );
        // This branch wasn't here before I started working on the bug where
        // switching away from the scene to the source code tab and back removed
        // the envmap and others. I want to try to cache the whole scene and
        // objects here to avoid re-creating anything. I'm also curious if this
        // causes any kind of infinite loupe
      } else {
        setCtxState(newCtx);
      }
    },
    [
      ctx,
      lastEngine,
      engine,
      setCtxState,
      initializeGraph,
      getRefData,
      graph,
      onInputBakedToggle,
    ]
  );

  /**
   * Split state mgmt
   */
  const windowSize = useWindowSize();
  const smallScreen = windowSize.width < SMALL_SCREEN_WIDTH;

  const [defaultMainSplitSize, setDefaultMainSplitSize] = useState<
    number[] | undefined
  >();

  useLayoutEffect(() => {
    const width = window.innerWidth;
    if (width >= SMALL_SCREEN_WIDTH) {
      const DEFAULT_SPLIT_PERCENT = 30;
      const sizes = [
        0.1 * (100 - DEFAULT_SPLIT_PERCENT) * width,
        0.1 * DEFAULT_SPLIT_PERCENT * width,
      ];
      setDefaultMainSplitSize(sizes);
    }
  }, []);

  const syncSceneSize = useThrottle(() => {
    if (sceneWrapRef.current) {
      const { width, height } = sceneWrapRef.current.getBoundingClientRect();
      extendState({ sceneWidth: width, sceneHeight: height });
    }
  }, 100);

  useEffect(() => {
    const listener = () => syncSceneSize();
    window.addEventListener('resize', listener);
    return () => {
      window.removeEventListener('resize', listener);
    };
  }, [syncSceneSize]);

  useEffect(() => syncSceneSize(), [defaultMainSplitSize, syncSceneSize]);

  /**
   * React flow
   */

  const addConnection = useCallback(
    (newEdge: FlowEdge | Connection) => {
      const newEdgeId = makeId();
      const sourceId = ensure(newEdge.source);
      const targetId = ensure(newEdge.target);
      const targetHandleId = ensure(newEdge.targetHandle);

      // Duplicated by the flow graph update after this
      setGraph((graph) => {
        const targetGraphNode = findNode(graph, targetId);
        const input = ensure(
          targetGraphNode.inputs.find((i) => i.id === targetHandleId)
        );
        const sourceGraphNode = findNode(graph, sourceId);

        // Icky business logic here...
        const edgeType = sourceGraphNode.type;
        const type: EdgeType | undefined = ((sourceGraphNode as CodeNode)
          .stage || edgeType) as EdgeType;
        const isCode = sourceGraphNode.type === 'source';

        const addedEdge: GraphEdge = {
          id: newEdgeId,
          from: sourceId,
          to: targetId,
          output: 'out',
          input: targetHandleId,
          type,
        };

        return updateGraphInput(
          addGraphEdge(graph, addedEdge),
          targetId,
          targetHandleId,
          // Here's the "auto-baking"
          input.bakeable
            ? {
                baked: isCode,
              }
            : {}
        );
      });

      // Duplicates above branch. Another option is to map the result of these
      // operations into the core graph, but that would require making both
      // graphs dependencies of this usecallback hook, which could be a lot of
      // extra renders
      setFlowElements((fe) => {
        const targetFlowNode = ensure(
          fe.nodes.find((node) => node.id === newEdge.target)
        );
        const input = ensure(
          targetFlowNode.data.inputs.find((i) => i.id === targetHandleId)
        );

        const sourceFlowNode = ensure(
          fe.nodes.find((node) => node.id === newEdge.source)
        );

        // More icky business logic here...
        const edgeType = (sourceFlowNode.data as FlowNodeDataData).type;
        const type: EdgeType | undefined =
          (sourceFlowNode.data as FlowNodeSourceData).stage || edgeType;
        const isCode = sourceFlowNode.type === 'source';

        const addedEdge: FlowEdge<FlowEdgeData> = {
          ...newEdge,
          id: newEdgeId,
          source: sourceId,
          target: targetId,
          data: { type },
          className: cx(type, edgeType),
          type: 'special',
        };

        return updateFlowInput(
          addFlowEdge(fe, addedEdge),
          sourceId,
          targetHandleId,
          input.bakeable
            ? {
                baked: isCode,
              }
            : {}
        );
      });

      setNeedsCompile(true);
    },
    [setFlowElements, setGraph]
  );

  const onConnect = useCallback(
    (edge: FlowEdge | Connection) => addConnection(edge),
    [addConnection]
  );

  const onEdgeUpdate = useCallback(
    (oldEdge: FlowEdge, newConnection: Connection) =>
      addConnection(newConnection),
    [addConnection]
  );

  // Used for selecting edges, also called when an edge is removed, along with
  // onEdgesDelete above
  const onEdgesChange = useCallback(
    (changes) =>
      setFlowElements((fe) => ({
        ...fe,
        edges: applyEdgeChanges(changes, fe.edges),
      })),
    [setFlowElements]
  );

  // Handles selection, dragging, and deletion
  const onNodesChange = useCallback(
    (changes) =>
      setFlowElements((elements) => ({
        nodes: applyNodeChanges(changes, elements.nodes),
        edges: elements.edges,
      })),
    [setFlowElements]
  );

  const onNodeDoubleClick = useCallback(
    (event: any, node: any) => {
      if (!('value' in node.data)) {
        setActiveShader(
          graph.nodes.find((n) => n.id === node.id) as SourceNode
        );
        setEditorTabIndex(1);
      }
    },
    [graph]
  );

  const setTargets = useCallback(
    (nodeId: string, handleType: string) => {
      setFlowElements((flowElements) => {
        const source = graph.nodes.find(({ id }) => id === nodeId) as GraphNode;
        return {
          edges: flowElements.edges,
          nodes: flowElements.nodes.map((node) => {
            if (
              node.data &&
              'stage' in source &&
              'stage' in node.data &&
              'label' in node.data &&
              (node.data.stage === source.stage ||
                !source.stage ||
                !node.data.stage) &&
              node.id !== nodeId
            ) {
              return {
                ...node,
                data: {
                  ...node.data,
                  inputs: node.data.inputs.map((input) => ({
                    ...input,
                    validTarget: handleType === 'source',
                  })),
                  outputs: node.data.outputs.map((output) => ({
                    ...output,
                    validTarget: handleType === 'target',
                  })),
                },
              };
            }
            return node;
          }),
        };
      });
    },
    [setFlowElements, graph]
  );

  const resetTargets = useCallback(() => {
    setFlowElements((flowElements) => {
      return {
        edges: flowElements.edges,
        nodes: flowElements.nodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            inputs: node.data.inputs.map((input) => ({
              ...input,
              validTarget: false,
            })),
            outputs: node.data.outputs.map((output) => ({
              ...output,
              validTarget: false,
            })),
          },
        })),
      };
    });
  }, [setFlowElements]);

  const onEdgeUpdateStart = useCallback(
    (event: any, edge: any) => {
      const g = event.target.parentElement;
      const handleType =
        [...g.parentElement.children].indexOf(g) === 3 ? 'source' : 'target';
      const nodeId = handleType === 'source' ? edge.source : edge.target;
      setTargets(nodeId, handleType);
    },
    [setTargets]
  );

  const connecting = useRef<{ node: GraphNode; input: NodeInput } | null>();
  const onConnectStart = useCallback(
    (_: MouseEvent, params: OnConnectStartParams) => {
      const { nodeId, handleType, handleId } = params;
      if (handleType === 'source' || !nodeId || !handleType) {
        return;
      }
      const node = ensure(graph.nodes.find((n) => n.id === nodeId));

      connecting.current = {
        node,
        input: ensure(node.inputs.find((i) => i.id === handleId)),
      };
      setTargets(nodeId, handleType);
    },
    [graph, setTargets]
  );

  const onEdgeUpdateEnd = () => resetTargets();

  const addNodeAtPosition = useCallback(
    (
      nodeDataType: string,
      name: string,
      position: XYPosition,
      newEdgeData?: Omit<GraphEdge, 'id' | 'from'>
    ) => {
      const makeName = (type: string) => name || type;
      const id = makeId();
      const groupId = makeId();
      let newGns: GraphNode[];

      if (nodeDataType === 'number') {
        newGns = [numberNode(id, makeName('number'), position, '1')];
      } else if (nodeDataType === 'texture') {
        newGns = [
          textureNode(id, makeName('texture'), position, 'grayscale-noise'),
        ];
      } else if (nodeDataType === 'vector2') {
        newGns = [vectorNode(id, makeName('vec2'), position, ['1', '1'])];
      } else if (nodeDataType === 'vector3') {
        newGns = [vectorNode(id, makeName('vec3'), position, ['1', '1', '1'])];
      } else if (nodeDataType === 'vector4') {
        newGns = [
          vectorNode(id, makeName('vec4'), position, ['1', '1', '1', '1']),
        ];
      } else if (nodeDataType === 'rgb') {
        newGns = [colorNode(id, makeName('rgb'), position, ['1', '1', '1'])];
      } else if (nodeDataType === 'rgba') {
        newGns = [
          colorNode(id, makeName('rgba'), position, ['1', '1', '1', '1']),
        ];
      } else if (nodeDataType === 'multiply') {
        newGns = [multiplyNode(id, position)];
      } else if (nodeDataType === 'add') {
        newGns = [addNode(id, position)];
      } else if (nodeDataType === 'phong') {
        newGns = [
          phongNode(id, 'Phong', groupId, position, 'fragment'),
          phongNode(makeId(), 'Phong', groupId, position, 'vertex', id),
        ];
      } else if (nodeDataType === 'toon') {
        newGns = [
          toonNode(id, 'Toon', groupId, position, [], 'fragment'),
          toonNode(makeId(), 'Toon', groupId, position, [], 'vertex', id),
        ];
      } else if (nodeDataType === 'fireNode') {
        newGns = [fireFrag(id, position), fireVert(makeId(), id, position)];
      } else if (nodeDataType === 'checkerboardF') {
        newGns = [
          checkerboardF(id, position),
          checkerboardV(makeId(), id, position),
        ];
      } else if (nodeDataType === 'cubemapReflection') {
        newGns = [
          cubemapReflectionF(id, position),
          cubemapReflectionV(makeId(), id, position),
        ];
      } else if (nodeDataType === 'fluidCirclesNode') {
        newGns = [fluidCirclesNode(id, position)];
      } else if (nodeDataType === 'heatmapShaderNode') {
        newGns = [
          heatShaderFragmentNode(id, position),
          heatShaderVertexNode(makeId(), id, position),
        ];
      } else if (nodeDataType === 'hellOnEarth') {
        newGns = [
          hellOnEarthFrag(id, position),
          hellOnEarthVert(makeId(), id, position),
        ];
      } else if (nodeDataType === 'outlineShader') {
        newGns = [
          outlineShaderF(id, position),
          outlineShaderV(makeId(), id, position),
        ];
      } else if (nodeDataType === 'perlinClouds') {
        newGns = [perlinCloudsFNode(id, position)];
      } else if (nodeDataType === 'purpleNoiseNode') {
        newGns = [purpleNoiseNode(id, position)];
      } else if (nodeDataType === 'solidColorNode') {
        newGns = [solidColorNode(id, position)];
      } else if (nodeDataType === 'staticShaderNode') {
        newGns = [staticShaderNode(id, position)];
      } else if (nodeDataType === 'normalMapify') {
        newGns = [normalMapify(id, position)];
      } else if (nodeDataType === 'samplerCube') {
        newGns = [
          samplerCubeNode(id, makeName('samplerCube'), position, 'warehouse'),
        ];
      } else if (nodeDataType === 'fragment' || nodeDataType === 'vertex') {
        newGns = [
          sourceNode(
            makeId(),
            'Source Code ' + id,
            position,
            {
              version: 2,
              preprocess: true,
              strategies: [
                uniformStrategy(),
                texture2DStrategy(),
                declarationOfStrategy('replaceMe'),
              ],
            },
            nodeDataType === 'fragment'
              ? `void main() {
  gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
}`
              : `void main() {
  gl_Position = vec4(1.0);
}`,
            nodeDataType,
            ctx?.engine
          ),
        ];
      } else {
        console.warn(
          `Could not create node: Unknown node type "${nodeDataType}'"`
        );
        return;
      }

      let newGEs: GraphEdge[] = newEdgeData
        ? [
            makeEdge(
              makeId(),
              id,
              newEdgeData.to,
              newEdgeData.output,
              newEdgeData.input,
              newEdgeData.type
            ),
          ]
        : [];

      setContexting(true);

      // Expand uniforms on new nodes automatically
      const originalNodes = new Set<string>(newGns.map((n) => n.id));
      const expanded = expandUniformDataNodes({ nodes: newGns, edges: newGEs });

      setFlowElements((fe) => ({
        edges: [...fe.edges, ...expanded.edges.map(graphEdgeToFlowEdge)],
        nodes: [
          ...fe.nodes,
          ...expanded.nodes.map((newGn, index) =>
            graphNodeToFlowNode(
              newGn,
              onInputBakedToggle,
              // We only want to position the originally created nodes, to
              // separate vertex/fragment. The auto-expanded uniforms get placed
              // by the expand fn
              originalNodes.has(newGn.id)
                ? {
                    x: position.x + index * 20,
                    y: position.y + index * 40,
                  }
                : newGn.position
            )
          ),
        ],
      }));

      // Give the flow graph time to update after adding the new nodes
      setTimeout(() => {
        setGraph((graph) => {
          const updatedGraph = {
            ...graph,
            edges: [...graph.edges, ...expanded.edges],
            nodes: [...graph.nodes, ...expanded.nodes],
          };
          // Create new inputs for new nodes added to the graph
          computeContextForNodes(ctx as EngineContext, engine, updatedGraph, [
            ...expanded.nodes,
            ...(newEdgeData ? [findNode(updatedGraph, newEdgeData.to)] : []),
          ]);
          return updatedGraph;
        });

        debouncedSetNeedsCompile(true);
      }, 10);
    },
    [
      debouncedSetNeedsCompile,
      engine,
      ctx,
      onInputBakedToggle,
      setFlowElements,
      setGraph,
    ]
  );

  const { project } = useReactFlow();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const onConnectEnd = useCallback(
    (event) => {
      resetTargets();
      // Make sure we only drop over the grid, not over a node
      const targetIsPane = event.target.classList.contains('react-flow__pane');

      if (targetIsPane && reactFlowWrapper.current && connecting.current) {
        // Remove the wrapper bounds to get the correct position
        const { top, left } = reactFlowWrapper.current.getBoundingClientRect();
        const { node, input } = connecting.current;

        let type: EdgeType | undefined = input.dataType;
        if (!type) {
          console.log('Could not resolve dragged edge type for', input);
          return;
        }

        addNodeAtPosition(
          type,
          input.displayName,
          project({
            x: event.clientX - left,
            y: event.clientY - top,
          } as XYPosition),
          {
            to: node.id,
            // This needs to line up with the weird naming convention in data-nodes.ts output
            output: '1',
            input: input.id,
            type,
          }
        );
      }

      // Clear the connection info on drag stop
      connecting.current = null;
    },
    [project, addNodeAtPosition, resetTargets]
  );

  const mouseRef = useRef<MouseData>({
    real: { x: 0, y: 0 },
    projected: { x: 0, y: 0 },
  });

  const onMouseMove = useCallback((event: MouseEvent<HTMLDivElement>) => {
    mouseRef.current.real = { x: event.clientX, y: event.clientY };
  }, []);

  const setMenuPos = useEditorStore((state) => state.setMenuPosition);
  const menuPosition = useEditorStore((state) => state.menuPosition);

  const onMenuAdd = useCallback(
    (type: string) => {
      const pos = project(menuPosition as XYPosition);
      addNodeAtPosition(type, '', pos);
      setMenuPos();
    },
    [addNodeAtPosition, setMenuPos, project, menuPosition]
  );

  /**
   * Convenience compilation effect. This lets other callbacks update the
   * graph or flowElements however they want, and then set needsCompliation
   * to true, without having to worry about all the possible combinations of
   * updates of the parameters to compile()
   */
  useEffect(() => {
    if (needsCompile && !compiling) {
      compile(engine, ctx as EngineContext, graph, flowElements);
    }
  }, [compiling, needsCompile, flowElements, ctx, graph, compile, engine]);

  const onContainerClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!hasParent(event.target as HTMLElement, '#x-context-menu')) {
        setMenuPos();
      }
    },
    [setMenuPos]
  );

  // onEdgesChange is what applies the edge changes to the flow graph.
  const onEdgesDelete = useCallback(
    (edges: Edge[]) => {
      const ids = edges.reduce<Record<string, boolean>>(
        (acc, e) => ({ ...acc, [e.id]: true }),
        {}
      );
      setGraph((graph) => ({
        ...graph,
        edges: graph.edges.filter((edge) => !(edge.id in ids)),
      }));
      setNeedsCompile(true);
    },
    [setGraph]
  );

  // Note if an edge is connected to this node, onEdgesDelete and onEdgesChange
  // both fire to update edges in the flow and core graph
  const onNodesDelete = useCallback(
    (nodes: FlowNode[]) => {
      const ids = nodes.reduce<Record<string, boolean>>(
        (acc, n) => ({ ...acc, [n.id]: true }),
        {}
      );
      setFlowElements(({ nodes, edges }) => ({
        nodes: nodes.filter((node) => !(node.id in ids)),
        edges,
      }));
      setGraph((graph) => ({
        ...graph,
        nodes: graph.nodes.filter((node) => !(node.id in ids)),
      }));
    },
    [setFlowElements, setGraph]
  );

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const value = example || '';
    urlParams.set('example', value);
    window.history.replaceState(
      {},
      value,
      `${window.location.pathname}?${urlParams.toString()}`
    );
  }, [example]);

  const exampleSelectorElement = (
    <select
      onChange={(e) => setExample(e.currentTarget.value || null)}
      value={example || undefined}
    >
      <option value="">Select an Example!</option>
      {Object.entries(Example).map(([key, name]) => (
        <option key={key} value={name}>
          {name}
        </option>
      ))}
    </select>
  );

  const editorElements = (
    <>
      {smallScreen ? null : (
        <div className={styles.tabControls}>
          <div className={styles.activeEngine}>
            {engine === babylengine ? 'Babylon.js' : 'Three.js'}
          </div>
          {exampleSelectorElement}
          {window.location.href.indexOf('localhost') > -1 ? (
            <>
              <button
                className={styles.formButton}
                onClick={() => {
                  if (!ctx) {
                    return;
                  }
                  if (engine === babylengine) {
                    setCompileResult(undefined);
                    setEngine({ lastEngine: engine, engine: threngine });
                  } else {
                    setCompileResult(undefined);
                    setEngine({ lastEngine: engine, engine: babylengine });
                  }
                }}
              >
                {engine === babylengine
                  ? 'Switch to Three.js'
                  : 'Switch to Babylon.js'}
              </button>
            </>
          ) : null}
        </div>
      )}
      <Tabs onSelect={setEditorTabIndex} selected={editorTabIndex}>
        <TabGroup>
          <Tab>Graph</Tab>
          <Tab>
            Editor
            {activeShader
              ? `(${activeShader.name} - 
            ${
              'stage' in activeShader ? activeShader.stage : activeShader.type
            })`
              : null}
          </Tab>
          <Tab
            className={{
              [styles.errored]: state.fragError || state.vertError,
            }}
          >
            Compiled Source
          </Tab>
        </TabGroup>
        <TabPanels>
          {/* Graph tab */}
          <TabPanel
            onMouseMove={onMouseMove}
            className={styles.reactFlowWrapper}
            ref={reactFlowWrapper}
          >
            <FlowEditor
              mouse={mouseRef}
              onMenuAdd={onMenuAdd}
              onNodeValueChange={onNodeValueChange}
              nodes={flowElements.nodes}
              edges={flowElements.edges}
              onConnect={onConnect}
              onEdgeUpdate={onEdgeUpdate}
              onEdgesChange={onEdgesChange}
              onNodesChange={onNodesChange}
              onNodesDelete={onNodesDelete}
              onNodeDoubleClick={onNodeDoubleClick}
              onEdgesDelete={onEdgesDelete}
              onConnectStart={onConnectStart}
              onEdgeUpdateStart={onEdgeUpdateStart}
              onEdgeUpdateEnd={onEdgeUpdateEnd}
              onConnectEnd={onConnectEnd}
            />
          </TabPanel>
          {/* Main code editor tab */}
          <TabPanel>
            <div className={styles.belowTabs}>
              <SplitPane split="horizontal">
                <div className={styles.splitInner}>
                  <div className={styles.editorControls}>
                    <button
                      className={styles.button}
                      onClick={() =>
                        compile(
                          engine,
                          ctx as EngineContext,
                          graph,
                          flowElements
                        )
                      }
                    >
                      Save (⌘-S)
                    </button>
                  </div>
                  <CodeEditor
                    engine={engine}
                    defaultValue={activeShader.source}
                    onSave={() => {
                      compile(
                        engine,
                        ctx as EngineContext,
                        graph,
                        flowElements
                      );
                    }}
                    onChange={(value, event) => {
                      if (value) {
                        (
                          graph.nodes.find(
                            ({ id }) => id === activeShader.id
                          ) as SourceNode
                        ).source = value;
                      }
                    }}
                  />
                </div>
                <div className={cx(styles.splitInner, styles.nodeEditorPanel)}>
                  <StrategyEditor
                    ctx={ctx}
                    node={
                      graph.nodes.find(
                        ({ id }) => id === activeShader.id
                      ) as SourceNode
                    }
                    onSave={() =>
                      compile(engine, ctx as EngineContext, graph, flowElements)
                    }
                  ></StrategyEditor>
                </div>
              </SplitPane>
            </div>
          </TabPanel>
          {/* Final source code tab */}
          <TabPanel style={{ height: '100%' }}>
            <Tabs onSelect={setSceneTabIndex} selected={sceneTabIndex}>
              <TabGroup className={styles.secondary}>
                <Tab className={{ [styles.errored]: state.fragError }}>
                  Fragment
                </Tab>
                <Tab className={{ [styles.errored]: state.vertError }}>
                  Vertex
                </Tab>
              </TabGroup>
              <TabPanels>
                {/* final fragment shader subtab */}
                <TabPanel style={{ height: '100%' }}>
                  {state.fragError && (
                    <div className={styles.codeError} title={state.fragError}>
                      {(state.fragError || '').substring(0, 500)}
                    </div>
                  )}
                  <CodeEditor
                    engine={engine}
                    value={compileResult?.fragmentResult}
                    onChange={(value, event) => {
                      debouncedSetFragmentOverride(value);
                    }}
                  />
                </TabPanel>
                {/* final vertex shader subtab */}
                <TabPanel style={{ height: '100%' }}>
                  {state.vertError && (
                    <div className={styles.codeError} title={state.vertError}>
                      {(state.vertError || '').substring(0, 500)}
                    </div>
                  )}
                  <CodeEditor
                    engine={engine}
                    value={compileResult?.vertexResult}
                    onChange={(value, event) => {
                      debouncedSetVertexOverride(value);
                    }}
                  />
                </TabPanel>
              </TabPanels>
            </Tabs>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </>
  );

  const sceneElements = (
    <div className={styles.scene}>
      {contexting ? (
        <div className={styles.compiling}>
          <span>Building Context&hellip;</span>
        </div>
      ) : compiling ? (
        <div className={styles.compiling}>
          <span>Compiling&hellip;</span>
        </div>
      ) : guiError ? (
        <div className={styles.guiError}>
          <b>Compilation Error!</b> {guiError}
        </div>
      ) : compileResult?.compileMs ? (
        <div className={styles.guiMsg}>
          Complile took {compileResult?.compileMs}ms
        </div>
      ) : null}
      {smallScreen ? exampleSelectorElement : null}
      <div
        className={cx(styles.sceneAndControls, {
          [styles.sceneSmallScreen]: smallScreen,
        })}
      >
        {engine.name === 'three' ? (
          <ThreeComponent
            initialCtx={ctx}
            bg={bg}
            setBg={setBg}
            setCtx={setCtx}
            graph={graph}
            lights={lights}
            setShowHelpers={setShowHelpers}
            showHelpers={showHelpers}
            setLights={setLights}
            previewObject={previewObject}
            setPreviewObject={setPreviewObject}
            compile={childCompile}
            compileResult={compileResult}
            setGlResult={setGlResult}
            width={state.sceneWidth}
            height={state.sceneHeight}
          />
        ) : (
          <BabylonComponent
            setCtx={setCtx}
            graph={graph}
            lights={lights}
            setLights={setLights}
            previewObject={previewObject}
            setPreviewObject={setPreviewObject}
            compile={childCompile}
            compileResult={compileResult}
            setGlResult={setGlResult}
            width={state.sceneWidth}
            height={state.sceneHeight}
          />
        )}
      </div>
    </div>
  );

  return (
    <div className={styles.container} onClick={onContainerClick}>
      {smallScreen ? (
        <Tabs
          onSelect={setSmallScreenEditorTabIndex}
          selected={smallScreenEditorTabIndex}
        >
          <TabGroup>
            <Tab>Scene</Tab>
            <Tab>Editor</Tab>
          </TabGroup>
          <TabPanels>
            <TabPanel>
              <div ref={sceneWrapRef}>{sceneElements}</div>
            </TabPanel>
            <TabPanel>
              <div className={styles.belowTabs}>{editorElements}</div>
            </TabPanel>
          </TabPanels>
        </Tabs>
      ) : (
        <SplitPane onChange={syncSceneSize} defaultSizes={defaultMainSplitSize}>
          <div className={styles.splitInner}>{editorElements}</div>
          {/* 3d display split */}
          <div ref={sceneWrapRef} className={styles.splitInner}>
            {sceneElements}
          </div>
        </SplitPane>
      )}
    </div>
  );
};

const StrategyEditor = ({
  node,
  onSave,
  ctx,
}: {
  node: SourceNode;
  onSave: () => void;
  ctx?: EngineContext;
}) => {
  if (!ctx || !node.config) {
    return null;
  }
  const { inputs } = node;
  return (
    <>
      <div className={styles.uiGroup}>
        <h2 className={styles.uiHeader}>Expression only?</h2>
        <input
          type="checkbox"
          checked={node.expressionOnly}
          onChange={(event) => {
            node.expressionOnly = event.currentTarget.checked;
            onSave();
          }}
        />
      </div>
      <div className={styles.uiGroup}>
        <h2 className={styles.uiHeader}>Node Strategies</h2>
        {node.config.strategies.map((strategy, index) => (
          <div key={strategy.type}>
            {strategy.type}
            <input
              className={styles.uiInput}
              type="text"
              readOnly
              value={JSON.stringify(strategy.config)}
            ></input>
            <button
              className={styles.formButton}
              onClick={() => {
                node.config.strategies = [
                  ...node.config.strategies.slice(0, index),
                  ...node.config.strategies.slice(index + 1),
                ];
                onSave();
              }}
            >
              &times;
            </button>
          </div>
        ))}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = Object.fromEntries(
              new FormData(event.target as HTMLFormElement).entries()
            );
            node.config.strategies = [
              ...node.config.strategies,
              {
                type: data.strategy,
                config: JSON.parse(data.config as string),
              } as Strategy,
            ];
            onSave();
          }}
        >
          <h2 className={cx(styles.uiHeader, 'mTop1')}>Add Strategy</h2>
          <select name="strategy" className={styles.uiInput}>
            {Object.entries(StrategyType).map(([name, value]) => (
              <option key={name} value={value}>
                {name}
              </option>
            ))}
          </select>
          <input
            className={styles.uiInput}
            type="text"
            name="config"
            defaultValue="{}"
          ></input>
          <button className={styles.formButton} type="submit">
            Add
          </button>
        </form>
      </div>
      <div className={styles.uiGroup}>
        <h2 className={styles.uiHeader}>Node Inputs</h2>
        {inputs.length
          ? inputs.map((i) => i.displayName).join(', ')
          : 'No inputs found'}
      </div>
    </>
  );
};

// Use React Flow Provider to get project(), to figure out the mouse position
// in the graph
const WithProvider = () => (
  <ReactFlowProvider>
    <Hoisty>
      <Editor />
    </Hoisty>
  </ReactFlowProvider>
);

export default WithProvider;
