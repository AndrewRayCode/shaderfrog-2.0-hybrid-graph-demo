import { useHotkeys } from 'react-hotkeys-hook';
import styles from '../../pages/editor/editor.module.css';
import ctxStyles from './context.menu.module.css';
import debounce from 'lodash.debounce';
import create from 'zustand';

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
  collectConnectedNodes,
} from '../../core/graph';
import { Edge as GraphEdge, EdgeType } from '../../core/nodes/edge';
import {
  outputNode,
  addNode,
  sourceNode,
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
  IndexedDataInputs,
  UICompileGraphResult,
} from '../uICompileGraphResult';
import { useLocalStorage } from '../useLocalStorage';
import { Strategy, StrategyType, uniformStrategy } from '../../core/strategy';
import { ensure } from '../../util/ensure';
import {
  GraphDataType,
  numberNode,
  vectorNode,
} from '../../core/nodes/data-nodes';
import { makeEdge } from '../../core/nodes/edge';
import { SourceNode } from '../../core/nodes/code-nodes';
import { makeId } from '../../util/id';
import { hasParent } from '../../util/hasParent';
import { FlowEventHack } from '../flowEventHack';

export type PreviewLight = 'point' | '3point' | 'spot';

// const useStore = create((set) => ({
//   bears: 0,
//   increasePopulation: () => set((state) => ({ bears: state.bears + 1 })),
//   removeAllBears: () => set({ bears: 0 }),
// }));

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

/**
 * Where was I?
 *  - Just added dynamic material properties, aka plugging in "albdeo" causes
 *    three material to get "map", and fixed bug with vertex/fragment shader
 *    having different code, by adding caching mechanism based on group id
 * - Maybe making vec3 data work next would be helpful
 * - bug adding toon because its not in graph when it looks for sibling
 * - Caching contexts would be helpful
 *
 * ✅ TODO ✅
 *
 * Experimentation ideas
 * - Try SDF image shader https://www.youtube.com/watch?v=1b5hIMqz_wM
 * - Put other images in the graph like the toon step shader
 * - Have uniforms added per shader in the graph
 *
 * Fundamental Issues
 * - The three.js material has properties like "envMap" and "reflectivity" which
 *   do different things based on shader settings. They are independent of the
 *   uniforms and/or set the uniforms. Right now there's no way to plug into
 *   a property like "map" or "envMap". Should there be a separate "properties"
 *   section on each node?
 *
 * Polish / Improvements
 * - UX
 *   - Add more syntax highlighting to the GLSL editor, look at vscode
 *     plugin? https://github.com/stef-levesque/vscode-shader/tree/master/syntaxes
 *   - Allow dragging uniform edge out backwards to create a data node for it
 *   - Auto rename the data inputs to uniforms to be that uniform name
 *   - Uniform strategy should be added as default ot all shaders
 *   - If the source code tab is focused in three.js, recompilation doesn't happen
 *   - Add three.js ability to switch lighting megashader
 * - Core
 *   - Recompiling re-parses / re-compiles the entire graph, nothing is memoized.
 *     Can we use immer or something else to preserve and update the original AST
 *     so it can be reused?
 *   - Break up graph.ts into more files, lke core parsers maybe
 *   - onBeforeCompile in threngine mutates the node to add the source - can
 *     we make this an immutable update in graph.ts?
 *
 * Features
 * - Ability to export shaders + use in engine
 * - Enable backfilling of uv param
 * - Allow for shader being duplicated in a main fn to allow it to
 *   be both normal map and albdeo
 * - Add types to the connections (like vec3/float), and show the types on
 *   the inputs/ouputs, and prevent wrong types from being connected
 * - Re-add the three > babylon conversion
 * - Add image data nodes to the graph
 * - Add persistable shaders to a db!
 * - Shader node editor specific undo history
 *
 * Bugs
 * - UI
 *   - Hot reload of nextjs kicks context into babylon?
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
 * - Nodes / Graph
 *   - Deleting a node while it's plugged into the output (maybe any connected
 *     node, i repro'd with the Physical node) node causes crash
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
 *
 * I don't remember what this is
 * - Here we hardcode "out" for the inputs which needs to line up with
 *   the custom handles.
 */
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

    const phongGroupId = makeId();
    const phongF = phongNode(makeId(), 'Phong', phongGroupId, 'fragment');
    const phongV = phongNode(
      makeId(),
      'Phong',
      phongGroupId,
      'vertex',
      phongF.id
    );

    const physicalGroupId = makeId();
    const physicalF = physicalNode(
      makeId(),
      'Physical',
      physicalGroupId,
      'fragment'
    );
    const physicalV = physicalNode(
      makeId(),
      'Physical',
      physicalGroupId,
      'vertex',
      physicalF.id
    );

    // const toonGroupId = makeId();
    // const toonF = toonNode(makeId(), 'Toon', toonGroupId, 'fragment');
    // const toonV = toonNode(makeId(), 'Toon', toonGroupId, 'vertex', toonF.id);

    const fluidF = fluidCirclesNode(makeId());
    const staticShader = staticShaderNode(makeId());
    const purpleNoise = purpleNoiseNode(makeId());
    const heatShaderF = heatShaderFragmentNode(makeId());
    const heatShaderV = heatShaderVertexNode(makeId(), heatShaderF.id);
    const fireF = fireFrag(makeId());
    const fireV = fireVert(makeId(), fireF.id);
    // const add = addNode(makeId());
    // const add2 = addNode(makeId());
    // const multiply = multiplyNode(makeId());
    const outlineF = outlineShaderF(makeId());
    const outlineV = outlineShaderV(makeId(), outlineF.id);
    const solidColorF = solidColorNode(makeId());
    const hellOnEarthF = hellOnEarthFrag(makeId());
    const hellOnEarthV = hellOnEarthVert(makeId(), hellOnEarthF.id);
    const perlinCloudsF = perlinCloudsFNode(makeId());
    // const num1 = numberNode(makeId(), 'number', '1');
    return expandDataElements({
      nodes: [
        physicalF,
        physicalV,
        solidColorF,
        fireF,
        fireV,
        fluidF,
        outputF,
        outputV,
        outlineF,
        outlineV,
        hellOnEarthF,
        hellOnEarthV,
        perlinCloudsF,
        purpleNoise,
        heatShaderF,
        heatShaderV,
        staticShader,
      ],
      edges: [
        makeEdge(physicalF.id, outputF.id, 'out', 'frogFragOut', 'fragment'),
        makeEdge(physicalV.id, outputV.id, 'out', 'gl_Position', 'vertex'),
      ],
    });
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
const collapseBinaryEdges = (flowGraph: FlowElements): FlowElements => {
  // Find all edges that flow into a binary node, grouped by the target node's
  // id, since we need to know the total number of edges per node first
  const binaryEdges = flowGraph.edges.reduce<Record<string, FlowEdgeOrLink[]>>(
    (acc, edge) => {
      const toNode = flowGraph.nodes.find(({ id }) => id === edge.target);
      return toNode?.type === NodeType.BINARY
        ? {
            ...acc,
            [toNode.id]: [...(acc[toNode.id] || []), edge],
          }
        : acc;
    },
    {}
  );

  // Then collapse them
  const updatedEdges = flowGraph.edges.map((edge) => {
    return edge.target in binaryEdges
      ? {
          ...edge,
          targetHandle: alphabet.charAt(binaryEdges[edge.target].indexOf(edge)),
        }
      : edge;
  });
  return {
    ...flowGraph,
    edges: updatedEdges,
  };
};

const flowStyles = { height: '100vh', background: '#111' };
type FlowElement = FlowNode<FlowNodeData> | FlowEdge<FlowEdgeData>;
type FlowEdgeOrLink = FlowEdge<FlowEdgeData>;
type FlowElements = {
  nodes: FlowNode<FlowNodeData>[];
  edges: FlowEdgeOrLink[];
};

const nodeTypes: Record<NodeType | GraphDataType | EngineNodeType, any> = {
  toon: SourceNodeComponent,
  phong: SourceNodeComponent,
  physical: SourceNodeComponent,
  shader: SourceNodeComponent,
  output: SourceNodeComponent,
  binary: SourceNodeComponent,
  source: SourceNodeComponent,
  vector2: DataNodeComponent,
  vector3: DataNodeComponent,
  vector4: DataNodeComponent,
  mat2: DataNodeComponent,
  mat3: DataNodeComponent,
  mat4: DataNodeComponent,
  mat2x2: DataNodeComponent,
  mat2x3: DataNodeComponent,
  mat2x4: DataNodeComponent,
  mat3x2: DataNodeComponent,
  mat3x3: DataNodeComponent,
  mat3x4: DataNodeComponent,
  mat4x2: DataNodeComponent,
  mat4x3: DataNodeComponent,
  mat4x4: DataNodeComponent,
  sampler2D: DataNodeComponent,
  number: DataNodeComponent,
  array: DataNodeComponent,
};

const edgeTypes = {
  special: FlowEdgeComponent,
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

      // Find which nodes flow up into uniform inputs, for colorizing and for
      // not recompiling when their data changes
      const dataNodes = Object.entries(activeUniforms).reduce<
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
        dataNodes,
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

const setFlowGraphNodeCategories = (
  flowElements: FlowElements,
  dataNodes: Record<string, GraphNode>
): FlowElements => {
  return {
    ...flowElements,
    nodes: flowElements.nodes.map((node) => {
      if (node.id in dataNodes) {
        return {
          ...node,
          data: {
            ...node.data,
            category: 'code',
          },
        };
      }
      return node;
    }),
  };
};

// Some nodes, like add, can be used for either fragment or vertex stage. When
// we connect edges in the graph, update it to figure out which stage we should
// set the add node to based on inputs to the node.
const setFlowGraphNodeStages = (flowElements: FlowElements): FlowElements => {
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
        inputs: toFlowInputs(node),
        outputs: node.outputs.map((o) => flowOutput(o.name)),
      };
  return {
    id: node.id,
    data,
    // type: isSourceNode(node) ? 'source' : 'data',
    type: node.type,
    position,
  };
};

const initializeFlowElementsFromGraph = (
  graph: Graph,
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

  return setFlowGraphNodeStages({ nodes, edges });
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
    lastEngine: Engine | null;
    engine: Engine;
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
  const [ctx, setCtxState] = useState<EngineContext>();

  // Compile function, meant to be called manually in places where we want to
  // trigger a compile. I tried making this a useEffect, however this function
  // needs to update "flowElements" at the end, which leads to an infinite loop
  const compile = useCallback(
    (
      engine: Engine,
      ctx: EngineContext,
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

        setFlowElements(
          setFlowGraphNodeCategories(
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
      });
    },
    [updateNodeInternals, graph, setFlowElements]
  );

  const onNodeValueChange = useCallback(
    (id: string, value: any) => {
      setFlowElements(({ nodes, edges }) => ({
        nodes: nodes.map((node) => {
          if (node.id === id) {
            node.data = { ...node.data, value };
          }
          return node;
        }),
        edges,
      }));
      const nodesWithUpdatedValue = graph.nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              value,
            }
          : node
      );
      setGraph((graph) => ({
        ...graph,
        nodes: nodesWithUpdatedValue,
      }));

      // TODO: How to avoid a recompile here if a data node *only* changes?
      if (!compileResult) {
        return;
      }
      const { dataNodes } = compileResult;
      if (!(id in dataNodes)) {
        debouncedSetNeedsCompile(true);
      }
    },
    [setFlowElements, compileResult, debouncedSetNeedsCompile, setGraph]
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
    (ctx: EngineContext) => {
      console.log('childCompile', ctx.nodes);
      return compile(engine, ctx, pauseCompile, flowElements);
    },
    [engine, compile, pauseCompile, flowElements]
  );

  const initializeGraph = useCallback(
    (initialElements: FlowElements, newCtx: EngineContext, graph: Graph) => {
      setGuiMsg(`🥸 Initializing ${engine.name}...`);
      setTimeout(() => {
        computeAllContexts(newCtx, engine, graph);
        console.log('Initializing flow nodes and compiling graph!', {
          graph,
          newCtx,
        });

        const initFlowElements = initialElements.nodes.length
          ? initialElements
          : initializeFlowElementsFromGraph(graph, onInputCategoryToggle);

        compile(engine, newCtx, pauseCompile, initFlowElements);
        setGuiMsg('');
      }, 10);
    },
    [compile, engine, pauseCompile, onInputCategoryToggle]
  );

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

    setFlowElements((flowElements) => {
      const updatedFlowElements = setFlowGraphNodeStages({
        ...flowElements,
        edges: [...updatedEdges, addedEdge],
      });
      return collapseBinaryEdges(updatedFlowElements);
    });
    setNeedsCompile(true);
  };

  const onConnect = (edge: FlowEdge | Connection) => addConnection(edge);

  const onEdgeUpdate = (oldEdge: FlowEdge, newConnection: Connection) =>
    addConnection(newConnection);

  const onEdgesDelete = (edges: Edge[]) => {
    setNeedsCompile(true);
  };

  // Used for selecting edges, also called when an edge is removed, along with
  // onEdgesDelete above
  const onEdgesChange = useCallback(
    (changes) =>
      setFlowElements((flowElements) => {
        const updatedFlowGraph = setFlowGraphNodeStages({
          nodes: flowElements.nodes,
          edges: applyEdgeChanges(changes, flowElements.edges),
        });
        return collapseBinaryEdges(updatedFlowGraph);
      }),
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
    const id = makeId();
    const groupId = makeId();
    // let newNode: FlowNode<FlowNodeData>;
    let newGns: GraphNode[];

    if (type === 'number') {
      newGns = [numberNode(id, 'number', '1')];
    } else if (type === 'vec2') {
      newGns = [vectorNode(id, 'vec2', ['1', '1'])];
    } else if (type === 'vec3') {
      newGns = [vectorNode(id, 'vec3', ['1', '1', '1'])];
    } else if (type === 'vec4') {
      newGns = [vectorNode(id, 'vec4', ['1', '1', '1', '1'])];
    } else if (type === 'multiply') {
      newGns = [multiplyNode(id)];
    } else if (type === 'add') {
      newGns = [addNode(id)];
    } else if (type === 'phong') {
      newGns = [
        phongNode(id, 'Phong', groupId, 'fragment'),
        phongNode(makeId(), 'Phong', groupId, 'vertex', id),
      ];
    } else if (type === 'toon') {
      newGns = [
        toonNode(id, 'Toon', groupId, 'fragment'),
        toonNode(makeId(), 'Toon', groupId, 'vertex', id),
      ];
    } else if (type === 'fragment' || type === 'vertex') {
      newGns = [
        sourceNode(
          makeId(),
          'Source Code ' + id,
          { version: 2, preprocess: true, strategies: [uniformStrategy()] },
          type === 'fragment'
            ? `void main() {
  gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
}`
            : `void main() {
  gl_Position = vec4(1.0);
}`,
          type,
          ctx?.engine
        ),
      ];
    } else {
      throw new Error('Unknown type "' + type + '"');
    }

    // TODO: Fails because newGns aren't in graph so it can't find sibling
    // to cache new node
    computeContextForNodes(ctx as EngineContext, engine, graph, newGns);

    const newNodes = newGns.map((newGn, index) => {
      // TODO: When adding an add node, there's the error "flow node has no input"
      // "a" - inside fromFlowToGraph() below - why?
      const pos = menuPos as XYPosition;
      return graphNodeToFlowNode(
        newGn,
        onInputCategoryToggle,
        project({
          x: pos.x + index * 20,
          y: pos.y + index * 20,
        })
      );
    });

    const updatedFlowElements = {
      ...flowElements,
      nodes: [...flowElements.nodes, ...newNodes],
    };
    const updatedGraph = {
      ...graph,
      nodes: [...graph.nodes, ...newGns],
    };
    setFlowElements(updatedFlowElements);
    setGraph(fromFlowToGraph(updatedGraph, updatedFlowElements));
    setMenuPos(null);
  };

  useHotkeys('esc', () => setMenuPos(null));
  useHotkeys('shift+a', () => setMenuPos(mouse.current.real));

  useEffect(() => {
    if (needsCompile) {
      compile(engine, ctx as EngineContext, pauseCompile, flowElements);
    }
  }, [needsCompile, flowElements, ctx, pauseCompile, compile, engine]);

  const onContainerClick = (event: React.MouseEvent<HTMLElement>) => {
    if (!hasParent(event.target as HTMLElement, '#x-context-menu')) {
      setMenuPos(null);
    }
  };

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

  const onContextMenu = useCallback((event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    setMenuPos(mouse.current.real);
  }, []);

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
              </>
            ) : null}
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
              <TabPanel onMouseMove={onMouseMove} onContextMenu={onContextMenu}>
                {menuPos ? (
                  <ContextMenu position={menuPos} onAdd={onMenuAdd} />
                ) : null}
                <FlowEventHack onChange={onNodeValueChange}>
                  <ReactFlow
                    nodes={flowElements.nodes}
                    edges={flowElements.edges}
                    style={flowStyles}
                    onConnect={onConnect}
                    onEdgeUpdate={onEdgeUpdate}
                    onEdgesChange={onEdgesChange}
                    onNodesChange={onNodesChange}
                    onNodesDelete={onNodesDelete}
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
                </FlowEventHack>
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
                              ctx as EngineContext,
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
                            ctx as EngineContext,
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
                            ctx as EngineContext,
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
  ctx?: EngineContext;
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
  ['fragment', 'Fragment'],
  ['vertex', 'Vertex'],
  ['number', 'Number'],
  ['vec2', 'Vector2'],
  ['vec3', 'Vector3'],
  ['vec4', 'Vector4'],
  ['add', 'Add'],
  ['multiply', 'Multiply'],
  ['phong', 'Phong'],
  ['toon', 'Toon'],
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
