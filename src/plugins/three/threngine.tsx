import { ParserProgram } from '@shaderfrog/glsl-parser/dist/parser/parser';
import { Graph, NodeParser, NodeType } from '../../core/graph';
import importers from './importers';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';

import { Engine, EngineContext, EngineNodeType } from '../../core/engine';
import { GraphNode, doesLinkThruShader, nodeName } from '../../core/graph';
import {
  returnGlPosition,
  returnGlPositionHardCoded,
  returnGlPositionVec3Right,
} from '../../ast/manipulate';
import { SourceNode } from '../../core/nodes/code-nodes';
import { Edge } from '../../core/nodes/edge';

export type ThreeRuntime = {
  scene: any;
  camera: any;
  renderer: any;
  three: any;
  sceneData: any;
  envMapTexture: any;
  // material: any;
  index: number;
  threeTone: any;
  cache: {
    data: {
      [key: string]: any;
    };
    nodes: {
      [id: string]: {
        fragmentRef: any;
        vertexRef: any;
        fragment: string;
        vertex: string;
      };
    };
  };
};

const cacher = (
  engineContext: EngineContext,
  graph: Graph,
  node: SourceNode,
  sibling: SourceNode,
  newValue: (...args: any[]) => any
) => {
  const cacheKey = programCacheKey(graph, node, sibling);

  if (engineContext.runtime.cache.data[cacheKey]) {
    console.log('cache hit', cacheKey);
  } else {
    console.log('cache miss', cacheKey);
  }
  const materialData = engineContext.runtime.cache.data[cacheKey] || newValue();

  engineContext.runtime.cache.data[cacheKey] = materialData;

  // TODO: We mutate the nodes here, can we avoid that later?
  node.source =
    node.stage === 'fragment' ? materialData.fragment : materialData.vertex;
  sibling.source =
    sibling.stage === 'fragment' ? materialData.fragment : materialData.vertex;
};

const onBeforeCompileMegaShader = (
  engineContext: EngineContext,
  newMat: any
) => {
  console.log('compiling three megashader!');
  const { renderer, sceneData, scene, camera, threeTone, three } =
    engineContext.runtime;
  const { mesh } = sceneData;

  mesh.material = newMat;
  renderer.compile(scene, camera);

  // The references to the compiled shaders in WebGL
  const fragmentRef = renderer.properties
    .get(mesh.material)
    .programs.values()
    .next().value.fragmentShader;
  const vertexRef = renderer.properties
    .get(mesh.material)
    .programs.values()
    .next().value.vertexShader;

  const gl = renderer.getContext();
  const fragment = gl.getShaderSource(fragmentRef);
  const vertex = gl.getShaderSource(vertexRef);

  // Do we even need to do this? This is just for debugging right? Using the
  // source on the node is the important thing.
  return {
    fragmentRef,
    vertexRef,
    fragment,
    vertex,
  };
};

const megaShaderMainpulateAst: NodeParser['manipulateAst'] = (
  engineContext,
  engine,
  graph,
  node,
  ast,
  inputEdges
) => {
  const programAst = ast as ParserProgram;
  const mainName = 'main' || nodeName(node);
  if (node.stage === 'vertex') {
    if (doesLinkThruShader(graph, node)) {
      returnGlPositionHardCoded(mainName, programAst, 'vec3', 'transformed');
    } else {
      returnGlPosition(mainName, programAst);
    }
  }
  return programAst;
};

const programCacheKey = (
  graph: Graph,
  node: SourceNode,
  sibling: SourceNode
) => {
  return [node, sibling]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((n) => nodeCacheKey(graph, n))
    .join('-');
};

const nodeCacheKey = (graph: Graph, node: SourceNode) => {
  return (
    '' +
    node.id +
    graph.edges
      .filter((edge) => edge.to === node.id)
      .map((edge) => `${edge.to}.${edge.input}`)
      .sort()
      .join(',')
    // Currently excluding node inputs because these are calculated *after*
    // the onbeforecompile, so the next compile, they'll all change!
    // node.inputs.map((i) => `${i.id}${i.bakeable}`)
  );
};

const threeMaterialProperties = (
  three: any,
  graph: Graph,
  node: SourceNode,
  sibling?: SourceNode
): Record<string, any> => {
  const inputEdges = graph.edges
    .filter((edge) => edge.to === node.id || edge.to === sibling?.id)
    .reduce<Record<string, Edge>>(
      (acc, edge) => ({ ...acc, [edge.input]: edge }),
      {}
    );
  const properties: any = {};
  if ('map' in inputEdges) {
    properties.map = new three.Texture();
  }
  if ('normalMap' in inputEdges) {
    properties.map = new three.Texture();
    properties.normalMap = new three.Texture();
  }
  if ('roughnessMap' in inputEdges) {
    properties.roughnessMap = new three.Texture();
  }

  // color: new three.Vector3(1.0, 1.0, 1.0),
  // map: new three.Texture(),
  // // TODO: Normals are wrong when using normalmap
  // normalMap: new three.Texture(),

  return properties;
};

export const threngine: Engine = {
  name: 'three',
  importers,
  mergeOptions: {
    includePrecisions: true,
    includeVersion: true,
  },
  // TODO: Get from uniform lib?
  preserve: new Set<string>([
    'viewMatrix',
    'modelMatrix',
    'modelViewMatrix',
    'projectionMatrix',
    'normalMatrix',
    'uvTransform',
    // Attributes
    'position',
    'normal',
    'uv',
    'uv2',
    // Varyings
    'vUv',
    'vUv2',
    'vViewPosition',
    'vNormal',
    'vPosition',
    // Uniforms
    'cameraPosition',
    'isOrthographic',
    'diffuse',
    'emissive',
    'specular',
    'shininess',
    'opacity',
    'map',
    'specularTint',
    'time',
    'normalScale',
    'normalMap',
    'envMap',
    'envMapIntensity',
    'flipEnvMap',
    'maxMipLevel',
    'roughnessMap',
    // Uniforms for lighting
    'receiveShadow',
    'ambientLightColor',
    'lightProbe',
    // Light uniform arrays
    'spotLights',
    'pointLights',
    // This isn't three wtf
    'resolution',
    'color',
    'image',
    'gradientMap',
    // TODO: This isn't specific to threejs as an engine, it's specific to the
    // phong shader. If a *shader* node has brightness, it should be unique, not
    // use the threejs one!
    'brightness',
    // TODO: These depend on the shaderlib, this might need to be a runtime
    // concern
    // Metalness
    'roughness',
    'metalness',
    'ior',
    'specularIntensity',
    'clearcoat',
    'clearcoatRoughness',
  ]),
  parsers: {
    [NodeType.SOURCE]: {
      manipulateAst: (engineContext, engine, graph, node, ast, inputEdges) => {
        const programAst = ast as ParserProgram;
        const mainName = 'main' || nodeName(node);

        // This hinges on the vertex shader calling vec3(p)
        if (node.stage === 'vertex') {
          if (doesLinkThruShader(graph, node)) {
            returnGlPositionVec3Right(mainName, programAst);
          } else {
            returnGlPosition(mainName, programAst);
          }
        }
        return ast;
      },
    },
    [EngineNodeType.phong]: {
      onBeforeCompile: (graph, engineContext, node, sibling) => {
        const { three } = engineContext.runtime;
        cacher(engineContext, graph, node, sibling as SourceNode, () =>
          onBeforeCompileMegaShader(
            engineContext,
            new three.MeshPhongMaterial({
              ...threeMaterialProperties(three, graph, node, sibling),
            })
          )
        );
      },
      manipulateAst: megaShaderMainpulateAst,
    },
    [EngineNodeType.physical]: {
      onBeforeCompile: (graph, engineContext, node, sibling) => {
        const { three, envMapTexture } = engineContext.runtime;

        // const envMap = new three.CubeTextureLoader().load([
        //   '/envmaps/pond/posx.jpg',
        //   '/envmaps/pond/negx.jpg',
        //   '/envmaps/pond/posy.jpg',
        //   '/envmaps/pond/negy.jpg',
        //   '/envmaps/pond/posy.jpg',
        //   '/envmaps/pond/negy.jpg',
        // ]);
        // const envMap = new RGBELoader().load(
        //   '/envmaps/empty_warehouse_01_2k.hdr',
        //   () => {
        //     envMap.mapping = three.EquirectangularReflectionMapping;
        //   }
        // );
        // const texture = new three.Texture();
        // texture.mapping = three.CubeUVReflectionMapping;

        cacher(engineContext, graph, node, sibling as SourceNode, () =>
          onBeforeCompileMegaShader(
            engineContext,
            (() => {
              const props = {
                envMap: envMapTexture,
                ...threeMaterialProperties(three, graph, node, sibling),
              };
              console.log({ props });
              return new three.MeshPhysicalMaterial(props);
            })()
          )
        );
      },
      manipulateAst: megaShaderMainpulateAst,
    },
    [EngineNodeType.toon]: {
      onBeforeCompile: (graph, engineContext, node, sibling) => {
        const { three, threeTone } = engineContext.runtime;

        cacher(engineContext, graph, node, sibling as SourceNode, () =>
          onBeforeCompileMegaShader(
            engineContext,
            new three.MeshToonMaterial({
              gradientMap: threeTone,
              ...threeMaterialProperties(three, graph, node, sibling),
            })
          )
        );
      },
      manipulateAst: megaShaderMainpulateAst,
    },
  },
};
