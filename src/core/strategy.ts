import { generate } from '@shaderfrog/glsl-parser';
import { visit, AstNode, NodeVisitors } from '@shaderfrog/glsl-parser/dist/ast';
import { findAssignmentTo } from '../ast/manipulate';
import { GraphNode, InputMapping, NodeContext, NodeInputs } from './graph';

export enum StrategyType {
  ASSIGNMENT_TO = 'Assignment To',
  TEXTURE_2D = 'Texture2D',
  NAMED_ATTRIBUTE = 'Named Attribute',
}

export interface BaseStrategy {
  type: StrategyType;
}

export interface AssignemntToStrategy extends BaseStrategy {
  type: StrategyType.ASSIGNMENT_TO;
  assignTo: string;
}
export interface Texture2DStrategy extends BaseStrategy {
  type: StrategyType.TEXTURE_2D;
}
export interface NamedAttributeStrategy extends BaseStrategy {
  type: StrategyType.NAMED_ATTRIBUTE;
  attributeName: string;
}

export type Strategy =
  | AssignemntToStrategy
  | Texture2DStrategy
  | NamedAttributeStrategy;

type StrategyImpl = (
  node: GraphNode,
  ast: AstNode,
  strategy: Strategy
) => NodeInputs;

type Strategies<T> = Record<StrategyType, StrategyImpl>;

export const strategyRunners: Strategies<NodeContext> = {
  [StrategyType.ASSIGNMENT_TO]: (node, ast, strategy) => {
    const cast = strategy as AssignemntToStrategy;
    const assignNode = findAssignmentTo(ast, cast.assignTo);
    return assignNode
      ? {
          [cast.assignTo]: (fillerAst: AstNode) => {
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
      (inputs, [name, parent, key]) => ({
        ...inputs,
        [name]: (fillerAst: AstNode) => {
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
      [cast.attributeName]: (fillerAst: AstNode) => {
        Object.entries(ast.scopes[0].bindings).forEach(
          ([name, binding]: [string, any]) => {
            binding.references.forEach((ref: AstNode) => {
              if (
                ref.type === 'identifier' &&
                ref.identifier === cast.attributeName
              ) {
                ref.identifier = generate(fillerAst);
              } else if (
                ref.type === 'parameter_declaration' &&
                ref.declaration.identifier.identifier === cast.attributeName
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
