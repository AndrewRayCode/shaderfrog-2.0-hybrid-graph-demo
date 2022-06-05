import { generate } from '@shaderfrog/glsl-parser';
import { visit, AstNode, NodeVisitors } from '@shaderfrog/glsl-parser/dist/ast';
import { Scope, ScopeIndex } from '@shaderfrog/glsl-parser/dist/parser/parser';
import { findAssignmentTo } from '../ast/manipulate';
import { ComputedInput, GraphNode, mangleName } from './graph';
import { SourceNode } from './nodes/code-nodes';

export enum StrategyType {
  VARIABLE = 'Variable Names',
  ASSIGNMENT_TO = 'Assignment To',
  TEXTURE_2D = 'Texture2D',
  NAMED_ATTRIBUTE = 'Named Attribute',
  UNIFORM = 'Uniform',
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
  | VariableStrategy;

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
        ) &&
        uniformType !== 'sampler2D'
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
          {
            name,
            id: name,
            category: 'data',
            bakeable: true,
          },
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
            {
              name,
              id: name,
              category: 'code',
              bakeable: false,
            },
            (fillerAst: AstNode) => {
              assignNode.expression.right = fillerAst;
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
          {
            // Suffix a texture2d input name with its index if it's used more than
            // once
            name: iName,
            id: iName,
            category: 'code',
            bakeable: false,
          },
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
        {
          name: attributeName,
          category: 'code',
          id: attributeName,
          bakeable: true,
        },
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
    // const cast = strategy as VariableStrategy;
    console.log('running start', ast);
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
              {
                name: identifier,
                id: identifier,
                category: 'code',
                bakeable: false,
              },
              replacer,
            ],
          ];
        },
        []
      );
    });
  },
};
