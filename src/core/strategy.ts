import { generate } from '@shaderfrog/glsl-parser';
import {
  visit,
  AstNode,
  NodeVisitors,
  Program,
  Scope,
  ScopeIndex,
  DeclarationNode,
  DeclarationStatementNode,
  KeywordNode,
} from '@shaderfrog/glsl-parser/ast';
import { findAssignmentTo, findDeclarationOf } from '../ast/manipulate';
import { ComputedInput, GraphNode, mangleName } from './graph';
import { SourceNode } from './nodes/code-nodes';
import { InputCategory, nodeInput, NodeInput } from './nodes/core-node';
import { GraphDataType } from './nodes/data-nodes';

export enum StrategyType {
  VARIABLE = 'Variable Names',
  ASSIGNMENT_TO = 'Assignment To',
  DECLARATION_OF = 'Variable Declaration',
  TEXTURE_2D = 'Texture2D',
  NAMED_ATTRIBUTE = 'Named Attribute',
  UNIFORM = 'Uniform',
  HARD_CODE = 'Hard Code Inputs',
}

export interface BaseStrategy {
  type: StrategyType;
  config: Object;
}

export interface AssignemntToStrategy extends BaseStrategy {
  type: StrategyType.ASSIGNMENT_TO;
  config: {
    assignTo: string;
  };
}
export const assignemntToStrategy = (
  assignTo: string
): AssignemntToStrategy => ({
  type: StrategyType.ASSIGNMENT_TO,
  config: { assignTo },
});

export interface Texture2DStrategy extends BaseStrategy {
  type: StrategyType.TEXTURE_2D;
}
export const texture2DStrategy = (): Texture2DStrategy => ({
  type: StrategyType.TEXTURE_2D,
  config: {},
});

export interface UniformStrategy extends BaseStrategy {
  type: StrategyType.UNIFORM;
}
export const uniformStrategy = (): UniformStrategy => ({
  type: StrategyType.UNIFORM,
  config: {},
});

export interface HardCodeStrategy extends BaseStrategy {
  type: StrategyType.HARD_CODE;
  config: { inputs: NodeInput[] };
}
export const hardCodeStrategy = (inputs: NodeInput[]): HardCodeStrategy => ({
  type: StrategyType.HARD_CODE,
  config: { inputs },
});

export const namedAttributeStrategy = (
  attributeName: string
): NamedAttributeStrategy => ({
  type: StrategyType.NAMED_ATTRIBUTE,
  config: { attributeName },
});
export interface NamedAttributeStrategy extends BaseStrategy {
  type: StrategyType.NAMED_ATTRIBUTE;
  config: {
    attributeName: string;
  };
}

export const declarationOfStrategy = (
  declarationOf: string
): DeclarationOfStrategy => ({
  type: StrategyType.DECLARATION_OF,
  config: { declarationOf },
});
export interface DeclarationOfStrategy extends BaseStrategy {
  type: StrategyType.DECLARATION_OF;
  config: {
    declarationOf: string;
  };
}

export interface VariableStrategy extends BaseStrategy {
  type: StrategyType.VARIABLE;
}
export const variableStrategy = (): VariableStrategy => ({
  type: StrategyType.VARIABLE,
  config: {},
});

export type Strategy =
  | UniformStrategy
  | AssignemntToStrategy
  | Texture2DStrategy
  | NamedAttributeStrategy
  | VariableStrategy
  | HardCodeStrategy
  | DeclarationOfStrategy;

type StrategyImpl = (
  node: SourceNode,
  ast: AstNode | Program,
  strategy: Strategy
) => ComputedInput[];

type Strategies = Record<StrategyType, StrategyImpl>;

const DATA_TYPE_MAP: Readonly<[GraphDataType, Set<string>][]> = [
  ['vector2', new Set(['bvec2', 'dvec2', 'ivec2', 'uvec2', 'vec2'])],
  ['number', new Set(['float', 'double', 'int', 'uint', 'atomic_uint'])],
  ['vector3', new Set(['bvec3', 'dvec3', 'ivec3', 'uvec3', 'vec3'])],
  ['vector4', new Set(['bvec4', 'dvec4', 'ivec4', 'uvec4', 'vec4'])],
  ['texture', new Set(['sampler2D'])],
  ['mat2', new Set(['mat2', 'dmat2'])],
  ['mat3', new Set(['mat3', 'dmat3'])],
  ['mat4', new Set(['mat4', 'dmat4'])],
  ['mat2x2', new Set(['mat2x2', 'dmat2x2'])],
  ['mat2x3', new Set(['mat2x3', 'dmat2x3'])],
  ['mat2x4', new Set(['mat2x4', 'dmat2x4'])],
  ['mat3x2', new Set(['mat3x2', 'dmat3x2'])],
  ['mat3x3', new Set(['mat3x3', 'dmat3x3'])],
  ['mat3x4', new Set(['mat3x4', 'dmat3x4'])],
  ['mat4x2', new Set(['mat4x2', 'dmat4x2'])],
  ['mat4x3', new Set(['mat4x3', 'dmat4x3'])],
  ['mat4x4', new Set(['mat4x4', 'dmat4x4'])],
];
/**
 * Uncategorized:
 * 
"sampler1D"
"sampler3D"
"samplerCube"
"sampler1DShadow"
"sampler2DShadow"
"samplerCubeShadow"
"sampler1DArray"
"sampler2DArray"
"sampler1DArrayShadow"
"sampler2DArrayshadow"
"isampler1D"
"isampler2D"
"isampler3D"
"isamplerCube"
"isampler1Darray"
"isampler2DArray"
"usampler1D"
"usampler2D"
"usampler3D"
"usamplerCube"
"usampler1DArray"
"usampler2DArray"
"sampler2DRect"
"sampler2DRectshadow"
"isampler2DRect"
"usampler2DRect"
"samplerBuffer"
"isamplerBuffer"
"usamplerBuffer"
"samplerCubeArray"
"samplerCubeArrayShadow"
"isamplerCubeArray"
"usamplerCubeArray"
"sampler2DMS"
"isampler2DMS"
"usampler2DMS"
"sampler2DMSArray"
"isampler2DMSArray"
"usampler2DMSArray"
"image1D"
"iimage1D"
"uimage1D"
"image2D"
"iimage2D"
"uimage2D"
"image3D"
"iimage3D"
"uimage3D"
"image2DRect"
"iimage2DRect"
"uimage2DRect"
"imageCube"
"iimageCube"
"uimageCube"
"imageBuffer"
"iimageBuffer"
"uimageBuffer"
"image1DArray"
"iimage1DArray"
"uimage1DArray"
"image2DArray"
"iimage2DArray"
"uimage2DArray"
"imageCubeArray"
"iimageCubeArray"
"uimageCubeArray"
"image2DMS"
"iimage2DMS"
"uimage2DMS"
"image2DMArray"
"iimage2DMSArray"
"uimage2DMSArray"
"struct"
 */

const mapUniformType = (type: string): GraphDataType | undefined => {
  const found = DATA_TYPE_MAP.find(([_, set]) => set.has(type));
  if (found) {
    return found[0];
  }
  // console.log(`Unknown uniform type, can't map to graph: ${type}`);
};

export const applyStrategy = (
  strategy: Strategy,
  node: SourceNode,
  ast: AstNode | Program
) => strategyRunners[strategy.type](node, ast, strategy);

export const strategyRunners: Strategies = {
  [StrategyType.HARD_CODE]: (graphNode, ast, strategy) => {
    return (strategy as HardCodeStrategy).config.inputs.map((input) => [
      input,
      (filler) => filler,
    ]);
  },
  [StrategyType.UNIFORM]: (graphNode, ast, strategy) => {
    const program = ast as Program;
    return (program.program || []).flatMap<ComputedInput>((node) => {
      // The uniform declration type, like vec4
      const uniformType = (node as DeclarationStatementNode).declaration
        ?.specified_type?.specifier?.specifier?.token;
      const graphDataType = mapUniformType(uniformType);

      // If this is a uniform declaration line
      if (
        node.type === 'declaration_statement' &&
        node.declaration?.specified_type?.qualifiers?.find(
          (n: KeywordNode) => n.token === 'uniform'
        )
        // commented this out to allow for sampler2D uniforms to appear as inputs
        // && uniformType !== 'sampler2D'
      ) {
        // Capture all the declared names, removing mangling suffix
        const { declarations } = node.declaration;
        const names = declarations.map(
          (d: any) => d.identifier.identifier
        ) as string[];

        // Tricky code warning: The flow of preparing a node for the graph is:
        // 1. Produce/mangle the AST (with unmangled names)
        // 2. findInputs() (with unmangled names)
        // 3. The AST is *then* mangled in graph.ts
        // 4. Later, the inputs are filled in, and now, we have an input with
        //    the name "x" but the ast now has the mangled name "x_1". So
        //    here, we look for the *mangled* name in the strategy runner
        return names.map<ComputedInput>((name) => [
          nodeInput(
            name,
            `uniform_${name}`,
            'uniform',
            graphDataType,
            new Set<InputCategory>(['code', 'data']),
            true
          ),
          (filler) => {
            const mangledName = mangleName(name, graphNode);
            // Remove the declaration line, or the declared uniform
            if (declarations.length === 1) {
              program.program.splice(program.program.indexOf(node), 1);
            } else {
              node.declaration.declarations =
                node.declaration.declarations.filter(
                  (d: any) => d.identifier.identifier !== mangledName
                );
            }
            // And rename all the references to said uniform
            program.scopes[0].bindings[name].references.forEach((ref) => {
              if (ref.type === 'identifier' && ref.identifier === mangledName) {
                ref.identifier = generate(filler);
              } else if (
                ref.type === 'parameter_declaration' &&
                'identifier' in ref.declaration &&
                ref.declaration.identifier.identifier === mangledName
              ) {
                ref.declaration.identifier.identifier = generate(filler);
              } else if ('identifier' in ref) {
                ref.identifier = generate(filler);
              } else {
                console.warn(
                  'Unknown uniform reference for',
                  graphNode.name,
                  'ref'
                );
              }
            });

            return ast;
          },
        ]);
      }
      return [];
    });
  },
  [StrategyType.ASSIGNMENT_TO]: (node, ast, strategy) => {
    const cast = strategy as AssignemntToStrategy;
    const assignNode = findAssignmentTo(ast, cast.config.assignTo);

    const name = cast.config.assignTo;
    return assignNode
      ? [
          [
            nodeInput(
              name,
              `filler_${name}`,
              'filler',
              undefined, // Data type for what plugs into this filler
              new Set<InputCategory>(['code', 'data']),
              false
            ),
            (fillerAst) => {
              assignNode.expression.right = fillerAst;
              return ast;
            },
          ],
        ]
      : [];
  },
  [StrategyType.DECLARATION_OF]: (node, ast, strategy) => {
    const cast = strategy as DeclarationOfStrategy;
    const declaration = findDeclarationOf(ast, cast.config.declarationOf);
    const name = cast.config.declarationOf;
    return declaration
      ? [
          [
            nodeInput(
              name,
              `filler_${name}`,
              'filler',
              undefined, // Data type for what plugs into this filler
              new Set<InputCategory>(['code', 'data']),
              false
            ),
            (fillerAst) => {
              declaration.initializer = fillerAst;
              return ast;
            },
          ],
        ]
      : [];
  },
  [StrategyType.TEXTURE_2D]: (node, ast, strategy) => {
    let texture2Dcalls: [string, AstNode, string, AstNode[]][] = [];
    const seen: { [key: string]: number } = {};
    const visitors: NodeVisitors = {
      function_call: {
        enter: (path) => {
          if (
            // TODO: 100 vs 300
            // @ts-ignore
            (path.node.identifier?.specifier?.identifier === 'texture2D' ||
              // @ts-ignore
              path.node.identifier?.specifier?.identifier === 'texture') &&
            path.key
          ) {
            if (!path.parent) {
              throw new Error(
                'This error is impossible. A function call always has a parent.'
              );
            }

            const name = generate(path.node.args[0]);
            seen[name] = (seen[name] || 0) + 1;
            texture2Dcalls.push([
              name,
              path.parent as AstNode,
              path.key,
              // Remove the first argument and comma
              (path.node.args as AstNode[]).slice(2),
            ]);
          }
        },
      },
    };
    visit(ast, visitors);
    const names = new Set(
      Object.entries(seen).reduce<string[]>(
        (arr, [name, count]) => [...arr, ...(count > 1 ? [name] : [])],
        []
      )
    );
    const inputs = texture2Dcalls.map<ComputedInput>(
      ([name, parent, key, texture2dArgs], index) => {
        // Suffix input name if it's used more than once
        const iName = names.has(name) ? `${name}_${index}` : name;
        return [
          nodeInput(
            iName,
            `filler_${iName}`,
            'filler',
            'vector4', // Data type for what plugs into this filler
            new Set<InputCategory>(['code', 'data']),
            false
          ),
          (fillerAst) => {
            // @ts-ignore
            parent[key] = fillerAst;
            return ast;
          },
          texture2dArgs,
        ];
      }
    );

    return inputs;
  },
  [StrategyType.NAMED_ATTRIBUTE]: (node, ast, strategy) => {
    const program = ast as Program;
    const cast = strategy as NamedAttributeStrategy;
    const { attributeName } = cast.config;
    return [
      [
        nodeInput(
          attributeName,
          `filler_${attributeName}`,
          'filler',
          undefined, // Data type for what plugs into this filler
          new Set<InputCategory>(['code', 'data']),
          true
        ),
        (fillerAst) => {
          Object.entries(program.scopes[0].bindings).forEach(
            ([name, binding]: [string, any]) => {
              binding.references.forEach((ref: AstNode) => {
                if (
                  ref.type === 'identifier' &&
                  ref.identifier === attributeName
                ) {
                  ref.identifier = generate(fillerAst);
                } else if (
                  ref.type === 'parameter_declaration' &&
                  'identifier' in ref.declaration &&
                  ref.declaration.identifier.identifier === attributeName
                ) {
                  ref.declaration.identifier.identifier = generate(fillerAst);
                }
              });
            }
          );
          return ast;
        },
      ],
    ];
  },
  [StrategyType.VARIABLE]: (node, ast, strategy) => {
    const program = ast as Program;
    return Object.values(
      (program.scopes as Scope[]).reduce<ScopeIndex>(
        (acc, scope) => ({ ...acc, ...scope.bindings }),
        {}
      )
    ).flatMap((binding: any) => {
      return (binding.references as AstNode[]).reduce<ComputedInput[]>(
        (acc, ref) => {
          let identifier: string, replacer;

          if (ref.type === 'declaration') {
            identifier = ref.identifier.identifier;
            replacer = (fillerAst: AstNode | Program) => {
              ref.identifier.identifier = generate(fillerAst);
              return ast;
            };
          } else if (ref.type === 'identifier') {
            identifier = ref.identifier;
            replacer = (fillerAst: AstNode | Program) => {
              ref.identifier = generate(fillerAst);
              return ast;
            };
            // } else if (ref.type === 'parameter_declaration') {
            //   identifier = ref.declaration.identifier.identifier;
            //   replacer = (fillerAst: AstNode) => {
            //     ref.declaration.identifier.identifier = generate(fillerAst);
            //   };
          } else {
            return acc;
          }
          return [
            ...acc,
            [
              nodeInput(
                identifier,
                `filler_${identifier}`,
                'filler',
                undefined, // Data type for what plugs into this filler
                new Set<InputCategory>(['code', 'data']),
                false
              ),
              replacer,
            ],
          ];
        },
        []
      );
    });
  },
};
