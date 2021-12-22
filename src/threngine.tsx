import { parser } from '@shaderfrog/glsl-parser';
import {
  renameBindings,
  renameFunctions,
} from '@shaderfrog/glsl-parser/dist/parser/utils';
import { visit, AstNode, NodeVisitors } from '@shaderfrog/glsl-parser/dist/ast';
import preprocess from '@shaderfrog/glsl-parser/dist/preprocessor';
import { Engine, nodeName, EngineContext } from './graph';

import {
  ShaderType,
  Node,
  convert300MainToReturn,
  makeExpression,
  from2To3,
  Edge,
} from './nodestuff';

export type RuntimeContext = {
  scene: any;
  camera: any;
  renderer: any;
  mesh: any;
  three: any;
  material: any;
  lGraph: any;
  index: number;
  threeTone: any;
  cache: {
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

export const phongNode = (id: string, name: string, options: Object): Node => {
  return {
    id,
    name,
    type: ShaderType.phong,
    options,
    inputs: [],
    vertexSource: '',
    fragmentSource: '',
  };
};

export const toonNode = (id: string, name: string, options: Object): Node => {
  return {
    id,
    name,
    type: ShaderType.toon,
    options,
    inputs: [],
    vertexSource: '',
    fragmentSource: '',
  };
};

export const threngine: Engine<RuntimeContext> = {
  preserve: new Set<string>([
    'viewMatrix',
    'modelMatrix',
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
    'time',
    // Uniforms for lighting
    'receiveShadow',
    'ambientLightColor',
    'lightProbe',
    // Light uniform arrays
    'spotLights',
    'pointLights',
    // This isn't three wtf
    'speed',
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
  ]),
  parsers: {
    [ShaderType.phong]: {
      onBeforeCompile: (engineContext, node) => {
        console.log('onbeforecompile [ShaderType.phong]: {');
        if (engineContext.runtime.cache.nodes[node.id]) {
          return;
        }
        const { renderer, mesh, scene, camera, material, threeTone, three } =
          engineContext.runtime;

        mesh.material = new three.MeshPhongMaterial({
          color: 0x00ff00,
          map: new three.Texture(),
        });
        renderer.compile(scene, camera);

        // The referecnes to the compiled shaders in WebGL
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

        engineContext.runtime.cache.nodes[node.id] = {
          fragmentRef,
          vertexRef,
          fragment,
          vertex,
        };
      },
      fragment: {
        produceAst: (
          // todo: help
          engineContext,
          engine: any,
          node,
          inputEdges
        ): AstNode => {
          const { fragment } = engineContext.runtime.cache.nodes[node.id];

          // console.log('Before preprocessing:', fragmentSource);
          const fragmentPreprocessed = preprocess(fragment, {
            preserve: {
              version: () => true,
            },
          });
          // console.log('after', fragmentPreprocessed);
          const fragmentAst = parser.parse(fragmentPreprocessed);

          // Used for the UI only right now
          engineContext.debuggingNonsense.fragmentPreprocessed =
            fragmentPreprocessed;
          engineContext.debuggingNonsense.fragmentSource = fragment;

          // Do I need this? Is threejs shader already in 3.00 mode?
          // from2To3(fragmentAst);

          convert300MainToReturn(fragmentAst);
          renameBindings(fragmentAst.scopes[0], threngine.preserve, node.id);
          renameFunctions(fragmentAst.scopes[0], node.id, {
            main: nodeName(node),
          });
          return fragmentAst;
        },
        findInputs: (engineContext, node: Node, ast: AstNode) => {
          // console.log(util.inspect(ast.program, false, null, true));

          let texture2Dcalls: [AstNode, string][] = [];
          const visitors: NodeVisitors = {
            function_call: {
              enter: (path) => {
                if (
                  // TODO: 100 vs 300
                  (path.node.identifier?.specifier?.identifier ===
                    'texture2D' ||
                    path.node.identifier?.specifier?.identifier ===
                      'texture') &&
                  path.key
                ) {
                  if (!path.parent) {
                    throw new Error(
                      'This is impossible a function call always has a parent'
                    );
                  }
                  texture2Dcalls.push([path.parent, path.key]);
                }
              },
            },
          };
          visit(ast, visitors);
          const inputs = texture2Dcalls.reduce(
            (inputs, [parent, key], index) => ({
              ...inputs,
              [`texture2d_${index}`]: (fillerAst: AstNode) => {
                parent[key] = fillerAst;
              },
            }),
            {}
          );

          return inputs;
        },
        produceFiller: (node: Node, ast: AstNode): AstNode => {
          return makeExpression(`${nodeName(node)}()`);
        },
      },
      vertex: {
        produceAst: (
          // todo: help
          engineContext,
          engine: any,
          node,
          inputEdges
        ): AstNode => {
          const { vertex } = engineContext.runtime.cache.nodes[node.id];
          // const { renderer, mesh, scene, camera, material, threeTone, three } =
          //   engineContext.runtime;
          // mesh.material = new three.MeshPhongMaterial({
          //   color: 0x00ff00,
          //   map: new three.Texture(),
          // });
          // renderer.compile(scene, camera);

          // engineContext.nodes[node.id] = {
          //   fragment: renderer.properties
          //     .get(mesh.material)
          //     .programs.values()
          //     .next().value.fragmentShader,
          //   vertex: renderer.properties
          //     .get(mesh.material)
          //     .programs.values()
          //     .next().value.vertexShader,
          // };

          // const gl = renderer.getContext();
          // const fragmentProgram = engineContext.nodes[node.id].fragment;
          // const fragmentSource = gl.getShaderSource(fragmentProgram);

          // console.log('Before preprocessing:', fragmentSource);
          const fragmentPreprocessed = preprocess(vertex, {
            preserve: {
              version: () => true,
            },
          });
          // console.log('after', fragmentPreprocessed);
          const fragmentAst = parser.parse(fragmentPreprocessed);

          // Used for the UI only right now
          // engineContext.fragmentPreprocessed = fragmentPreprocessed;
          // engineContext.fragmentSource = fragmentSource;

          // Do I need this? Is threejs shader already in 3.00 mode?
          // from2To3(fragmentAst);

          convert300MainToReturn(fragmentAst);
          renameBindings(fragmentAst.scopes[0], threngine.preserve, node.id);
          renameFunctions(fragmentAst.scopes[0], node.id, {
            main: nodeName(node),
          });
          return fragmentAst;
        },
        findInputs: (engineContext, node: Node, ast: AstNode) => {
          // console.log(util.inspect(ast.program, false, null, true));

          let texture2Dcalls: [AstNode, string][] = [];
          const visitors: NodeVisitors = {
            function_call: {
              enter: (path) => {
                if (
                  // TODO: 100 vs 300
                  (path.node.identifier?.specifier?.identifier ===
                    'texture2D' ||
                    path.node.identifier?.specifier?.identifier ===
                      'texture') &&
                  path.key
                ) {
                  if (!path.parent) {
                    throw new Error(
                      'This is impossible a function call always has a parent'
                    );
                  }
                  texture2Dcalls.push([path.parent, path.key]);
                }
              },
            },
          };
          visit(ast, visitors);
          const inputs = texture2Dcalls.reduce(
            (inputs, [parent, key], index) => ({
              ...inputs,
              [`texture2d_${index}`]: (fillerAst: AstNode) => {
                parent[key] = fillerAst;
              },
            }),
            {}
          );

          return inputs;
        },
        produceFiller: (node: Node, ast: AstNode): AstNode => {
          return makeExpression(`${nodeName(node)}()`);
        },
      },
    },
    [ShaderType.toon]: {
      onBeforeCompile: (engineContext, node) => {
        console.log('onbeforecompile [ShaderType.toon]: {');
        if (engineContext.runtime.cache.nodes[node.id]) {
          return;
        }
        const { renderer, mesh, scene, camera, material, threeTone, three } =
          engineContext.runtime;

        mesh.material = new three.MeshToonMaterial({
          color: 0x00ff00,
          map: new three.Texture(),
          gradientMap: threeTone,
        });
        renderer.compile(scene, camera);

        // The referecnes to the compiled shaders in WebGL
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

        engineContext.runtime.cache.nodes[node.id] = {
          fragmentRef,
          vertexRef,
          fragment,
          vertex,
        };
      },
      fragment: {
        produceAst: (
          // todo: help
          engineContext,
          engine,
          node: Node,
          inputEdges: Edge[]
        ): AstNode => {
          const { fragment } = engineContext.runtime.cache.nodes[node.id];
          // console.log('Before preprocessing:', fragmentSource);
          const fragmentPreprocessed = preprocess(fragment, {
            preserve: {
              version: () => true,
            },
          });
          // console.log('after', fragmentPreprocessed);
          const fragmentAst = parser.parse(fragmentPreprocessed);

          // Used for the UI only right now
          engineContext.debuggingNonsense.fragmentPreprocessed =
            fragmentPreprocessed;
          engineContext.debuggingNonsense.fragmentSource = fragment;

          // Do I need this? Is threejs shader already in 3.00 mode?
          // from2To3(fragmentAst);

          convert300MainToReturn(fragmentAst);
          renameBindings(fragmentAst.scopes[0], threngine.preserve, node.id);
          renameFunctions(fragmentAst.scopes[0], node.id, {
            main: nodeName(node),
          });
          return fragmentAst;
        },
        findInputs: (engineContext, node: Node, ast: AstNode) => {
          // console.log(util.inspect(ast.program, false, null, true));

          let texture2Dcalls: [AstNode, string][] = [];
          const visitors: NodeVisitors = {
            function_call: {
              enter: (path) => {
                if (
                  // TODO: 100 vs 300
                  (path.node.identifier?.specifier?.identifier ===
                    'texture2D' ||
                    path.node.identifier?.specifier?.identifier ===
                      'texture') &&
                  path.key
                ) {
                  if (!path.parent) {
                    throw new Error(
                      'This is impossible a function call always has a parent'
                    );
                  }
                  texture2Dcalls.push([path.parent, path.key]);
                }
              },
            },
          };
          visit(ast, visitors);
          const inputs = texture2Dcalls.reduce(
            (inputs, [parent, key], index) => ({
              ...inputs,
              [`texture2d_${index}`]: (fillerAst: AstNode) => {
                parent[key] = fillerAst;
              },
            }),
            {}
          );

          return inputs;
        },
        produceFiller: (node: Node, ast: AstNode): AstNode => {
          return makeExpression(`${nodeName(node)}()`);
        },
      },
      vertex: {
        produceAst: (
          // todo: help
          engineContext,
          engine: any,
          node: Node,
          inputEdges: Edge[]
        ): AstNode => {
          const { vertex } = engineContext.runtime.cache.nodes[node.id];

          // console.log('Before preprocessing:', fragmentSource);
          const fragmentPreprocessed = preprocess(vertex, {
            preserve: {
              version: () => true,
            },
          });
          // console.log('after', fragmentPreprocessed);
          const fragmentAst = parser.parse(fragmentPreprocessed);

          // Do I need this? Is threejs shader already in 3.00 mode?
          // from2To3(fragmentAst);

          convert300MainToReturn(fragmentAst);
          renameBindings(fragmentAst.scopes[0], threngine.preserve, node.id);
          renameFunctions(fragmentAst.scopes[0], node.id, {
            main: nodeName(node),
          });
          return fragmentAst;
        },
        findInputs: (engineContext, node: Node, ast: AstNode) => {
          // console.log(util.inspect(ast.program, false, null, true));

          let texture2Dcalls: [AstNode, string][] = [];
          const visitors: NodeVisitors = {
            function_call: {
              enter: (path) => {
                if (
                  // TODO: 100 vs 300
                  (path.node.identifier?.specifier?.identifier ===
                    'texture2D' ||
                    path.node.identifier?.specifier?.identifier ===
                      'texture') &&
                  path.key
                ) {
                  if (!path.parent) {
                    throw new Error(
                      'This is impossible a function call always has a parent'
                    );
                  }
                  texture2Dcalls.push([path.parent, path.key]);
                }
              },
            },
          };
          visit(ast, visitors);
          const inputs = texture2Dcalls.reduce(
            (inputs, [parent, key], index) => ({
              ...inputs,
              [`texture2d_${index}`]: (fillerAst: AstNode) => {
                parent[key] = fillerAst;
              },
            }),
            {}
          );

          return inputs;
        },
        produceFiller: (node: Node, ast: AstNode): AstNode => {
          return makeExpression(`${nodeName(node)}()`);
        },
      },
    },
  },
};
