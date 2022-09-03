import { generate } from '@shaderfrog/glsl-parser';
import { visit, AstNode, NodeVisitors } from '@shaderfrog/glsl-parser/dist/ast';
import { Scope, ScopeIndex } from '@shaderfrog/glsl-parser/dist/parser/parser';
import { findAssignmentTo, findDeclarationOf } from '../ast/manipulate';
import { ComputedInput, GraphNode, mangleName } from './graph';
import { SourceNode } from './nodes/code-nodes';
import { InputCategory, nodeInput, NodeInput } from './nodes/core-node';

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
  ast: AstNode,
  strategy: Strategy
) => ComputedInput[];

type Strategies = Record<StrategyType, StrategyImpl>;

export const applyStrategy = (
  strategy: Strategy,
  node: SourceNode,
  ast: AstNode
) => strategyRunners[strategy.type](node, ast, strategy);

export const strategyRunners: Strategies = {
  [StrategyType.HARD_CODE]: (graphNode, ast, strategy) => {
    return (strategy as HardCodeStrategy).config.inputs.map((input) => [
      input,
      (filler: AstNode) => filler,
    ]);
  },
  [StrategyType.UNIFORM]: (graphNode, ast, strategy) => {
    return (ast.program as AstNode[]).flatMap<ComputedInput>((node) => {
      // The uniform declration type, like vec4
      const uniformType =
        node.declaration?.specified_type?.specifier?.specifier?.token;

      // If this is a uniform declaration line
      if (
        node.type === 'declaration_statement' &&
        node.declaration?.specified_type?.qualifiers?.find(
          (n: AstNode) => n.token === 'uniform'
        )
        /**
         * Hit an issue while adding textures as data nodes to the graph. Before
         * I was hard coding texture uniforms in ThreeComponent. Now I want them
         * as data nodes. To do that, this uniform strategy needs to include
         * sampler2D uniforms. It *didn't* before because there was no support
         * for texture data nodes, and because the texture2D strategy handles
         * the texture2D calls loading the sampler2D.
         *
         * So I commented this out to allow for sampler2D uniforms to appear as
         * inputs. But NOW the sampler2d "map" line in the physical shader is
         * overwriting the "map" PROPERTY input on the shader (both are mapped
         * to "albedo") so when I plug in a shader into "albedo" now it triggers
         * the uniform filler (previously sampler2d filler) which makes the
         * invalid line "texture(purple_metal(), vUv)"
         *
         * So if there's an albdeo UNIFORM filler which replaces instances of
         * that uniform with a filler, (by the way that SUCKS and this should
         * only inject the filler once if possible), AND a texture2D filler,
         * then... uh... hold on.
         *  - before: albedo was sampler2d filler (or becomes property setter if
         *    the category input is "data")
         *  - now: albedo is uniform filler and plugging in code slaps it in the
         *    wrong spot. I want sampler2D uniforms to show up so I can add data
         *    into them. So I need
         *    albedo_uniform_data/albedo_uniform_code/albedo_sampler2d_code? You
         *    can't put data into the sampler2d code filler, it's only bakeable
         *    I don't see it right now, bedtime
         *
         * As an aside maybe the sampler2D strategy isn't what I want in the
         * sense that it finds three noiseImage inputs on the perlin clouds
         * shader ... although that seems right, because that's all different uv
         * lookups.
         *
         * ... so now i've added an "accepts" property to inputs to say if they
         * accept data or code. I've moved "category" into "baked" and
         * "bakeable". I added image data nodes to the graph. I moved proeprty
         * setting out of hard coding in ThreeComponent. I added "type" to
         * inputs (uniform | property | filler). Made IDs more unique on inputs
         * because a map texture() filler is not the same as a map() uniform
         * filler is nto the same as a map() property.
         *
         * All of this is to allow a texture and a shader to be plugged into
         * albedo.
         *
         * Now in the graph plugging in thickness does nothing lol. Albedo works
         * as a shader, but after baking, plugging in shader, it can't be un-
         * baked? Need auto-baking too when dragging a shader or texture into an
         * input. And now we have two inputs named map. Had shower thought: for
         * "albedo" is there a higher grouping object that hides multiple inputs
         * behind the group? "special: ["filler_map" | "property_map"]"? I don't
         * like that a property has a fillerName, it would be nice if something
         * else knew about that relationship.
         *
         * wtf why isn't transmission working now
         */
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
            new Set<InputCategory>(['code', 'data']),
            true
          ),
          (filler: AstNode) => {
            const mangledName = mangleName(name, graphNode);
            // Remove the declaration line, or the declared uniform
            if (declarations.length === 1) {
              ast.program.splice(ast.program.indexOf(node), 1);
            } else {
              node.declaration.declarations =
                node.declaration.declarations.filter(
                  (d: any) => d.identifier.identifier !== mangledName
                );
            }
            // And rename all the references to said uniform
            ast.scopes[0].bindings[name].references.forEach((ref: AstNode) => {
              if (ref.type === 'identifier' && ref.identifier === mangledName) {
                ref.identifier = generate(filler);
              } else if (
                ref.type === 'parameter_declaration' &&
                ref.declaration.identifier.identifier === mangledName
              ) {
                ref.declaration.identifier.identifier = generate(filler);
              } else if (ref.identifier) {
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
              new Set<InputCategory>(['code', 'data']),
              false
            ),
            (fillerAst: AstNode) => {
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
              new Set<InputCategory>(['code', 'data']),
              false
            ),
            (fillerAst: AstNode) => {
              declaration.initializer = fillerAst;
              return ast;
            },
          ],
        ]
      : [];
  },
  // todo: refactoring inputs out here
  [StrategyType.TEXTURE_2D]: (
    node: GraphNode,
    ast: AstNode,
    strategy: Strategy
  ) => {
    let texture2Dcalls: [string, AstNode, string][] = [];
    const seen: { [key: string]: number } = {};
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

            // This function can get called after names are mangled, so remove
            // any trailing shaderfrog suffix
            const name = generate(path.node.args[0]);
            seen[name] = (seen[name] || 0) + 1;
            texture2Dcalls.push([name, path.parent, path.key]);
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
      ([name, parent, key], index) => {
        const iName = names.has(name) ? `${name}_${index}` : name;
        return [
          nodeInput(
            // Suffix a texture2d input name with its index if it's used more than
            // once
            iName,
            `filler_${iName}`,
            'filler',
            new Set<InputCategory>(['code', 'data']),
            false
          ),
          (fillerAst: AstNode) => {
            parent[key] = fillerAst;
            return ast;
          },
        ];
      }
    );

    return inputs;
  },
  [StrategyType.NAMED_ATTRIBUTE]: (node, ast, strategy) => {
    const cast = strategy as NamedAttributeStrategy;
    const { attributeName } = cast.config;
    return [
      [
        nodeInput(
          attributeName,
          `filler_${attributeName}`,
          'filler',
          new Set<InputCategory>(['code', 'data']),
          true
        ),
        (fillerAst: AstNode) => {
          Object.entries(ast.scopes[0].bindings).forEach(
            ([name, binding]: [string, any]) => {
              binding.references.forEach((ref: AstNode) => {
                if (
                  ref.type === 'identifier' &&
                  ref.identifier === attributeName
                ) {
                  ref.identifier = generate(fillerAst);
                } else if (
                  ref.type === 'parameter_declaration' &&
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
    return Object.values(
      (ast.scopes as Scope[]).reduce<ScopeIndex>(
        (acc, scope) => ({ ...acc, ...scope.bindings }),
        {}
      )
    ).flatMap((binding: any) => {
      return (binding.references as AstNode[]).reduce<ComputedInput[]>(
        (acc, ref) => {
          let identifier: string, replacer;

          if (ref.type === 'declaration') {
            identifier = ref.identifier.identifier;
            replacer = (fillerAst: AstNode) => {
              ref.identifier.identifier = generate(fillerAst);
              return ast;
            };
          } else if (ref.type === 'identifier') {
            identifier = ref.identifier;
            replacer = (fillerAst: AstNode) => {
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
