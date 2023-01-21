import * as BABYLON from 'babylonjs';
import cx from 'classnames';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { evaluateNode, Graph, mangleVar } from '../../core/graph';
import { EngineContext, EngineNodeType } from '../../core/engine';
import {
  babylengine,
  physicalDefaultProperties,
  RuntimeContext,
} from './bablyengine';

import styles from '../../pages/editor/editor.module.css';

import { useBabylon } from './useBabylon';
import { usePrevious } from '../../site/hooks/usePrevious';
import { UICompileGraphResult } from '../../site/uICompileGraphResult';
import { SamplerCubeNode, TextureNode } from '../../core/nodes/data-nodes';
import { useSize } from '../../site/hooks/useSize';
import { Nullable } from 'babylonjs';

export type PreviewLight = 'point' | '3point' | 'spot';

const log = (...args: any[]) =>
  console.log.call(console, '\x1b[36m(component)\x1b[0m', ...args);

let mIdx = 0;
let id = () => mIdx++;
const _err = BABYLON.Logger.Error;
let capturing = false;
let capture: any[] = [];
BABYLON.Logger.Error = (...args) => {
  const str = args[0] || '';
  if (capturing || str.includes('Unable to compile effect')) {
    capturing = true;
    capture.push(str);
    if (str.includes('Error:')) {
      capturing = false;
    }
  }
  _err(...args);
};

type OnBeforeDraw = (mesh: BABYLON.Mesh) => void;
const useOnMeshDraw = (
  mesh: BABYLON.Mesh | undefined,
  callback: (mesh: BABYLON.Mesh) => void
) => {
  const lastMesh = usePrevious(mesh);
  const savedCallback = useRef<(mesh: BABYLON.Mesh) => void>(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (mesh && lastMesh !== mesh) {
      const applied: OnBeforeDraw = (mesh) => savedCallback.current(mesh);
      log('Setting new onBeforeDrawObservable callback on mesh!');
      if (lastMesh) {
        lastMesh.onBeforeDrawObservable.clear();
      }
      mesh.onBeforeDrawObservable.clear();
      mesh.onBeforeDrawObservable.add(applied);
    }
  }, [lastMesh, mesh]);
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
  });

  const images = useMemo<
    Record<
      string,
      BABYLON.Texture | BABYLON.HDRCubeTexture | BABYLON.CubeTexture | null
    >
  >(
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
      warehouseEnvTexture: new BABYLON.HDRCubeTexture(
        '/envmaps/room.hdr',
        scene,
        512
      ),
      cityCourtYard: BABYLON.CubeTexture.CreateFromPrefilteredData(
        '/envmaps/citycourtyard.dds',
        scene
      ),
    }),
    [scene]
  );

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
          radius: 0.5,
          tube: 0.15,
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
  }, [previewObject, scene, sceneData]);

  const meshUpdater = useCallback(
    (mesh: BABYLON.Mesh) => {
      if (mesh && mesh.material) {
        const effect = mesh.material.getEffect();
        if (!effect) {
          return;
        }
        effect.setFloat('time', performance.now() * 0.001);

        // Note the uniforms are updated here every frame, but also instantiated
        // in this component at RawShaderMaterial creation time. There might be
        // some logic duplication to worry about.
        if (compileResult?.dataInputs && sceneData.mesh?.material) {
          const material = sceneData.mesh.material as BABYLON.Material &
            Record<string, any>;
          Object.entries(compileResult.dataInputs).forEach(
            ([nodeId, inputs]) => {
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
                  const fromNode = graph.nodes.find(
                    ({ id }) => id === edge.from
                  );
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
                  if (fromNode.type === 'samplerCube') {
                    newValue = images[(fromNode as SamplerCubeNode).value];
                  }

                  if (input.type === 'property' && input.property) {
                    if (
                      !newValue.url ||
                      material[input.property]?.url !== newValue.url
                    ) {
                      material[input.property] = newValue;
                    }
                  } else {
                    // TODO: This doesn't work for engine variables because
                    // those aren't suffixed
                    const name = mangleVar(
                      input.displayName,
                      babylengine,
                      node
                    );

                    // @ts-ignore
                    if (fromNode.type === 'number') {
                      effect.setFloat(name, newValue);
                    } else if (fromNode.type === 'vector2') {
                      effect.setVector2(name, newValue);
                    } else if (fromNode.type === 'vector3') {
                      effect.setVector3(name, newValue);
                    } else if (fromNode.type === 'vector4') {
                      effect.setVector4(name, newValue);
                    } else if (fromNode.type === 'rgb') {
                      effect.setColor3(name, newValue);
                    } else if (fromNode.type === 'rgba') {
                      // TODO: Uniforms aren't working for plugging in purple noise
                      // shader to Texture filler of babylon physical - was getting
                      // webgl warnings, but now object is black? Also I need to
                      // get the actual color4 alpha value here
                      effect.setColor4(name, newValue, 1.0);
                    } else {
                      log(`Unknown uniform type: ${fromNode.type}`);
                    }
                  }
                }
              });
            }
          );
        }
      }
    },
    [compileResult?.dataInputs, sceneData.mesh, graph, images]
  );

  useOnMeshDraw(sceneData.mesh, meshUpdater);

  const [ctx] = useState<EngineContext>(() => {
    return {
      engine: 'babylon',
      runtime: {
        BABYLON,
        scene,
        camera,
        sceneData,
        cache: { nodes: {}, data: {} },
      },
      nodes: {},
      debuggingNonsense: {},
    };
  });

  // Inform parent our context is created
  useEffect(() => {
    setCtx(ctx);
  }, [ctx, setCtx]);

  const previousPreviewObject = usePrevious(previewObject);
  const previousBg = usePrevious(bg);
  const skybox = useRef<Nullable<BABYLON.Mesh>>();
  useEffect(() => {
    if (bg === previousBg) {
      return;
    }
    const newBg = bg ? images[bg] : null;
    scene.environmentTexture = newBg;
    if (skybox.current) {
      skybox.current.dispose();
    }
    if (newBg) {
      skybox.current = scene.createDefaultSkybox(newBg);
    }
  }, [
    bg,
    previousBg,
    previousPreviewObject,
    sceneData,
    previewObject,
    scene,
    images,
  ]);

  useEffect(() => {
    if (!compileResult?.fragmentResult) {
      // log('Not yet creating a Babylon material as there is no fragmentResult');
      return;
    }
    const { graph } = compileResult;

    const pbrName = `component_pbr_${id()}`;
    log('🛠 Re-creating BPR material', {
      pbrName,
      scene,
      compileResult,
    });

    // TODO: Babylon doesn't have a RawShaderMaterial. This hard codes the
    // assumption there's a Physical material in the graph.
    const shaderMaterial = new BABYLON.PBRMaterial(pbrName, scene);
    const graphProperties: Record<string, any> = {};

    // Babylon has some internal uniforms like vAlbedoInfos that are only set
    // if a property is set on the object. If a shader is plugged in to an image
    // property, this code sets a placeholder image, to force Babylon to create
    // the internal uniforms, even though they aren't used on the property image
    const physicalFragmentNode = graph.nodes.find(
      (n) =>
        'stage' in n &&
        n.stage === 'fragment' &&
        n.type === EngineNodeType.physical
    );
    if (physicalFragmentNode) {
      physicalFragmentNode.inputs.forEach((input) => {
        const edge = graph.edges.find(
          ({ to, input: i }) => to === physicalFragmentNode.id && i === input.id
        );
        // @ts-ignore
        if (edge && !window.xxx) {
          if (input?.dataType === 'texture') {
            if (input.property === 'albedoTexture') {
              graphProperties.albedoTexture =
                images.brickNormal as BABYLON.Texture;
            }
            if (input.property === 'bumpTexture') {
              graphProperties.bumpTexture =
                images.brickNormal as BABYLON.Texture;
            }
          }
        }
      });
    }

    // Possible PBRMaterial defaults
    // Ensures irradiance is computed per fragment to make the bump visible
    // shaderMaterial.forceIrradianceInFragment = true;
    // shaderMaterial.bumpTexture = images.brickNormal as BABYLON.Texture;
    // shaderMaterial.albedoColor = new BABYLON.Color3(1.0, 1.0, 1.0);
    // shaderMaterial.metallic = 0.0;
    // Roughness of 0 makes the material black.
    // shaderMaterial.roughness = 1.0;

    const newProperties = {
      ...physicalDefaultProperties,
      ...graphProperties,
    };
    log('Component material properties', { newProperties });
    Object.assign(shaderMaterial, newProperties);

    // If you define a custom shader name, Babylon tries to look up that
    // shader's source code in the ShaderStore. If it's not present, Babylon
    // makes a network call to try to find the shader. Setting these values
    // makes Babylon not perform a network call. Ironically these values are
    // completely discarded because of processFinalCode.
    BABYLON.Effect.ShadersStore[pbrName + 'VertexShader'] =
      'Cant Be Empty Despite Being Unused';
    BABYLON.Effect.ShadersStore[pbrName + 'FragmentShader'] =
      'Cant Be Empty Despite Being Unused';

    // @ts-ignore
    if (window.xxx) {
      shaderMaterial.metallic = 1.0;
      shaderMaterial.roughness = 0.0;
    } else {
      shaderMaterial.customShaderNameResolve = (
        shaderName,
        uniforms,
        uniformBuffers,
        samplers,
        defines,
        attributes,
        options
      ) => {
        lastCompile.current.vertexResult = compileResult?.vertexResult;
        lastCompile.current.fragmentResult = compileResult?.fragmentResult;

        uniforms.push('time');

        if (compileResult?.dataInputs) {
          Object.entries(compileResult.dataInputs).forEach(
            ([nodeId, inputs]) => {
              const node = graph.nodes.find(({ id }) => id === nodeId);
              if (!node) {
                console.warn(
                  'While creating uniforms, no node was found from dataInputs',
                  { nodeId, dataInputs: compileResult.dataInputs, graph }
                );
                return;
              }
              inputs.forEach((input) => {
                const edge = graph.edges.find(
                  ({ to, input: i }) => to === nodeId && i === input.id
                );
                if (edge) {
                  const fromNode = graph.nodes.find(
                    ({ id }) => id === edge.from
                  );
                  // In the case where a node has been deleted from the graph,
                  // dataInputs won't have been udpated until a recompile completes
                  if (!fromNode) {
                    return;
                  }
                  if (input.type !== 'property') {
                    const name = mangleVar(
                      input.displayName,
                      babylengine,
                      node
                    );
                    uniforms.push(name);
                  }
                }
              });
            }
          );
        }
        log(`${pbrName} PBRMaterial customShaderNameResolve called...`, {
          defines,
          uniforms,
        });

        if (options) {
          options.processFinalCode = (type, _code) => {
            log(
              `${pbrName} scene processFinalCode called, setting ${type} shader source!`
            );
            // return _code;
            if (type === 'vertex') {
              if (!compileResult?.vertexResult) {
                console.error('No vertex result for Babylon shader!');
              }
              // log('Setting vertex source', {
              //   code,
              //   type,
              //   vert: compileResult?.vertexResult,
              // });
              return compileResult?.vertexResult;
            }
            // log('Setting fragment source', {
            //   code,
            //   type,
            //   frag: compileResult?.fragmentResult,
            // });
            // Babylo
            return compileResult?.fragmentResult.replace(
              'out vec4 glFragColor',
              ''
            );
          };
        } else {
          console.warn(
            'No options present to set processFinalCode on, cannot set shader source!'
          );
        }
        capture = [];
        checkForCompileErrors.current = true;
        return pbrName;
      };
    }
    if (sceneData.mesh) {
      sceneData.mesh.material = shaderMaterial;
    } else {
      console.warn('No mesh to assign the material to!');
    }
    // sceneRef.current.shadersUpdated = true;
  }, [scene, compileResult, images.brickNormal, sceneData.mesh]);

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
            {/* <option value="spot">Spot Lights</option> */}
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
            onChange={(event) => {
              setBg(event.target.value === 'none' ? null : event.target.value);
            }}
            value={bg ? bg : 'none'}
          >
            <option value="none">None</option>
            <option value="cityCourtYard">City Courtyard</option>
            {/* <option value="pondCubeMap">Pond Cube Map</option> */}
          </select>
        </div>
      </div>
      <div ref={sceneWrapper} className={styles.sceneContainer}>
        <div ref={babylonDomRef} className={styles.babylonContainer}></div>
      </div>
    </>
  );
};

export default BabylonComponent;
