import * as BABYLON from 'babylonjs';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Graph } from '../../nodestuff';

import { EngineContext } from '../../graph';
import { babylengine, RuntimeContext } from './bablyengine';

import styles from '../../../pages/editor/editor.module.css';

import { useBabylon } from './useBabylon';
import { usePrevious } from '../../usePrevious';
import { UICompileGraphResult } from '../../uICompileGraphResult';

let mIdx = 0;
let id = () => mIdx++;
const _err = BABYLON.Logger.Error;
let capturing = false;
let capture: any[] = [];
BABYLON.Logger.Error = (...args) => {
  const str = args[0] || '';
  if (capturing || str.startsWith('Unable to compile effect')) {
    capturing = true;
    capture.push(str);
    if (str.startsWith('Error:')) {
      capturing = false;
    }
  }
  _err(...args);
};

type AnyFn = (...args: any) => any;
type BabylonComponentProps = {
  compile: AnyFn;
  guiMsg: string;
  compileResult: UICompileGraphResult | undefined;
  graph: Graph;
  lights: string;
  previewObject: string;
  setCtx: <T extends unknown>(ctx: EngineContext<T>) => void;
  setGlResult: AnyFn;
  setLights: AnyFn;
  setPreviewObject: AnyFn;
  width: number;
  height: number;
};
const BabylonComponent: React.FC<BabylonComponentProps> = ({
  compile,
  guiMsg,
  compileResult,
  graph,
  lights,
  previewObject,
  setCtx,
  setGlResult,
  setLights,
  setPreviewObject,
  width,
  height,
}) => {
  // TODO: Changing nodes in babylon land doesn't update babylon, and this
  // ref is renamed
  const shaderNeedsReApplying = useRef<boolean>(false);

  const { canvas, sceneData, babylonDomRef, scene, camera, engine } =
    useBabylon((time) => {
      if (shaderNeedsReApplying.current) {
        // console.log(sceneData.mesh?.material);
        // const effect = sceneData.mesh?.material?.getEffect();
        // const y = BABYLON.Logger._pipelineContext;
        // const t = capture;
        // capture.FRAGMENT SHADER ERROR
        setGlResult({
          fragError: capture.find((str) =>
            str.includes('FRAGMENT SHADER ERROR')
          ),
          vertError: capture.find((str) => str.includes('VERTEX SHADER ERROR')),
          programError: '',
        });
        shaderNeedsReApplying.current = false;
      }

      const { lights } = sceneData;
      if (lights.length === 2) {
        (lights[0] as BABYLON.PointLight).position.x =
          1 * Math.sin(time * 0.001);
        (lights[0] as BABYLON.PointLight).position.y =
          1 * Math.cos(time * 0.001);
        (lights[1] as BABYLON.PointLight).position.x =
          1 * Math.sin(time * 0.001);
        (lights[1] as BABYLON.PointLight).position.y =
          1 * Math.cos(time * 0.001);
      } else if (lights.length > 2) {
        (lights[0] as BABYLON.PointLight).position.x =
          1 * Math.sin(time * 0.001);
        (lights[0] as BABYLON.PointLight).position.y =
          1 * Math.cos(time * 0.001);
        (lights[0] as BABYLON.PointLight).setDirectionToTarget(
          new BABYLON.Vector3(0, 0, 0)
        );
        (lights[1] as BABYLON.PointLight).position.x =
          1 * Math.sin(time * 0.001);
        (lights[1] as BABYLON.PointLight).position.y =
          1 * Math.cos(time * 0.001);

        (lights[2] as BABYLON.PointLight).position.x =
          1 * Math.cos(time * 0.001);
        (lights[2] as BABYLON.PointLight).position.y =
          1 * Math.sin(time * 0.001);
        (lights[2] as BABYLON.PointLight).setDirectionToTarget(
          new BABYLON.Vector3(0, 0, 0)
        );
        (lights[3] as BABYLON.PointLight).position.x =
          1 * Math.cos(time * 0.001);
        (lights[3] as BABYLON.PointLight).position.y =
          1 * Math.sin(time * 0.001);
      }
      if (sceneData.mesh && sceneData.mesh.material) {
        sceneData.mesh.material.getEffect()?.setFloat('time', time * 0.001);
      }
    });

  const os1: any = graph.nodes.find(
    (node) => node.name === 'Outline Shader F'
  )?.id;
  const os2: any = graph.nodes.find(
    (node) => node.name === 'Outline Shader V'
  )?.id;
  const fs1: any = graph.nodes.find((node) => node.name === 'Fireball F')?.id;
  const fs2: any = graph.nodes.find((node) => node.name === 'Fireball V')?.id;
  const fc: any = graph.nodes.find((node) => node.name === 'Fluid Circles')?.id;
  const pu: any = graph.nodes.find((node) => node.name === 'Purple Metal')?.id;
  const edgeId: any = graph.nodes.find((node) => node.name === 'Triplanar')?.id;
  const hs1: any = graph.nodes.find(
    (node) => node.name === 'Fake Heatmap F'
  )?.id;
  const hs2: any = graph.nodes.find(
    (node) => node.name === 'Fake Heatmap V'
  )?.id;

  // const meshRef = useRef<BABYLON.Mesh>();
  useEffect(() => {
    if (sceneData.mesh) {
      sceneData.mesh.dispose();
    }

    let mesh;
    if (previewObject === 'torusknot') {
      mesh = BABYLON.MeshBuilder.CreateTorusKnot(
        'torusKnot',
        {
          radius: 1,
          tube: 0.25,
          radialSegments: 128,
        },
        scene
      );
    } else if (previewObject === 'sphere') {
      mesh = BABYLON.Mesh.CreateSphere(
        'sphere1',
        16,
        2,
        scene,
        false,
        BABYLON.Mesh.FRONTSIDE
      );
    } else {
      throw new Error('fffffff');
    }
    if (sceneData.mesh) {
      mesh.material = sceneData.mesh.material;
    }
    sceneData.mesh = mesh;

    mesh.onBeforeDrawObservable.add((mesh) => {
      if (mesh && mesh.material) {
        const effect = mesh.material.getEffect();
        if (effect) {
          // effect.setFloat('time', performance.now() * 0.001);

          effect.setFloat(`speed_${pu}`, 3.0);
          effect.setFloat(`brightnessX_${pu}`, 1.0);
          effect.setFloat(`permutations_${pu}`, 10);
          effect.setFloat(`iterations_${pu}`, 1);
          effect.setVector2(`uvScale_${pu}`, new BABYLON.Vector2(1, 1));
          effect.setVector3(`color1_${pu}`, new BABYLON.Vector3(0.7, 0.3, 0.8));
          effect.setVector3(`color2_${pu}`, new BABYLON.Vector3(0.1, 0.2, 0.9));
          effect.setVector3(`color3_${pu}`, new BABYLON.Vector3(0.8, 0.3, 0.8));

          effect.setFloat(`scale_${hs1}`, 1.2);
          effect.setFloat(`power_${hs1}`, 1);
          effect.setFloat(`scale_${hs2}`, 1.2);
          effect.setFloat(`power_${hs2}`, 1);

          effect.setFloat(`speed_${fc}`, 1);
          effect.setFloat(`baseRadius_${fc}`, 1);
          effect.setFloat(`colorVariation_${fc}`, 0.6);
          effect.setFloat(`brightnessVariation_${fc}`, 0);
          effect.setFloat(`variation_${fc}`, 8);
          effect.setVector3(
            `backgroundColor_${fc}`,
            new BABYLON.Vector3(0.0, 0.0, 0.5)
          );

          effect.setFloat(`fireSpeed_${fs1}`, 0.6);
          effect.setFloat(`fireSpeed_${fs2}`, 0.6);
          effect.setFloat(`pulseHeight_${fs1}`, 0.1);
          effect.setFloat(`pulseHeight_${fs2}`, 0.1);
          effect.setFloat(`displacementHeight_${fs1}`, 0.2);
          effect.setFloat(`displacementHeight_${fs2}`, 0.2);
          effect.setFloat(`turbulenceDetail_${fs1}`, 0.8);
          effect.setFloat(`turbulenceDetail_${fs2}`, 0.8);

          effect.setFloat(`cel0_${edgeId}`, 1.0);
          effect.setFloat(`cel1_${edgeId}`, 1.0);
          effect.setFloat(`cel2_${edgeId}`, 1.0);
          effect.setFloat(`cel3_${edgeId}`, 1.0);
          effect.setFloat(`cel4_${edgeId}`, 1.0);
          effect.setFloat(`celFade_${edgeId}`, 1.0);
          effect.setFloat(`edgeSteepness_${edgeId}`, 0.1);
          effect.setFloat(`edgeBorder_${edgeId}`, 0.1);
          effect.setFloat(`color_${edgeId}`, 1.0);

          effect.setVector3(`color_${os1}`, new BABYLON.Vector3(1, 1, 1));
          effect.setVector3(`color_${os2}`, new BABYLON.Vector3(1, 1, 1));
          effect.setFloat(`start_${os1}`, 0);
          effect.setFloat(`start_${os2}`, 0);
          effect.setFloat(`end_${os1}`, 1);
          effect.setFloat(`end_${os2}`, 1);
          effect.setFloat(`alpha_${os1}`, 1);
          effect.setFloat(`alpha_${os2}`, 1);
        }
      }
    });
  }, [previewObject, scene]);

  const [ctx] = useState<EngineContext<RuntimeContext>>(() => {
    console.log('Babylon re-creating ctx!!! 🍠🍠🍠🍠🍠');
    return {
      engine: 'babylon',
      compileCount: 0,
      runtime: {
        BABYLON,
        scene,
        camera,
        sceneData,
        cache: { nodes: {} },
      },
      nodes: {},
      debuggingNonsense: {},
    };
  });
  console.log('ctx babyloncomponent renderx', { ctx });

  // Inform parent our context is created
  useEffect(() => {
    setCtx<RuntimeContext>(ctx);
  }, [ctx, setCtx]);

  useEffect(() => {
    if (!compileResult?.fragmentResult) {
      console.log('Bailing on babylon new material, because no compile result');
      return;
    }
    console.log('🛠 🛠 🛠 Re-creating BPR material', {
      pu,
      scene,
      compileResult,
      ct: ctx.compileCount,
    });

    const pbrName = `pbr${id()}`;
    const shaderMaterial = new BABYLON.PBRMaterial(pbrName, scene);

    // FILTH lies https://forum.babylonjs.com/t/how-to-get-shader-gl-compilation-errors-from-babylon/27420/3
    // const effect = shaderMaterial.getEffect();
    // console.log({ effect });
    // effect.onError = (effect, errors) => {
    //   console.log({ effect, errors });
    // };

    // Ensures irradiance is computed per fragment to make the
    // Bump visible
    shaderMaterial.forceIrradianceInFragment = true;

    const brickTexture = new BABYLON.Texture('/brick-texture.jpeg', scene);
    shaderMaterial.albedoTexture = brickTexture;

    const brickNormal = new BABYLON.Texture('/bricknormal.png', scene);
    shaderMaterial.bumpTexture = brickNormal;

    shaderMaterial.albedoColor = new BABYLON.Color3(1.0, 1.0, 1.0);
    shaderMaterial.metallic = 0.1; // set to 1 to only use it from the metallicRoughnessTexture
    shaderMaterial.roughness = 0.1; // set to 1 to only use it from the metallicRoughnessTexture

    shaderMaterial.customShaderNameResolve = (
      shaderName,
      uniforms,
      uniformBuffers,
      samplers,
      defines,
      attributes,
      options
    ) => {
      console.log('💪🏽 component customShaderNameResolve called...', {
        defines,
      });

      // if (Array.isArray(defines)) {
      //   defines.push('MYDUMMY' + id());
      // } else {
      // defines['MYDUMMY' + id()] = id();
      // if (Array.isArray(defines)) {
      //   defines.push('MYDUMMY' + id());
      // } else {
      //   defines['MYDUMMY' + id()] = id();
      //   defines.AMBIENTDIRECTUV = 0.0000001 * ctx.compileCount;
      // }
      // defines._isDirty = true;
      // }
      if (!Array.isArray(defines)) {
        console.log('Setting AMBIENTDIRECTUV', 0.00001 * ctx.compileCount);
        defines.AMBIENTDIRECTUV = 0.00001 * ctx.compileCount;
      }

      // TODO: No Time?
      uniforms.push('time');

      uniforms.push(`speed_${pu}`);
      uniforms.push(`brightnessX_${pu}`);
      uniforms.push(`permutations_${pu}`);
      uniforms.push(`iterations_${pu}`);
      uniforms.push(`uvScale_${pu}`);
      uniforms.push(`color1_${pu}`);
      uniforms.push(`color2_${pu}`);
      uniforms.push(`color3_${pu}`);

      uniforms.push(`scale_${hs1}`);
      uniforms.push(`power_${hs1}`);
      uniforms.push(`scale_${hs2}`);
      uniforms.push(`power_${hs2}`);

      uniforms.push(`speed_${fc}`);
      uniforms.push(`baseRadius_${fc}`);
      uniforms.push(`colorVariation_${fc}`);
      uniforms.push(`brightnessVariation_${fc}`);
      uniforms.push(`variation_${fc}`);
      uniforms.push(`backgroundColor_${fc}`);

      uniforms.push(`fireSpeed_${fs1}`);
      uniforms.push(`fireSpeed_${fs2}`);
      uniforms.push(`pulseHeight_${fs1}`);
      uniforms.push(`pulseHeight_${fs2}`);
      uniforms.push(`displacementHeight_${fs1}`);
      uniforms.push(`displacementHeight_${fs2}`);
      uniforms.push(`turbulenceDetail_${fs1}`);
      uniforms.push(`turbulenceDetail_${fs2}`);

      uniforms.push(`cel0_${edgeId}`);
      uniforms.push(`cel1_${edgeId}`);
      uniforms.push(`cel2_${edgeId}`);
      uniforms.push(`cel3_${edgeId}`);
      uniforms.push(`cel4_${edgeId}`);
      uniforms.push(`celFade_${edgeId}`);
      uniforms.push(`edgeSteepness_${edgeId}`);
      uniforms.push(`edgeBorder_${edgeId}`);
      uniforms.push(`color_${edgeId}`);

      uniforms.push(`color_${os1}`);
      uniforms.push(`color_${os2}`);
      uniforms.push(`start_${os1}`);
      uniforms.push(`start_${os2}`);
      uniforms.push(`end_${os1}`);
      uniforms.push(`end_${os2}`);
      uniforms.push(`alpha_${os1}`);
      uniforms.push(`alpha_${os2}`);

      if (options) {
        console.log('Babylon scene setting processFinalCode...');
        options.processFinalCode = (type, code) => {
          console.log(
            '😮😮😮 Babylon scene processFinalCode called, setting shader source!'
          );
          if (type === 'vertex') {
            console.log('processFinalCode', {
              code,
              type,
              vert: compileResult?.vertexResult,
            });
            return compileResult?.vertexResult;
          }
          console.log('processFinalCode', {
            code,
            type,
            frag: compileResult?.fragmentResult,
          });
          return compileResult?.fragmentResult;
        };
      }
      capture = [];
      shaderNeedsReApplying.current = true;
      return shaderName;
    };

    if (sceneData.mesh) {
      console.log('👩‍🚀 👩‍🚀 reassigning shader');
      sceneData.mesh.material = shaderMaterial;
    }
    // sceneRef.current.shadersUpdated = true;
  }, [pu, scene, compileResult, ctx.compileCount]);

  // const lightsRef = useRef<BABYLON.Light[]>([]);
  const prevLights = usePrevious(lights);
  useEffect(() => {
    // Hack to let this hook get the latest state like ctx, but only update
    // if a certain dependency has changed
    // @ts-ignore
    if (
      prevLights === lights ||
      (prevLights === undefined && sceneData.lights.length)
    ) {
      return;
    }
    sceneData.lights.forEach((light) => light.dispose());

    // TODO: Lights aren't getting applied in babylengine now, or it's all
    // too dark?
    console.log('Babylon NEW LIGHTS');
    if (lights === 'point') {
      const pointLight = new BABYLON.PointLight(
        'p1',
        new BABYLON.Vector3(1, 0, 0),
        scene
      );
      pointLight.position = new BABYLON.Vector3(0, 0, 1);
      pointLight.diffuse = new BABYLON.Color3(1, 1, 1);
      pointLight.specular = new BABYLON.Color3(1, 1, 1);

      const sphere1 = BABYLON.MeshBuilder.CreateSphere(
        'sphere',
        { segments: 1, diameter: 0.2 },
        scene
      );
      sphere1.position = new BABYLON.Vector3(0, 0, 2);
      const mat1 = new BABYLON.StandardMaterial('mat1', scene);
      mat1.emissiveColor = new BABYLON.Color3(1, 1, 1);
      mat1.wireframe = true;
      sphere1.material = mat1;

      sceneData.lights = [pointLight, sphere1];
    } else if (lights === 'spot') {
      const spot1 = new BABYLON.SpotLight(
        'spotLight',
        new BABYLON.Vector3(0, 0, 2),
        new BABYLON.Vector3(0, 0, -1),
        Math.PI,
        0.1,
        scene
      );
      spot1.position = new BABYLON.Vector3(0, 0, 2);
      spot1.diffuse = new BABYLON.Color3(0, 1, 0);
      spot1.specular = new BABYLON.Color3(0, 1, 0);
      const sphere1 = BABYLON.MeshBuilder.CreateSphere(
        'sphere',
        { segments: 1, diameter: 0.2 },
        scene
      );
      sphere1.position = new BABYLON.Vector3(0, 0, 2);
      const mat1 = new BABYLON.StandardMaterial('mat1', scene);
      mat1.emissiveColor = new BABYLON.Color3(0, 1, 0);
      mat1.wireframe = true;
      sphere1.material = mat1;

      const spot2 = new BABYLON.SpotLight(
        'spotLight2',
        new BABYLON.Vector3(0, 0, 2),
        new BABYLON.Vector3(0, 0, -1),
        Math.PI,
        0.1,
        scene
      );
      spot2.position = new BABYLON.Vector3(0, 0, 2);
      spot2.diffuse = new BABYLON.Color3(1, 0, 0);
      spot2.specular = new BABYLON.Color3(1, 0, 0);
      const sphere2 = BABYLON.MeshBuilder.CreateSphere(
        'sphere',
        { segments: 1, diameter: 0.2 },
        scene
      );
      sphere2.position = new BABYLON.Vector3(0, 0, 2);
      const mat2 = new BABYLON.StandardMaterial('mat2', scene);
      mat2.emissiveColor = new BABYLON.Color3(1, 0, 0);
      mat2.wireframe = true;
      sphere2.material = mat2;

      sceneData.lights = [spot1, sphere1, spot2, sphere2];
    }

    //   if (sceneData.mesh) {
    //     sceneData.mesh.material = loadingMaterial;
    //   }

    // @ts-ignore
    // if (scene.lights) {
    compile(ctx);
    // }
    // // @ts-ignore

    // This is a hack, maybe should be usePrevious
    // scene.lightsStore = lights;
  }, [sceneData, prevLights, lights, scene, compile, ctx]);

  useEffect(() => {
    console.log('resize');
    canvas.width = width;
    canvas.height = height;
    engine.resize();
  }, [engine, canvas, width, height, ctx.runtime]);

  return (
    <div>
      <div
        style={{
          width: `${width}px`,
          height: `${height}px`,
        }}
        ref={babylonDomRef}
      ></div>
      <div className={styles.sceneLabel}>
        {guiMsg}
        {!guiMsg &&
          compileResult?.compileMs &&
          `Complile took ${compileResult?.compileMs}ms`}
      </div>
      <div className={styles.sceneControls}>
        <button
          className={styles.button}
          onClick={() => setLights('point')}
          disabled={lights === 'point'}
        >
          Point Light
        </button>
        <button
          className={styles.button}
          onClick={() => setLights('spot')}
          disabled={lights === 'spot'}
        >
          Spot Lights
        </button>
        <button
          className={styles.button}
          onClick={() =>
            setPreviewObject(
              previewObject === 'sphere' ? 'torusknot' : 'sphere'
            )
          }
        >
          {previewObject === 'sphere' ? 'Torus Knot' : 'Sphere'}
        </button>
      </div>
    </div>
  );
};

export default BabylonComponent;
