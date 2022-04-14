import { generate } from '@shaderfrog/glsl-parser';
import { visit, AstNode, NodeVisitors } from '@shaderfrog/glsl-parser/dist/ast';
import { findAssignmentTo } from '../ast/manipulate';
import {
  GraphNode,
  InputMapping,
  mangleName,
  NodeContext,
  NodeInputs,
} from './graph';

export enum StrategyType {
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
export interface Texture2DStrategy extends BaseStrategy {
  type: StrategyType.TEXTURE_2D;
}
export interface UniformStrategy extends BaseStrategy {
  type: StrategyType.UNIFORM;
}
export interface NamedAttributeStrategy extends BaseStrategy {
  type: StrategyType.NAMED_ATTRIBUTE;
  config: {
    attributeName: string;
  };
}

export type Strategy =
  | UniformStrategy
  | AssignemntToStrategy
  | Texture2DStrategy
  | NamedAttributeStrategy;

type StrategyImpl = (
  node: GraphNode,
  ast: AstNode,
  strategy: Strategy
) => NodeInputs;

type Strategies<T> = Record<StrategyType, StrategyImpl>;

export const applyStrategy = (
  strategy: Strategy,
  node: GraphNode,
  ast: AstNode
): NodeInputs => strategyRunners[strategy.type](node, ast, strategy);

export const strategyRunners: Strategies<NodeContext> = {
  [StrategyType.UNIFORM]: (
    graphNode: GraphNode,
    ast: AstNode,
    strategy: Strategy
  ) => {
    const uniforms = (ast.program as AstNode[]).reduce<NodeInputs>(
      (acc, node) => {
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
          return {
            ...acc,
            ...names.reduce(
              (nameAcc, name) => ({
                ...nameAcc,
                [name]: (filler: AstNode) => {
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
                  ast.scopes[0].bindings[name].references.forEach(
                    (ref: AstNode) => {
                      if (
                        ref.type === 'identifier' &&
                        ref.identifier === mangledName
                      ) {
                        ref.identifier = generate(filler);
                      } else if (
                        ref.type === 'parameter_declaration' &&
                        ref.declaration.identifier.identifier === mangledName
                      ) {
                        ref.declaration.identifier.identifier =
                          generate(filler);
                      }
                    }
                  );
                },
              }),
              {}
            ),
          };
        }
        return acc;
      },
      {}
    );
    return uniforms;
  },
  [StrategyType.ASSIGNMENT_TO]: (node, ast, strategy) => {
    const cast = strategy as AssignemntToStrategy;
    const assignNode = findAssignmentTo(ast, cast.config.assignTo);
    return assignNode
      ? {
          [cast.config.assignTo]: (fillerAst: AstNode) => {
            assignNode.expression.right = fillerAst;
          },
        }
      : {};
  },
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
    const inputs = texture2Dcalls.reduce(
      (inputs, [name, parent, key], index) => ({
        ...inputs,
        // Suffix a texture2d input name with its index if it's used more than
        // once
        [names.has(name) ? `${name}_${index}` : name]: (fillerAst: AstNode) => {
          parent[key] = fillerAst;
        },
      }),
      {}
    );

    return inputs;
  },
  [StrategyType.NAMED_ATTRIBUTE]: (node, ast, strategy) => {
    const cast = strategy as NamedAttributeStrategy;
    return {
      [cast.config.attributeName]: (fillerAst: AstNode) => {
        Object.entries(ast.scopes[0].bindings).forEach(
          ([name, binding]: [string, any]) => {
            binding.references.forEach((ref: AstNode) => {
              if (
                ref.type === 'identifier' &&
                ref.identifier === cast.config.attributeName
              ) {
                ref.identifier = generate(fillerAst);
              } else if (
                ref.type === 'parameter_declaration' &&
                ref.declaration.identifier.identifier ===
                  cast.config.attributeName
              ) {
                ref.declaration.identifier.identifier = generate(fillerAst);
              }
            });
          }
        );
      },
    };
  },
};

export const mapInputs = (
  mappings: InputMapping,
  inputs: NodeInputs
): NodeInputs =>
  Object.entries(inputs).reduce<NodeInputs>(
    (acc, [name, fn]) => ({
      ...acc,
      [mappings[name] || name]: fn,
    }),
    {}
  );
