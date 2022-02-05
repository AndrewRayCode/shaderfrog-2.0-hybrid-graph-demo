import { parser, generate } from '@shaderfrog/glsl-parser';
import {
  renameBindings,
  renameFunctions,
} from '@shaderfrog/glsl-parser/dist/parser/utils';
import { visit, AstNode, NodeVisitors } from '@shaderfrog/glsl-parser/dist/ast';
import preprocess from '@shaderfrog/glsl-parser/dist/preprocessor';
import { Engine, nodeName, EngineContext } from './graph';

import {
  ShaderType,
  convert300MainToReturn,
  makeExpression,
  Node,
  Edge,
  ShaderStage,
  doesLinkThruShader,
  Graph,
  returnGlPositionHardCoded,
  returnGlPosition,
} from './nodestuff';

import babf from './babylon-fragment';
import babv from './babylon-vertex';

export type RuntimeContext = {
  scene: any;
  camera: any;
  meshRef: any;
  BABYLON: any;
  // material: any;
  // index: number;
  // threeTone: any;
  cache: {
    nodes: {
      [id: string]: {
        // fragmentRef: any;
        // vertexRef: any;
        fragment: string;
        vertex: string;
      };
    };
  };
};

const onBeforeCompileMegaShader = (
  engineContext: EngineContext<RuntimeContext>,
  node: Node
  // newMat: any
) => {
  // const { nodes } = engineContext.runtime.cache;
  // const { renderer, meshRef, scene, camera, material, threeTone, three } =
  //   engineContext.runtime;
  // const mesh = meshRef.current;

  // mesh.material = newMat;
  // console.log('scene', JSON.parse(JSON.stringify(scene)));
  // renderer.compile(scene, camera);

  // // The references to the compiled shaders in WebGL
  // const fragmentRef = renderer.properties
  //   .get(mesh.material)
  //   .programs.values()
  //   .next().value.fragmentShader;
  // const vertexRef = renderer.properties
  //   .get(mesh.material)
  //   .programs.values()
  //   .next().value.vertexShader;

  // const gl = renderer.getContext();
  // const fragment = gl.getShaderSource(fragmentRef);
  // const vertex = gl.getShaderSource(vertexRef);

  engineContext.runtime.cache.nodes[node.id] = {
    // fragmentRef,
    // vertexRef,
    fragment: babf,
    vertex: babv,
  };
};

const megaShaderProduceVertexAst = (
  // todo: help
  engineContext: EngineContext<RuntimeContext>,
  engine: any,
  graph: Graph,
  node: Node,
  inputEdges: Edge[]
) => {
  const { nodes } = engineContext.runtime.cache;
  const { vertex } =
    nodes[node.id] || (node.nextStageNodeId && nodes[node.nextStageNodeId]);

  engineContext.debuggingNonsense.vertexSource = vertex;

  const vertexPreprocessed = preprocess(vertex, {
    preserve: {
      version: () => true,
    },
  });

  const vertexAst = parser.parse(vertexPreprocessed);
  engineContext.debuggingNonsense.vertexPreprocessed = vertexPreprocessed;

  // Do I need this? Is threejs shader already in 3.00 mode?
  // from2To3(vertexAst);

  if (doesLinkThruShader(graph, node)) {
    returnGlPositionHardCoded(vertexAst, 'vec3', 'transformed');
  } else {
    returnGlPosition(vertexAst);
  }

  renameBindings(vertexAst.scopes[0], (name) =>
    babylengine.preserve.has(name) ? name : `${name}_${node.id}`
  );
  renameFunctions(vertexAst.scopes[0], (name) =>
    name === 'main' ? nodeName(node) : `${name}_${node.id}`
  );
  return vertexAst;
};

const megaShaderFindPositionInputs = (
  engineContext: EngineContext<RuntimeContext>,
  node: Node,
  ast: AstNode
) => ({
  position: (fillerAst: AstNode) => {
    Object.entries(ast.scopes[0].bindings).forEach(
      ([name, binding]: [string, any]) => {
        binding.references.forEach((ref: AstNode) => {
          if (ref.type === 'identifier' && ref.identifier === 'position') {
            ref.identifier = generate(fillerAst);
          } else if (
            ref.type === 'parameter_declaration' &&
            ref.declaration.identifier.identifier === 'position'
          ) {
            ref.declaration.identifier.identifier = generate(fillerAst);
          }
        });
      }
    );
  },
});

const inputNameMap: { [key: string]: string } = {
  albedoSampler: 'albedo',
};
const texture2DInputFinder = (
  engineContext: EngineContext<RuntimeContext>,
  node: Node,
  ast: AstNode
) => {
  let texture2Dcalls: [string, AstNode, string][] = [];
  const visitors: NodeVisitors = {
    function_call: {
      enter: (path) => {
        if (
          // TODO: 100 vs 300
          (path.node.identifier?.specifier?.identifier === 'texture2D' ||
            path.node.identifier?.specifier?.identifier === 'texture') &&
          path.key
        ) {
          if (!path.parent) {
            throw new Error(
              'This is impossible a function call always has a parent'
            );
          }
          texture2Dcalls.push([
            generate(path.node.args[0]),
            path.parent,
            path.key,
          ]);
        }
      },
    },
  };
  visit(ast, visitors);
  const inputs = texture2Dcalls.reduce(
    (inputs, [name, parent, key], index) => ({
      ...inputs,
      [inputNameMap[name] || name]: (fillerAst: AstNode) => {
        parent[key] = fillerAst;
      },
    }),
    {}
  );

  return inputs;
};

export const babylengine: Engine<RuntimeContext> = {
  name: 'babylon',
  // TODO: Get from uniform lib?
  preserve: new Set<string>([
    'vAmbientInfos',
    'vOpacityInfos',
    'vEmissiveInfos',
    'vLightmapInfos',
    'vReflectivityInfos',
    'vMicroSurfaceSamplerInfos',
    'vReflectionInfos',
    'vReflectionFilteringInfo',
    'vReflectionPosition',
    'vReflectionSize',
    'vBumpInfos',
    'albedoMatrix',
    'ambientMatrix',
    'opacityMatrix',
    'emissiveMatrix',
    'lightmapMatrix',
    'reflectivityMatrix',
    'microSurfaceSamplerMatrix',
    'bumpMatrix',
    'vTangentSpaceParams',
    'reflectionMatrix',
    'vReflectionColor',
    'vAlbedoColor',
    'vLightingIntensity',
    'vReflectionMicrosurfaceInfos',
    'pointSize',
    'vReflectivityColor',
    'vEmissiveColor',
    'visibility',
    'vMetallicReflectanceFactors',
    'vMetallicReflectanceInfos',
    'metallicReflectanceMatrix',
    'vClearCoatParams',
    'vClearCoatRefractionParams',
    'vClearCoatInfos',
    'clearCoatMatrix',
    'clearCoatRoughnessMatrix',
    'vClearCoatBumpInfos',
    'vClearCoatTangentSpaceParams',
    'clearCoatBumpMatrix',
    'vClearCoatTintParams',
    'clearCoatColorAtDistance',
    'vClearCoatTintInfos',
    'clearCoatTintMatrix',
    'vAnisotropy',
    'vAnisotropyInfos',
    'anisotropyMatrix',
    'vSheenColor',
    'vSheenRoughness',
    'vSheenInfos',
    'sheenMatrix',
    'sheenRoughnessMatrix',
    'vRefractionMicrosurfaceInfos',
    'vRefractionFilteringInfo',
    'vRefractionInfos',
    'refractionMatrix',
    'vThicknessInfos',
    'thicknessMatrix',
    'vThicknessParam',
    'vDiffusionDistance',
    'vTintColor',
    'vSubSurfaceIntensity',
    'scatteringDiffusionProfile',
    'vDetailInfos',
    'detailMatrix',
    'Scene',
    'vEyePosition',
    'vAmbientColor',
    'vCameraInfos',
    'vPositionW',
    'vMainUV1',
    'vNormalW',
    'Light0',
    'albedoSampler',
    'environmentBrdfSampler',
    'position',
    'normal',
    'uv',
    'world',
  ]),
  parsers: {
    [ShaderType.physical]: {
      onBeforeCompile: (engineContext, node) => {
        // const { three } = engineContext.runtime;
        onBeforeCompileMegaShader(
          engineContext,
          node
          // new three.MeshPhongMaterial({
          //   color: 0x00ff00,
          //   map: new three.Texture(),
          // })
          // new three.MeshPhysicalMaterial({
          //   color: 0x00ff00,
          //   roughness: 0.046,
          //   metalness: 0.491,
          //   clearcoat: 1,
          //   map: new three.Texture(),
          // })
        );
      },
      fragment: {
        produceAst: (
          // todo: help
          engineContext,
          engine,
          graph,
          node,
          inputEdges
        ) => {
          const { fragment } = engineContext.runtime.cache.nodes[node.id];

          const fragmentPreprocessed = preprocess(fragment, {
            preserve: {
              version: () => true,
            },
          });

          const fragmentAst = parser.parse(fragmentPreprocessed);

          // Used for the UI only right now
          engineContext.debuggingNonsense.fragmentPreprocessed =
            fragmentPreprocessed;
          engineContext.debuggingNonsense.fragmentSource = fragment;

          // Do I need this? Is threejs shader already in 3.00 mode?
          // from2To3(fragmentAst);

          convert300MainToReturn(fragmentAst);
          renameBindings(fragmentAst.scopes[0], (name) =>
            babylengine.preserve.has(name) ? name : `${name}_${node.id}`
          );
          renameFunctions(fragmentAst.scopes[0], (name) =>
            name === 'main' ? nodeName(node) : `${name}_${node.id}`
          );
          return fragmentAst;
        },
        findInputs: texture2DInputFinder,
        produceFiller: (node: Node, ast: AstNode) => {
          return makeExpression(`${nodeName(node)}()`);
        },
      },
      vertex: {
        produceAst: megaShaderProduceVertexAst,
        findInputs: megaShaderFindPositionInputs,
        produceFiller: (node: Node, ast: AstNode) => {
          return makeExpression(`${nodeName(node)}()`);
        },
      },
    },
  },
};

babylengine.parsers[ShaderType.toon] = babylengine.parsers[ShaderType.physical];
babylengine.parsers[ShaderType.phong] =
  babylengine.parsers[ShaderType.physical];
