import {
  collectConnectedNodes,
  compileGraph,
  computeGraphContext,
  filterGraphNodes,
  Graph,
  GraphNode,
  isDataInput,
} from '../../core/graph';
import { Edge as GraphEdge, EdgeType, makeEdge } from '../../core/nodes/edge';
import {
  Engine,
  EngineContext,
  convertToEngine,
  convertNode,
} from '../../core/engine';
import { UICompileGraphResult } from '../uICompileGraphResult';
import { generate } from '@shaderfrog/glsl-parser';
import { shaderSectionsToProgram } from '../../ast/shader-sections';

import {
  arrayNode,
  colorNode,
  numberNode,
  samplerCubeNode,
  textureNode,
  Vector2,
  Vector3,
  Vector4,
  vectorNode,
} from '../../core/nodes/data-nodes';

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
import { makeId } from '../../util/id';
import {
  addNode,
  multiplyNode,
  phongNode,
  sourceNode,
  toonNode,
} from '../../core/nodes/engine-node';
import {
  declarationOfStrategy,
  texture2DStrategy,
  uniformStrategy,
} from '../../core/strategy';
import { serpentF, serpentV } from '../../shaders/serpentNode';
import { badTvFrag } from '../../shaders/badTvNode';
import whiteNoiseNode from '../../shaders/whiteNoiseNode';
import { babylengine } from '../../plugins/babylon/bablyengine';

const compileGraphAsync = async (
  graph: Graph,
  engine: Engine,
  ctx: EngineContext
): Promise<UICompileGraphResult> =>
  new Promise((resolve, reject) => {
    setTimeout(async () => {
      console.warn('Compiling!', graph, 'for nodes', ctx.nodes);

      const allStart = performance.now();

      let result;

      try {
        await computeGraphContext(ctx, engine, graph);
        result = compileGraph(ctx, engine, graph);
      } catch (err) {
        return reject(err);
      }
      const fragmentResult = generate(
        shaderSectionsToProgram(result.fragment, engine.mergeOptions).program
      );
      const vertexResult = generate(
        shaderSectionsToProgram(result.vertex, engine.mergeOptions).program
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

const createGraphNode = (
  nodeDataType: string,
  name: string,
  position: { x: number; y: number },
  engine: string | undefined,
  newEdgeData?: Omit<GraphEdge, 'id' | 'from'>,
  defaultValue?: any
): [Set<string>, Graph] => {
  const makeName = (type: string) => name || type;
  const id = makeId();
  const groupId = makeId();
  let newGns: GraphNode[];

  if (nodeDataType === 'number') {
    newGns = [
      numberNode(
        id,
        makeName('number'),
        position,
        defaultValue === undefined || defaultValue === null ? '1' : defaultValue
      ),
    ];
  } else if (nodeDataType === 'texture') {
    newGns = [
      textureNode(
        id,
        makeName('texture'),
        position,
        defaultValue || 'grayscale-noise'
      ),
    ];
  } else if (nodeDataType === 'vector2') {
    newGns = [
      vectorNode(id, makeName('vec2'), position, defaultValue || ['1', '1']),
    ];
  } else if (nodeDataType === 'array') {
    newGns = [
      arrayNode(id, makeName('array'), position, defaultValue || ['1', '1']),
    ];
  } else if (nodeDataType === 'vector3') {
    newGns = [
      vectorNode(
        id,
        makeName('vec3'),
        position,
        defaultValue || ['1', '1', '1']
      ),
    ];
  } else if (nodeDataType === 'vector4') {
    newGns = [
      vectorNode(
        id,
        makeName('vec4'),
        position,
        defaultValue || ['1', '1', '1', '1']
      ),
    ];
  } else if (nodeDataType === 'rgb') {
    newGns = [
      colorNode(id, makeName('rgb'), position, defaultValue || ['1', '1', '1']),
    ];
  } else if (nodeDataType === 'rgba') {
    newGns = [
      colorNode(
        id,
        makeName('rgba'),
        position,
        defaultValue || ['1', '1', '1', '1']
      ),
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
  } else if (nodeDataType === 'badTv') {
    newGns = [badTvFrag(id, position)];
  } else if (nodeDataType === 'whiteNoiseNode') {
    newGns = [whiteNoiseNode(id, position)];
  } else if (nodeDataType === 'checkerboardF') {
    newGns = [
      checkerboardF(id, position),
      checkerboardV(makeId(), id, position),
    ];
  } else if (nodeDataType === 'serpent') {
    newGns = [serpentF(id, position), serpentV(makeId(), id, position)];
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
      samplerCubeNode(
        id,
        makeName('samplerCube'),
        position,
        'warehouseEnvTexture'
      ),
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
          strategies: [uniformStrategy(), texture2DStrategy()],
        },
        nodeDataType === 'fragment'
          ? `void main() {
  gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
}`
          : `void main() {
  gl_Position = vec4(1.0);
}`,
        nodeDataType,
        engine
      ),
    ];
  } else {
    throw new Error(
      `Could not create node: Unknown node type "${nodeDataType}'"`
    );
  }

  // Hack: Auto-converting nodes to threejs for testing
  newGns.forEach((gn) => {
    if (gn.type === 'source' && engine === 'babylon') {
      convertNode(gn, babylengine.importers.three);
    }
  });

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

  // Expand uniforms on new nodes automatically
  const originalNodes = new Set<string>(newGns.map((n) => n.id));
  return [
    originalNodes,
    expandUniformDataNodes({ nodes: newGns, edges: newGEs }),
  ];
};

export { createGraphNode, expandUniformDataNodes, compileGraphAsync };
