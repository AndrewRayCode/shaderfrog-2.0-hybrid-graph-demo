import { parser, generate } from '@shaderfrog/glsl-parser';
import {
  renameBindings,
  renameFunctions,
} from '@shaderfrog/glsl-parser/dist/parser/utils';
import { visit, AstNode, NodeVisitors } from '@shaderfrog/glsl-parser/dist/ast';
import preprocess from '@shaderfrog/glsl-parser/dist/preprocessor';
import { Engine, nodeName, EngineContext } from './graph';

import {
  ShaderType,
  convert300MainToReturn,
  makeExpression,
  from2To3,
  Node,
  Edge,
  ShaderStage,
  doesLinkThruShader,
  Graph,
  returnGlPositionHardCoded,
  returnGlPosition,
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

export const phongNode = (
  id: string,
  name: string,
  options: Object,
  stage: ShaderStage,
  nextStageNodeId?: string
): Node => {
  return {
    id,
    name,
    type: ShaderType.phong,
    options,
    inputs: [],
    source: '',
    stage,
    nextStageNodeId,
  };
};

export const toonNode = (
  id: string,
  name: string,
  options: Object,
  stage: ShaderStage,
  nextStageNodeId?: string
): Node => {
  return {
    id,
    name,
    type: ShaderType.toon,
    options,
    inputs: [],
    source: '',
    stage,
    nextStageNodeId,
  };
};

const onBeforeCompileMegaShader = (
  engineContext: EngineContext<RuntimeContext>,
  node: Node,
  newMat: any
) => {
  console.log(
    `"${node.name}"onbeforecompile  ${node.id} (${node.stage}) ${
      node.nextStageNodeId || 'no next stage id'
    }`
  );
  const { nodes } = engineContext.runtime.cache;
  if (nodes[node.id] || (node.nextStageNodeId && nodes[node.nextStageNodeId])) {
    console.log(
      ` -- skipping phong onbeforecompile "${node.name}" ${node.id} (${
        node.stage
      }) ${node.nextStageNodeId || 'no next stage id'}`
    );
    return;
  }
  const { renderer, mesh, scene, camera, material, threeTone, three } =
    engineContext.runtime;

  mesh.material = newMat;
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

const megaShaderProduceVertexAst = (
  // todo: help
  engineContext: EngineContext<RuntimeContext>,
  engine: any,
  graph: Graph,
  node: Node,
  inputEdges: Edge[]
) => {
  console.log(
    `produceAst "${node.name}" ${node.id} (${node.stage}) ${
      node.nextStageNodeId || 'no next stage id'
    }`
  );
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
  engineContext.debuggingNonsense.vertexPreprocessed = vertexPreprocessed;

  // Do I need this? Is threejs shader already in 3.00 mode?
  // from2To3(vertexAst);

  if (doesLinkThruShader(graph, node)) {
    // TODO: Needs to be vec3 for this case, vec4 for final case
    returnGlPosition(vertexAst);
  } else {
    returnGlPositionHardCoded(vertexAst, 'vec4', 'transformed');
  }

  renameBindings(vertexAst.scopes[0], threngine.preserve, node.id);
  renameFunctions(vertexAst.scopes[0], node.id, {
    main: nodeName(node),
  });
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

export const threngine: Engine<RuntimeContext> = {
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
    // TODO: frag and vert shader get different names for varyings, also the
    // "preserve" in the core graph.ts always reads from the engine which I don't
    // think is what I wanted since my mental model was there was a core engine to use
    'noise',
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
          })
          // new three.MeshPhysicalMaterial({
          //   color: 0x00ff00,
          //   roughness: 0.046,
          //   metalness: 0.491,
          //   clearcoat: 1,
          //   map: new three.Texture(),
          // })
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
        findInputs: (engineContext, node, ast: AstNode) => {
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
          console.log(
            `fragment toon produceAst (id: ${
              node.id
            }) with cached [${Object.keys(engineContext.runtime.cache.nodes)}]`
          );
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
