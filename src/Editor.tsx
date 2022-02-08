import styles from '../pages/editor/editor.module.css';

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
} from 'react';

import ReactFlow, {
  Background,
  BackgroundVariant,
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

import ThreeComponent from './ThreeComponent';
import { threngine } from './threngine';

import BabylonComponent from './BabylonComponent';
import { babylengine } from './bablyengine';

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
const heatShaderV = heatShaderVertexNode(id(), heatShaderF.id);
const fireF = fireFrag(id());
const fireV = fireVert(id(), fireF.id);
const add = addNode(id(), {});
const add2 = addNode(id(), {});
const multiply = multiplyNode(id(), {});
const outlineF = outlineShaderF(id());
const outlineV = outlineShaderV(id(), outlineF.id);
const solidColorF = solidColorNode(id());

// const loadingMaterial = new three.MeshBasicMaterial({ color: 'pink' });

const usePrevious = <T extends unknown>(value: T): T | undefined => {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
};

const graph: Graph = {
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
    // TODO: Highlight inputs and outputs in the shader editor
    // TODO: Add more syntax highlighting to the GLSL editor, look at vscode
    //       plugin? https://github.com/stef-levesque/vscode-shader/tree/master/syntaxes
    // - Consolidate todos in this file
    // - Look into why the linked vertex node is no longer found
    // - Related to above - highlight nodes in use by graph, maybe edges too
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
    // {
    //   from: solidColorF.id,
    //   to: physicalF.id,
    //   output: 'out',
    //   input: 'albedo',
    //   stage: 'fragment',
    // },
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

const flowStyles = { height: '100vh', background: '#111' };
export type FlowElement = FlowNode<FlowNodeData> | FlowEdge<FlowEdgeData>;

const nodeTypes = {
  special: FlowNodeComponent,
};

const edgeTypes = {
  special: FlowEdgeComponent,
};

export type UICompileGraphResult = {
  compileMs: string;
  fragmentResult: string;
  vertexResult: string;
};

const compileGraphAsync = async (
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
const setBiStages = (flowElements: FlowElement[]) => {
  const byIds = flowElements.reduce(
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
    flowElements
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

const Editor: React.FC = () => {
  const [engine, setEngine] = useState<Engine<any>>(babylengine);

  // const sceneRef = useRef<{ [key: string]: any }>({});
  const rightSplit = useRef<HTMLDivElement>(null);
  const [pauseCompile, setPauseCompile] = useState(false);

  // tabIndex may still be needed to pause rendering
  const [tabIndex, setTabIndex] = useState<number>(0);
  const [sceneTabIndex, setSceneTabIndex] = useState<number>(0);
  const [editorTabIndex, setEditorTabIndex] = useState<number>(0);
  const [guiMsg, setGuiMsg] = useState<string>('');
  const [lights, setLights] = useState<string>('point');
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

  const [state, setState, extendState] = useAsyncExtendedState<{
    fragError: string | null;
    vertError: string | null;
    programError: string | null;
    compileMs: string | null;
    width: number;
    height: number;
    flowElements: FlowElement[];
  }>({
    fragError: null,
    vertError: null,
    programError: null,
    compileMs: null,
    width: 0,
    height: 0,
    flowElements: [],
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

  const [ctx, setCtxState] = useState<EngineContext<any>>();

  const setCtx = useCallback(
    <T extends unknown>(ctx: EngineContext<T>) => {
      console.log('got new context!', ctx);
      setCtxState(ctx);
    },
    [setCtxState]
  );

  // Compile function, meant to be called manually in places where we want to
  // trigger a compile. I tried making this a useEffect, however this function
  // needs to update "flowElements" at the end, which leads to an infinite loop
  const compile = useCallback(
    (
      engine: Engine<any>,
      ctx: EngineContext<any>,
      pauseCompile: boolean,
      flowElements: FlowElement[]
    ) => {
      // if (!ctx || pauseCompile || !flowElements.length) {
      //   return;
      // }

      // Convert the flow edges into the graph edges, to reflect the latest
      // user's changes
      graph.edges = flowElements
        .filter(
          (element): element is FlowEdge<FlowEdgeData> => 'source' in element
        )
        .map((element) => ({
          from: element.source,
          to: element.target,
          output: 'out',
          input: element.targetHandle as string,
          stage: element.data?.stage as ShaderStage,
        }));

      setGuiMsg('Compiling!');

      compileGraphAsync(engine, ctx).then((compileResult) => {
        // sceneRef.current.shadersUpdated = true;
        setGuiMsg('');
        setCompileResult(compileResult);
        setFinalFragment(compileResult.fragmentResult);
        setVertex(compileResult.vertexResult);
        // Mutated from the processAst call for now
        setPreprocessed(ctx.debuggingNonsense.fragmentPreprocessed);
        setPreprocessedVert(ctx.debuggingNonsense.vertexPreprocessed);
        setOriginal(ctx.debuggingNonsense.fragmentSource);
        setOriginalVert(ctx.debuggingNonsense.vertexSource);
        extendState((state) => ({
          // compileMs,
          flowElements: (state.flowElements || []).map((node) =>
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
      });
    },
    [extendState]
  );

  // Let child components call compile after, say, their lighting has finished
  // updating. I'm doing this to avoid having to figure out the flow control
  // of: parent updates lights, child gets updates, sets lights, then parent
  // handles recompile
  const childCompile = useCallback(
    (ctx: EngineContext<any>) =>
      compile(engine, ctx, pauseCompile, state.flowElements),
    [engine, compile, pauseCompile, state.flowElements]
  );

  const initializeGraph = useCallback(() => {
    if (!ctx) {
      return;
    }

    setGuiMsg(`🥸🥸🥸🥸🥸🥸🥸 Initializing ${engine.name}...`);
    setTimeout(() => {
      computeAllContexts(ctx, engine, graph);

      let engines = 0;
      let maths = 0;
      let outputs = 0;
      let shaders = 0;
      const spacing = 200;
      const maxHeight = 4;

      const flowElements = setBiStages([
        ...graph.nodes.map((node: any, index) => ({
          id: node.id,
          data: {
            label: node.name,
            stage: node.stage,
            biStage: node.biStage,
            inputs: Object.keys(ctx.nodes[node.id]?.inputs || []).map(
              (name) => ({
                name,
                validTarget: false,
              })
            ),
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
              : node.type === ShaderType.add ||
                node.type === ShaderType.multiply
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

      compile(engine, ctx, pauseCompile, flowElements);
      extendState({ flowElements });
      setGuiMsg('');
    }, 10);
  }, [engine, ctx, extendState, pauseCompile, compile]);

  // Create the graph
  const prevEngine = usePrevious(engine);
  useEffect(() => {
    if (ctx && (prevEngine !== engine || !state.flowElements.length)) {
      console.log(
        '🚦🚦🚦🚦🚦🚦🚦🚦🚦🚦🚦 initializeGraph(), ',
        engine,
        prevEngine,
        engine !== prevEngine,
        state.flowElements.length
      );
      initializeGraph();
    }
  }, [prevEngine, ctx, engine, state.flowElements, initializeGraph]);

  const addConnection = (edge: FlowEdge | Connection) => {
    const stage = state.flowElements.find((elem) => elem.id === edge.source)
      ?.data?.stage;

    const flowElements = setBiStages([
      ...state.flowElements.filter(
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
    extendState({ flowElements });
    compile(engine, ctx as EngineContext<any>, pauseCompile, flowElements);
  };

  const onConnect = (edge: FlowEdge | Connection) => addConnection(edge);

  const onEdgeUpdate = (oldEdge: FlowEdge, newConnection: Connection) =>
    addConnection(newConnection);

  const onElementsRemove = (params: any) => {
    const ids = new Set(params.map(({ id }: any) => id));

    const flowElements: any = setBiStages([
      ...state.flowElements.filter(({ id }: any) => !ids.has(id)),
    ]);
    extendState({ flowElements });
    compile(engine, ctx as EngineContext<any>, pauseCompile, flowElements);
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

  const setTargets = (nodeId: string, handleType: string) => {
    extendState(({ flowElements }) => {
      const source = graph.nodes.find(({ id }) => id === nodeId) as Node;
      return {
        flowElements: (flowElements || []).map((element) => {
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
    extendState(({ flowElements }) => {
      return {
        flowElements: (flowElements || []).map((element) => {
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
                  setEngine(threngine);
                  // compile(threngine, ctx, pauseCompile, state.flowElements);
                } else {
                  setCompileResult(undefined);
                  setEngine(babylengine);
                  // compile(babylengine, ctx, pauseCompile, state.flowElements);
                }
              }}
            >
              {engine === babylengine
                ? 'Switch to Three.js'
                : 'Switch to Babylon.js'}
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
                  elements={state.flowElements}
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
                    onClick={() =>
                      compile(
                        engine,
                        ctx as EngineContext<any>,
                        pauseCompile,
                        state.flowElements
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
                      state.flowElements
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

export default Editor;
