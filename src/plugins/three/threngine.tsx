import { ParserProgram } from '@shaderfrog/glsl-parser/dist/parser/parser';
import { NodeParser, NodeType } from '../../core/graph';
import importers from './importers';
import { Engine, EngineContext, EngineNodeType } from '../../core/engine';
import { GraphNode, doesLinkThruShader, nodeName } from '../../core/graph';
import {
  returnGlPosition,
  returnGlPositionHardCoded,
  returnGlPositionVec3Right,
} from '../../ast/manipulate';

export type RuntimeContext = {
  scene: any;
  camera: any;
  renderer: any;
  three: any;
  sceneData: any;
  // material: any;
  index: number;
  threeTone: any;
  cache: {
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

const onBeforeCompileMegaShader = (
  engineContext: EngineContext<RuntimeContext>,
  node: GraphNode,
  newMat: any
) => {
  // const { nodes } = engineContext.runtime.cache;
  // TODO: Update cache based on lights (or other, like mesh + lights?)
  // if (node.nextStageNodeId && nodes[node.nextStageNodeId] && node.stage) {
  //   console.log('loading cached source from next stage', { node });
  //   node.source =
  //     engineContext.runtime.cache.nodes[node.nextStageNodeId][node.stage];
  //   return;
  // }

  // TODO: This gets called 4 times currently, twice for compute initial
  // context, and twice for compilation

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

  node.source = node.stage === 'fragment' ? fragment : vertex;

  engineContext.runtime.cache.nodes[node.id] = {
    fragmentRef,
    vertexRef,
    fragment,
    vertex,
  };
};

const megaShaderMainpulateAst: NodeParser<any>['manipulateAst'] = (
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

export const threngine: Engine<RuntimeContext> = {
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
      onBeforeCompile: (engineContext, node) => {
        const { three } = engineContext.runtime;
        onBeforeCompileMegaShader(
          engineContext,
          node,
          new three.MeshPhongMaterial({
            color: 0x00ff00,
            map: new three.Texture(),
            normalMap: new three.Texture(),
          })
        );
      },
      manipulateAst: megaShaderMainpulateAst,
    },
    [EngineNodeType.physical]: {
      onBeforeCompile: (engineContext, node) => {
        const { three } = engineContext.runtime;
        onBeforeCompileMegaShader(
          engineContext,
          node,
          new three.MeshPhysicalMaterial({
            metalness: 0.4,
            roughness: 0.2,
            clearcoat: 0.5,
            clearcoatRoughness: 0.5,
            reflectivity: 0.5,
            color: new three.Vector3(1.0, 1.0, 1.0),
            map: new three.Texture(),
            // TODO: Normals are wrong when using normalmap
            normalMap: new three.Texture(),
            // roughnessMap: new three.Texture(),
          })
        );
      },
      manipulateAst: megaShaderMainpulateAst,
    },
    [EngineNodeType.toon]: {
      onBeforeCompile: (engineContext, node) => {
        const { three, threeTone } = engineContext.runtime;
        onBeforeCompileMegaShader(
          engineContext,
          node,
          new three.MeshToonMaterial({
            color: 0x00ff00,
            map: new three.Texture(),
            gradientMap: threeTone,
          })
        );
      },
      manipulateAst: megaShaderMainpulateAst,
    },
  },
};
