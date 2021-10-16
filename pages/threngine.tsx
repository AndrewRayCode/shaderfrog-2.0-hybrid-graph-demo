import { parser } from '@shaderfrog/glsl-parser';
import {
  renameBindings,
  renameFunctions,
} from '@shaderfrog/glsl-parser/dist/parser/utils';
import { visit, AstNode, NodeVisitors } from '@shaderfrog/glsl-parser/dist/ast';
import preprocess from '@shaderfrog/glsl-parser/dist/preprocessor';
import { Engine, nodeName } from './graph';

import {
  ShaderType,
  Node,
  convert300MainToReturn,
  makeExpression,
  from2To3,
  Edge,
} from './nodestuff';

type EngineContext = {
  scene: object;
  camera: object;
  renderer: object;
  mesh: object;
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

export const threngine: Engine = {
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
    'receiveShadow',
    'ambientLightColor',
    'lightProbe',
    'pointLights',
    'time',
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
      produceAst: (
        // todo: help
        engineContext: any,
        engine: any,
        node: Node,
        inputEdges: Edge[]
      ): AstNode => {
        const { renderer, mesh, scene, camera, material, threeTone, three } =
          engineContext;
        mesh.material = new three.MeshPhongMaterial({
          color: 0x00ff00,
          map: new three.Texture(),
          // gradientMap: threeTone,
        });
        renderer.compile(scene, camera);

        engineContext.nodes[node.id] = {
          fragment: renderer.properties
            .get(mesh.material)
            .programs.values()
            .next().value.fragmentShader,
          vertex: renderer.properties
            .get(mesh.material)
            .programs.values()
            .next().value.vertexShader,
        };

        const gl = renderer.getContext();
        const fragmentProgram = engineContext.nodes[node.id].fragment;
        const fragmentSource = gl.getShaderSource(fragmentProgram);

        // console.log('Before preprocessing:', fragmentSource);
        const fragmentPreprocessed = preprocess(fragmentSource, {
          preserve: {
            version: () => true,
          },
        });
        // console.log('after', fragmentPreprocessed);
        const fragmentAst = parser.parse(fragmentPreprocessed);

        // Used for the UI only right now
        engineContext.fragmentPreprocessed = fragmentPreprocessed;
        engineContext.fragmentSource = fragmentSource;

        // Do I need this? Is threejs shader already in 3.00 mode?
        // from2To3(fragmentAst);

        convert300MainToReturn(fragmentAst);
        renameBindings(fragmentAst.scopes[0], engine.preserve, node.id);
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
                (path.node.identifier?.specifier?.identifier === 'texture2D' ||
                  path.node.identifier?.specifier?.identifier === 'texture') &&
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
              console.log('FILLING...', fillerAst);
              parent[key] = fillerAst;
            },
          }),
          {}
        );
        console.log('inputs', inputs);
        return inputs;
      },
      produceFiller: (node: Node, ast: AstNode): AstNode => {
        return makeExpression(`${nodeName(node)}()`);
      },
    },
    [ShaderType.toon]: {
      produceAst: (
        // todo: help
        engineContext: any,
        engine: any,
        node: Node,
        inputEdges: Edge[]
      ): AstNode => {
        const { renderer, mesh, scene, camera, material, threeTone, three } =
          engineContext;
        mesh.material = new three.MeshToonMaterial({
          color: 0x00ff00,
          map: new three.Texture(),
          gradientMap: threeTone,
        });
        renderer.compile(scene, camera);

        engineContext.nodes[node.id] = {
          fragment: renderer.properties
            .get(mesh.material)
            .programs.values()
            .next().value.fragmentShader,
          vertex: renderer.properties
            .get(mesh.material)
            .programs.values()
            .next().value.vertexShader,
        };

        const gl = renderer.getContext();
        const fragmentProgram = engineContext.nodes[node.id].fragment;
        const fragmentSource = gl.getShaderSource(fragmentProgram);

        // console.log('Before preprocessing:', fragmentSource);
        const fragmentPreprocessed = preprocess(fragmentSource, {
          preserve: {
            version: () => true,
          },
        });
        // console.log('after', fragmentPreprocessed);
        const fragmentAst = parser.parse(fragmentPreprocessed);

        // Used for the UI only right now
        engineContext.fragmentPreprocessed = fragmentPreprocessed;
        engineContext.fragmentSource = fragmentSource;

        // Do I need this? Is threejs shader already in 3.00 mode?
        // from2To3(fragmentAst);

        convert300MainToReturn(fragmentAst);
        renameBindings(fragmentAst.scopes[0], engine.preserve, node.id);
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
                (path.node.identifier?.specifier?.identifier === 'texture2D' ||
                  path.node.identifier?.specifier?.identifier === 'texture') &&
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
              console.log('FILLING...', fillerAst);
              parent[key] = fillerAst;
            },
          }),
          {}
        );
        console.log('inputs', inputs);
        return inputs;
      },
      produceFiller: (node: Node, ast: AstNode): AstNode => {
        return makeExpression(`${nodeName(node)}()`);
      },
    },
  },
};
