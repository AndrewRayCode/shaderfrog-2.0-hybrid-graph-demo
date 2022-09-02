import styles from '../../pages/editor/editor.module.css';
import debounce from 'lodash.debounce';

import FlowEditor, { MouseData, useEditorStore } from './FlowEditor';

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
} from '../../core/nodes/engine-node';
import {
  Engine,
  EngineContext,
  convertToEngine,
  EngineNodeType,
} from '../../core/engine';
import { shaderSectionsToAst } from '../../ast/shader-sections';

import useThrottle from '../hooks/useThrottle';

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
import { useAsyncExtendedState } from '../hooks/useAsyncExtendedState';
// import { usePromise } from '../usePromise';

import { FlowEdgeData } from './flow/FlowEdge';
import {
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
  collectDataInputsFromNodes,
  UICompileGraphResult,
} from '../uICompileGraphResult';
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
  numberNode,
  numberUniformData,
  textureNode,
  Vector2,
  Vector3,
  Vector4,
  vectorNode,
  vectorUniformData,
} from '../../core/nodes/data-nodes';
import { makeEdge } from '../../core/nodes/edge';
import { SourceNode } from '../../core/nodes/code-nodes';
import { makeId } from '../../util/id';
import { hasParent } from '../../util/hasParent';
import { useWindowSize } from '../hooks/useWindowSize';

export type PreviewLight = 'point' | '3point' | 'spot';

const SMALL_SCREEN_WIDTH = 500;

const expandUniformDataNodes = (graph: Graph): Graph =>
  graph.nodes.reduce<Graph>((updated, node) => {
    if ('config' in node && node.config.uniforms) {
      const newNodes = node.config.uniforms.reduce<[GraphNode[], GraphEdge[]]>(
        (acc, uniform) => {
          let n;
          switch (uniform.type) {
            case 'sampler2D': {
              n = textureNode(makeId(), 'sampler2D', uniform.value);
              break;
            }
            case 'number': {
              n = numberNode(makeId(), 'number', uniform.value, {
                range: uniform.range,
                stepper: uniform.stepper,
              });
              break;
            }
            case 'vector2': {
              n = vectorNode(makeId(), 'vector2', uniform.value as Vector2);
              break;
            }
            case 'vector3': {
              n = vectorNode(makeId(), 'vector3', uniform.value as Vector3);
              break;
            }
            case 'vector4': {
              n = vectorNode(makeId(), 'vector4', uniform.value as Vector4);
              break;
            }
          }
          return [
            [...acc[0], n],
            [
              ...acc[1],
              makeEdge(
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
 *    - abstracted out editor component, which broke new node addition location
 *      on shift+a / right-click
 *    - trying to get physical material transmission working but setting
 *      transmission uniform sitll makes material see thru and setting
 *      thickness / ior properties don't have the expected changes
 *    - trying out dropdowns in the UI to support examples, hard coded hi/bye
 *    - added ability to edit final shader source
 *    - added scene background
 *    - moved source to left pane
 *    - Got transmission working. The initial issue was that to tell threejs to
 *      render the transmission rendertarget, the material property in
 *      ThreeComponent needs material.transmission set on it. However to get the
 *      rest of the uniforms on the material, three copies the material
 *      properties onto the shader uniforms, overwriting external uniforms.
 *      This is a deviation from Shaderfrog's GLSL uniforms strategy where
 *      material properties need to be set from the graph. And some, like map,
 *      require both the uniform and the material property to work together.
 *    - Adding properties to materials, need to use in ThreeComponent, need to
 *      distinguish between vertex and fragment properties, properties changes
 *      shouldn't cause a recompile
 *    - wow like 3 years ago I was trying to make a dropdown to change the
 *      scene background and add additional geometry types, and trying to add
 *      EXAMPLES
 *    - Plugging in albedo now fails because it's treated and data and tried to
 *      be evaluated. Need to auto-set inputs similar to colorization
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
 *   - Add more syntax highlighting to the GLSL editor, look at vscode
 *     plugin? https://github.com/stef-levesque/vscode-shader/tree/master/syntaxes
 *   - Allow dragging uniform edge out backwards to create a data node for it
 *   - Auto rename the data inputs to uniforms to be that uniform name
 *   - Uniform strategy should be added as default ot all shaders
 *   - If the source code tab is focused in three.js, recompilation doesn't happen
 *   - Add three.js ability to switch lighting megashader
 *   - Sort node inputs into engine, uniforms, properties
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
 *   - Deleting a node while it's plugged into the output (maybe any connected
 *     node, i repro'd with the Physical node) node causes crash
 *   - Adding together a three.js phong and physical lighting model fails to
 *     compiles becaues it introduces duplicated structs - structs aren't
 *     suffixed/renamed? Interesting
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
 *
 * I don't remember what this is
 * - Here we hardcode "out" for the inputs which needs to line up with
 *   the custom handles.
 */

type FlowElement = FlowNode<FlowNodeData> | FlowEdge<FlowEdgeData>;
type FlowEdgeOrLink = FlowEdge<FlowEdgeData>;
type FlowElements = {
  nodes: FlowNode<FlowNodeData>[];
  edges: FlowEdgeOrLink[];
};

// Default node setup
const useTestingNodeSetup = () => {
  const [flowElements, setFlowElements, resetFlowElements] =
    useLocalStorage<FlowElements>('flow', {
      nodes: [],
      edges: [],
    });

  const [graph, setGraph, resetGraph] = useLocalStorage<Graph>('graph', () => {
    // const expression = expressionNode(makeId(), 'Expression', 'a + b / c');
    const outputF = outputNode(makeId(), 'Output', 'fragment');
    const outputV = outputNode(makeId(), 'Output', 'vertex', outputF.id);

    // const phongGroupId = makeId();
    // const phongF = phongNode(makeId(), 'Phong', phongGroupId, 'fragment');
    // const phongV = phongNode(
    //   makeId(),
    //   'Phong',
    //   phongGroupId,
    //   'vertex',
    //   phongF.id
    // );

    const physicalGroupId = makeId();
    const physicalF = physicalNode(
      makeId(),
      'Physical',
      physicalGroupId,
      [
        // numberUniformData('thickness', '0.6'),
        numberUniformData('metalness', '0.4'),
        // numberUniformData('transmission', '0'),
        numberUniformData('roughness', '0.2'),
        vectorUniformData('diffuse', ['1', '0.5', '0.5']),
      ],
      'fragment'
    );
    const physicalV = physicalNode(
      makeId(),
      'Physical',
      physicalGroupId,
      [],
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
    return expandUniformDataNodes({
      nodes: [
        physicalF,
        physicalV,
        // solidColorF,
        // fireF,
        // fireV,
        // fluidF,
        outputF,
        outputV,
        // outlineF,
        // outlineV,
        // hellOnEarthF,
        // hellOnEarthV,
        perlinCloudsF,
        purpleNoise,
        // heatShaderF,
        // heatShaderV,
        // staticShader,
      ],
      edges: [
        makeEdge(
          physicalF.id,
          outputF.id,
          'out',
          'filler_frogFragOut',
          'fragment'
        ),
        makeEdge(
          physicalV.id,
          outputV.id,
          'out',
          'filler_gl_Position',
          'vertex'
        ),
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

      const dataInputs = collectDataInputsFromNodes(graph, [
        result.outputFrag,
        result.outputVert,
      ]);

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
        dataInputs,
        graph,
      });
    }, 0);
  });

// Determine the stage of a node (vertex/fragment) by recursively looking at
// the noddes that feed into this one, until we find one that has a stage set
const findInputStage = (
  ids: Record<string, FlowNode<FlowNodeData>>,
  edgesByTarget: Record<string, FlowEdge<FlowEdgeData>[]>,
  node: FlowNode<FlowNodeData>
): ShaderStage | undefined => {
  let nodeData = node.data as FlowNodeSourceData;
  return (
    (!nodeData?.biStage && nodeData?.stage) ||
    (edgesByTarget[node.id] || []).reduce<ShaderStage | undefined>(
      (found, edge) => {
        const type = edge.data?.type;
        return (
          found ||
          (type === 'fragment' || type === 'vertex' ? type : false) ||
          findInputStage(ids, edgesByTarget, ids[edge.source])
        );
      },
      undefined
    )
  );
};

const setFlowNodeCategories = (
  flowElements: FlowElements,
  dataNodes: Record<string, GraphNode>
): FlowElements => ({
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
});

// Some nodes, like add, can be used for either fragment or vertex stage. When
// we connect edges in the graph, update it to figure out which stage we should
// set the add node to based on inputs to the node.
const setFlowNodeStages = (flowElements: FlowElements): FlowElements => {
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
    .filter(({ displayName }) => displayName !== MAGIC_OUTPUT_STMTS)
    .map((input) => ({
      id: input.id,
      name: input.displayName,
      baked: input.baked,
      bakeable: input.bakeable,
      validTarget: false,
      accepts: input.accepts,
    }));

const graphNodeToFlowNode = (
  node: GraphNode,
  onInputBakedToggle: any,
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
        onInputBakedToggle,
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
  onInputBakedToggle: any
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
      onInputBakedToggle,
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

  return setFlowNodeStages({ nodes, edges });
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
        if (node.name === 'Output') {
          console.log({ node, i });
        }
        // mainStmts is hidden from the graph
        if (i.displayName === MAGIC_OUTPUT_STMTS) {
          return i;
        }

        const inputFromFlow = ensure(
          flowInputs.find((f) => f.id === i.id),
          `Flow Node ${node.name} has no input ${i.id}`
        );
        return {
          ...i,
          ...(inputFromFlow.baked ? { baked: inputFromFlow.baked } : null),
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
  } = useTestingNodeSetup();

  const sceneSplit = useRef<HTMLDivElement>(null);

  // tabIndex may still be needed to pause rendering
  const [tabIndex, setTabIndex] = useState<number>(0);
  const [sceneTabIndex, setSceneTabIndex] = useState<number>(0);
  const [editorTabIndex, setEditorTabIndex] = useState<number>(0);
  const [guiMsg, setGuiMsg] = useState<string>('');
  const [lights, setLights] = useState<PreviewLight>('point');
  const [previewObject, setPreviewObject] = useState('torusknot');
  const [bg, setBg] = useState('on');

  const [activeShader, setActiveShader] = useState<SourceNode>(
    graph.nodes[0] as SourceNode
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
      graph: Graph,
      flowElements: FlowElements
    ) => {
      const updatedGraph = fromFlowToGraph(graph, flowElements);

      setGuiMsg('Compiling!');

      compileGraphAsync(updatedGraph, engine, ctx).then((compileResult) => {
        setNeedsCompile(false);
        console.log('comple async complete!', { compileResult });
        setGuiMsg('');
        setCompileResult(compileResult);

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
      });
    },
    [updateNodeInternals, setFlowElements]
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
    [setFlowElements, compileResult, debouncedSetNeedsCompile, setGraph, graph]
  );

  const onInputBakedToggle = useCallback(
    (id: string, inputId: string) => {
      setFlowElements(({ nodes, edges }) => ({
        nodes: nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  inputs: node.data.inputs.map((i) =>
                    i.id === inputId
                      ? {
                          ...i,
                          baked: !i.baked,
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
      return compile(engine, ctx, graph, flowElements);
    },
    [engine, compile, graph, flowElements]
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
          : initializeFlowElementsFromGraph(graph, onInputBakedToggle);

        compile(engine, newCtx, graph, initFlowElements);
        setGuiMsg('');
      }, 10);
    },
    [compile, engine, onInputBakedToggle]
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
      flowElements,
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

  const onSplitResize = useThrottle(() => {
    if (sceneSplit.current) {
      const { width, height } = sceneSplit.current.getBoundingClientRect();
      extendState({ width, height });
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
      const updatedFlowElements = setFlowNodeStages({
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
        const updatedFlowGraph = setFlowNodeStages({
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

  const mouseRef = useRef<MouseData>({
    real: { x: 0, y: 0 },
    projected: { x: 0, y: 0 },
  });

  const { project } = useReactFlow();
  const onMouseMove = useCallback((event: MouseEvent<HTMLDivElement>) => {
    mouseRef.current.real = { x: event.clientX, y: event.clientY };
  }, []);

  const setMenuPos = useEditorStore((state) => state.setMenuPosition);
  const menuPosition = useEditorStore((state) => state.menuPosition);

  const onMenuAdd = (type: string) => {
    const id = makeId();
    const groupId = makeId();
    let newGns: GraphNode[];

    if (type === 'number') {
      newGns = [numberNode(id, 'number', '1')];
    } else if (type === 'sampler2D') {
      newGns = [textureNode(id, 'sampler2D', 'grayscale-noise')];
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
          {
            version: 2,
            preprocess: true,
            strategies: [
              uniformStrategy(),
              texture2DStrategy(),
              declarationOfStrategy('replaceMe'),
            ],
          },
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

    // Put the new nodes in the graph first, because computing context requires
    // the siblings / nextStage nodes to be present
    const updatedGraph = {
      ...graph,
      nodes: [...graph.nodes, ...newGns],
    };

    // Then compute the context before we convert to flow node, so that
    // inputs are created on the node correctly
    computeContextForNodes(ctx as EngineContext, engine, updatedGraph, newGns);

    const pos = project(menuPosition as XYPosition);

    // Now we're safe to compute the flow nodes
    const newNodes = newGns.map((newGn, index) => {
      return graphNodeToFlowNode(newGn, onInputBakedToggle, {
        x: pos.x + index * 20,
        y: pos.y + index * 20,
      });
    });

    // Then we can update react state
    const updatedFlowElements = {
      ...flowElements,
      nodes: [...flowElements.nodes, ...newNodes],
    };
    setFlowElements(updatedFlowElements);
    setGraph(fromFlowToGraph(updatedGraph, updatedFlowElements));
    setMenuPos();
  };

  useEffect(() => {
    if (needsCompile) {
      compile(engine, ctx as EngineContext, graph, flowElements);
    }
  }, [needsCompile, flowElements, ctx, graph, compile, engine]);

  const onContainerClick = (event: React.MouseEvent<HTMLElement>) => {
    if (!hasParent(event.target as HTMLElement, '#x-context-menu')) {
      setMenuPos();
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

  const doTheThing = () => {
    if (!ctx) {
      throw new Error('what');
    }
    const outputF = outputNode(makeId(), 'Output', 'fragment');
    const outputV = outputNode(makeId(), 'Output', 'vertex', outputF.id);
    const physicalGroupId = makeId();
    const physicalF = physicalNode(
      makeId(),
      'Physical',
      physicalGroupId,
      [
        numberUniformData('metalness', '0.6'),
        vectorUniformData('diffuse', ['1', '0.5', '0.5']),
      ],
      'fragment'
    );
    const physicalV = physicalNode(
      makeId(),
      'Physical',
      physicalGroupId,
      [],
      'vertex',
      physicalF.id
    );
    // setGraph(
    const newGraph = expandUniformDataNodes({
      nodes: [outputF, outputV, physicalF, physicalV],
      edges: [
        makeEdge(
          physicalF.id,
          outputF.id,
          'out',
          'filler_frogFragOut',
          'fragment'
        ),
        makeEdge(
          physicalV.id,
          outputV.id,
          'out',
          'filler_gl_Position',
          'vertex'
        ),
      ],
    });
    // );

    setGraph(newGraph);
    initializeGraph(
      {
        nodes: [],
        edges: [],
      },
      ctx,
      newGraph
    );
  };

  return (
    <div className={styles.container} onClick={onContainerClick}>
      <SplitPane
        split={smallScreen ? 'horizontal' : 'vertical'}
        onChange={onSplitResize}
        defaultSizes={defaultMainSplitSize}
      >
        <div className={styles.splitInner}>
          <div className={styles.tabControls}>
            <div className={styles.activeEngine}>
              {engine === babylengine ? 'Babylon.js' : 'Three.js'}
            </div>
            <button className={styles.formButton} onClick={doTheThing}>
              Help
            </button>
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
              <TabPanel onMouseMove={onMouseMove}>
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
                  onConnectStop={onConnectStop}
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
                            graph,
                            flowElements
                          )
                        }
                      ></StrategyEditor>
                    </div>
                  </SplitPane>
                </div>
              </TabPanel>
              {/* Final source code tab */}
              <TabPanel>
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
                    <TabPanel>
                      {state.fragError && (
                        <div
                          className={styles.codeError}
                          title={state.fragError}
                        >
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
                    <TabPanel>
                      {state.vertError && (
                        <div
                          className={styles.codeError}
                          title={state.vertError}
                        >
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
        </div>
        {/* 3d display split */}
        <div ref={sceneSplit} className={styles.splitInner}>
          <div className={styles.scene}>
            {engine.name === 'three' ? (
              <ThreeComponent
                initialCtx={ctx}
                bg={bg}
                setBg={setBg}
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
          </div>
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
          ? inputs.map((i) => i.displayName).join(', ')
          : 'No inputs found'}
      </div>
    </div>
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
