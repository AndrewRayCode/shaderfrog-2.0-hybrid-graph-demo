import { useHotkeys } from 'react-hotkeys-hook';
import styles from '../../pages/editor/editor.module.css';
import ctxStyles from './context.menu.module.css';
import debounce from 'lodash.debounce';

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
  MouseEvent,
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
  useReactFlow,
  XYPosition,
  // FlowElement,
} from 'react-flow-renderer';

import {
  Graph,
  GraphNode,
  ShaderStage,
  compileGraph,
  computeAllContexts,
  computeContextForNodes,
  MAGIC_OUTPUT_STMTS,
  NodeType,
  alphabet,
  isDataNode,
  isSourceNode,
} from '../../core/graph';
import { Edge as GraphEdge, EdgeType } from '../../core/nodes/edge';
import {
  outputNode,
  addNode,
  multiplyNode,
  phongNode,
  physicalNode,
  toonNode,
  expressionNode,
} from '../../core/nodes/engine-node';
import {
  Engine,
  EngineContext,
  convertToEngine,
  EngineNodeType,
  NodeContext,
} from '../../core/engine';
import { shaderSectionsToAst } from '../../ast/shader-sections';

import useThrottle from '../useThrottle';

import { hellOnEarthFrag, hellOnEarthVert } from '../../shaders/hellOnEarth';
import perlinCloudsFNode from '../../shaders/perlinClouds';
import purpleNoiseNode from '../../shaders/purpleNoiseNode';
import staticShaderNode from '../../shaders/staticShaderNode';
import fluidCirclesNode from '../../shaders/fluidCirclesNode';
import solidColorNode from '../../shaders/solidColorNode';
import {
  heatShaderFragmentNode,
  heatShaderVertexNode,
} from '../../shaders/heatmapShaderNode';
import { fireFrag, fireVert } from '../../shaders/fireNode';
import { outlineShaderF, outlineShaderV } from '../../shaders/outlineShader';

// import contrastNoise from '..';
import { useAsyncExtendedState } from '../useAsyncExtendedState';
// import { usePromise } from '../usePromise';

import ConnectionLine from './flow/ConnectionLine';
import FlowEdgeComponent, { FlowEdgeData, LinkEdgeData } from './flow/FlowEdge';
import {
  DataNodeComponent,
  SourceNodeComponent,
  FlowNodeData,
  FlowNodeSourceData,
  FlowNodeDataData,
  InputNodeHandle,
  flowOutput,
} from './flow/FlowNode';

import { Tabs, Tab, TabGroup, TabPanel, TabPanels } from './Tabs';
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
import {
  collectUniformsFromActiveNodes,
  UICompileGraphResult,
} from '../uICompileGraphResult';
import { useLocalStorage } from '../useLocalStorage';
import { Strategy, StrategyType } from '../../core/strategy';
import { ensure } from '../../util/ensure';
import { numberNode } from '../../core/nodes/data-nodes';
import { makeEdge } from '../../core/nodes/edge';
import { SourceNode } from '../../core/nodes/code-nodes';
import { makeId } from '../../util/id';
import { hasParent } from '../../util/hasParent';
import { NodeInput } from '../../core/nodes/core-node';

export type PreviewLight = 'point' | '3point' | 'spot';

const expandDataElements = (graph: Graph): Graph =>
  graph.nodes.reduce<Graph>((updated, node) => {
    if ('config' in node && node.config.uniforms) {
      const newElements = node.config.uniforms.reduce<
        [GraphNode[], GraphEdge[]]
      >(
        (elems, uniform) => {
          if (uniform.type === 'number') {
            const n = numberNode(makeId(), 'number', uniform.value, {
              range: uniform.range,
              stepper: uniform.stepper,
            });
            return [
              [...elems[0], n],
              [
                ...elems[1],
                makeEdge(n.id, node.id, 'out', uniform.name, uniform.type),
              ],
            ];
          }
          return elems;
        },
        [[], []]
      );

      return {
        nodes: [...updated.nodes, ...newElements[0]],
        edges: [...updated.edges, ...newElements[1]],
      };
    }
    return updated;
  }, graph);

const useFlef = () => {
  const [flowElements, setFlowElements, resetFlowElements] =
    useLocalStorage<FlowElements>('flow', {
      nodes: [],
      edges: [],
    });

  const [graph, setGraph, resetGraph] = useLocalStorage<Graph>('graph', () => {
    const expression = expressionNode(makeId(), 'Expression', 'a + b / c');
    const outputF = outputNode(makeId(), 'Output', 'fragment');
    const outputV = outputNode(makeId(), 'Output', 'vertex', outputF.id);
    const phongF = phongNode(makeId(), 'Phong', 'fragment');
    const phongV = phongNode(makeId(), 'Phong', 'vertex', phongF.id);
    const physicalF = physicalNode(makeId(), 'Physical', 'fragment');
    const physicalV = physicalNode(
      makeId(),
      'Physical',
      'vertex',
      physicalF.id
    );
    const toonF = toonNode(makeId(), 'Toon', 'fragment');
    const toonV = toonNode(makeId(), 'Toon', 'vertex', toonF.id);
    const fluidF = fluidCirclesNode(makeId());
    const staticShader = staticShaderNode(makeId());
    const purpleNoise = purpleNoiseNode(makeId());
    const heatShaderF = heatShaderFragmentNode(makeId());
    const heatShaderV = heatShaderVertexNode(makeId(), heatShaderF.id);
    const fireF = fireFrag(makeId());
    const fireV = fireVert(makeId(), fireF.id);
    const add = addNode(makeId());
    const add2 = addNode(makeId());
    const multiply = multiplyNode(makeId());
    const outlineF = outlineShaderF(makeId());
    const outlineV = outlineShaderV(makeId(), outlineF.id);
    const solidColorF = solidColorNode(makeId());
    const hellOnEarthF = hellOnEarthFrag(makeId());
    const hellOnEarthV = hellOnEarthVert(makeId(), hellOnEarthF.id);
    const perlinCloudsF = perlinCloudsFNode(makeId());
    const num1 = numberNode(makeId(), 'number', '1');
    return (
      expandDataElements({
        nodes: [
          physicalF,
          physicalV,
          fireF,
          fireV,
          outputF,
          outputV,
          outlineF,
          outlineV,
        ],
        edges: [
          makeEdge(physicalF.id, outputF.id, 'out', 'frogFragOut', 'fragment'),
          makeEdge(physicalV.id, outputV.id, 'out', 'gl_Position', 'vertex'),
        ],
      }) || {
        nodes: [
          expression,
          outputF,
          outputV,
          phongF,
          phongV,
          num1,
          physicalF,
          physicalV,
          // toonF,
          // toonV,
          fluidF,
          staticShader,
          hellOnEarthF,
          hellOnEarthV,
          perlinCloudsF,
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
          // TODO: Try SDF image shader https://www.youtube.com/watch?v=1b5hIMqz_wM
          // TODO: Put other images in the graph like the toon step shader
          // TODO: Could be cool to try outline shader https://shaderfrog.com/app/view/4876
          // TODO: Have uniforms added per shader in the graph
          // TODO: AnyCode node to try manipulating above shader for normal map
          // TODO: Make uniforms like map: change the uniforms
          // TODO: Here we hardcode "out" for the inputs which needs to line up with
          //       the custom handles.
          // TODO: Add more syntax highlighting to the GLSL editor, look at vscode
          //       plugin? https://github.com/stef-levesque/vscode-shader/tree/master/syntaxes
          // TODO: Babylon.js light doesn't seem to animate
          // TODO: Babylon.js shader doesn't seem to get re-applied until I leave
          //       and come back to the scene
          // TODO: Opposite of above, dragging in solid color to albedo, leaving and
          //       coming back to scene, shader is black
          // TODO: Adding shader inputs like bumpTexture should not require
          //       duplicating that manually into babylengine
          // TODO: Make nodes addable/removable in the graph
          // TODO: Allow for a source expression only node that has a normal-map-ifier
          // TODO: Enable backfilling of uv param?
          // TODO: Allow for shader being duplicated in a main fn to allow it to
          //       be both normal map and albdeo
          // TODO: In a source node, if two functions declare a variable, the
          //       current "Variable" strategy will only pick the second one as
          //       an input.
          // TODO: The variable strategy needs to handle multiple variable
          //       replacements of the same name (looping over references), and
          //       maybe handle if that variable is declared in the program by
          //       removing the declaration line
          makeEdge(physicalV.id, outputV.id, 'out', 'position', 'vertex'),
          makeEdge(physicalF.id, outputF.id, 'out', 'color', 'fragment'),
          // {
          //   from: hellOnEarthF.id,
          //   to: physicalF.id,
          //   output: 'out',
          //   input: 'normal',
          //   stage: 'fragment',
          // },
          makeEdge(num1.id, solidColorF.id, 'out', 'blorf', 'number'),
          makeEdge(solidColorF.id, physicalF.id, 'out', 'albedo', 'fragment'),
          // {
          //   from: solidColorF.id,
          //   to: add.id,
          //   output: 'out',
          //   input: 'b',
          //   stage: 'fragment',
          // ),
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
      }
    );
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

/**
 * A binary node automatically adds/removes inputs based on how many edges
 * connect to it. If a binary node has edges to "a" and "b", removing the edge
 * to "a" means the edge to "b" needs to be moved down to the "a" one. This
 * function essentially groups edges by target node id, and resets the edge
 * target to its index. This doesn't feel good to do here but I don't have a
 * better idea at the moment. One reason the inputs to binary nodes are
 * automatically updated after compile, but the edges are updated here
 * at the editor layer, before compile. This also hard codes assumptions about
 * (binary) node inputs into the graph, namely they can't have blank inputs.
 */
const collapseBinaryEdges = (
  graph: Graph,
  edges: FlowEdgeOrLink[]
): FlowEdgeOrLink[] => {
  const binaryEdges = edges.reduce<Record<string, FlowEdgeOrLink[]>>(
    (acc, edge) => {
      const to = graph.nodes.find(({ id }) => id === edge.target);
      return to?.type === NodeType.BINARY
        ? {
            ...acc,
            [to.id]: [...(acc[to.id] || []), edge],
          }
        : acc;
    },
    {}
  );

  return edges.map((edge) => {
    return edge.target in binaryEdges
      ? {
          ...edge,
          targetHandle: alphabet.charAt(binaryEdges[edge.target].indexOf(edge)),
        }
      : edge;
  });
};

const flowStyles = { height: '100vh', background: '#111' };
type FlowElement = FlowNode<FlowNodeData> | FlowEdge<FlowEdgeData>;
type FlowEdgeOrLink = FlowEdge<FlowEdgeData>;
type FlowElements = {
  nodes: FlowNode<FlowNodeData>[];
  edges: FlowEdgeOrLink[];
};

const nodeTypes = {
  data: DataNodeComponent,
  source: SourceNodeComponent,
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

      const activeUniforms = collectUniformsFromActiveNodes(graph, [
        result.outputFrag,
        result.outputVert,
      ]);

      const now = performance.now();
      console.log(`Compilation took:
-------------------
total: ${(now - allStart).toFixed(3)}ms
-------------------
`);
      resolve({
        compileMs: (now - allStart).toFixed(3),
        result,
        fragmentResult,
        vertexResult,
        activeUniforms,
        graph,
      });
    }, 0);
  });

const findInputStage = (
  ids: Record<string, FlowNode<FlowNodeData>>,
  targets: Record<string, FlowEdge<FlowEdgeData>[]>,
  node: FlowNode<FlowNodeData>
): ShaderStage | undefined => {
  let cast = node.data as FlowNodeSourceData;
  return (
    (!cast?.biStage && cast?.stage) ||
    (targets[node.id] || []).reduce<ShaderStage | undefined>((found, edge) => {
      const type = edge.data?.type;
      return (
        found ||
        (type === 'fragment' || type === 'vertex' ? type : false) ||
        findInputStage(ids, targets, ids[edge.source])
      );
    }, undefined)
  );
};

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
      const { stage } = updatedSides[element.source].data as FlowNodeSourceData;
      return {
        ...element,
        // className: element.data?.type === 'data' ? element.data.type : stage,
        data: {
          ...element.data,
          stage,
        },
      };
    }),
  };
};

const toFlowInputs = (node: GraphNode): InputNodeHandle[] =>
  (node.inputs || [])
    .filter(({ name }) => name !== MAGIC_OUTPUT_STMTS)
    .map((input) => ({
      id: input.id,
      name: input.name,
      bakeable: input.bakeable,
      validTarget: false,
      category: input.category,
    }));

const graphNodeToFlowNode = (
  node: GraphNode,
  onChange: any,
  onInputCategoryToggle: any,
  position: XYPosition
): FlowNode<FlowNodeData> => {
  const data: FlowNodeData = isSourceNode(node)
    ? {
        label: node.name,
        stage: node.stage,
        active: false,
        biStage: node.biStage || false,
        inputs: toFlowInputs(node),
        outputs: node.outputs.map((o) => flowOutput(o.name)),
        onInputCategoryToggle,
      }
    : {
        label: node.name,
        type: node.type,
        value: node.value,
        onChange,
        inputs: toFlowInputs(node),
        outputs: node.outputs.map((o) => flowOutput(o.name)),
      };
  return {
    id: node.id,
    data,
    type: isSourceNode(node) ? 'source' : 'data',
    position,
  };
};

const initializeFlowElementsFromGraph = (
  graph: Graph,
  onChange: any,
  onInputCategoryToggle: any
): FlowElements => {
  let engines = 0;
  let maths = 0;
  let outputs = 0;
  let shaders = 0;
  const spacing = 200;
  const maxHeight = 4;
  console.log('Initializing flow elements from', { graph });

  const nodes = graph.nodes.map((node) =>
    graphNodeToFlowNode(
      node,
      onChange,
      onInputCategoryToggle,
      node.type === EngineNodeType.output
        ? { x: spacing * 2, y: outputs++ * 100 }
        : node.type === EngineNodeType.phong ||
          node.type === EngineNodeType.toon ||
          node.type === EngineNodeType.physical
        ? { x: spacing, y: engines++ * 100 }
        : node.type === EngineNodeType.binary
        ? { x: 0, y: maths++ * 100 }
        : {
            x: -spacing - spacing * Math.floor(shaders / maxHeight),
            y: (shaders++ % maxHeight) * 120,
          }
    )
  );

  // console.log('edge', { edge });
  const edges: FlowEdgeOrLink[] = graph.edges.map(
    (edge): FlowEdge<FlowEdgeData> => ({
      id: `${edge.to}-${edge.from}`,
      source: edge.from,
      sourceHandle: edge.output,
      targetHandle: edge.input,
      target: edge.to,
      data: { type: edge.type },
      className: edge.type,
      type: 'special',
    })
  );

  return setBiStages({ nodes, edges });
};

// Convert flow elements to graph
const fromFlowToGraph = (graph: Graph, flowElements: FlowElements): Graph => {
  graph.edges = flowElements.edges.map(
    (edge: FlowEdge<FlowEdgeData>): GraphEdge => ({
      from: edge.source,
      to: edge.target,
      output: 'out',
      input: edge.targetHandle as string,
      type: edge.data?.type,
    })
  );

  const flowNodesById = flowElements.nodes.reduce<
    Record<string, FlowNode<FlowNodeData>>
  >((acc, node) => ({ ...acc, [node.id]: node }), {});

  graph.nodes = graph.nodes.map((node) => {
    const fromFlow = flowNodesById[node.id];
    const {
      data: { inputs: flowInputs },
    } = flowNodesById[node.id];

    return {
      ...node,
      inputs: node.inputs.map((i) => {
        // mainStmts is hidden from the graph
        if (i.name === MAGIC_OUTPUT_STMTS) {
          return i;
        }

        const inputFromFlow = ensure(
          flowInputs.find((f) => f.id === i.id),
          `Flow Node ${node.name} has no input ${i.id}`
        );
        return {
          ...i,
          ...(inputFromFlow.category
            ? { category: inputFromFlow.category }
            : null),
        };
      }),
      ...('value' in node
        ? { value: (fromFlow.data as FlowNodeDataData).value }
        : null),
    };
  });

  return graph;
};

const Editor: React.FC = () => {
  const { getRefData } = useHoisty();

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

  const [activeShader, setActiveShader] = useState<SourceNode>(
    graph.nodes[0] as SourceNode
  );

  const [vertex, setVertex] = useState<string | undefined>('');
  const [finalFragment, setFinalFragment] = useState<string | undefined>('');
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
      const updatedGraph = fromFlowToGraph(graph, flowElements);

      setGuiMsg('Compiling!');

      compileGraphAsync(updatedGraph, engine, ctx).then((compileResult) => {
        setNeedsCompile(false);
        console.log('comple async complete!', { compileResult });
        setGuiMsg('');
        setCompileResult(compileResult);
        setFinalFragment(compileResult.fragmentResult);
        setVertex(compileResult.vertexResult);

        const byId = updatedGraph.nodes.reduce<Record<string, GraphNode>>(
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

        setFlowElements({
          ...flowElements,
          nodes: updatedFlowNodes,
        });

        // This is a hack to make the edges update to their handles if they move
        // https://github.com/wbkd/react-flow/issues/2008
        setTimeout(() => {
          updatedFlowNodes.forEach((node) => updateNodeInternals(node.id));
        }, 500);
      });
    },
    [updateNodeInternals, graph, setFlowElements]
  );

  const onNodeInputChange = useCallback(
    (id: string, event: React.FormEvent<HTMLInputElement>) => {
      setFlowElements(({ nodes, edges }) => ({
        nodes: nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  value: event.currentTarget.value,
                },
              }
            : node
        ),
        edges,
      }));
      debouncedSetNeedsCompile(true);
    },
    [setFlowElements, debouncedSetNeedsCompile]
  );

  const onInputCategoryToggle = useCallback(
    (id: string, inputName: string) => {
      setFlowElements(({ nodes, edges }) => ({
        nodes: nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  inputs: node.data.inputs.map((i) =>
                    i.name === inputName
                      ? {
                          ...i,
                          category: i.category === 'data' ? 'code' : 'data',
                        }
                      : i
                  ),
                },
              }
            : node
        ),
        edges,
      }));
      debouncedSetNeedsCompile(true);
    },
    [setFlowElements, debouncedSetNeedsCompile]
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

        const initFlowElements = initialElements.nodes.length
          ? initialElements
          : initializeFlowElementsFromGraph(
              graph,
              onNodeInputChange,
              onInputCategoryToggle
            );

        compile(engine, newCtx, pauseCompile, initFlowElements);
        setGuiMsg('');
      }, 10);
    },
    [compile, engine, pauseCompile, onNodeInputChange, onInputCategoryToggle]
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
    const target = flowElements.nodes.find(
      (elem) => elem.id === newEdge.source
    );
    if (!target) {
      return;
    }

    const edgeType = (target.data as FlowNodeDataData).type;
    const type: EdgeType | undefined =
      (target.data as FlowNodeSourceData).stage || edgeType;

    if (newEdge.source === null || newEdge.target === null) {
      throw new Error('No source or target');
    }

    const addedEdge: FlowEdge<FlowEdgeData> = {
      ...newEdge,
      id: `${newEdge.source}-${newEdge.target}`,
      source: newEdge.source,
      target: newEdge.target,
      data: { type },
      className: cx(type, edgeType),
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

  const onEdgesChange = useCallback(
    (changes) =>
      setFlowElements((flowElements) =>
        setBiStages({
          nodes: flowElements.nodes,
          edges: collapseBinaryEdges(
            graph,
            applyEdgeChanges(changes, flowElements.edges)
          ),
        })
      ),
    [setFlowElements, graph]
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
    if (!('value' in node.data)) {
      setActiveShader(graph.nodes.find((n) => n.id === node.id) as SourceNode);
      setEditorTabIndex(1);
    }
  };

  const setTargets = (nodeId: string, handleType: string) => {
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

  const mouse = useRef<{ real: XYPosition; projected: XYPosition }>({
    real: { x: 0, y: 0 },
    projected: { x: 0, y: 0 },
  });
  const { project } = useReactFlow();
  const onMouseMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      mouse.current.real = { x: event.clientX, y: event.clientY };
      mouse.current.projected = project(mouse.current.real);
    },
    [project]
  );

  const [menuPos, setMenuPos] = useState<XYPosition | null>();

  const onMenuAdd = (type: string) => {
    console.log(type);
    const id = makeId();
    // let newNode: FlowNode<FlowNodeData>;
    let newGn: GraphNode;

    if (type === 'number') {
      newGn = numberNode(id, 'number', '1');
    } else if (type === 'multiply') {
      newGn = multiplyNode(id);
    } else if (type === 'add') {
      newGn = addNode(id);
    } else {
      throw new Error('Unknown type "' + type + '"');
    }
    // TODO: When adding an add node, there's the error "flow node has no input"
    // "a" - inside fromFlowToGraph() below - why?
    computeContextForNodes(ctx as EngineContext<any>, engine, graph, [newGn]);
    const newNode = graphNodeToFlowNode(
      newGn,
      onNodeInputChange,
      onInputCategoryToggle,
      project(menuPos as XYPosition)
    );
    // console.log('computed', { newGn });
    const updatedFlowElements = {
      ...flowElements,
      nodes: [...flowElements.nodes, newNode],
    };
    const updatedGraph = {
      ...graph,
      nodes: [...graph.nodes, newGn],
    };
    setFlowElements(updatedFlowElements);
    setGraph(fromFlowToGraph(updatedGraph, updatedFlowElements));
    setMenuPos(null);
  };

  useHotkeys('esc', () => setMenuPos(null));
  useHotkeys('shift+a', () => setMenuPos(mouse.current.real));

  useEffect(() => {
    if (needsCompile) {
      compile(engine, ctx as EngineContext<any>, pauseCompile, flowElements);
    }
  }, [needsCompile, flowElements, ctx, pauseCompile, compile, engine]);

  const onContainerClick = (event: React.MouseEvent<HTMLElement>) => {
    if (!hasParent(event.target as HTMLElement, '#x-context-menu')) {
      setMenuPos(null);
    }
  };

  return (
    <div className={styles.container} onClick={onContainerClick}>
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
            {window.location.href.indexOf('localhost') > -1 ? (
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
            ) : null}
            <button
              className={styles.formButton}
              onClick={() => {
                localStorage.clear();
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
            <TabGroup>
              <Tab>Graph</Tab>
              <Tab>
                Editor ({activeShader.name} -{' '}
                {'stage' in activeShader
                  ? activeShader.stage
                  : activeShader.type}
                )
              </Tab>
            </TabGroup>
            <TabPanels>
              <TabPanel onMouseMove={onMouseMove}>
                {menuPos ? (
                  <ContextMenu position={menuPos} onAdd={onMenuAdd} />
                ) : null}
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
                <div className={styles.belowTabs}>
                  <SplitPane split="horizontal">
                    <div className={styles.splitInner}>
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
                      <CodeEditor
                        engine={engine}
                        defaultValue={activeShader.source}
                        onSave={() => {
                          compile(
                            engine,
                            ctx as EngineContext<any>,
                            pauseCompile,
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
                    <div
                      className={cx(styles.splitInner, styles.nodeEditorPanel)}
                    >
                      <StrategyEditor
                        ctx={ctx}
                        node={
                          graph.nodes.find(
                            ({ id }) => id === activeShader.id
                          ) as SourceNode
                        }
                        onSave={() =>
                          compile(
                            engine,
                            ctx as EngineContext<any>,
                            pauseCompile,
                            flowElements
                          )
                        }
                      ></StrategyEditor>
                    </div>
                  </SplitPane>
                </div>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </div>
        {/* 3d display split */}
        <div ref={rightSplit} className={styles.splitInner}>
          <Tabs selected={tabIndex} onSelect={setTabIndex}>
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
                  <TabGroup className={styles.secondary}>
                    <Tab className={{ [styles.errored]: state.vertError }}>
                      Vertex
                    </Tab>
                    <Tab className={{ [styles.errored]: state.fragError }}>
                      Fragment
                    </Tab>
                  </TabGroup>
                  <TabPanels>
                    <TabPanel>
                      {state.vertError && (
                        <div className={styles.codeError}>
                          {state.vertError}
                        </div>
                      )}
                      <CodeEditor engine={engine} readOnly value={vertex} />
                    </TabPanel>
                    <TabPanel>
                      {state.fragError && (
                        <div className={styles.codeError}>
                          {state.fragError}
                        </div>
                      )}
                      <CodeEditor
                        engine={engine}
                        readOnly
                        value={finalFragment}
                      />
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

const StrategyEditor = ({
  node,
  onSave,
  ctx,
}: {
  node: SourceNode;
  onSave: () => void;
  ctx?: EngineContext<any>;
}) => {
  if (!ctx) {
    return null;
  }
  const { inputs } = node;
  return (
    <div>
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
          ? inputs.map((i) => i.name).join(', ')
          : 'No inputs found'}
      </div>
    </div>
  );
};

const ctxNodes: [string, string][] = [
  ['number', 'Number'],
  ['add', 'Add'],
  ['multiply', 'Multiply'],
];
const ContextMenu = ({
  position,
  onAdd,
}: {
  onAdd: (name: string) => void;
  position: XYPosition;
}) => {
  return (
    <div
      id="x-context-menu"
      className={ctxStyles.contextMenu}
      style={{ top: position.y, left: position.x }}
    >
      <div className={ctxStyles.contextHeader}>Add a Node</div>
      {ctxNodes.map(([type, display]) => (
        <div
          key={type}
          className={ctxStyles.contextRow}
          onClick={() => onAdd(type)}
        >
          {display}
        </div>
      ))}
    </div>
  );
};

const WithProvider = () => (
  <ReactFlowProvider>
    <Hoisty>
      <Editor />
    </Hoisty>
  </ReactFlowProvider>
);

export default WithProvider;
