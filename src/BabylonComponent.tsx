import * as BABYLON from 'babylonjs';
import { useEffect, useMemo, useRef, useState } from 'react';

import babf from './babylon-fragment';
import babv from './babylon-vertex';

import { Graph } from './nodestuff';

import { EngineContext } from './graph';
import { babylengine, RuntimeContext } from './bablyengine';

import styles from '../pages/editor/editor.module.css';

import { UICompileGraphResult } from './Editor';
import { useBabylon } from './useBabylon';
import useOnce from './useOnce';

// const loadingMaterial = new three.MeshBasicMaterial({ color: 'pink' });

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
  const shadersRef = useRef<boolean>(false);

  const { babylonCanvas, babylonDomRef, scene, camera, engine } = useBabylon(
    (time) => {
      if (shadersRef.current) {
        // console.log(meshRef.current?.material);
        // const effect = meshRef.current?.material?.getEffect();
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
        shadersRef.current = false;
      }

      const light = lightsRef.current[0];
      if (light) {
        (light as BABYLON.PointLight).position.x = 1.2 * Math.sin(time * 0.001);
        (light as BABYLON.PointLight).position.y = 1.2 * Math.cos(time * 0.001);
      }
    }
  );

  useOnce(() => {
    // Create a basic light, aiming 0, 1, 0 - meaning, to the sky
    new BABYLON.HemisphericLight('light1', new BABYLON.Vector3(0, 2, 0), scene);

    // Create a built-in "ground" shape; its constructor takes 6 params : name, width, height, subdivision, scene, updatable
    // BABYLON.Mesh.CreateGround('ground1', 6, 6, 2, scene, false);
  });

  const pu: any = graph.nodes.find((node) => node.name === 'Purple Metal')?.id;

  const meshRef = useRef<BABYLON.Mesh>();
  useMemo(() => {
    if (meshRef.current) {
      meshRef.current.dispose();
    }

    let mesh;
    if (previewObject === 'torusknot') {
      mesh = BABYLON.MeshBuilder.CreateTorusKnot(
        'torusKnot',
        {
          radius: 1,
          tube: 0.25,
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
    if (meshRef.current) {
      mesh.material = meshRef.current.material;
    }
    meshRef.current = mesh;
    mesh.position.y = 1;

    mesh.onBeforeDrawObservable.add((mesh) => {
      if (mesh && mesh.material) {
        const effect = mesh.material.getEffect();
        if (effect) {
          effect.setFloat(`brightnessX_${pu}`, 1.0);
          effect.setFloat(`permutations_${pu}`, 10);
          effect.setFloat(`iterations_${pu}`, 1);
          effect.setFloat(`time_${pu}`, performance.now() * 0.001);
          effect.setFloat(`speed_${pu}`, 1.0);
          effect.setVector2(`uvScale_${pu}`, new BABYLON.Vector2(1, 1));
          effect.setColor3(`color1_${pu}`, new BABYLON.Color3(0.7, 0.3, 0.8));
          effect.setColor3(`color2_${pu}`, new BABYLON.Color3(0.1, 0.2, 0.9));
          effect.setColor3(`color3_${pu}`, new BABYLON.Color3(0.8, 0.3, 0.8));
        }
      }
    });
  }, [previewObject, scene, pu]);

  const [ctx] = useState<EngineContext<RuntimeContext>>({
    runtime: {
      BABYLON,
      scene,
      camera,
      meshRef,
      cache: { nodes: {} },
    },
    nodes: {},
    debuggingNonsense: {},
  });

  // Inform parent our context is created
  useEffect(() => {
    setCtx<RuntimeContext>(ctx);
  }, [ctx, setCtx]);

  useEffect(() => {
    if (!compileResult?.fragmentResult) {
      return;
    }

    const shaderMaterial = new BABYLON.PBRMaterial('pbr', scene);

    // Ensures irradiance is computed per fragment to make the
    // Bump visible
    shaderMaterial.forceIrradianceInFragment = true;

    const brickTexture = new BABYLON.Texture('/brick-texture.jpeg', scene);
    shaderMaterial.albedoTexture = brickTexture;

    const brickNormal = new BABYLON.Texture('/brick-texture.jpeg', scene);
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
      uniforms.push(`time_${pu}`);
      uniforms.push(`permutations_${pu}`);
      uniforms.push(`iterations_${pu}`);
      uniforms.push(`uvScale_${pu}`);
      uniforms.push(`color1_${pu}`);
      uniforms.push(`color2_${pu}`);
      uniforms.push(`color3_${pu}`);
      uniforms.push(`brightnessX_${pu}`);
      uniforms.push(`speed_${pu}`);
      if (options) {
        options.processFinalCode = (type, code) => {
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
      shadersRef.current = true;
      return shaderName;
    };

    if (meshRef.current) {
      meshRef.current.material = shaderMaterial;
    }
    // sceneRef.current.shadersUpdated = true;
  }, [pu, scene, compileResult, ctx.runtime, graph.nodes]);

  const lightsRef = useRef<BABYLON.Light[]>([]);
  useMemo(() => {
    // Hack to let this hook get the latest state like ctx, but only update
    // if a certain dependency has changed
    // @ts-ignore
    if (scene.lights === lights) {
      return;
    }
    //   lightsRef.current.forEach((light) => scene.remove(light));

    if (lights === 'point') {
      const pointLight = new BABYLON.PointLight(
        'p1',
        new BABYLON.Vector3(1, 0, 0),
        scene
      );
      //   } else {
      //     const light = new three.SpotLight(0x00ff00, 1, 3, 0.4, 1);
      //     light.position.set(0, 0, 2);
      //     scene.add(light);

      //     const helper = new three.SpotLightHelper(
      //       light,
      //       new three.Color(0x00ff00)
      //     );
      //     scene.add(helper);

      //     const light2 = new three.SpotLight(0xff0000, 1, 4, 0.4, 1);
      //     light2.position.set(0, 0, 2);
      //     scene.add(light2);

      //     const helper2 = new three.SpotLightHelper(
      //       light2,
      //       new three.Color(0xff0000)
      //     );
      //     scene.add(helper2);

      lightsRef.current = [pointLight];
    }

    //   if (meshRef.current) {
    //     meshRef.current.material = loadingMaterial;
    //   }

    //   // @ts-ignore
    //   if (scene.lights) {
    //     compile(ctx);
    //   }
    //   // @ts-ignore
    //   scene.lights = lights;
  }, [lights, scene, compile, ctx]);

  useEffect(() => {
    babylonCanvas.width = width;
    babylonCanvas.height = height;
    engine.resize();
  }, [engine, babylonCanvas, width, height, ctx.runtime]);

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
        {/* <button
          className={styles.button}
          onClick={() => setPauseCompile(!pauseCompile)}
        >
          {pauseCompile ? 'Unpause' : 'Pause'}
        </button> */}
      </div>
    </div>
  );
};

export default BabylonComponent;
