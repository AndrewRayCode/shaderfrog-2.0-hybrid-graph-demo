import styles from '../styles/editor.module.css';
import debounce from 'lodash.debounce';

import FlowEditor, { MouseData, useEditorStore } from './flow/FlowEditor';

import { SplitPane } from '@andrewray/react-multi-split-pane';
import cx from 'classnames';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  MouseEvent,
  MouseEventHandler,
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
} from 'reactflow';

import { findNode } from '@core/graph';
import { Graph, GraphNode } from '@core/graph-types';
import { Edge as GraphEdge, EdgeType } from '@core/nodes/edge';

import { Engine, EngineContext, convertToEngine } from '@core/engine';

import useThrottle from '../hooks/useThrottle';

import { useAsyncExtendedState } from '../hooks/useAsyncExtendedState';

import { FlowEdgeData } from './flow/FlowEdge';
import { FlowNodeSourceData, FlowNodeDataData } from './flow/FlowNode';

import { Tabs, Tab, TabGroup, TabPanel, TabPanels } from './tabs/Tabs';
import CodeEditor from './CodeEditor';

import { engine as threngine } from '@core/plugins/three';
import {
  Editor as ThreeComponent,
  makeExampleGraph as threeMakeExampleGraph,
  Example as ThreeExample,
} from '../../editor-engine-plugins/three';

import { engine as babylengine } from '@core/plugins/babylon';
import {
  Editor as BabylonComponent,
  makeExampleGraph as babylonMakeExampleGraph,
  Example as BabylonExample,
} from '../../editor-engine-plugins/babylon';

import { Hoisty, useHoisty } from '../hoistedRefContext';
import { UICompileGraphResult } from '../uICompileGraphResult';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Strategy, StrategyType } from '@core/strategy';
import { ensure } from '../../editor-util/ensure';

import { CodeNode, SourceNode, SourceType } from '@core/nodes/code-nodes';
import { makeId } from '../../editor-util/id';
import { hasParent } from '../../editor-util/hasParent';
import { useWindowSize } from '../hooks/useWindowSize';
import { NodeInput } from '@core/nodes/core-node';
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
  updateGraphFromFlowGraph,
} from './flow/helpers';

import { usePrevious } from '../hooks/usePrevious';
import {
  compileGraphAsync,
  createGraphNode,
  expandUniformDataNodes,
} from './useGraph';
import { computeAllContexts, computeContextForNodes } from '@core/context';

export type PreviewLight = 'point' | '3point' | 'spot';

const SMALL_SCREEN_WIDTH = 500;

const assetPrefix = process.env.NEXT_PUBLIC_ASSET_PREFIX as string;

/**
 * Where was I?
 * - Made babylon a lot better, got three<>babylon example working. Then
 *   noticed:
 *    - Adding a source code node that references a known engine global, like
 *      "time", fails because time isn't auto-injected. And an expression-only
 *      node can't currently support a line for a uniform on top. It woudln't
 *      make sense for a node to be "uniform float time;\n(sin(time))" for the
 *      expression. Should it be a function?
 *      - Also there is no function node generic abstraction
 *    - API improvement ideas:
 *      - Make shader generation and uniform generation part of engines, not
 *        components
 *    - Up next: Instead of inlining baked values, declare them as a variable
 *      and reference that variable in the filler code
 *    - Merge vertex and fragment shaders together into the same nodes, to avoid
 *      duplicating uniforms between the two nodes
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
 * - ✅ Have uniforms added per shader in the graph
 * - Adding a rim glow to a toon lit mesh is cool - but it would be even cooler
 *   to be able to multiply the rim lighting by the threejs lighting output
 *   specifically.
 *
 * Fundamental Issues
 * - ✅ The three.js material has properties like "envMap" and "reflectivity" which
 *   do different things based on shader settings. They are independent of the
 *   uniforms and/or set the uniforms. Right now there's no way to plug into a
 *   property like "map" or "envMap". Should there be a separate "properties"
 *   section on each node?
 *   (https://github.com/mrdoob/three.js/blob/e22cb060cc91283d250e704f886528e1be593f45/src/materials/MeshPhysicalMaterial.js#L37)
 * - "displacementMap" on a three.js material is calculated in the vertex
 *   shader, so fundamentally it can't have fragment shaders plugged into it as
 *   images.
 *
 * Polish / Improvements
 * - UX
 *   - ✅ Store graph zoom / pan position between tab switches
 *   - ✅ fix default placement of nodes so they don't overlap and stack better,
 *     and/or save node positions for examples?
 *   - Add more syntax highlighting to the GLSL editor, look at vscode plugin?
 *     https://github.com/stef-levesque/vscode-shader/tree/master/syntaxes
 *   - ✅ Allow dragging uniform edge out backwards to create a data node for it
 *   - ✅ Auto rename the data inputs to uniforms to be that uniform name
 *   - Uniform strategy should be added as default to all shaders
 *   - Add three.js ability to switch lighting megashader
 *   - ✅ Sort node inputs into engine, uniforms, properties
 *   - Show input type by the input
 *   - ✅ "Compiling" doesn't show up when (at least) changing number input nodes,
 *     and the compiling indicator could be more obvious
 * - Core
 *   - Recompiling re-parses / re-compiles the entire graph, nothing is
 *     memoized. Can we use immer or something else to preserve and update the
 *     original AST so it can be reused?
 *   - Break up graph.ts into more files, lke core parsers maybe
 *   - onBeforeCompile in threngine mutates the node to add the source - can we
 *     make this an immutable update in graph.ts?
 *   - See TODO on collapseInputs in graph.ts
 *   - Fragment and Vertex nodes should be combined together, because uniforms
 *     are used between both of them (right?). Although I guess technically you
 *     could bake a different value in the fragment vs vertex uniform...
 *   - Make properties "shadow" the uniforms the control to hide the uniforms on
 *     the node inputs
 *   - Add Graph Index data type to avoid re-indexing nodes by ID, filtering
 *     nodes everywhere
 *
 * Features
 * - Ability to export shaders + use in engine
 * - Enable backfilling of uv param
 * - Allow for shader being duplicated in a main fn to allow it to be both
 *   normal map and albdeo
 * - Add types to the connections (like vec3/float), and show the types on the
 *   inputs/ouputs, and prevent wrong types from being connected
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
 *   - Adding shader inputs like bumpTexture should not require duplicating that
 *     manually into babylengine
 * - Uniforms
 *   - Plugging in a number node to a vec2 uniform (like perlin clouds speed)
 *     causes a crash
 *   - Data nodes hard coded as '1' fail because that's not a valid float, like
 *     hard coding "transmission" uniform.
 * - Nodes / Graph
 *   - clamp(texture2D(), vec4(), vec4()) and replacing texture2D() eats whole clamp!
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
 *   - ✅ Dragging out a color/vec3 auto-creates a number node, causing webgl
 *     render crash
 * - Core
 *   - In a source node, if two functions declare a variable, the current
 *     "Variable" strategy will only pick the second one as an input.
 *   - (same as above?) The variable strategy needs to handle multiple variable
 *     replacements of the same name (looping over references), and maybe handle
 *     if that variable is declared in the program by removing the declaration
 *     line
 *   - Nodes not plugged into the graph don't get their contex computed (like
 *     new inputs)
 *   - Move engine nodes into engine specific constructors
 */

// This must be kept in sync with the core shader model
export type EditorShader = {
  id?: string;
  engine: string;
  createdAt?: Date;
  updatedAt?: Date;
  userId?: string;
  name: string;
  description?: string | null;
  visibility: number;
  config: {
    graph: {
      nodes: any[];
      edges: any[];
    };
    scene: {
      bg: string;
      lights: string;
      previewObject: string;
    };
  };
};
// Ditto. Maybe one day extract a @shaderfrog/types library or something
type ShaderUpdateInput = Omit<
  EditorShader,
  'createdAt' | 'updatedAt' | 'userId'
> & {
  id: string;
};

type ShaderCreateInput = Omit<
  EditorShader,
  'id' | 'createdAt' | 'updatedAt' | 'userId'
>;

type EditorProps = {
  shader?: EditorShader;
  onCreateShader?: (shader: ShaderCreateInput) => Promise<void>;
  onUpdateShader?: (shader: ShaderUpdateInput) => Promise<void>;
};

const Editor = ({
  shader: initialShader,
  onCreateShader,
  onUpdateShader,
}: EditorProps) => {
  const [shader, setShader] = useState<EditorShader>(
    initialShader || {
      // TODO: Align these with the examples and/or the actual initial values
      // when creating a shader
      engine: 'three',
      name: `New shader ${Math.random()}`,
      visibility: 0,
      config: {
        graph: {
          nodes: [],
          edges: [],
        },
        scene: {
          bg: '',
          lights: 'point',
          previewObject: 'sphere',
        },
      },
    }
  );
  const { getRefData } = useHoisty();

  const updateNodeInternals = useUpdateNodeInternals();

  // const query = new URLSearchParams(window.location.search);
  // const queryEngine = query.get('engine') || '';

  const [{ lastEngine: lastEngineName, engine: engineName }, setEngine] =
    useState<{
      lastEngine: string | null;
      engine: string;
    }>({
      lastEngine: null,
      engine: shader?.engine || 'three',
    });
  const lastEngine = lastEngineName
    ? lastEngineName === 'babylon'
      ? babylengine
      : threngine
    : null;
  const engine = engineName === 'babylon' ? babylengine : threngine;

  // Store the engine context in state. There's a separate function for passing
  // to children to update the engine context, which has more side effects
  const [ctx, setCtxState] = useState<EngineContext>();
  const [flowElements, setFlowElements] = useLocalStorage<FlowElements>(
    'flow',
    {
      nodes: [],
      edges: [],
    }
  );

  const [examples, makeExampleGraph] = useMemo<
    | [typeof BabylonExample, typeof babylonMakeExampleGraph]
    | [typeof ThreeExample, typeof threeMakeExampleGraph]
  >(() => {
    return engineName === 'babylon'
      ? [BabylonExample, babylonMakeExampleGraph]
      : [ThreeExample, threeMakeExampleGraph];
  }, [engineName]);

  const [initialGraph, initialPreviewObject, initialBg, initialExample] =
    useMemo(() => {
      const query = new URLSearchParams(window.location.search);
      const example = query.get('example') || examples.DEFAULT;
      if (initialShader) {
        console.log('Loading shader from API', initialShader);
        return [
          initialShader.config.graph as Graph,
          initialShader.config.scene.previewObject,
          initialShader.config.scene.bg,
        ];
      }
      // @ts-ignore
      const [graph, a, b] = makeExampleGraph(example);
      return [expandUniformDataNodes(graph), a, b, example];
    }, [makeExampleGraph, examples, initialShader]);

  const [currentExample, setExample] = useState<string | null | undefined>(
    initialExample
  );
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
  const [animatedLights, setAnimatedLights] = useState<boolean>(true);

  const [activeNode, setActiveNode] = useState<SourceNode>(
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

  const [uiState, , extendUiState] = useAsyncExtendedState<{
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
      extendUiState(result);
    },
    [extendUiState]
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
          console.log(`Compile complete in ${compileResult.compileMs} ms!`, {
            compileResult,
          });
          setGuiError('');
          setCompileResult(compileResult);

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
      setTimeout(async () => {
        try {
          const result = await computeAllContexts(newCtx, engine, graph);
          if (result.type === 'errors') {
            setContexting(false);
            const errors = result.errors as any[];
            console.error('Error computing context!', errors);
            setGuiError(`Error computing context: ${errors[0]}`);

            // In case the initial context fails to generate, which can happen
            // if a node is saved in a bad state, create the flow elements
            // anyway, so the graph still shows up
            setFlowElements(initialElements);
          } else {
            console.log('Initializing flow nodes and compiling graph!', {
              graph,
              newCtx,
            });
            compile(engine, newCtx, graph, initialElements);
          }
        } catch (error: any) {
          setContexting(false);
          console.error('Error computing context!', error);
          setGuiError(error.message);

          // Same comment as above
          setFlowElements(initialElements);
        }
      }, 0);
    },
    [compile, engine, setFlowElements]
  );

  const previousExample = usePrevious(currentExample);
  useEffect(() => {
    if (currentExample !== previousExample && previousExample !== undefined) {
      console.log('🧶 Loading new example!', currentExample);
      const [graph, previewObject, bg] = makeExampleGraph(
        // @ts-ignore
        currentExample || examples.DEFAULT
      );
      const newGraph = expandUniformDataNodes(graph);
      setGraph(newGraph);
      setPreviewObject(previewObject);
      setBg(bg);
      setActiveNode(newGraph.nodes[0] as SourceNode);

      if (ctx) {
        const initFlowElements = graphToFlowGraph(newGraph, onInputBakedToggle);
        initializeGraph(initFlowElements, ctx, newGraph);
      } else {
        console.log('NOT Running initializeGraph from example change!');
      }
    }
  }, [
    engineName,
    currentExample,
    previousExample,
    setGraph,
    setPreviewObject,
    setBg,
    ctx,
    initializeGraph,
    examples,
    makeExampleGraph,
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
          newGraph = convertToEngine(lastEngine, engine, graph);

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
      extendUiState({ sceneWidth: width, sceneHeight: height });
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
      const sourceHandleId = ensure(newEdge.sourceHandle);

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
          output: sourceHandleId,
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
        setActiveNode(graph.nodes.find((n) => n.id === node.id) as SourceNode);
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
    (_: React.MouseEvent | React.TouchEvent, params: OnConnectStartParams) => {
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
      graph: Graph,
      nodeDataType: string,
      name: string,
      position: XYPosition,
      newEdgeData?: Omit<GraphEdge, 'id' | 'from'>,
      defaultValue?: any
    ) => {
      setContexting(true);

      // Expand uniforms on new nodes automatically
      const [originalNodes, expanded] = createGraphNode(
        nodeDataType,
        name,
        position,
        engine,
        newEdgeData,
        defaultValue
      );

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
      setTimeout(async () => {
        const updatedGraph = {
          ...graph,
          edges: [...graph.edges, ...expanded.edges],
          nodes: [...graph.nodes, ...expanded.nodes],
        };
        // Create new inputs for new nodes added to the graph
        const nodesToRefresh = [
          ...expanded.nodes,
          ...(newEdgeData ? [findNode(updatedGraph, newEdgeData.to)] : []),
        ];
        console.log(
          'Computing context for new nodes to generate their inputs...',
          { 'New Nodes': nodesToRefresh }
        );
        await computeContextForNodes(
          ctx as EngineContext,
          engine,
          updatedGraph,
          nodesToRefresh
        );
        setGraph(updatedGraph);
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

        // Find the default value for this property, if any
        const fromNode = graph.nodes.find((n) => n.id === node.id);
        let defaultValue;
        if (fromNode && 'config' in fromNode && input.property) {
          const properties = fromNode.config?.properties || [];
          defaultValue = properties.find(
            (p) => p.property === input.property
          )?.defaultValue;
        }
        addNodeAtPosition(
          graph,
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
          },
          defaultValue
        );
      }

      // Clear the connection info on drag stop
      connecting.current = null;
    },
    [graph, project, addNodeAtPosition, resetTargets]
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
      addNodeAtPosition(graph, type, '', pos);
      setMenuPos();
    },
    [graph, addNodeAtPosition, setMenuPos, project, menuPosition]
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
    if (shader) {
      return;
    }
    const urlParams = new URLSearchParams(window.location.search);
    const value = currentExample || '';
    urlParams.set('example', value);
    window.history.replaceState(
      {},
      value,
      `${window.location.pathname}?${urlParams.toString()}`
    );
  }, [currentExample, shader]);

  const engineSelectorElement = (
    <div className="inlinecontrol">
      <div>
        <label className="label" htmlFor="engineSelect">
          Engine
        </label>
      </div>
      <div>
        <select
          id="engineSelect"
          className="select"
          onChange={(e) => {
            setEngine({
              lastEngine: engine.name,
              engine: e.currentTarget.value,
            });
            // const urlParams = new URLSearchParams(window.location.search);
            // urlParams.set('engine', e.currentTarget.value);
            // window.location.href = `${
            //   window.location.pathname
            // }?${urlParams.toString()}`;
          }}
          value={engine.name}
        >
          <option value="three">Three.js</option>
          <option value="babylon">Babylon</option>
        </select>
      </div>
    </div>
  );

  const exampleSelectorElement = (
    <div className="inlinecontrol">
      <div>
        <label className="label" htmlFor="exampleSelect">
          Select an example!
        </label>
      </div>
      <div>
        <select
          id="exampleSelect"
          className="select"
          onChange={(e) => setExample(e.currentTarget.value || null)}
          value={currentExample || undefined}
        >
          <option value="">None</option>
          {Object.entries(examples).map(([key, name]) => (
            <option key={key} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  const onClickSave = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!ctx || (!onUpdateShader && !onCreateShader)) {
      return;
    }
    setIsSaving(true);
    // TODO: These values liek engine and bg all have their own state, vs
    // setShader() copies all those values
    const payload = {
      engine: engineName,
      name: shader?.name || `Andy's new shader ${Math.random()}`,
      description: shader?.description || 'description',
      visibility: shader?.visibility || 1,
      config: {
        graph: updateGraphFromFlowGraph(graph, flowElements),
        scene: {
          bg,
          lights,
          previewObject,
        },
      },
    };
    try {
      if (shader?.id && onUpdateShader) {
        await onUpdateShader({
          id: shader.id,
          ...payload,
        });
      } else if (onCreateShader) {
        await onCreateShader(payload);
      }
      console.log('saved');
    } catch (error) {
      console.error('Error saving', error);
    }
    setIsSaving(false);
  };

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const isLocal = window.location.href.indexOf('localhost') > 111;
  const editorElements = (
    <>
      {smallScreen ? null : (
        <div className={cx(styles.tabControls, { [styles.col3]: isLocal })}>
          <div className="m-right-15">
            <button
              disabled={isSaving}
              className="buttonauto formbutton"
              onClick={onClickSave}
            >
              Save
            </button>
          </div>
          <div className="m-right-15">{engineSelectorElement}</div>
          {exampleSelectorElement}
          {isLocal ? (
            <>
              <button
                className="buttonauto formbutton"
                onClick={() => {
                  if (!ctx) {
                    return;
                  }
                  if (engine === babylengine) {
                    setCompileResult(undefined);
                    setEngine({
                      lastEngine: engine.name,
                      engine: threngine.name,
                    });
                  } else {
                    setCompileResult(undefined);
                    setEngine({
                      lastEngine: engine.name,
                      engine: babylengine.name,
                    });
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
        <TabGroup className={styles.tabBar}>
          <Tab>Graph</Tab>
          <Tab>GLSL Editor</Tab>
          <Tab
            className={{
              [styles.errored]: uiState.fragError || uiState.vertError,
            }}
          >
            Shader
          </Tab>
        </TabGroup>
        <TabPanels>
          {/* Graph tab */}
          <TabPanel
            onMouseMove={onMouseMove}
            className={styles.reactFlowWrapper}
            ref={reactFlowWrapper}
          >
            <div
              style={{
                height: '100%',
                width: '100%',
                position: 'relative',
              }}
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
              <div className={styles.graphFooter}>
                {compileResult?.compileMs ? (
                  <>Compile took {compileResult?.compileMs}ms</>
                ) : null}
              </div>
            </div>
          </TabPanel>
          {/* Main code editor tab */}
          <TabPanel>
            <div className={styles.belowTabs}>
              <SplitPane split="horizontal">
                <div className={styles.splitInner}>
                  <div className={styles.editorControls}>
                    <button
                      className="buttonauto formbutton"
                      onClick={() =>
                        compile(
                          engine,
                          ctx as EngineContext,
                          graph,
                          flowElements
                        )
                      }
                    >
                      Compile
                    </button>
                  </div>
                  <CodeEditor
                    engine={engine}
                    defaultValue={activeNode.source}
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
                            ({ id }) => id === activeNode.id
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
                        ({ id }) => id === activeNode.id
                      ) as SourceNode
                    }
                    onSave={() =>
                      compile(engine, ctx as EngineContext, graph, flowElements)
                    }
                    onGraphChange={() => {
                      setGraph(graph);
                      setFlowElements(
                        graphToFlowGraph(graph, onInputBakedToggle)
                      );
                    }}
                  ></StrategyEditor>
                </div>
              </SplitPane>
            </div>
          </TabPanel>
          {/* Final source code tab */}
          <TabPanel style={{ height: '100%' }}>
            <Tabs onSelect={setSceneTabIndex} selected={sceneTabIndex}>
              <TabGroup className={styles.secondary}>
                <Tab className={{ [styles.errored]: uiState.fragError }}>
                  Metadata
                </Tab>
                <Tab className={{ [styles.errored]: uiState.fragError }}>
                  Fragment
                </Tab>
                <Tab className={{ [styles.errored]: uiState.vertError }}>
                  Vertex
                </Tab>
              </TabGroup>
              <TabPanels>
                {/* final fragment shader subtab */}
                <TabPanel style={{ height: '100%' }}>
                  <div className={styles.uiGroup}>
                    <h2 className={styles.uiHeader}>Shader Name</h2>
                    <input
                      className="textinput"
                      type="text"
                      value={shader?.name}
                      onChange={(e) => {
                        setShader({
                          ...shader,
                          name: e.target.value,
                        });
                      }}
                    ></input>
                  </div>
                </TabPanel>
                <TabPanel style={{ height: '100%' }}>
                  {uiState.fragError && (
                    <div className={styles.codeError} title={uiState.fragError}>
                      {(uiState.fragError || '').substring(0, 500)}
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
                  {uiState.vertError && (
                    <div className={styles.codeError} title={uiState.vertError}>
                      {(uiState.vertError || '').substring(0, 500)}
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
            setShowHelpers={setShowHelpers}
            showHelpers={showHelpers}
            lights={lights}
            setLights={setLights}
            animatedLights={animatedLights}
            setAnimatedLights={setAnimatedLights}
            previewObject={previewObject}
            setPreviewObject={setPreviewObject}
            compile={childCompile}
            compileResult={compileResult}
            setGlResult={setGlResult}
            width={uiState.sceneWidth}
            height={uiState.sceneHeight}
            assetPrefix={assetPrefix}
          />
        ) : (
          <BabylonComponent
            setCtx={setCtx}
            graph={graph}
            bg={bg}
            setShowHelpers={setShowHelpers}
            showHelpers={showHelpers}
            setBg={setBg}
            lights={lights}
            setLights={setLights}
            animatedLights={animatedLights}
            setAnimatedLights={setAnimatedLights}
            previewObject={previewObject}
            setPreviewObject={setPreviewObject}
            compile={childCompile}
            compileResult={compileResult}
            setGlResult={setGlResult}
            width={uiState.sceneWidth}
            height={uiState.sceneHeight}
            assetPrefix={assetPrefix}
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
  onGraphChange,
  ctx,
}: {
  node: SourceNode;
  onSave: () => void;
  onGraphChange: () => void;
  ctx?: EngineContext;
}) => {
  if (!ctx || !node.config) {
    return null;
  }
  const { inputs } = node;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    node.sourceType = event.target.value as typeof node.sourceType;
    onSave();
  };

  return (
    <>
      <div className={styles.uiGroup}>
        <div>
          <h2 className={styles.uiHeader}>Node Name</h2>
          <input
            className="textinput"
            type="text"
            value={node.name}
            onChange={(e) => {
              node.name = e.target.value;
              onGraphChange();
            }}
          ></input>
        </div>
        <h2 className={cx(styles.uiHeader, 'mTop1')}>Node Strategies</h2>
        <div className={styles.autocolmax}>
          {node.config.strategies.map((strategy, index) => (
            <React.Fragment key={strategy.type}>
              <div>{strategy.type}</div>
              <div>
                <input
                  className="textinput"
                  type="text"
                  readOnly
                  value={JSON.stringify(strategy.config)}
                ></input>
              </div>
              <div>
                <button
                  className="buttonauto formbutton"
                  onClick={() => {
                    node.config.strategies = [
                      ...node.config.strategies.slice(0, index),
                      ...node.config.strategies.slice(index + 1),
                    ];
                    onSave();
                  }}
                >
                  &times; Remove Strategy
                </button>
              </div>
            </React.Fragment>
          ))}
        </div>
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
          <div className={styles.colcolauto}>
            <div>
              <select name="strategy" className="select">
                {Object.entries(StrategyType).map(([name, value]) => (
                  <option key={name} value={value}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <input
                className="textinput"
                type="text"
                name="config"
                defaultValue="{}"
              ></input>
            </div>
            <div>
              <button className="buttonauto formbutton" type="submit">
                Add
              </button>
            </div>
          </div>
        </form>
      </div>
      <div className={styles.uiGroup}>
        <h2 className={styles.uiHeader}>Source Code Type</h2>
        {Object.values(SourceType).map((value) => (
          <label key={value}>
            <input
              type="radio"
              value={value}
              checked={node.sourceType === value}
              onChange={handleChange}
            />
            {value}
          </label>
        ))}
      </div>

      <div className={styles.uiGroup}>
        <h2 className={styles.uiHeader}>Node Inputs</h2>
        {inputs.length ? inputs.map((i) => i.id).join(', ') : 'No inputs found'}
      </div>
    </>
  );
};

// Use React Flow Provider to get project(), to figure out the mouse position
// in the graph
const WithProvider = (props: EditorProps) => (
  <ReactFlowProvider>
    <Hoisty>
      <Editor {...props} />
    </Hoisty>
  </ReactFlowProvider>
);

export default WithProvider;
