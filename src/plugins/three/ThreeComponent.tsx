import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as three from 'three';
import { evaluateNode, Graph, mangleVar } from '../../core/graph';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import { EngineContext } from '../../core/engine';

import styles from '../../pages/editor/editor.module.css';

import { threngine, ThreeRuntime } from './threngine';

import { useThree } from './useThree';
import { usePrevious } from '../../site/hooks/usePrevious';
import { UICompileGraphResult } from '../../site/uICompileGraphResult';
import { PreviewLight } from '../../site/components/Editor';
import { ensure } from '../../util/ensure';
import { Edge } from '../../core/nodes/edge';
import { Color, Material, UniformsLib, Vector3 } from 'three';
import { TextureNode } from '../../core/nodes/data-nodes';
import { useSize } from '../../site/hooks/useSize';

const loadingMaterial = new three.MeshBasicMaterial({ color: 'pink' });

function mapTextureMapping(texture: three.Texture, mapping: any) {
  if (mapping === three.EquirectangularReflectionMapping) {
    texture.mapping = three.CubeReflectionMapping;
  } else if (mapping === three.EquirectangularRefractionMapping) {
    texture.mapping = three.CubeRefractionMapping;
  }
  return texture;
}

type AnyFn = (...args: any) => any;
type ThreeSceneProps = {
  compile: AnyFn;
  compileResult: UICompileGraphResult | undefined;
  graph: Graph;
  lights: PreviewLight;
  previewObject: string;
  bg: string | undefined;
  setCtx: (ctx: EngineContext) => void;
  initialCtx: any;
  setGlResult: AnyFn;
  setLights: AnyFn;
  setPreviewObject: AnyFn;
  setBg: AnyFn;
  width: number;
  height: number;
};

const repeat = (t: three.Texture, x: number, y: number) => {
  t.repeat = new three.Vector2(x, y);
  t.wrapS = t.wrapT = three.RepeatWrapping;
  return t;
};

const ThreeComponent: React.FC<ThreeSceneProps> = ({
  compile,
  compileResult,
  graph,
  lights,
  previewObject,
  setCtx,
  initialCtx,
  setGlResult,
  setLights,
  setPreviewObject,
  bg,
  setBg,
  width,
  height,
}) => {
  const shadersUpdated = useRef<boolean>(false);
  const sceneWrapper = useRef<HTMLDivElement>(null);
  const size = useSize(sceneWrapper);

  const images = useMemo<Record<string, any>>(
    () => ({
      explosion: new three.TextureLoader().load('/explosion.png'),
      'grayscale-noise': new three.TextureLoader().load('/grayscale-noise.png'),
      brick: repeat(new three.TextureLoader().load('/bricks.jpeg'), 3, 3),
      brickNormal: repeat(
        new three.TextureLoader().load('/bricknormal.jpeg'),
        3,
        3
      ),
    }),
    []
  );

  const { sceneData, scene, camera, threeDomElement, threeDomCbRef, renderer } =
    useThree((time) => {
      const { mesh } = sceneData;
      if (!mesh) {
        return;
      }

      if (shadersUpdated.current) {
        const gl = renderer.getContext();

        const { fragmentShader, vertexShader, program } = renderer.properties
          .get(mesh.material)
          .programs.values()
          .next().value;

        const compiled = gl.getProgramParameter(program, gl.LINK_STATUS);
        if (!compiled) {
          const log = gl.getProgramInfoLog(program)?.trim();

          setGlResult({
            fragError: gl.getShaderInfoLog(fragmentShader)?.trim() || log,
            vertError: gl.getShaderInfoLog(vertexShader)?.trim() || log,
            programError: log,
          });
        } else {
          setGlResult({
            fragError: null,
            vertError: null,
            programError: null,
          });
        }

        shadersUpdated.current = false;
      }

      if (sceneData.lights.length === 2) {
        const light = sceneData.lights[0];
        light.position.x = 1.2 * Math.sin(time * 0.001);
        light.position.y = 1.2 * Math.cos(time * 0.001);
      } else if (sceneData.lights.length === 4) {
        const light = sceneData.lights[0];
        light.position.x = 1.2 * Math.sin(time * 0.001);
        light.position.y = 1.2 * Math.cos(time * 0.001);
        light.lookAt(new three.Vector3(0, 0, 0));

        const light1 = sceneData.lights[1];
        light1.position.x = 1.3 * Math.cos(time * 0.0015);
        light1.position.y = 1.3 * Math.sin(time * 0.0015);

        light1.lookAt(new three.Vector3(0, 0, 0));
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
              // When a shader is plugged into the Texture node of a megashader,
              // this happens, I'm not sure why yet. In fact, why is this branch
              // getting called at all in useThree() ?
              try {
                value = evaluateNode(graph, fromNode);
              } catch (err) {
                console.warn('Tried to evaluate a non-data node!', {
                  err,
                  dataInputs: compileResult.dataInputs,
                });
                return;
              }
              let newValue = value;
              if (fromNode.type === 'texture') {
                // THIS DUPLICATES OTHER LINE
                newValue = images[(fromNode as TextureNode).value];
              }

              if (input.type === 'property') {
                // @ts-ignore
                mesh.material[input.property] = newValue;
              } else {
                // TODO: This doesn't work for engine variables because
                // those aren't suffixed
                const name = mangleVar(input.displayName, threngine, node);

                // @ts-ignore
                if (name in mesh.material.uniforms) {
                  // @ts-ignore
                  mesh.material.uniforms[name].value = newValue;
                } else {
                  console.warn('Unknown uniform', name);
                }
              }
            }
          });
        });
      }

      // @ts-ignore
      if (mesh.material?.uniforms?.time && !Array.isArray(mesh.material)) {
        // @ts-ignore
        mesh.material.uniforms.time.value = time * 0.001;
      }
    });

  const previousPreviewObject = usePrevious(previewObject);
  useEffect(() => {
    if (previousPreviewObject === previewObject) {
      return;
    }
    if (sceneData.mesh) {
      scene.remove(sceneData.mesh);
    }

    let mesh;
    if (previewObject === 'torusknot') {
      const geometry = new three.TorusKnotGeometry(0.6, 0.25, 200, 32);

      mesh = new three.Mesh(geometry);
    } else if (previewObject === 'sphere') {
      const geometry = new three.SphereBufferGeometry(1, 64, 64);
      mesh = new three.Mesh(geometry);
    } else if (previewObject === 'icosahedron') {
      const geometry = new three.IcosahedronGeometry(1, 0);
      mesh = new three.Mesh(geometry);
    } else {
      throw new Error(`Wtf there is no preview object named ${previewObject}`);
    }
    if (sceneData.mesh) {
      mesh.material = sceneData.mesh.material;
    }
    sceneData.mesh = mesh;
    scene.add(mesh);
  }, [previousPreviewObject, sceneData, previewObject, scene]);

  const previousBg = usePrevious(bg);
  useEffect(() => {
    if (bg === previousBg) {
      return;
    }
    if (bg) {
      const pmremGenerator = new three.PMREMGenerator(renderer);
      pmremGenerator.compileEquirectangularShader();

      // yolo https://stackoverflow.com/a/65817213/743464
      new RGBELoader().load('envmaps/empty_warehouse_01_2k.hdr', (texture) => {
        const envMap = pmremGenerator.fromEquirectangular(texture).texture;

        scene.background = envMap;
        scene.environment = envMap;

        texture.dispose();
        pmremGenerator.dispose();
      });
    } else {
      scene.environment = null;
      scene.background = null;
    }

    // if (sceneData.bg) {
    //   scene.remove(sceneData.bg);
    // }

    // const geometry = new three.PlaneGeometry(2, 2);
    // const material = new three.MeshBasicMaterial({
    //   color: 0xffff00,
    //   side: three.DoubleSide,
    // });
    // const mesh = new three.Mesh(geometry);
    // mesh.material = material;
    // sceneData.bg = mesh;
    // scene.add(mesh);
  }, [
    bg,
    previousBg,
    renderer,
    previousPreviewObject,
    sceneData,
    previewObject,
    scene,
  ]);

  const threeTone = useMemo(() => {
    console.log('loading 3tone image');
    const image = new three.TextureLoader().load('/3tone.jpg');
    image.minFilter = three.NearestFilter;
    image.magFilter = three.NearestFilter;
  }, []);

  const [ctx] = useState<EngineContext>(
    // EXPERIMENTAL! Added context from hoisted ref as initializer to avoid
    // re-creating context including cache and envmaptexture. Remove this
    // comment if there are no future issues switching between threejs source
    // code tab and the scene
    initialCtx || {
      engine: 'three',
      compileCount: 0,
      // TODO: Rename runtime to "engine" and make a new nodes and data top level
      // key cache (if we keep the material cache) and type it in the graph
      runtime: {
        three,
        renderer,
        sceneData,
        scene,
        camera,
        envMapTexture: null,
        index: 0,
        threeTone,
        cache: { data: {}, nodes: {} },
      },
      nodes: {},
      debuggingNonsense: {},
    }
  );

  useEffect(() => {
    if (!ctx.runtime.envMapTexture) {
      console.log('loading envmap texture');
      new RGBELoader().load(
        'envmaps/empty_warehouse_01_2k.hdr',
        (textureCb) => {
          const pmremGenerator = new three.PMREMGenerator(renderer);
          const renderTarget = pmremGenerator.fromCubemap(textureCb as any);
          const { texture } = renderTarget;

          ctx.runtime.envMapTexture = texture;

          // Inform parent our context is created
          setCtx(ctx);
        }
      );
    }
  }, [ctx, setCtx, renderer]);

  useEffect(() => {
    if (!compileResult?.fragmentResult) {
      return;
    }
    const { graph } = compileResult;
    const {
      threeTone,
      sceneData: { mesh },
      envMapTexture,
      engineMaterial,
    } = ctx.runtime as ThreeRuntime;
    console.log('oh hai birfday boi boi boiiiii');

    const os1: any = graph.nodes.find((node) => node.name === 'Outline')?.id;
    const fs1: any = graph.nodes.find((node) => node.name === 'Fireball')?.id;
    const fc: any = graph.nodes.find(
      (node) => node.name === 'Fluid Circles'
    )?.id;
    const edgeId: any = graph.nodes.find(
      (node) => node.name === 'Triplanar'
    )?.id;
    const hs1: any = graph.nodes.find(
      (node) => node.name === 'Fake Heatmap'
    )?.id;

    // const envMap = new RGBELoader().load(
    //   '/envmaps/empty_warehouse_01_2k.hdr',
    //   (textureCb) => {
    //     textureCb.mapping = three.CubeUVReflectionMapping;

    //     const pmremGenerator = new three.PMREMGenerator(renderer);
    //     // const isEquirectMap =
    //     //   textureCb.mapping === three.EquirectangularReflectionMapping ||
    //     //   textureCb.mapping === three.EquirectangularRefractionMapping;
    //     // const renderTarget = isEquirectMap
    //     //   ? pmremGenerator.fromEquirectangular(textureCb)
    //     //   : pmremGenerator.fromCubemap(textureCb as any);
    //     const renderTarget = pmremGenerator.fromCubemap(textureCb as any);
    //     const { texture } = renderTarget;

    //     console.log('loaded envmap', { envMap, texture, textureCb });
    //     newMat.uniforms.blenvMap.value = texture;
    //     // todo try putting defines in shader too?
    //     // newMat.uniforms.envMap.value = texture;
    //     newMat.needsUpdate = true;
    //   }
    // );
    // scene.background = envMap;
    // console.log('created envmap', { envMap });

    // Note this is setting the uniforms of the shader at creation time. The
    // uniforms are also updated every frame in the useThree() loop
    const { uniforms, properties } = Object.entries(
      compileResult.dataInputs || {}
    ).reduce<{
      uniforms: Record<string, { value: any }>;
      properties: Record<string, any>;
    }>(
      ({ uniforms, properties }, [nodeId, inputs]) => {
        const node = ensure(graph.nodes.find(({ id }) => id === nodeId));
        const updatedUniforms: typeof uniforms = {};
        const updatedProperties: typeof properties = {};

        inputs.forEach((input) => {
          const edge = graph.edges.find(
            ({ to, input: i }) => to === nodeId && i === input.id
          );
          if (edge) {
            const fromNode = ensure(
              graph.nodes.find(({ id }) => id === edge.from)
            );
            const value = evaluateNode(graph, fromNode);
            let newValue = value;
            if (fromNode.type === 'texture') {
              // THIS DUPLICATES OTHER LINE
              newValue = images[(fromNode as TextureNode).value];
            }
            console.log('value, evalauted', {
              fromNode,
              input,
              value,
              newValue,
            });
            // TODO: This doesn't work for engine variables because
            // those aren't suffixed
            const name = mangleVar(input.displayName, threngine, node);

            if (input.property) {
              updatedProperties[name] = newValue;
            } else {
              updatedUniforms[name] = { value: newValue };
            }
          }
        });
        return {
          uniforms: { ...uniforms, ...updatedUniforms },
          properties: { ...properties, ...updatedProperties },
        };
      },
      {
        uniforms: {},
        properties: {},
      }
    );

    const finalUniforms = {
      // TODO: Get these from threngine
      ...three.ShaderLib.phong.uniforms,
      ...three.ShaderLib.toon.uniforms,
      ...three.ShaderLib.physical.uniforms,

      time: { value: 0 },

      [`scale_${hs1}`]: { value: 1.2 },
      [`power_${hs1}`]: { value: 1 },

      [`speed_${fc}`]: { value: 1 },
      [`baseRadius_${fc}`]: { value: 1 },
      [`colorVariation_${fc}`]: { value: 0.6 },
      [`brightnessVariation_${fc}`]: { value: 0 },
      [`variation_${fc}`]: { value: 8 },
      [`backgroundColor_${fc}`]: { value: new three.Vector3(0.0, 0.0, 0.5) },

      [`tExplosion_${fs1}`]: {
        value: new three.TextureLoader().load('/explosion.png'),
      },
      [`fireSpeed_${fs1}`]: { value: 0.6 },
      [`pulseHeight_${fs1}`]: { value: 0.1 },
      [`displacementHeight_${fs1}`]: { value: 0.6 },
      [`turbulenceDetail_${fs1}`]: { value: 0.8 },
      [`brightness`]: { value: 0.8 },

      [`cel0_${edgeId}`]: { value: 1.0 },
      [`cel1_${edgeId}`]: { value: 1.0 },
      [`cel2_${edgeId}`]: { value: 1.0 },
      [`cel3_${edgeId}`]: { value: 1.0 },
      [`cel4_${edgeId}`]: { value: 1.0 },
      [`celFade_${edgeId}`]: { value: 1.0 },
      [`edgeSteepness_${edgeId}`]: { value: 0.1 },
      [`edgeBorder_${edgeId}`]: { value: 0.1 },
      [`color_${edgeId}`]: { value: 1.0 },

      [`color_${os1}`]: { value: new three.Vector3(1, 1, 1) },
      [`start_${os1}`]: { value: 0 },
      [`end_${os1}`]: { value: 1 },
      [`alpha_${os1}`]: { value: 1 },

      ...uniforms,
      envMap: {
        value: envMapTexture,
      },
    };

    const initialProperties = {
      name: 'ShaderFrog Material',
      lights: true,
      uniforms: {
        ...finalUniforms,
      },
      transparent: true,
      opacity: 1.0,
      vertexShader: compileResult?.vertexResult,
      fragmentShader: compileResult?.fragmentResult,
    };

    const additionalProperties = Object.entries({
      ...engineMaterial,
      ...properties,
    })
      .filter(
        ([property]) =>
          // Ignore three material "hidden" properties
          property.charAt(0) !== '_' &&
          // Ignore uuid since it should probably be unique?
          property !== 'uuid' &&
          // I'm not sure what three does with type under the hood, ignore it
          property !== 'type' &&
          // "precision" adds a precision preprocessor line
          property !== 'precision' &&
          // Ignore existing properties
          !(property in initialProperties) &&
          // Ignore STANDARD and PHYSICAL defines to the top of the shader in
          // WebGLProgram
          // https://github.com/mrdoob/three.js/blob/e7042de7c1a2c70e38654a04b6fd97d9c978e781/src/renderers/webgl/WebGLProgram.js#L392
          // which occurs if we set isMeshPhysicalMaterial/isMeshStandardMaterial
          property !== 'defines'
      )
      .reduce((acc, [key, value]) => ({
        ...acc,
        [key]: value,
      }));

    const newMat = new three.RawShaderMaterial(initialProperties);

    // This prevents a deluge of warnings from three on the constructor saying
    // that each of these properties is not a property of the material
    Object.entries(additionalProperties).forEach(([key, value]) => {
      // @ts-ignore
      newMat[key] = value;
    });

    console.log('🏞 Re-creating three.js material!', {
      newMat,
      uniforms,
      properties,
      finalUniforms,
      engineMaterial: ctx.runtime.engineMaterial,
    });

    mesh.material = newMat;
    shadersUpdated.current = true;
  }, [compileResult, ctx.runtime, images]);

  const prevLights = usePrevious(lights);
  useEffect(() => {
    if (
      // If the lights are unchanged
      prevLights === lights ||
      // Or if there were no previous lights, but we already have them in the
      // persisted sceneData, we already have three data in memory
      (prevLights === undefined && sceneData.lights.length)
    ) {
      return;
    }
    sceneData.lights.forEach((light) => {
      scene.remove(light);
    });

    if (lights === 'point') {
      const pointLight = new three.PointLight(0xffffff, 1);
      pointLight.position.set(0, 0, 2);
      scene.add(pointLight);

      const helper = new three.PointLightHelper(pointLight, 0.1);
      scene.add(helper);
      sceneData.lights = [pointLight, helper];
    } else if (lights === '3point') {
      const light1 = new three.PointLight(0xffffff, 1, 0);
      light1.position.set(2, 2, 5);
      scene.add(light1);
      const helper1 = new three.PointLightHelper(light1, 0.1);
      scene.add(helper1);

      const light2 = new three.PointLight(0xffffff, 1, 0);
      light2.position.set(-2, 5, -5);
      scene.add(light2);
      const helper2 = new three.PointLightHelper(light2, 0.1);
      scene.add(helper2);

      const light3 = new three.PointLight(0xffffff, 1, 0);
      light3.position.set(5, -5, -5);
      scene.add(light3);
      const helper3 = new three.PointLightHelper(light3, 0.1);
      scene.add(helper3);

      sceneData.lights = [light1, helper1, light2, helper2, light3, helper3];
    } else if (lights === 'spot') {
      const light = new three.SpotLight(0x00ff00, 1, 3, 0.4, 1);
      light.position.set(0, 0, 2);
      scene.add(light);

      const helper = new three.SpotLightHelper(
        light,
        new three.Color(0x00ff00)
      );
      scene.add(helper);

      const light2 = new three.SpotLight(0xff0000, 1, 4, 0.4, 1);
      light2.position.set(0, 0, 2);
      scene.add(light2);

      const helper2 = new three.SpotLightHelper(
        light2,
        new three.Color(0xff0000)
      );
      scene.add(helper2);

      sceneData.lights = [light, light2, helper, helper2];
    }

    if (sceneData.mesh) {
      sceneData.mesh.material = loadingMaterial;
    }

    if (prevLights) {
      compile(ctx);
    }
  }, [sceneData, lights, scene, compile, ctx, prevLights]);

  useEffect(() => {
    if (ctx.runtime?.camera && size) {
      const { camera, renderer } = ctx.runtime;

      const canvasWidth = size.width;
      const canvasHeight = size.height;
      camera.aspect = canvasWidth / canvasHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(canvasWidth, canvasHeight);
    }
  }, [size, ctx.runtime]);

  return (
    <div>
      <div className={styles.paneContainer}>
        <div className={styles.sceneControls}>
          <div className={styles.control}>
            <div className={styles.body}>
              <label>
                <span>Lighting</span>
              </label>
              <select
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
          </div>
          <div className={styles.control}>
            <div className={styles.body}>
              <label>
                <span>Model</span>
              </label>
              <select
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
          </div>
          <div className={styles.control}>
            <div className={styles.body}>
              <label>
                <span>Background</span>
              </label>
              <select
                onChange={(event) => {
                  setBg(
                    event.target.value === 'none' ? null : event.target.value
                  );
                }}
                value={bg ? bg : 'none'}
              >
                <option value="none">None</option>
                <option value="warehouse">Warehouse</option>
              </select>
            </div>
          </div>
        </div>
        <div ref={sceneWrapper} className={styles.sceneContainer}>
          <div ref={threeDomCbRef}></div>
        </div>
      </div>
    </div>
  );
};

export default ThreeComponent;
