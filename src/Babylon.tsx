import * as BABYLON from 'babylonjs';
import { useEffect, useRef } from 'react';

import { generate } from '@shaderfrog/glsl-parser';

import babf from './babylon-fragment';
import babv from './babylon-vertex';

import {
  outputNode,
  Graph,
  shaderSectionsToAst,
  Node,
  addNode,
  multiplyNode,
  ShaderType,
  Edge,
  ShaderStage,
} from './nodestuff';

import {
  compileGraph,
  computeAllContexts,
  computeGraphContext,
  EngineContext,
  NodeInputs,
} from './graph';
import { babylengine, physicalNode, RuntimeContext } from './bablyengine';

let counter = 0;
const id = () => '' + counter++;
const outputF = outputNode(id(), 'Output F', {}, 'fragment');
const outputV = outputNode(id(), 'Output V', {}, 'vertex', outputF.id);
const physicalF = physicalNode(id(), 'Putput F', {}, 'fragment');
const physicalV = physicalNode(id(), 'Physical V', {}, 'vertex', outputF.id);

const graph: Graph = {
  nodes: [outputF, outputV, physicalF, physicalV],
  edges: [
    {
      from: physicalV.id,
      to: outputV.id,
      output: 'out',
      input: 'position',
      stage: 'vertex',
    },
    {
      from: physicalF.id,
      to: outputF.id,
      output: 'out',
      input: 'color',
      stage: 'fragment',
    },
  ],
};

/*
BABYLON.Effect.ShadersStore['customVertexShader'] =
  babv ||
  `
precision highp float;
// Attributes
attribute vec3 position;
attribute vec2 uv;
// Uniforms
uniform mat4 worldViewProjection;
// varying
varying vec2 vUV;
void main(void) {
    gl_Position = worldViewProjection * vec4(position, 1.0);
    vUV = uv;
}
`;

BABYLON.Effect.ShadersStore['customFragmentShader'] =
  babf ||
  `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
void main(void) {
    gl_FragColor = texture2D(textureSampler, vUV);
}
`;
*/

let compiled: { vert: string; frag: string } = { vert: '', frag: '' };
let x = 0,
  sphere,
  shaderMaterial;
const Babylon = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }
    // Get the canvas DOM element
    const canvas = document.getElementById('renderCanvas');
    // Load the 3D engine
    const engine = new BABYLON.Engine(canvasRef.current, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    // CreateScene function that creates and return the scene
    const createScene = function () {
      // Create a basic BJS Scene object
      const scene = new BABYLON.Scene(engine);

      // Create a FreeCamera, and set its position to {x: 0, y: 5, z: -10}
      const camera = new BABYLON.FreeCamera(
        'camera1',
        new BABYLON.Vector3(0, 5, -10),
        scene
      );
      // Target the camera to scene origin
      camera.setTarget(BABYLON.Vector3.Zero());
      // Attach the camera to the canvas
      camera.attachControl(canvas, false);
      // Create a basic light, aiming 0, 1, 0 - meaning, to the sky
      const light = new BABYLON.HemisphericLight(
        'light1',
        new BABYLON.Vector3(0, 2, 0),
        scene
      );
      // Create a built-in "sphere" shape; its constructor takes 6 params: name, segment, diameter, scene, updatable, sideOrientation
      sphere = BABYLON.Mesh.CreateSphere(
        'sphere1',
        16,
        2,
        scene,
        false,
        BABYLON.Mesh.FRONTSIDE
      );
      // Move the sphere upward 1/2 of its height
      sphere.position.y = 1;

      const mainTexture = new BABYLON.Texture('/contrast-noise.png', scene);
      const brickTexture = new BABYLON.Texture('/brick-texture.jpeg', scene);
      // shaderMaterial.diffuseTexture = brickTexture;
      // shaderMaterial.normalTexture = brickTexture;

      var shaderMaterial = new BABYLON.PBRMaterial('pbr', scene);

      shaderMaterial.albedoTexture = brickTexture;
      shaderMaterial.albedoColor = new BABYLON.Color3(1.0, 0.766, 0.336);
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
        console.log({
          shaderName,
          uniforms,
          uniformBuffers,
          samplers,
          defines,
          attributes,
          options,
        });
        options.processFinalCode = (type, code) => {
          console.warn('Compiling!', graph, 'for nodes');
          if (!compiled.vert) {
            const ctx: EngineContext<RuntimeContext> = {
              runtime: {
                BABYLON,
                scene,
                camera,
                meshRef: null,
                material: shaderMaterial,
                // material: null,
                // I'm refactoring the hooks, is this an issue, where meshRef won't
                // be set? I put previewObject in the deps array to try to ensure this
                // hook is called when that's changed
                // meshRef: meshRef,
                // scene,
                // camera,
                // index: 0,
                cache: { nodes: {} },
              },
              nodes: {},
              debuggingNonsense: {},
            };

            // computeAllContexts(ctx, threngine, graph);

            const allStart = performance.now();

            const result = compileGraph(ctx, babylengine, graph);
            const fragmentResult = generate(
              shaderSectionsToAst(result.fragment).program
            );
            const vertexResult = generate(
              shaderSectionsToAst(result.vertex).program
            );

            const now = performance.now();
            console.log(`Compilation took:
    -------------------
    total: ${(now - allStart).toFixed(3)}ms
    -------------------
    `);

            compiled.vert = vertexResult;
            compiled.frag = fragmentResult;
          }
          if (type === 'vertex') {
            console.log('processFinalCode', {
              code,
              type,
              vert: compiled.vert,
            });
            return compiled.vert || babv;
          }
          console.log('processFinalCode', {
            code,
            type,
            frag: compiled.frag,
          });
          return compiled.frag || babf;
        };
        return shaderName;
      };

      // shaderMaterial.setBaseTexture('textureSampler', mainTexture);
      sphere.material = shaderMaterial;

      // Create a built-in "ground" shape; its constructor takes 6 params : name, width, height, subdivision, scene, updatable
      const ground = BABYLON.Mesh.CreateGround(
        'ground1',
        6,
        6,
        2,
        scene,
        false
      );
      // Return the created scene
      return scene;
    };
    // call the createScene function
    const scene = createScene();
    // run the render loop
    engine.runRenderLoop(function () {
      scene.render();
      if (x === 0 && canvasRef.current) {
        // console.log({ shaderMaterial, sphere, engine });
        x = 1;
        const gl = canvasRef.current.getContext('webgl2');
        console.log({ gl, scene });

        // renderer.properties
        // .get(mesh.material)
        // .programs.values()
        // .next().value;
      }
    });
    // the canvas/window resize event handler
    window.addEventListener('resize', function () {
      engine.resize();
    });
  }, []);
  return (
    <div>
      <canvas
        style={{
          width: 800,
          height: 800,
        }}
        ref={canvasRef}
      ></canvas>
    </div>
  );
};

export default Babylon;
