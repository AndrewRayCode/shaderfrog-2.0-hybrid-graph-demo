import * as BABYLON from 'babylonjs';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Graph } from '../../core/graph';
import { EngineContext } from '../../core/engine';
import { babylengine, RuntimeContext } from './bablyengine';

import styles from '../../pages/editor/editor.module.css';

import { useBabylon } from './useBabylon';
import { usePrevious } from '../../site/hooks/usePrevious';
import { UICompileGraphResult } from '../../site/uICompileGraphResult';

export type PreviewLight = 'point' | '3point' | 'spot';

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
  compileResult: UICompileGraphResult | undefined;
  graph: Graph;
  lights: PreviewLight;
  previewObject: string;
  setCtx: <T extends unknown>(ctx: EngineContext) => void;
  setGlResult: AnyFn;
  setLights: AnyFn;
  setPreviewObject: AnyFn;
  width: number;
  height: number;
};
const BabylonComponent: React.FC<BabylonComponentProps> = ({
  compile,
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
  const checkForCompileErrors = useRef<boolean>(false);
  const compileCount = useRef<number>(0);

  const { canvas, sceneData, babylonDomRef, scene, camera, engine } =
    useBabylon((time) => {
      if (checkForCompileErrors.current) {
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
        checkForCompileErrors.current = false;
      }

      const { lights } = sceneData;
      if (lights.length === 2) {
        const light = lights[0] as BABYLON.PointLight;
        light.position.x = 1.2 * Math.sin(time * 0.001);
        light.position.y = 1.2 * Math.cos(time * 0.001);
        const helper = lights[1] as BABYLON.Mesh;
        helper.position.x = 1.2 * Math.sin(time * 0.001);
        helper.position.y = 1.2 * Math.cos(time * 0.001);
      } else if (lights.length === 4) {
        const light1 = lights[0] as BABYLON.PointLight;
        light1.position.x = 1.2 * Math.sin(time * 0.001);
        light1.position.y = 1.2 * Math.cos(time * 0.001);
        light1.setDirectionToTarget(new BABYLON.Vector3(0, 0, 0));
        const helper1 = lights[1] as BABYLON.Mesh;
        helper1.position.x = 1.2 * Math.sin(time * 0.001);
        helper1.position.y = 1.2 * Math.cos(time * 0.001);

        const light2 = lights[2] as BABYLON.PointLight;
        light2.position.x = 1.3 * Math.cos(time * 0.0015);
        light2.position.y = 1.3 * Math.sin(time * 0.0015);
        const helper2 = lights[3] as BABYLON.Mesh;
        helper2.position.x = 1.2 * Math.sin(time * 0.001);
        helper2.position.y = 1.2 * Math.cos(time * 0.001);

        light1.setDirectionToTarget(new BABYLON.Vector3(0, 0, 0));
      }

      if (sceneData.mesh && sceneData.mesh.material) {
        sceneData.mesh.material.getEffect()?.setFloat('time', time * 0.001);
      }
    });

  const os1: any = graph.nodes.find(
    (node) => node.name === 'Outline Shader'
  )?.id;
  const os2: any = graph.nodes.find(
    (node) => node.name === 'Outline Shader'
  )?.id;
  const fs1: any = graph.nodes.find((node) => node.name === 'Fireball')?.id;
  const fs2: any = graph.nodes.find((node) => node.name === 'Fireball')?.id;
  const fc: any = graph.nodes.find((node) => node.name === 'Fluid Circles')?.id;
  const pu: any = graph.nodes.find((node) => node.name === 'Purple Metal')?.id;
  const edgeId: any = graph.nodes.find((node) => node.name === 'Triplanar')?.id;
  const hs1: any = graph.nodes.find((node) => node.name === 'Fake Heatmap')?.id;
  const hs2: any = graph.nodes.find((node) => node.name === 'Fake Heatmap')?.id;

  useEffect(() => {
    if (sceneData.mesh) {
      sceneData.mesh.onBeforeDrawObservable.clear();
      sceneData.mesh.dispose();
    }

    let mesh: BABYLON.Mesh;
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
          effect.setFloat(`displacementHeight_${fs1}`, 0.6);
          effect.setFloat(`displacementHeight_${fs2}`, 0.6);
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

  const [ctx] = useState<EngineContext>(() => {
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

    // Ensures irradiance is computed per fragment to make the bump visible
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

      if (!Array.isArray(defines)) {
        compileCount.current++;
        console.log('Setting AMBIENTDIRECTUV', 0.00001 * compileCount.current);
        defines.AMBIENTDIRECTUV = 0.00001 * compileCount.current;
        // defines._isDirty = true;
      }

      // TODO: No Time?
      uniforms.push('time');

      uniforms.push(`Scene`);
      uniforms.push(`world`);
      uniforms.push(`viewProjection`);
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

      // todo lights are at 90 degree angle and something switches engine back
      // to three lolå
      if (options) {
        console.log('Babylon scene setting processFinalCode...');
        options.processFinalCode = (type, code) => {
          console.log(
            '😮 Babylon scene processFinalCode called, setting shader source!'
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
      checkForCompileErrors.current = true;
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
    } else if (lights === '3point') {
      const light1 = new BABYLON.PointLight(
        'light1',
        new BABYLON.Vector3(2, -2, 0),
        scene
      );
      const sphere1 = BABYLON.MeshBuilder.CreateSphere(
        'sphere',
        { segments: 1, diameter: 0.2 },
        scene
      );
      sphere1.position = new BABYLON.Vector3(2, -2, 0);
      const mat1 = new BABYLON.StandardMaterial('mat1', scene);
      mat1.wireframe = true;
      sphere1.material = mat1;

      const light2 = new BABYLON.PointLight(
        'light2',
        new BABYLON.Vector3(-1, 2, 1),
        scene
      );
      const sphere2 = BABYLON.MeshBuilder.CreateSphere(
        'sphere',
        { segments: 1, diameter: 0.2 },
        scene
      );
      sphere2.position = new BABYLON.Vector3(-1, 2, 1);
      const mat2 = new BABYLON.StandardMaterial('mat2', scene);
      mat2.wireframe = true;
      sphere2.material = mat2;

      const light3 = new BABYLON.PointLight(
        'light3',
        new BABYLON.Vector3(-1, -2, -1),
        scene
      );
      const sphere3 = BABYLON.MeshBuilder.CreateSphere(
        'sphere',
        { segments: 1, diameter: 0.2 },
        scene
      );
      sphere3.position = new BABYLON.Vector3(-1, -2, -1);
      const mat3 = new BABYLON.StandardMaterial('mat3', scene);
      mat3.wireframe = true;
      sphere3.material = mat3;

      sceneData.lights = [light1, sphere1, light2, sphere2, light3, sphere3];
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

    compile(ctx);
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
          onClick={() => setLights('3point')}
          disabled={lights === '3point'}
        >
          3 Points
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
