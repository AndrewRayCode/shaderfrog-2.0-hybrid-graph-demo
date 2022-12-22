import { Vector2, Vector3, Vector4, Color } from 'three';
import { Program } from '@shaderfrog/glsl-parser/ast';
import {
  Graph,
  NodeParser,
  NodeType,
  ShaderStage,
  prepopulatePropertyInputs,
} from '../../core/graph';
import importers from './importers';

import { Engine, EngineContext, EngineNodeType } from '../../core/engine';
import { GraphNode, doesLinkThruShader, nodeName } from '../../core/graph';
import {
  returnGlPosition,
  returnGlPositionHardCoded,
  returnGlPositionVec3Right,
} from '../../ast/manipulate';
import {
  CodeNode,
  NodeProperty,
  property,
  SourceNode,
} from '../../core/nodes/code-nodes';
import { NodeInput, NodePosition } from '../../core/nodes/core-node';
import { DataNode, UniformDataType } from '../../core/nodes/data-nodes';
import {
  namedAttributeStrategy,
  texture2DStrategy,
  uniformStrategy,
} from '../../core/strategy';

export const physicalNode = (
  id: string,
  name: string,
  groupId: string,
  position: NodePosition,
  uniforms: UniformDataType[],
  stage: ShaderStage,
  nextStageNodeId?: string
): CodeNode =>
  prepopulatePropertyInputs({
    id,
    name,
    groupId,
    position,
    type: EngineNodeType.physical,
    config: {
      uniforms,
      version: 3,
      preprocess: true,
      properties: [
        property('Color', 'color', 'rgb', 'uniform_diffuse'),
        property('Texture', 'map', 'texture', 'filler_map'),
        property('Normal Map', 'normalMap', 'texture', 'filler_normalMap'),
        property('Normal Scale', 'normalScale', 'vector2'),
        property('Metalness', 'metalness', 'number'),
        property('Roughness', 'roughness', 'number'),
        property(
          'Roughness Map',
          'roughnessMap',
          'texture',
          'filler_roughnessMap'
        ),
        property('Displacement Map', 'displacementMap', 'texture'),
        // MeshPhysicalMaterial gets envMap from the scene. MeshStandardMaterial
        // gets it from the material
        // property('Env Map', 'envMap', 'samplerCube'),
        property('Transmission', 'transmission', 'number'),
        property(
          'Transmission Map',
          'transmissionMap',
          'texture',
          'filler_transmissionMap'
        ),
        property('Thickness', 'thickness', 'number'),
        property('Index of Refraction', 'ior', 'number'),
        property('Sheen', 'sheen', 'number'),
        property('Reflectivity', 'reflectivity', 'number'),
        property('Clearcoat', 'clearcoat', 'number'),
      ],
      hardCodedProperties: {
        isMeshPhysicalMaterial: true,
        isMeshStandardMaterial: true,
      },
      strategies: [
        uniformStrategy(),
        stage === 'fragment'
          ? texture2DStrategy()
          : namedAttributeStrategy('position'),
      ],
    },
    inputs: [],
    outputs: [
      {
        name: 'out',
        category: 'data',
        id: '1',
      },
    ],
    source: '',
    stage,
    nextStageNodeId,
  });

const cacher = (
  engineContext: EngineContext,
  graph: Graph,
  node: SourceNode,
  sibling: SourceNode,
  newValue: (...args: any[]) => any
) => {
  const cacheKey = programCacheKey(engineContext, graph, node, sibling);

  if (engineContext.runtime.cache.data[cacheKey]) {
    console.log('cache hit', cacheKey);
  } else {
    console.log('cache miss', cacheKey);
  }
  const materialData = engineContext.runtime.cache.data[cacheKey] || newValue();

  engineContext.runtime.cache.data[cacheKey] = materialData;
  engineContext.runtime.engineMaterial = materialData.material;

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
  const { renderer, sceneData, scene, camera } = engineContext.runtime;
  const { mesh } = sceneData;

  // Temporarily swap the mesh material to the new one, since materials can
  // be mesh specific, render, then get its source code
  const originalMaterial = mesh.material;
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

  // Reset the material on the mesh, since the shader we're computing context
  // for might not be the one actually want on the mesh - like if a toon node
  // was added to the graph but not connected
  mesh.material = originalMaterial;

  // Do we even need to do this? This is just for debugging right? Using the
  // source on the node is the important thing.
  return {
    material: newMat,
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
  const programAst = ast as Program;
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
  engineContext: EngineContext,
  graph: Graph,
  node: SourceNode,
  sibling: SourceNode
) => {
  // The megashader source is dependent on scene information, like the number
  // and type of lights in the scene. This kinda sucks - it's duplicating
  // three's material cache key, and is coupled to how three builds shaders
  const { three, scene } = engineContext.runtime;
  const lights: string[] = [];
  scene.traverse((obj: any) => {
    if (obj instanceof three.Light) {
      lights.push(obj.type as string);
    }
  });

  return (
    [node, sibling]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((n) => nodeCacheKey(graph, n))
      .join('-') + lights.join(',')
  );
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
  // Find inputs to this node that are dependent on a property of the material
  const propertyInputs = node.inputs
    .filter((i) => i.property)
    .reduce<Record<string, NodeInput>>(
      (acc, input) => ({ ...acc, [input.id]: input }),
      {}
    );

  // Then look for any edges into those inputs and set the material property
  return graph.edges
    .filter((edge) => edge.to === node.id || edge.to === sibling?.id)
    .reduce<Record<string, any>>((acc, edge) => {
      // Check if we've plugged into an input for a property
      const propertyInput = propertyInputs[edge.input];
      if (propertyInput) {
        // Find the property itself
        const property = (node.config.properties || []).find(
          (p) => p.property === propertyInput.property
        ) as NodeProperty;

        // Initialize the property on the material
        if (property.type === 'texture') {
          acc[property.property] = new three.Texture();
        } else if (property.type === 'number') {
          acc[property.property] = 0.5;
        } else if (property.type === 'rgb') {
          acc[property.property] = new three.Color(1, 1, 1);
        } else if (property.type === 'rgba') {
          acc[property.property] = new three.Color(1, 1, 1, 1);
        }
      }
      return acc;
    }, {});
};

export type ThreeRuntime = {
  scene: any;
  camera: any;
  renderer: any;
  three: any;
  sceneData: any;
  engineMaterial: any;
  index: number;
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

const evaluateNode = (node: DataNode) => {
  if (node.type === 'number') {
    return parseFloat(node.value);
  }

  // HARD CODED THREE.JS HACK for testing meshpshysicalmaterial uniforms
  if (node.type === 'vector2') {
    return new Vector2(parseFloat(node.value[0]), parseFloat(node.value[1]));
  } else if (node.type === 'vector3') {
    return new Vector3(
      parseFloat(node.value[0]),
      parseFloat(node.value[1]),
      parseFloat(node.value[2])
    );
  } else if (node.type === 'vector4') {
    return new Vector4(
      parseFloat(node.value[0]),
      parseFloat(node.value[1]),
      parseFloat(node.value[2]),
      parseFloat(node.value[3])
    );
  } else if (node.type === 'rgb') {
    return new Color(
      parseFloat(node.value[0]),
      parseFloat(node.value[1]),
      parseFloat(node.value[2])
    );
  } else if (node.type === 'rgba') {
    return new Vector4(
      parseFloat(node.value[0]),
      parseFloat(node.value[1]),
      parseFloat(node.value[2]),
      parseFloat(node.value[3])
    );
  } else {
    return node.value;
  }
};

export const threngine: Engine = {
  name: 'three',
  importers,
  mergeOptions: {
    includePrecisions: true,
    includeVersion: true,
  },
  evaluateNode,
  constructors: {
    [EngineNodeType.physical]: physicalNode,
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
    'transmission',
    'thickness',
    'attenuationDistance',
    'attenuationTint',
    'transmissionSamplerMap',
    'transmissionSamplerSize',
    'displacementMap',
    'displacementScale',
    'displacementBias',
  ]),
  parsers: {
    [NodeType.SOURCE]: {
      manipulateAst: (engineContext, engine, graph, node, ast, inputEdges) => {
        const programAst = ast as Program;
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
              isMeshPhongMaterial: true,
              ...threeMaterialProperties(three, graph, node, sibling),
            })
          )
        );
      },
      manipulateAst: megaShaderMainpulateAst,
    },
    [EngineNodeType.physical]: {
      onBeforeCompile: (graph, engineContext, node, sibling) => {
        const { three } = engineContext.runtime;

        cacher(engineContext, graph, node, sibling as SourceNode, () =>
          onBeforeCompileMegaShader(
            engineContext,
            new three.MeshPhysicalMaterial({
              // These properties are copied onto the runtime RawShaderMaterial.
              // These exist on the MeshPhysicalMaterial but only in the
              // prototype. We have to hard code them for Object.keys() to work
              isMeshPhysicalMaterial: true,
              isMeshStandardMaterial: true,
              ...threeMaterialProperties(three, graph, node, sibling),
            })
          )
        );
      },
      manipulateAst: megaShaderMainpulateAst,
    },
    [EngineNodeType.toon]: {
      onBeforeCompile: (graph, engineContext, node, sibling) => {
        const { three } = engineContext.runtime;

        cacher(engineContext, graph, node, sibling as SourceNode, () =>
          onBeforeCompileMegaShader(
            engineContext,
            new three.MeshToonMaterial({
              gradientMap: new three.Texture(),
              isMeshToonMaterial: true,
              ...threeMaterialProperties(three, graph, node, sibling),
            })
          )
        );
      },
      manipulateAst: megaShaderMainpulateAst,
    },
  },
};
