import * as BABYLON from 'babylonjs';
import { Engine, EngineNodeType, EngineContext } from '../../core/engine';
import {
  nodeName,
  GraphNode,
  doesLinkThruShader,
  NodeParser,
} from '../../core/graph';
import importers from './importers';

import {
  returnGlPositionHardCoded,
  returnGlPosition,
} from '../../ast/manipulate';

import { ParserProgram } from '@shaderfrog/glsl-parser/dist/parser/parser';

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

let mIdx = 0;
let id = () => mIdx++;
const onBeforeCompileMegaShader = (
  engineContext: EngineContext<RuntimeContext>,
  node: GraphNode
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

  // Ensures irradiance is computed per fragment to make the
  // Bump visible
  shaderMaterial.forceIrradianceInFragment = true;

  const tex = new BABYLON.Texture('/brick-texture.jpeg', scene);
  shaderMaterial.albedoTexture = tex;
  shaderMaterial.bumpTexture = tex;

  shaderMaterial.albedoColor = new BABYLON.Color3(1.0, 1.0, 1.0);
  shaderMaterial.metallic = 0.1; // set to 1 to only use it from the metallicRoughnessTexture
  shaderMaterial.roughness = 0.1; // set to 1 to only use it from the metallicRoughnessTexture

  let fragmentSource =
    engineContext.runtime.cache.nodes[node.id]?.fragment ||
    engineContext.runtime.cache.nodes[node.nextStageNodeId || 'tttt']?.fragment;
  let vertexSource =
    engineContext.runtime.cache.nodes[node.id]?.vertex ||
    engineContext.runtime.cache.nodes[node.nextStageNodeId || 'tttt']?.vertex;
  console.log(
    '🍃 Creating custom shadermaterial for' + node.id + ` (${node.name})`,
    { fragmentSource, vertexSource }
  );
  shaderMaterial.customShaderNameResolve = (
    shaderName,
    uniforms,
    uniformBuffers,
    samplers,
    defines,
    attributes,
    options
  ) => {
    console.log('🍃 in customshadernameresolve', { defines });
    if (Array.isArray(defines)) {
      defines.push('FAKE_UPDATE_' + id());
    } else {
      // defines['FAKE_UPDATE_' + id()] = true;
      defines.AMBIENTDIRECTUV = 0.0000001 * Math.random();
      // defines._isDirty = true;
    }
    if (options) {
      options.processFinalCode = (type, code) => {
        if (type === 'vertex') {
          console.log('🍃 processFinalCode vertex processFinalCode', {
            node,
            code,
            type,
          });
          vertexSource = code;
          return code;
        }
        console.log('🍃 processFinalCode fragment processFinalCode', {
          node,
          code,
          type,
        });
        fragmentSource = code;
        return code;
      };
    }
    // return pbrName;
    return shaderName;
  };

  if (sceneData.mesh) {
    console.log('🍃 Calling forceCompilation()....');
    // sceneData.mesh.material = shaderMaterial;
    shaderMaterial.forceCompilation(sceneData.mesh);
    scene.render();
  } else {
    console.log('🍃 FCUK no MESHREF RENDER()....');
  }
  console.log('🍃 BABYLERN forceCompilation done()....');
  // shaderMaterial.forceCompilation(sceneData.mesh);
  // scene.render();
  console.log('🍃 BABYLERN RENDER done', { vertexSource, fragmentSource });

  // TODO: This is hard coded to not include a b'ump
  engineContext.runtime.cache.nodes[node.id] = {
    // fragmentRef,
    // vertexRef,
    fragment: fragmentSource,
    vertex: vertexSource,
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
  // const { nodes } = engineContext.runtime.cache;
  // const { vertex } =
  //   nodes[node.id] || (node.nextStageNodeId && nodes[node.nextStageNodeId]);
  // engineContext.debuggingNonsense.vertexSource = vertex;
  // engineContext.debuggingNonsense.vertexPreprocessed = vertexPreprocessed;

  const programAst = ast as ParserProgram;
  const mainName = nodeName(node);

  if (node.stage === 'vertex') {
    if (doesLinkThruShader(graph, node)) {
      returnGlPositionHardCoded(mainName, programAst, 'vec3', 'transformed');
    } else {
      returnGlPosition(mainName, programAst);
    }
  }

  return programAst;
};

export const babylengine: Engine<RuntimeContext> = {
  name: 'babylon',
  importers,
  mergeOptions: {
    includePrecisions: true,
    includeVersion: false,
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
      onBeforeCompile: (engineContext, node) => {
        onBeforeCompileMegaShader(engineContext, node);
      },
      manipulateAst: megaShaderMainpulateAst,
    },
  },
};

babylengine.parsers[EngineNodeType.toon] =
  babylengine.parsers[EngineNodeType.physical];
babylengine.parsers[EngineNodeType.phong] =
  babylengine.parsers[EngineNodeType.physical];
