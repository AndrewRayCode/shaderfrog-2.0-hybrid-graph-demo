import styles from '../pages/editor/editor.module.css';

import { SplitPane } from 'react-multi-split-pane';
import cx from 'classnames';
import { generate } from '@shaderfrog/glsl-parser';
import React, {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import ReactFlow, {
  Background,
  BackgroundVariant,
  Node as FlowNode,
  Edge as FlowEdge,
  Connection,
  applyNodeChanges,
  applyEdgeChanges,
  EdgeChange,
  Edge,
  ReactFlowProvider,
  useUpdateNodeInternals,
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
  ShaderStage,
  phongNode,
  physicalNode,
  toonNode,
} from './nodestuff';
import {
  compileGraph,
  computeAllContexts,
  computeGraphContext,
  Engine,
  EngineContext,
  convertToEngine,
  NodeInputs,
} from './graph';

import useThrottle from './useThrottle';

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

import ConnectionLine from './flow/ConnectionLine';
import FlowEdgeComponent, { FlowEdgeData } from './flow/FlowEdge';
import FlowNodeComponent, { FlowNodeData } from './flow/FlowNode';

import { Tabs, Tab, TabGroup, TabPanel, TabPanels } from './Tabs';
import Monaco from './Monaco';

import { Editor as ThreeComponent, engine as threngine } from './plugins/three';

import {
  Editor as BabylonComponent,
  engine as babylengine,
} from './plugins/babylon';
import { HoistedRef, HoistedRefGetter, Hoisty } from './hoistedRefContext';
import { UICompileGraphResult } from './uICompileGraphResult';
import { useLocalStorage } from './useLocalStorage';

export type PreviewLight = 'point' | '3point' | 'spot';

const useFlef = () => {
  const [flowElements, setFlowElements, resetFlowElements] =
    useLocalStorage<FlowElements>('flow', {
      nodes: [],
      edges: [],
    });

  const [graph, setGraph, resetGraph] = useLocalStorage<Graph>('graph', () => {
    let counter = 0;
    const id = () => '' + counter++;
    const outputF = outputNode(id(), 'Output F', {}, 'fragment');
    const outputV = outputNode(id(), 'Output V', {}, 'vertex', outputF.id);
    const phongF = phongNode(id(), 'Phong F', {}, 'fragment');
    const phongV = phongNode(id(), 'Phong V', {}, 'vertex', phongF.id);
    const physicalF = physicalNode(id(), 'Physical F', {}, 'fragment');
    const physicalV = physicalNode(
      id(),
      'Physical V',
      {},
      'vertex',
      physicalF.id
    );
    const toonF = toonNode(id(), 'Toon F', {}, 'fragment');
    const toonV = toonNode(id(), 'Toon V', {}, 'vertex', toonF.id);
    const fluidF = fluidCirclesNode(id());
    const staticShader = staticShaderNode(id());
    const purpleNoise = purpleNoiseNode(id());
    const heatShaderF = heatShaderFragmentNode(id());
    const heatShaderV = heatShaderVertexNode(id(), heatShaderF.id);
    const fireF = fireFrag(id());
    const fireV = fireVert(id(), fireF.id);
    const add = addNode(id(), {});
    const add2 = addNode(id(), {});
    const multiply = multiplyNode(id(), {});
    const outlineF = outlineShaderF(id());
    const outlineV = outlineShaderV(id(), outlineF.id);
    const solidColorF = solidColorNode(id());
    return {
      nodes: [
        outputF,
        outputV,
        // phongF,
        // phongV,
        physicalF,
        physicalV,
        // toonF,
        // toonV,
        fluidF,
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
        // TODO: Put other images in the graph like the toon step shader
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
        // TODO: Highlight inputs and outputs in the shader editor
        // TODO: Add more syntax highlighting to the GLSL editor, look at vscode
        //       plugin? https://github.com/stef-levesque/vscode-shader/tree/master/syntaxes
        // - Look into why the linked vertex node is no longer found
        // - Related to above - highlight nodes in use by graph, maybe edges too
        // TODO: Plugging into bumpSampler and switching back to three from babylon
        //       breaks as three doesn't have this input (and vice versa)
        // TODO: Babylon.js light doesn't seem to animate
        // TODO: Babylon.js shader doesn't seem to get re-applied until I leave
        //       and come back to the scene
        // TODO: Opposite of above, dragging in solid color to albedo, leaving and
        //       coming back to scene, shader is black
        // TODO: After above, dragging a graph connection line makes the shader
        //       brighter. What the FUC/Kz
        // TODO: Adding shader inputs like bumpTexture should not require
        //       duplicating that manually into babylengine
        {
          from: physicalV.id,
          to: outputV.id,
          output: 'out',
          input: 'position',
          stage: 'vertex',
        },
        {
          from: physicalF.id,
          to: outputF.id,
          output: 'out',
          input: 'color',
          stage: 'fragment',
        },
        // {
        //   from: add.id,
        //   to: physicalF.id,
        //   output: 'out',
        //   input: 'texture2d_0',
        //   stage: 'fragment',
        // },
        {
          from: solidColorF.id,
          to: physicalF.id,
          output: 'out',
          input: 'albedo',
          stage: 'fragment',
        },
        // {
        //   from: heatShaderF.id,
        //   to: add.id,
        //   output: 'out',
        //   input: 'b',
        //   stage: 'fragment',
        // },
        // {
        //   from: heatShaderV.id,
        //   to: phongV.id,
        //   output: 'out',
        //   input: 'position',
        //   stage: 'vertex',
        // },
      ],
    };
  });

  return {
    flowElements,
    setFlowElements,
    graph,
    setGraph,
    resetFlowElements,
    resetGraph,
  };
};

const flowStyles = { height: '100vh', background: '#111' };
type FlowElement = FlowNode<FlowNodeData> | FlowEdge<FlowEdgeData>;
type FlowElements = {
  nodes: FlowNode<FlowNodeData>[];
  edges: FlowEdge<FlowEdgeData>[];
};

const nodeTypes = {
  special: FlowNodeComponent,
};

const edgeTypes = {
  special: FlowEdgeComponent,
};

const compileGraphAsync = async (
  graph: Graph,
  engine: Engine<any>,
  ctx: EngineContext<any>
): Promise<UICompileGraphResult> =>
  new Promise((resolve, reject) => {
    setTimeout(() => {
      console.warn('Compiling!', graph, 'for nodes', ctx.nodes);

      const allStart = performance.now();

      const result = compileGraph(ctx, engine, graph);
      const fragmentResult = generate(
        shaderSectionsToAst(result.fragment, engine.mergeOptions).program
      );
      const vertexResult = generate(
        shaderSectionsToAst(result.vertex, engine.mergeOptions).program
      );

      const now = performance.now();
      console.log(`Compilation took:
-------------------
total: ${(now - allStart).toFixed(3)}ms
-------------------
`);
      resolve({
        compileMs: (now - allStart).toFixed(3),
        fragmentResult,
        vertexResult,
      });
    }, 0);
  });

const findInputStage = (
  ids: Record<string, FlowNode<FlowNodeData>>,
  targets: Record<string, FlowEdge<FlowEdgeData>[]>,
  node: FlowNode<FlowNodeData>
): ShaderStage | undefined => {
  return (
    (!node.data?.biStage && node.data?.stage) ||
    (targets[node.id] || []).reduce<ShaderStage | undefined>(
      (found, edge) =>
        found ||
        edge.data?.stage ||
        findInputStage(ids, targets, ids[edge.source]),
      undefined
    )
  );
};

// type IndexedByTarget = {
//   targets: Record<string, FlowEdge<FlowEdgeData>[]>;
//   ids: Record<string, FlowNode<FlowNodeData>>;
// };

// Some nodes, like add, can be used for either fragment or vertex stage. When
// we connect edges in the graph, update it to figure out which stage we should
// set the add node to based on inputs to the node.
const setBiStages = (flowElements: FlowElements) => {
  const targets = flowElements.edges.reduce<Record<string, FlowEdge[]>>(
    (acc, edge) => ({
      ...acc,
      [edge.target]: [...(acc[edge.target] || []), edge],
    }),
    {}
  );
  const ids = flowElements.nodes.reduce<Record<string, FlowNode>>(
    (acc, node) => ({
      ...acc,
      [node.id]: node,
    }),
    {}
  );

  const updatedSides: Record<string, FlowElement> = {};
  // Update the node stages by looking at their inputs
  return {
    nodes: flowElements.nodes.map((node) => {
      if (!node.data || !('biStage' in node.data)) {
        return node;
      }
      if (!node.data.biStage && node.data.stage) {
        return node;
      }
      return (updatedSides[node.id] = {
        ...node,
        data: {
          ...node.data,
          stage: findInputStage(ids, targets, node),
        },
      });
    }),
    // Set the stage for edges connected to nodes whose stage changed
    edges: flowElements.edges.map((element) => {
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
    }),
  };
};

const initializeFlowElementsFromGraph = (
  graph: Graph,
  ctx: EngineContext<any>
): FlowElements => {
  let engines = 0;
  let maths = 0;
  let outputs = 0;
  let shaders = 0;
  const spacing = 200;
  const maxHeight = 4;
  console.log('Initializing flow elements from', { graph });

  const updatedNodes = graph.nodes.map((node) => ({
    id: node.id,
    data: {
      label: node.name,
      stage: node.stage,
      biStage: node.biStage || false,
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
        : node.type === ShaderType.phong ||
          node.type === ShaderType.toon ||
          node.type === ShaderType.physical
        ? { x: spacing, y: engines++ * 100 }
        : node.type === ShaderType.add || node.type === ShaderType.multiply
        ? { x: 0, y: maths++ * 100 }
        : {
            x: -spacing - spacing * Math.floor(shaders / maxHeight),
            y: (shaders++ % maxHeight) * 120,
          },
  }));

  const updatedEdges = graph.edges.map((edge) => ({
    id: `${edge.to}-${edge.from}`,
    source: edge.from,
    sourceHandle: edge.output,
    targetHandle: edge.input,
    target: edge.to,
    data: { stage: edge.stage },
    className: edge.stage,
    type: 'special',
  }));

  return setBiStages({
    nodes: updatedNodes,
    edges: updatedEdges,
  });
};

const Editor: React.FC = () => {
  const { getRefData } = useContext(HoistedRef) as {
    getRefData: HoistedRefGetter;
  };

  const updateNodeInternals = useUpdateNodeInternals();

  const [{ lastEngine, engine }, setEngine] = useState<{
    lastEngine: Engine<any> | null;
    engine: Engine<any>;
  }>({
    lastEngine: null,
    engine: threngine,
  });

  const {
    graph,
    setGraph,
    flowElements,
    setFlowElements,
    resetFlowElements,
    resetGraph,
  } = useFlef();

  const rightSplit = useRef<HTMLDivElement>(null);
  const [pauseCompile, setPauseCompile] = useState(false);

  // tabIndex may still be needed to pause rendering
  const [tabIndex, setTabIndex] = useState<number>(0);
  const [sceneTabIndex, setSceneTabIndex] = useState<number>(0);
  const [editorTabIndex, setEditorTabIndex] = useState<number>(0);
  const [guiMsg, setGuiMsg] = useState<string>('');
  const [lights, setLights] = useState<PreviewLight>('point');
  const [previewObject, setPreviewObject] = useState('torusknot');

  const [activeShader, setActiveShader] = useState<Node>(graph.nodes[0]);
  const [preprocessed, setPreprocessed] = useState<string | undefined>('');
  const [preprocessedVert, setPreprocessedVert] = useState<string | undefined>(
    ''
  );
  const [vertex, setVertex] = useState<string | undefined>('');
  const [original, setOriginal] = useState<string | undefined>('');
  const [originalVert, setOriginalVert] = useState<string | undefined>('');
  const [finalFragment, setFinalFragment] = useState<string | undefined>('');
  const [compileResult, setCompileResult] = useState<UICompileGraphResult>();

  // React-flow apparently needs(?) the useState callback to ensure the latest
  // flow elements are in state. We can no longer easily access the "latest"
  // flow elements in react-flow callbacks. To get the latest state, this
  // flag is set, and read in a useEffect
  const [needsCompile, setNeedsCompile] = useState<boolean>(false);

  const [state, setState, extendState] = useAsyncExtendedState<{
    fragError: string | null;
    vertError: string | null;
    programError: string | null;
    compileMs: string | null;
    width: number;
    height: number;
  }>({
    fragError: null,
    vertError: null,
    programError: null,
    compileMs: null,
    width: 0,
    height: 0,
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

  // Store the engine context in state. There's a separate function for passing
  // to children to update the engine context, which has more side effects
  const [ctx, setCtxState] = useState<EngineContext<any>>();

  // Compile function, meant to be called manually in places where we want to
  // trigger a compile. I tried making this a useEffect, however this function
  // needs to update "flowElements" at the end, which leads to an infinite loop
  const compile = useCallback(
    (
      engine: Engine<any>,
      ctx: EngineContext<any>,
      pauseCompile: boolean,
      flowElements: FlowElements
    ) => {
      // Convert the flow edges into the graph edges, to reflect the latest
      // user's changes
      graph.edges = flowElements.edges.map((edge) => ({
        from: edge.source,
        to: edge.target,
        output: 'out',
        input: edge.targetHandle as string,
        stage: edge.data?.stage as ShaderStage,
      }));

      setGuiMsg('Compiling!');

      compileGraphAsync(graph, engine, ctx).then((compileResult) => {
        setNeedsCompile(false);
        console.log('comple async complete!', { compileResult });
        setGuiMsg('');
        setCompileResult(compileResult);
        setFinalFragment(compileResult.fragmentResult);
        setVertex(compileResult.vertexResult);
        // Mutated from the processAst call for now
        setPreprocessed(ctx.debuggingNonsense.fragmentPreprocessed);
        setPreprocessedVert(ctx.debuggingNonsense.vertexPreprocessed);
        setOriginal(ctx.debuggingNonsense.fragmentSource);
        setOriginalVert(ctx.debuggingNonsense.vertexSource);

        // Update the available inputs from the node after the compile
        const updatedNodes = flowElements.nodes.map((node) => {
          return {
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
          };
        });

        setFlowElements({
          ...flowElements,
          nodes: updatedNodes,
        });
        setTimeout(() => {
          updatedNodes.forEach((node) => updateNodeInternals(node.id));
        }, 500);
      });
    },
    [updateNodeInternals, graph, setFlowElements]
  );

  // Let child components call compile after, say, their lighting has finished
  // updating. I'm doing this to avoid having to figure out the flow control
  // of: parent updates lights, child gets updates, sets lights, then parent
  // handles recompile
  const childCompile = useCallback(
    (ctx: EngineContext<any>) => {
      console.log('childCompile', ctx.nodes);
      return compile(engine, ctx, pauseCompile, flowElements);
    },
    [engine, compile, pauseCompile, flowElements]
  );

  const initializeGraph = useCallback(
    (
      initialElements: FlowElements,
      newCtx: EngineContext<any>,
      graph: Graph
    ) => {
      setGuiMsg(`🥸 Initializing ${engine.name}...`);
      setTimeout(() => {
        computeAllContexts(newCtx, engine, graph);
        console.log('Initializing flow nodes and compiling graph!', {
          graph,
          newCtx,
        });

        // TODO: After mutating the source code and recomputing inputs, and
        // mapping inputs from one flowelement to another, we need to do this
        // again to recompute node heights. Also do we need to do this FIRST to
        // get the inputs on the node? No, we can modify the edges I bet, and
        // then do this
        const initFlowElements = initialElements.nodes.length
          ? initialElements
          : initializeFlowElementsFromGraph(graph, newCtx);

        compile(engine, newCtx, pauseCompile, initFlowElements);
        // setFlowElements(flowElements);
        setGuiMsg('');
      }, 10);
    },
    [compile, engine, pauseCompile]
  );

  // Once we receive a new engine context, re-initialize the graph. This method
  // is passed to engine specific editor components
  const setCtx = useCallback(
    <T extends unknown>(newCtx: EngineContext<T>) => {
      if (newCtx.engine !== ctx?.engine) {
        ctx?.engine
          ? console.log('🔀 Changing engines!', { ctx, newCtx })
          : console.log('🌟 Initializing engine!', newCtx, '(no old context)', {
              ctx,
            });
        setCtxState(newCtx);
        let newGraph = graph;
        if (lastEngine) {
          const result = convertToEngine(newCtx, lastEngine, engine, graph);
          newGraph = result[0];

          if (ctx?.engine) {
            const currentScene = getRefData(ctx.engine);
            if (currentScene) {
              // @ts-ignore
              currentScene.destroy(currentScene);
            }
          }
        }
        initializeGraph(flowElements, newCtx, newGraph);
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
      flowElements,
    ]
  );

  /**
   * Split state mgmt
   */

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

  const onSplitResize = useThrottle(() => {
    if (rightSplit.current) {
      const { width, height } = rightSplit.current.getBoundingClientRect();
      let heightMinusTab = height - 25;
      extendState({ width, height: heightMinusTab });
    }
  }, 100);

  useEffect(() => {
    const listener = () => onSplitResize();
    window.addEventListener('resize', listener);
    return () => {
      window.removeEventListener('resize', listener);
    };
  }, [onSplitResize]);

  useEffect(() => onSplitResize(), [defaultMainSplitSize, onSplitResize]);

  /**
   * React flow
   */

  const addConnection = (newEdge: FlowEdge | Connection) => {
    const stage = flowElements.nodes.find((elem) => elem.id === newEdge.source)
      ?.data?.stage;

    if (newEdge.source === null || newEdge.target === null) {
      throw new Error('No source or target');
    }

    const addedEdge: FlowEdge<FlowEdgeData> = {
      ...newEdge,
      id: `${newEdge.source}-${newEdge.target}`,
      source: newEdge.source,
      target: newEdge.target,
      data: { stage },
      className: stage,
      type: 'special',
    };
    console.log({ newEdge, addedEdge });
    const updatedEdges = flowElements.edges.filter(
      (element) =>
        // Prevent one input handle from having multiple inputs
        !(
          (
            'targetHandle' in element &&
            element.targetHandle === newEdge.targetHandle &&
            element.target === newEdge.target
          )
          // Prevent one output handle from having multiple lines out
        ) &&
        !(
          'sourceHandle' in element &&
          element.sourceHandle === newEdge.sourceHandle &&
          element.source === newEdge.source
        )
    );

    setFlowElements((flowElements) =>
      setBiStages({
        edges: [...updatedEdges, addedEdge],
        nodes: flowElements.nodes,
      })
    );
    setNeedsCompile(true);
  };

  const onConnect = (edge: FlowEdge | Connection) => addConnection(edge);

  const onEdgeUpdate = (oldEdge: FlowEdge, newConnection: Connection) =>
    addConnection(newConnection);

  const onEdgesDelete = (edges: Edge[]) => {
    setNeedsCompile(true);
  };

  // TODO: this seems to work, at least 3 issues:
  // 4. switching to babylno doesn't keep purple noise as inp ut?
  const onEdgesChange = useCallback(
    (changes) =>
      setFlowElements((flowElements) =>
        setBiStages({
          nodes: flowElements.nodes,
          edges: applyEdgeChanges(changes, flowElements.edges),
        })
      ),
    [setFlowElements]
  );

  const onNodesChange = useCallback(
    (changes) =>
      setFlowElements((elements) => ({
        nodes: applyNodeChanges(changes, elements.nodes),
        edges: elements.edges,
      })),
    [setFlowElements]
  );

  const onNodeDoubleClick = (event: any, node: any) => {
    setActiveShader(graph.nodes.find((n) => n.id === node.id) as Node);
    setEditorTabIndex(1);
  };

  const setTargets = (nodeId: string, handleType: string) => {
    setFlowElements((flowElements) => {
      const source = graph.nodes.find(({ id }) => id === nodeId) as Node;
      return {
        edges: flowElements.edges,
        nodes: flowElements.nodes.map((node) => {
          if (
            node.data &&
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
  };

  const resetTargets = () => {
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
  };

  const onEdgeUpdateStart = (event: any, edge: any) => {
    const g = event.target.parentElement;
    const handleType =
      [...g.parentElement.children].indexOf(g) === 3 ? 'source' : 'target';
    const nodeId = handleType === 'source' ? edge.source : edge.target;
    setTargets(nodeId, handleType);
  };
  const onConnectStart = (params: any, { nodeId, handleType }: any) => {
    setTargets(nodeId, handleType);
  };
  const onEdgeUpdateEnd = () => resetTargets();
  const onConnectStop = () => resetTargets();

  useEffect(() => {
    if (needsCompile) {
      compile(engine, ctx as EngineContext<any>, pauseCompile, flowElements);
    }
  }, [needsCompile, flowElements, ctx, pauseCompile, compile, engine]);

  return (
    <div className={styles.container}>
      <SplitPane
        split="vertical"
        onChange={onSplitResize}
        defaultSizes={defaultMainSplitSize}
      >
        <div className={styles.splitInner}>
          <div className={styles.tabControls}>
            <div className={styles.activeEngine}>
              {engine === babylengine ? 'Babylon.js' : 'Three.js'}
            </div>
            <button
              className={styles.tabButton}
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
            <button
              className={styles.tabButton}
              onClick={() => {
                if (ctx) {
                  const rGraph = resetGraph();
                  const rElements = resetFlowElements();
                  initializeGraph(rElements, ctx, rGraph);
                }
              }}
            >
              Reset
            </button>
          </div>
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
                  // Possible fix for this being broken in dev+hot reload mode
                  // https://discord.com/channels/771389069270712320/859774873500778517/956225780252291112
                  multiSelectionKeyCode={null}
                  nodes={flowElements.nodes}
                  edges={flowElements.edges}
                  style={flowStyles}
                  onConnect={onConnect}
                  onEdgeUpdate={onEdgeUpdate}
                  onEdgesChange={onEdgesChange}
                  onNodesChange={onNodesChange}
                  onNodeDoubleClick={onNodeDoubleClick}
                  onEdgesDelete={onEdgesDelete}
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
                    onClick={() =>
                      compile(
                        engine,
                        ctx as EngineContext<any>,
                        pauseCompile,
                        flowElements
                      )
                    }
                  >
                    Save (⌘-S)
                  </button>
                </div>
                <Monaco
                  engine={engine}
                  defaultValue={activeShader.source}
                  onSave={() =>
                    compile(
                      engine,
                      ctx as EngineContext<any>,
                      pauseCompile,
                      flowElements
                    )
                  }
                  onChange={(value, event) => {
                    if (value) {
                      (
                        graph.nodes.find(
                          ({ id }) => id === activeShader.id
                        ) as Node
                      ).source = value;
                    }
                  }}
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
                {engine === threngine ? (
                  <ThreeComponent
                    setCtx={setCtx}
                    graph={graph}
                    lights={lights}
                    setLights={setLights}
                    previewObject={previewObject}
                    setPreviewObject={setPreviewObject}
                    compile={childCompile}
                    guiMsg={guiMsg}
                    compileResult={compileResult}
                    setGlResult={setGlResult}
                    width={state.width}
                    height={state.height}
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
                    guiMsg={guiMsg}
                    compileResult={compileResult}
                    setGlResult={setGlResult}
                    width={state.width}
                    height={state.height}
                  />
                )}
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

const WithProvider = () => (
  <ReactFlowProvider>
    <Hoisty>
      <Editor />
    </Hoisty>
  </ReactFlowProvider>
);

export default WithProvider;
