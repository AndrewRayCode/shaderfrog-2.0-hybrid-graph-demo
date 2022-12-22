import * as BABYLON from 'babylonjs';
import { Engine, EngineNodeType, EngineContext } from '../../core/engine';
import {
  nodeName,
  doesLinkThruShader,
  NodeParser,
  ShaderStage,
  prepopulatePropertyInputs,
  Graph,
} from '../../core/graph';
import importers from './importers';

import {
  returnGlPositionHardCoded,
  returnGlPosition,
  makeFnStatement,
} from '../../ast/manipulate';

import { Program } from '@shaderfrog/glsl-parser/ast';
import {
  CodeNode,
  NodeProperty,
  property,
  SourceNode,
} from '../../core/nodes/code-nodes';

import {
  namedAttributeStrategy,
  texture2DStrategy,
  uniformStrategy,
} from '../../core/strategy';
import { NodeInput, NodePosition } from '../../core/nodes/core-node';
import { DataNode, UniformDataType } from '../../core/nodes/data-nodes';

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
        property('Base Color', 'baseColor', 'rgb', '?????'),
        property('Color', 'albedoColor', 'rgb', 'uniform_vAlbedoColor'),
        property('Texture', 'albedoTexture', 'texture', 'filler_albedoSampler'),
        property('Bump Map', 'bumpTexture', 'texture', 'filler_bumpTexture'),
        // property('Normal Scale', 'normalScale', 'vector2'),
        property('Metalness', 'metallic', 'number'),
        property('Roughness', 'roughness', 'number'),
        // property(
        //   'Roughness Map',
        //   'roughnessMap',
        //   'texture',
        //   'filler_roughnessMap'
        // ),
        // property('Displacement Map', 'displacementMap', 'texture'),
        // MeshPhysicalMaterial gets envMap from the scene. MeshStandardMaterial
        // gets it from the material
        property('Env Map', 'environmentTexture', 'samplerCube'),
        // property('Transmission', 'transmission', 'number'),
        // property(
        //   'Transmission Map',
        //   'transmissionMap',
        //   'texture',
        //   'filler_transmissionMap'
        // ),
        // property('Thickness', 'thickness', 'number'),
        // property('Index of Refraction', 'ior', 'number'),
        // property('Sheen', 'sheen', 'number'),
        // property('Reflectivity', 'reflectivity', 'number'),
        // property('Clearcoat', 'clearcoat', 'number'),
      ],
      // hardCodedProperties: {
      //   isMeshPhysicalMaterial: true,
      //   isMeshStandardMaterial: true,
      // },
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

export type RuntimeContext = {
  scene: BABYLON.Scene;
  camera: BABYLON.Camera;
  BABYLON: any;
  sceneData: any;
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

const babylonMaterialProperties = (
  scene: BABYLON.Scene,
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
          acc[property.property] = new BABYLON.Texture('', scene);
        } else if (property.type === 'number') {
          acc[property.property] = 0.5;
        } else if (property.type === 'rgb') {
          acc[property.property] = new BABYLON.Color3(1, 1, 1);
        } else if (property.type === 'rgba') {
          acc[property.property] = new BABYLON.Color4(1, 1, 1, 1);
        }
      }
      return acc;
    }, {});
};

let mIdx = 0;
let id = () => mIdx++;
const onBeforeCompileMegaShader = (
  engineContext: EngineContext,
  graph: Graph,
  node: SourceNode,
  sibling: SourceNode
) => {
  const { scene, sceneData } = engineContext.runtime;

  // TODO: match what's in threngine, where they comment this out? Maybe to
  // support changing lights?
  // const { nodes } = engineContext.runtime.cache;
  // if (nodes[node.id] || (node.nextStageNodeId && nodes[node.nextStageNodeId])) {
  //   return;
  // }

  console.log('------------------------- starting onbeforecompile mega shader');
  const pbrName = `spbr${id()}`;
  const shaderMaterial = new BABYLON.PBRMaterial(pbrName, scene);
  Object.assign(
    shaderMaterial,
    babylonMaterialProperties(scene, graph, node, sibling)
  );

  // Ensures irradiance is computed per fragment to make the
  // Bump visible
  shaderMaterial.forceIrradianceInFragment = true;

  // const tex = new BABYLON.Texture('/brick-texture.jpeg', scene);
  // shaderMaterial.albedoTexture = tex;
  // shaderMaterial.bumpTexture = tex;

  // reasonable default
  shaderMaterial.albedoColor = new BABYLON.Color3(1.0, 1.0, 1.0);
  // shaderMaterial.metallic = 0.1; // set to 1 to only use it from the metallicRoughnessTexture
  // shaderMaterial.roughness = 0.1; // set to 1 to only use it from the metallicRoughnessTexture

  let fragmentSource =
    engineContext.runtime.cache.nodes[node.id]?.fragment ||
    engineContext.runtime.cache.nodes[node.nextStageNodeId || 'tttt']?.fragment;
  let vertexSource =
    engineContext.runtime.cache.nodes[node.id]?.vertex ||
    engineContext.runtime.cache.nodes[node.nextStageNodeId || 'tttt']?.vertex;
  // console.log(
  //   '🍃 Creating custom shadermaterial for' + node.id + ` (${node.name})`,
  //   { fragmentSource, vertexSource }
  // );
  shaderMaterial.customShaderNameResolve = (
    shaderName,
    uniforms,
    uniformBuffers,
    samplers,
    defines,
    attributes,
    options
  ) => {
    // console.log('🍃 in customshadernameresolve', { defines });
    console.log('🍃 in customshadernameresolve');
    if (Array.isArray(defines)) {
      defines.push('FAKE_UPDATE_' + id());
    } else {
      // defines['FAKE_UPDATE_' + id()] = true;
      defines.AMBIENTDIRECTUV = 0.0000001 * Math.random();
      // defines._isDirty = true;

      // TODO: Does this work?
      // shaderMaterial.markDirty();
    }
    if (options) {
      options.processFinalCode = (type, code) => {
        console.log('🍃 processFinalCode');
        if (type === 'vertex' && node.stage === 'vertex') {
          // console.log('🍃 processFinalCode vertex processFinalCode', {
          //   node,
          //   code,
          //   type,
          // });
          vertexSource = code;
          node.source = code;
          return code;
        } else if (type === 'fragment' && node.stage === 'fragment') {
          // console.log('🍃 processFinalCode fragment processFinalCode', {
          //   node,
          //   code,
          //   type,
          // });
          fragmentSource = code;
          node.source = code;
          return code;
        }
        return code;
      };
    }
    // return pbrName;
    return shaderName;
  };

  if (sceneData.mesh) {
    // console.log('🍃 Calling forceCompilation()....');
    // sceneData.mesh.material = shaderMaterial;
    shaderMaterial.forceCompilation(sceneData.mesh);
    scene.render();
  } else {
    console.log('🍃 FCUK no MESHREF RENDER()....');
  }
  // console.log('🍃 BABYLERN forceCompilation done()....');
  // shaderMaterial.forceCompilation(sceneData.mesh);
  // scene.render();
  // console.log('🍃 BABYLERN RENDER done', { vertexSource, fragmentSource });

  // TODO: This is hard coded to not include a b'ump
  engineContext.runtime.cache.nodes[node.id] = {
    // fragmentRef,
    // vertexRef,
    fragment: fragmentSource,
    vertex: vertexSource,
  };

  shaderMaterial.dispose();
};

const megaShaderMainpulateAst: NodeParser['manipulateAst'] = (
  engineContext,
  engine,
  graph,
  node,
  ast,
  inputEdges
) => {
  // const { nodes } = engineContext.runtime.cache;
  // const { vertex } =
  //   nodes[node.id] || (node.nextStageNodeId && nodes[node.nextStageNodeId]);
  // engineContext.debuggingNonsense.vertexSource = vertex;
  // engineContext.debuggingNonsense.vertexPreprocessed = vertexPreprocessed;

  const programAst = ast as Program;
  const mainName = 'main' || nodeName(node);

  if (node.stage === 'vertex') {
    if (doesLinkThruShader(graph, node)) {
      returnGlPositionHardCoded(mainName, programAst, 'vec3', 'transformed');
    } else {
      returnGlPosition(mainName, programAst);
    }
  }

  /*
  // I wrote this code like an idiot, when I incorreectly thought that the
  // "out" var I was looking for in the vertex shader was glFragColor, so this
  // is to find whatever vec4 var is "out" and rename that in the main fn.
  if (node.stage === 'vertex') {
    // Looking for "out vec4 glFragColor"
    const outDecl = programAst.program.find(
      (stmt): stmt is DeclarationStatementNode => {
        return (
          stmt.type === 'declaration_statement' &&
          stmt.declaration?.specified_type?.qualifiers?.some(
            (q: KeywordNode) => q.token === 'out'
          ) &&
          stmt.declaration?.specified_type?.specifier?.specifier?.token ===
            'vec4'
        );
      }
    );
    if (!outDecl) {
      console.log(generate(programAst));
      throw new Error(`Didn't find out vec4 in vertex program`);
    }
    const { declarations } = outDecl.declaration;
    if (declarations.length !== 1) {
      throw new Error(
        `More than one vec4 out found in vertex program, not sure what to do`
      );
    }
    const outVar = declarations[0].identifier.identifier;
    programAst.program.splice(programAst.program.indexOf(outDecl), 1);

    if (doesLinkThruShader(graph, node)) {
      returnGlPositionHardCoded(mainName, programAst, 'vec3', 'transformed');
    } else {
      // returnGlPosition(mainName, programAst);

      const mainReturnVar = `frogOut`;

      const main = programAst.scopes[0].functions.main
        .references[0] as FunctionNode;
      if (!main) {
        throw new Error(`No main fn found in vertex!`);
      }

      // Convert the main function to one that returns
      (
        main['prototype'].header.returnType.specifier.specifier as KeywordNode
      ).token = 'vec4';

      // Find the gl_position assignment line
      const assign = main.body.statements.find(
        (stmt) =>
          stmt.type === 'expression_statement' &&
          stmt.expression.left?.identifier === outVar
      );
      if (!assign) {
        console.error({ statements: main.body.statements });
        throw new Error(`No ${outVar} assign found in main fn!`);
      }

      const rtnStmt = makeFnStatement(
        `vec4 ${mainReturnVar} = 1.0`
      ) as DeclarationStatementNode;
      rtnStmt.declaration.declarations[0].initializer = assign.expression.right;

      main.body.statements.splice(
        main.body.statements.indexOf(assign),
        1,
        rtnStmt
      );
      main.body.statements.push(makeFnStatement(`return ${mainReturnVar}`));
    }
  }
  */

  return programAst;
};

const evaluateNode = (node: DataNode) => {
  if (node.type === 'number') {
    return parseFloat(node.value);
  }

  // HARD CODED THREE.JS HACK for testing meshpshysicalmaterial uniforms
  if (node.type === 'vector2') {
    return new BABYLON.Vector2(
      parseFloat(node.value[0]),
      parseFloat(node.value[1])
    );
  } else if (node.type === 'vector3') {
    return new BABYLON.Vector3(
      parseFloat(node.value[0]),
      parseFloat(node.value[1]),
      parseFloat(node.value[2])
    );
  } else if (node.type === 'vector4') {
    return new BABYLON.Vector4(
      parseFloat(node.value[0]),
      parseFloat(node.value[1]),
      parseFloat(node.value[2]),
      parseFloat(node.value[3])
    );
  } else if (node.type === 'rgb') {
    return new BABYLON.Color3(
      parseFloat(node.value[0]),
      parseFloat(node.value[1]),
      parseFloat(node.value[2])
    );
  } else if (node.type === 'rgba') {
    return new BABYLON.Color4(
      parseFloat(node.value[0]),
      parseFloat(node.value[1]),
      parseFloat(node.value[2]),
      parseFloat(node.value[3])
    );
  } else {
    return node.value;
  }
};

export const babylengine: Engine = {
  name: 'babylon',
  importers,
  mergeOptions: {
    includePrecisions: true,
    includeVersion: false,
  },
  evaluateNode,
  constructors: {
    [EngineNodeType.physical]: physicalNode,
  },
  // TODO: Get from uniform lib?
  preserve: new Set<string>([
    'viewProjection',
    'normalMatrix',
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
    'bumpSampler',
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
    'time',
    'Light0',
    'Light1',
    'Light2',
    'Light3',
    'light0',
    'light1',
    'light2',
    'light3',
  ]),
  parsers: {
    [EngineNodeType.physical]: {
      onBeforeCompile: (graph, engineContext, node, sibling) => {
        onBeforeCompileMegaShader(
          engineContext,
          graph,
          node,
          sibling as SourceNode
        );
        // Fragment and vertex source code look ok here
        // console.warn(
        //   'after compile megashader fragemnt',
        //   node.stage,
        //   generate(node.source)
        // );
        // console.warn(
        //   'after compile megashader vertex',
        //   sibling!.stage,
        //   generate(sibling!.source)
        // );
      },
      manipulateAst: megaShaderMainpulateAst,
    },
  },
};

babylengine.parsers[EngineNodeType.toon] =
  babylengine.parsers[EngineNodeType.physical];
babylengine.parsers[EngineNodeType.phong] =
  babylengine.parsers[EngineNodeType.physical];
