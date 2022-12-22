import * as BABYLON from 'babylonjs';
import cx from 'classnames';
import { useEffect, useMemo, useRef, useState } from 'react';

import { evaluateNode, Graph, mangleVar } from '../../core/graph';
import { EngineContext } from '../../core/engine';
import { babylengine, RuntimeContext } from './bablyengine';

import styles from '../../pages/editor/editor.module.css';

import { useBabylon } from './useBabylon';
import { usePrevious } from '../../site/hooks/usePrevious';
import { UICompileGraphResult } from '../../site/uICompileGraphResult';
import { TextureNode } from '../../core/nodes/data-nodes';
import { useSize } from '../../site/hooks/useSize';

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

const lightHelper = (scene: BABYLON.Scene, parent: BABYLON.Light) => {
  const helper = BABYLON.MeshBuilder.CreatePolyhedron(
    'oct',
    { type: 1, size: 0.075 },
    scene
  );
  const mat1 = new BABYLON.StandardMaterial('lighthelpermat' + id(), scene);
  mat1.emissiveColor = new BABYLON.Color3(1, 1, 1);
  mat1.wireframe = true;
  helper.material = mat1;
  helper.setParent(parent);

  return helper;
};

type AnyFn = (...args: any) => any;
type BabylonComponentProps = {
  compile: AnyFn;
  compileResult: UICompileGraphResult | undefined;
  graph: Graph;
  lights: PreviewLight;
  previewObject: string;
  setCtx: (ctx: EngineContext) => void;
  setGlResult: AnyFn;
  setLights: AnyFn;
  setPreviewObject: AnyFn;
  showHelpers: boolean;
  setShowHelpers: AnyFn;
  bg: string | undefined;
  setBg: AnyFn;
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
  bg,
  setBg,
  showHelpers,
  setShowHelpers,
  width,
  height,
}) => {
  const checkForCompileErrors = useRef<boolean>(false);
  const compileCount = useRef<number>(0);
  const lastCompile = useRef<any>({});
  const sceneWrapper = useRef<HTMLDivElement>(null);
  const size = useSize(sceneWrapper);

  const {
    canvas,
    sceneData,
    babylonDomRef,
    scene,
    camera,
    engine,
    loadingMaterial,
  } = useBabylon((time) => {
    if (checkForCompileErrors.current) {
      // console.log(sceneData.mesh?.material);
      // const effect = sceneData.mesh?.material?.getEffect();
      // const y = BABYLON.Logger._pipelineContext;
      // const t = capture;
      // capture.FRAGMENT SHADER ERROR
      setGlResult({
        fragError: capture.find((str) => str.includes('FRAGMENT SHADER ERROR')),
        vertError: capture.find((str) => str.includes('VERTEX SHADER ERROR')),
        programError: '',
      });
      checkForCompileErrors.current = false;
    }

    const { lights: lightMeshes } = sceneData;
    if (lights === 'point') {
      const light = lightMeshes[0] as BABYLON.PointLight;
      light.position.x = 1.2 * Math.sin(time * 0.001);
      light.position.y = 1.2 * Math.cos(time * 0.001);
    } else if (lights === 'spot') {
      // I haven't done this yet
    }

    const effect = sceneData?.mesh?.material?.getEffect();
    if (sceneData.mesh && sceneData.mesh.material) {
      effect?.setFloat('time', time * 0.001);
    }

    // Note the uniforms are updated here every frame, but also instantiated
    // in this component at RawShaderMaterial creation time. There might be
    // some logic duplication to worry about.
    if (compileResult?.dataInputs) {
      Object.entries(compileResult.dataInputs).forEach(([nodeId, inputs]) => {
        const node = graph.nodes.find(({ id }) => id === nodeId);
        if (!node) {
          console.warn(
            'While populating uniforms, no node was found from dataInputs',
            { nodeId, dataInputs: compileResult.dataInputs, graph }
          );
          return;
        }
        inputs.forEach((input) => {
          const edge = graph.edges.find(
            ({ to, input: i }) => to === nodeId && i === input.id
          );
          if (edge) {
            const fromNode = graph.nodes.find(({ id }) => id === edge.from);
            // In the case where a node has been deleted from the graph,
            // dataInputs won't have been udpated until a recompile completes
            if (!fromNode) {
              return;
            }

            let value;
            // THIS DUPLICATES OTHER LINE
            // When a shader is plugged into the Texture node of a megashader,
            // this happens, I'm not sure why yet. In fact, why is this branch
            // getting called at all in useThree() ?
            try {
              value = evaluateNode(babylengine, graph, fromNode);
            } catch (err) {
              console.warn(
                `Tried to evaluate a non-data node! ${input.displayName} on ${node.name}`
              );
              return;
            }
            let newValue = value;
            if (fromNode.type === 'texture') {
              // THIS DUPLICATES OTHER LINE, used for runtime uniform setting
              newValue = images[(fromNode as TextureNode).value];
            }
            // TODO RENDER TARGET
            if (fromNode.type === 'samplerCube') {
              return;
            }

            if (input.type === 'property') {
              if (
                !newValue.url ||
                // @ts-ignore
                sceneData.mesh.material[input.property]?.url !== newValue.url
              ) {
                // @ts-ignore
                sceneData.mesh.material[input.property] = newValue;
              }
            } else {
              // TODO: This doesn't work for engine variables because
              // those aren't suffixed
              const name = mangleVar(input.displayName, babylengine, node);

              // sceneData.mesh.material.getEffect()?.setFloat('time', time * 0.001);
              // @ts-ignore
              if (fromNode.type === 'number') {
                effect?.setFloat(name, newValue);
              }
              // if (name `in (sceneData.mesh.material.uniforms || {})) {
              //   // @ts-ignore
              //   sceneData.mesh.material.uniforms[name].value = newValue;
              // } else {
              //   console.warn('Unknown uniform', name);
              // }`
            }
          }
        });
      });
    }
  });

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
    } else if (previewObject === 'icosahedron') {
      mesh = BABYLON.MeshBuilder.CreatePolyhedron(
        'oct',
        { type: 3, size: 1 },
        scene
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
          // TODO: Set runtime uniforms here
          effect.setFloat('time', performance.now() * 0.001);
        }
      }
    });
  }, [previewObject, scene, sceneData]);

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
    setCtx(ctx);
  }, [ctx, setCtx]);

  const images = useMemo<Record<string, BABYLON.Texture | null>>(
    () => ({
      explosion: new BABYLON.Texture('/explosion.png', scene),
      'grayscale-noise': new BABYLON.Texture('/grayscale-noise.png', scene),
      threeTone: new BABYLON.Texture('/3tone.jpg', scene),
      brick: new BABYLON.Texture('/bricks.jpeg', scene),
      brickNormal: new BABYLON.Texture('/bricknormal.jpeg', scene),
      pebbles: new BABYLON.Texture('/Big_pebbles_pxr128.jpeg', scene),
      pebblesNormal: new BABYLON.Texture(
        '/Big_pebbles_pxr128_normal.jpeg',
        scene
      ),
      pebblesBump: new BABYLON.Texture('/Big_pebbles_pxr128_bmp.jpeg', scene),
      pondCubeMap: null,
      warehouseEnvTexture: null,
    }),
    [scene]
  );

  useEffect(() => {
    if (!compileResult?.fragmentResult) {
      console.log('Bailing on babylon new material, because no compile result');
      return;
    }
    console.log('🛠 🛠 🛠 Re-creating BPR material', {
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
    // shaderMaterial.albedoTexture = images.brick as BABYLON.Texture;
    // shaderMaterial.bumpTexture = images.brickNormal as BABYLON.Texture;
    shaderMaterial.albedoColor = new BABYLON.Color3(1.0, 1.0, 1.0);
    shaderMaterial.metallic = 0.0; // set to 1 to only use it from the metallicRoughnessTexture
    // Roughness of 0 makes the material black.
    shaderMaterial.roughness = 1.0; // set to 1 to only use it from the metallicRoughnessTexture

    shaderMaterial.customShaderNameResolve = (
      shaderName,
      uniforms,
      uniformBuffers,
      samplers,
      defines,
      attributes,
      options
    ) => {
      // Hack to force defines change
      if (
        compileResult?.vertexResult !== lastCompile.current.vertexResult ||
        compileResult?.fragmentResult !== lastCompile.current.fragmentResult
      ) {
        if (!Array.isArray(defines)) {
          compileCount.current++;
          // Only this works, the mark dirty methods don't work. \
          defines.AMBIENTDIRECTUV = 0.00001 * compileCount.current;
          //Lies:
          // https://forum.babylonjs.com/t/how-to-access-raw-shader-information/27240/16
          // shaderMaterial.markAsDirty(BABYLON.Constants.MATERIAL_AllDirtyFlag);
          // shaderMaterial.markDirty();
        }
        lastCompile.current.vertexResult = compileResult?.vertexResult;
        lastCompile.current.fragmentResult = compileResult?.fragmentResult;
      } else {
        return shaderName;
      }

      console.log('💪🏽 component customShaderNameResolve called...', {
        defines,
      });

      // TODO: No Time?
      uniforms.push('time');

      // uniforms.push(`Scene`);
      // uniforms.push(`world`);
      // uniforms.push(`viewProjection`);
      // uniforms.push(`speed_${pu}`);
      // uniforms.push(`brightnessX_${pu}`);
      // uniforms.push(`permutations_${pu}`);
      // uniforms.push(`iterations_${pu}`);
      // uniforms.push(`uvScale_${pu}`);
      // uniforms.push(`color1_${pu}`);
      // uniforms.push(`color2_${pu}`);
      // uniforms.push(`color3_${pu}`);

      // uniforms.push(`scale_${hs1}`);
      // uniforms.push(`power_${hs1}`);
      // uniforms.push(`scale_${hs2}`);
      // uniforms.push(`power_${hs2}`);

      // uniforms.push(`speed_${fc}`);
      // uniforms.push(`baseRadius_${fc}`);
      // uniforms.push(`colorVariation_${fc}`);
      // uniforms.push(`brightnessVariation_${fc}`);
      // uniforms.push(`variation_${fc}`);
      // uniforms.push(`backgroundColor_${fc}`);

      // uniforms.push(`fireSpeed_${fs1}`);
      // uniforms.push(`fireSpeed_${fs2}`);
      // uniforms.push(`pulseHeight_${fs1}`);
      // uniforms.push(`pulseHeight_${fs2}`);
      // uniforms.push(`displacementHeight_${fs1}`);
      // uniforms.push(`displacementHeight_${fs2}`);
      // uniforms.push(`turbulenceDetail_${fs1}`);
      // uniforms.push(`turbulenceDetail_${fs2}`);

      // uniforms.push(`cel0_${edgeId}`);
      // uniforms.push(`cel1_${edgeId}`);
      // uniforms.push(`cel2_${edgeId}`);
      // uniforms.push(`cel3_${edgeId}`);
      // uniforms.push(`cel4_${edgeId}`);
      // uniforms.push(`celFade_${edgeId}`);
      // uniforms.push(`edgeSteepness_${edgeId}`);
      // uniforms.push(`edgeBorder_${edgeId}`);
      // uniforms.push(`color_${edgeId}`);

      // uniforms.push(`color_${os1}`);
      // uniforms.push(`color_${os2}`);
      // uniforms.push(`start_${os1}`);
      // uniforms.push(`start_${os2}`);
      // uniforms.push(`end_${os1}`);
      // uniforms.push(`end_${os2}`);
      // uniforms.push(`alpha_${os1}`);
      // uniforms.push(`alpha_${os2}`);

      // todo lights are at 90 degree angle and something switches engine back
      // to three lolå
      if (options) {
        console.log('Babylon scene setting processFinalCode...');
        options.processFinalCode = (type, code) => {
          console.log(
            '😮 Babylon scene processFinalCode called, setting shader source!'
          );
          if (type === 'vertex') {
            if (!compileResult?.vertexResult) {
              console.error('No vertex result for Babylon shader!');
            }
            console.log('processFinalCode', {
              code,
              type,
              vert: compileResult?.vertexResult,
            });
            return compileResult?.vertexResult;
          }
          if (!compileResult?.fragmentResult) {
            console.error('No fragment result for Babylon shader!');
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
  }, [scene, compileResult, ctx.compileCount, sceneData.mesh]);

  // const lightsRef = useRef<BABYLON.Light[]>([]);
  const prevLights = usePrevious(lights);
  const previousShowHelpers = usePrevious(showHelpers);
  useEffect(() => {
    if (
      (prevLights === lights && previousShowHelpers === showHelpers) ||
      (prevLights === undefined && sceneData.lights.length)
    ) {
      return;
    }
    sceneData.lights.forEach((light) => light.dispose());

    if (lights === 'point') {
      const pointLight = new BABYLON.PointLight(
        'p1',
        new BABYLON.Vector3(1, 0, 0),
        scene
      );
      pointLight.position = new BABYLON.Vector3(0, 0, 1);
      pointLight.diffuse = new BABYLON.Color3(1, 1, 1);
      pointLight.specular = new BABYLON.Color3(1, 1, 1);
      sceneData.lights = [pointLight];

      // https://forum.babylonjs.com/t/creating-a-mesh-without-adding-to-the-scene/12546/17
      // :(
      if (showHelpers) {
        const sphere1 = lightHelper(scene, pointLight);
        sphere1.position = new BABYLON.Vector3(0, 0, 2);
        sceneData.lights = sceneData.lights.concat(sphere1);
      }
    } else if (lights === '3point') {
      const light1 = new BABYLON.PointLight(
        'light1',
        new BABYLON.Vector3(2, -2, 0),
        scene
      );

      const light2 = new BABYLON.PointLight(
        'light2',
        new BABYLON.Vector3(-1, 2, 1),
        scene
      );

      const light3 = new BABYLON.PointLight(
        'light3',
        new BABYLON.Vector3(-1, -2, -1),
        scene
      );

      sceneData.lights = [light1, light2, light3];

      if (showHelpers) {
        const sphere1 = lightHelper(scene, light1);
        sphere1.position = new BABYLON.Vector3(2, -2, 0);
        const sphere2 = lightHelper(scene, light2);
        sphere2.position = new BABYLON.Vector3(-1, 2, 1);
        const sphere3 = lightHelper(scene, light3);
        sphere3.position = new BABYLON.Vector3(-1, -2, -1);

        sceneData.lights = sceneData.lights.concat(sphere1, sphere2, sphere3);
      }
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

      sceneData.lights = [spot1, spot2];

      if (showHelpers) {
        const sphere1 = lightHelper(scene, spot1);
        sphere1.position = new BABYLON.Vector3(0, 0, 2);

        const sphere2 = lightHelper(scene, spot2);
        sphere2.position = new BABYLON.Vector3(0, 0, 2);

        sceneData.lights = sceneData.lights.concat(sphere1, sphere2);
      }
    }

    if (prevLights && prevLights !== undefined && prevLights !== lights) {
      if (sceneData.mesh) {
        sceneData.mesh.material = loadingMaterial;
      }
      compile(ctx);
    }
  }, [
    sceneData,
    prevLights,
    lights,
    scene,
    compile,
    ctx,
    previousShowHelpers,
    showHelpers,
    loadingMaterial,
  ]);

  useEffect(() => {
    console.log('resize');
    canvas.width = width;
    canvas.height = height;
    engine.resize();
  }, [engine, canvas, width, height, ctx.runtime]);

  return (
    <>
      <div className={cx(styles.sceneControls)}>
        <div>
          <label htmlFor="Lightingsfs" className="label noselect">
            <span>Lighting</span>
          </label>
        </div>
        <div>
          <select
            id="Lightingsfs"
            className="select"
            onChange={(event) => {
              setLights(event.target.value);
            }}
            value={lights}
          >
            <option value="3point">Static Point Lights</option>
            <option value="point">Animated Point Light</option>
            <option value="spot">Spot Lights</option>
          </select>
        </div>
        <div>
          <label className="label noselect" htmlFor="shp">
            <span>Lighting Helpers</span>
          </label>
        </div>
        <div>
          <input
            className="checkbox"
            id="shp"
            type="checkbox"
            checked={showHelpers}
            onChange={(event) => setShowHelpers(event?.target.checked)}
          />
        </div>
        <div>
          <label htmlFor="Modelsfs" className="label noselect">
            <span>Model</span>
          </label>
        </div>
        <div>
          <select
            id="Modelsfs"
            className="select"
            onChange={(event) => {
              setPreviewObject(event.target.value);
            }}
            value={previewObject}
          >
            <option value="sphere">Sphere</option>
            <option value="torusknot">Torus Knot</option>
            <option value="icosahedron">Icosahedron</option>
          </select>
        </div>
        <div>
          <label htmlFor="Backgroundsfs" className="label noselect">
            <span>Background</span>
          </label>
        </div>
        <div>
          <select
            id="Backgroundsfs"
            className="select"
            disabled
            onChange={(event) => {
              setBg(event.target.value === 'none' ? null : event.target.value);
            }}
            value={bg ? bg : 'none'}
          >
            <option value="none">None</option>
            <option value="warehouseEnvTexture">Warehouse</option>
            <option value="pondCubeMap">Pond Cube Map</option>
          </select>
        </div>
      </div>
      <div ref={sceneWrapper} className={styles.sceneContainer}>
        <div ref={babylonDomRef}></div>
      </div>
    </>
  );
};

export default BabylonComponent;
