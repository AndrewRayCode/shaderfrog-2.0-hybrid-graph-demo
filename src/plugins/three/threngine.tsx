import { parser, generate } from '@shaderfrog/glsl-parser';
import {
  renameBindings,
  renameFunctions,
} from '@shaderfrog/glsl-parser/dist/parser/utils';
import { visit, AstNode, NodeVisitors } from '@shaderfrog/glsl-parser/dist/ast';
import preprocess from '@shaderfrog/glsl-parser/dist/preprocessor';
import { Engine, nodeName, EngineContext } from '../../graph';
import importers from './importers';

import {
  ShaderType,
  convert300MainToReturn,
  makeExpression,
  Node,
  Edge,
  ShaderStage,
  doesLinkThruShader,
  Graph,
  returnGlPositionHardCoded,
  returnGlPosition,
} from '../../nodestuff';

export type RuntimeContext = {
  scene: any;
  camera: any;
  renderer: any;
  three: any;
  sceneData: any;
  // material: any;
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

const onBeforeCompileMegaShader = (
  engineContext: EngineContext<RuntimeContext>,
  node: Node,
  newMat: any
) => {
  // const { nodes } = engineContext.runtime.cache;
  // TODO: Update cache based on lights (or other, like mesh + lights?)
  // if (nodes[node.id] || (node.nextStageNodeId && nodes[node.nextStageNodeId])) {
  //   return;
  // }
  const { renderer, sceneData, scene, camera, threeTone, three } =
    engineContext.runtime;
  const { mesh } = sceneData;

  mesh.material = newMat;
  // console.log('scene', JSON.parse(JSON.stringify(scene)));
  renderer.compile(scene, camera);

  // The references to the compiled shaders in WebGL
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
};

const xxy =
  () =>
  (a: EngineContext<RuntimeContext>, b: any, c: Graph, d: Node, e: Edge[]) =>
    megaShaderProduceVertexAst(a, b, c, d, e, true);
const megaShaderProduceVertexAst = (
  // todo: help
  engineContext: EngineContext<RuntimeContext>,
  engine: any,
  graph: Graph,
  node: Node,
  inputEdges: Edge[],
  inc?: boolean
) => {
  const { nodes } = engineContext.runtime.cache;
  const { vertex } =
    nodes[node.id] || (node.nextStageNodeId && nodes[node.nextStageNodeId]);

  engineContext.debuggingNonsense.vertexSource = vertex;

  const vertexPreprocessed = preprocess(vertex, {
    preserve: {
      version: () => true,
    },
  });

  const vertexAst = parser.parse(vertexPreprocessed);
  if (inc) {
    engineContext.debuggingNonsense.vertexPreprocessed = vertexPreprocessed;
  }

  // Do I need this? Is threejs shader already in 3.00 mode?
  // from2To3(vertexAst);

  if (doesLinkThruShader(graph, node)) {
    returnGlPositionHardCoded(vertexAst, 'vec3', 'transformed');
  } else {
    returnGlPosition(vertexAst);
  }

  renameBindings(vertexAst.scopes[0], (name) =>
    threngine.preserve.has(name) ? name : `${name}_${node.id}`
  );
  renameFunctions(vertexAst.scopes[0], (name) =>
    name === 'main' ? nodeName(node) : `${name}_${node.id}`
  );
  return vertexAst;
};

const megaShaderFindPositionInputs = (
  engineContext: EngineContext<RuntimeContext>,
  node: Node,
  ast: AstNode
) => ({
  position: (fillerAst: AstNode) => {
    Object.entries(ast.scopes[0].bindings).forEach(
      ([name, binding]: [string, any]) => {
        binding.references.forEach((ref: AstNode) => {
          if (ref.type === 'identifier' && ref.identifier === 'position') {
            ref.identifier = generate(fillerAst);
          } else if (
            ref.type === 'parameter_declaration' &&
            ref.declaration.identifier.identifier === 'position'
          ) {
            ref.declaration.identifier.identifier = generate(fillerAst);
          }
        });
      }
    );
  },
});

const inputNameMap: { [key: string]: string } = {
  map: 'albedo',
};
const texture2DInputFinder = (
  engineContext: EngineContext<RuntimeContext>,
  node: Node,
  ast: AstNode
) => {
  let texture2Dcalls: [string, AstNode, string][] = [];
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
          texture2Dcalls.push([
            generate(path.node.args[0]),
            path.parent,
            path.key,
          ]);
        }
      },
    },
  };
  visit(ast, visitors);
  const inputs = texture2Dcalls.reduce(
    (inputs, [name, parent, key], index) => ({
      ...inputs,
      [inputNameMap[name] || name]: (fillerAst: AstNode) => {
        parent[key] = fillerAst;
      },
    }),
    {}
  );

  return inputs;
};

export const threngine: Engine<RuntimeContext> = {
  name: 'three',
  importers,
  mergeOptions: {
    includePrecisions: true,
    includeVersion: true,
  },
  // TODO: Get from uniform lib?
  preserve: new Set<string>([
    'viewMatrix',
    'modelMatrix',
    'modelViewMatrix',
    'projectionMatrix',
    'normalMatrix',
    'uvTransform',
    // Attributes
    'position',
    'normal',
    'uv',
    'uv2',
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
    'specularTint',
    'time',
    'normalScale',
    'normalMap',
    'roughnessMap',
    // Uniforms for lighting
    'receiveShadow',
    'ambientLightColor',
    'lightProbe',
    // Light uniform arrays
    'spotLights',
    'pointLights',
    // This isn't three wtf
    'resolution',
    'color',
    'image',
    'gradientMap',
    // TODO: This isn't specific to threejs as an engine, it's specific to the
    // phong shader. If a *shader* node has brightness, it should be unique, not
    // use the threejs one!
    'brightness',
    // TODO: frag and vert shader get different names for varyings, also the
    // "preserve" in the core graph.ts always reads from the engine which I don't
    // think is what I wanted since my mental model was there was a core engine to use
    'noise',
    'fPosition',
    'fNormal',
    // TODO: These depend on the shaderlib, this might need to be a runtime
    // concern
    // Metalness
    'roughness',
    'metalness',
    'ior',
    'specularIntensity',
    'clearcoat',
    'clearcoatRoughness',
  ]),
  parsers: {
    [ShaderType.phong]: {
      onBeforeCompile: (engineContext, node) => {
        const { three } = engineContext.runtime;
        onBeforeCompileMegaShader(
          engineContext,
          node,
          new three.MeshPhongMaterial({
            color: 0x00ff00,
            map: new three.Texture(),
            normalMap: new three.Texture(),
          })
        );
      },
      fragment: {
        produceAst: (engineContext, engine, graph, node, inputEdges) => {
          const { fragment } = engineContext.runtime.cache.nodes[node.id];

          const fragmentPreprocessed = preprocess(fragment, {
            preserve: {
              version: () => true,
            },
          });

          const fragmentAst = parser.parse(fragmentPreprocessed);

          // Used for the UI only right now
          // engineContext.debuggingNonsense.fragmentPreprocessed =
          //   fragmentPreprocessed;
          // engineContext.debuggingNonsense.fragmentSource = fragment;

          // Do I need this? Is threejs shader already in 3.00 mode?
          // from2To3(fragmentAst);

          convert300MainToReturn(fragmentAst);
          renameBindings(fragmentAst.scopes[0], (name) =>
            threngine.preserve.has(name) ? name : `${name}_${node.id}`
          );
          renameFunctions(fragmentAst.scopes[0], (name) =>
            name === 'main' ? nodeName(node) : `${name}_${node.id}`
          );
          return fragmentAst;
        },
        findInputs: texture2DInputFinder,
        produceFiller: (node: Node, ast: AstNode) => {
          return makeExpression(`${nodeName(node)}()`);
        },
      },
      vertex: {
        produceAst: megaShaderProduceVertexAst,
        findInputs: megaShaderFindPositionInputs,
        produceFiller: (node: Node, ast: AstNode) => {
          return makeExpression(`${nodeName(node)}()`);
        },
      },
    },
    [ShaderType.physical]: {
      onBeforeCompile: (engineContext, node) => {
        const { three } = engineContext.runtime;
        onBeforeCompileMegaShader(
          engineContext,
          node,
          new three.MeshPhysicalMaterial({
            metalness: 0.4,
            roughness: 0.2,
            clearcoat: 0.5,
            clearcoatRoughness: 0.5,
            reflectivity: 0.5,
            color: new three.Vector3(1.0, 1.0, 1.0),
            map: new three.Texture(),
            // TODO: Normals are wrong when using normalmap
            normalMap: new three.Texture(),
            // roughnessMap: new three.Texture(),
          })
        );
      },
      fragment: {
        produceAst: (
          // todo: help
          engineContext,
          engine,
          graph,
          node,
          inputEdges
        ) => {
          const { fragment } = engineContext.runtime.cache.nodes[node.id];

          const fragmentPreprocessed = preprocess(fragment, {
            preserve: {
              version: () => true,
            },
          });

          const fragmentAst = parser.parse(fragmentPreprocessed);

          // Used for the UI only right now
          engineContext.debuggingNonsense.fragmentPreprocessed =
            fragmentPreprocessed;
          engineContext.debuggingNonsense.fragmentSource = fragment;

          // Do I need this? Is threejs shader already in 3.00 mode?
          // from2To3(fragmentAst);

          convert300MainToReturn(fragmentAst);
          renameBindings(fragmentAst.scopes[0], (name) =>
            threngine.preserve.has(name) ? name : `${name}_${node.id}`
          );
          renameFunctions(fragmentAst.scopes[0], (name) =>
            name === 'main' ? nodeName(node) : `${name}_${node.id}`
          );
          return fragmentAst;
        },
        findInputs: texture2DInputFinder,
        produceFiller: (node: Node, ast: AstNode) => {
          return makeExpression(`${nodeName(node)}()`);
        },
      },
      vertex: {
        // produceAst: megaShaderProduceVertexAst,
        produceAst: xxy(),
        findInputs: megaShaderFindPositionInputs,
        produceFiller: (node: Node, ast: AstNode) => {
          return makeExpression(`${nodeName(node)}()`);
        },
      },
    },
    [ShaderType.toon]: {
      onBeforeCompile: (engineContext, node) => {
        const { three, threeTone } = engineContext.runtime;
        onBeforeCompileMegaShader(
          engineContext,
          node,
          new three.MeshToonMaterial({
            color: 0x00ff00,
            map: new three.Texture(),
            gradientMap: threeTone,
          })
        );
      },
      fragment: {
        produceAst: (
          // todo: help
          engineContext,
          engine,
          graph,
          node,
          inputEdges
        ) => {
          const { fragment } = engineContext.runtime.cache.nodes[node.id];

          const fragmentPreprocessed = preprocess(fragment, {
            preserve: {
              version: () => true,
            },
          });

          const fragmentAst = parser.parse(fragmentPreprocessed);

          // Used for the UI only right now
          // engineContext.debuggingNonsense.fragmentPreprocessed =
          //   fragmentPreprocessed;
          // engineContext.debuggingNonsense.fragmentSource = fragment;

          // Do I need this? Is threejs shader already in 3.00 mode?
          // from2To3(fragmentAst);

          convert300MainToReturn(fragmentAst);
          renameBindings(fragmentAst.scopes[0], (name) =>
            threngine.preserve.has(name) ? name : `${name}_${node.id}`
          );
          renameFunctions(fragmentAst.scopes[0], (name) =>
            name === 'main' ? nodeName(node) : `${name}_${node.id}`
          );
          return fragmentAst;
        },
        findInputs: texture2DInputFinder,
        produceFiller: (node, ast) => {
          return makeExpression(`${nodeName(node)}()`);
        },
      },
      vertex: {
        produceAst: megaShaderProduceVertexAst,
        findInputs: megaShaderFindPositionInputs,
        produceFiller: (node, ast) => {
          return makeExpression(`${nodeName(node)}()`);
        },
      },
    },
  },
};
