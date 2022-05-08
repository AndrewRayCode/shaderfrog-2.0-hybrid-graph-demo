import { EngineNodeType } from './engine';
import {
  BinaryNode,
  CodeNode,
  DataNode,
  GraphNode,
  NodeConfig,
  NodeType,
  ShaderStage,
} from './graph';
import { StrategyType } from './strategy';

// three last in chain: return gl_position right vec4
// three not last in chain: return returnRight

// other last in chain: return gl_position right vec4
// other not last in chain: return vec4(xxxxxxx, 1.0)

// export interface ProgramSource {
//   fragment: string;
//   vertex: string;
// }

// export interface ProgramAst {
//   fragment: AstNode;
//   vertex: string;
// }

/**
 * TODO LOL
 */

// export interface BinaryNode extends Node {
//   operator: string;
// }

/**
 * TODO: These definitions should live outside of core since I'm trying to
 * refactor out this core folder to only know about nodes with config config,
 * where nodes like output/phong/physical are all configured at the
 * implementation level. "phong" shouldn't be in the core
 */

export const numberNode = (id: string, value: number): DataNode => ({
  id,
  type: 'number',
  value,
  name: 'number',
  inputs: [],
  outputs: [],
});

export const sourceNode = (
  id: string,
  name: string,
  config: NodeConfig,
  source: string,
  stage: ShaderStage,
  originalEngine?: string,
  nextStageNodeId?: string
): CodeNode => ({
  id,
  name,
  type: NodeType.SOURCE,
  config,
  inputs: [],
  outputs: ['out'],
  source,
  stage,
  originalEngine,
  nextStageNodeId,
});

export const outputNode = (
  id: string,
  name: string,
  stage: ShaderStage,
  nextStageNodeId?: string
): CodeNode => ({
  id,
  name,
  type: NodeType.OUTPUT,
  config: {
    version: 3,
    preprocess: false,
    inputMapping:
      stage === 'fragment'
        ? {
            frogFragOut: 'color',
          }
        : {
            gl_Position: 'position',
          },
    strategies: [
      {
        type: StrategyType.ASSIGNMENT_TO,
        config: {
          assignTo: stage === 'fragment' ? 'frogFragOut' : 'gl_Position',
        },
      },
    ],
  },
  inputs: [],
  outputs: [],
  // Consumed by findVec4Constructo4
  source:
    stage === 'fragment'
      ? `
#version 300 es
precision highp float;

out vec4 frogFragOut;
void main() {
  frogFragOut = vec4(1.0);
}
`
      : // gl_Position isn't "out"-able apparently https://stackoverflow.com/a/24425436/743464
        `
#version 300 es
precision highp float;

void main() {
  gl_Position = vec4(1.0);
}
`,
  stage,
  nextStageNodeId,
});

export const expressionNode = (
  id: string,
  name: string,
  source: string
): CodeNode => ({
  id,
  name,
  type: NodeType.SOURCE,
  expressionOnly: true,
  config: {
    version: 3,
    preprocess: false,
    inputMapping: {},
    strategies: [
      {
        type: StrategyType.VARIABLE,
        config: {},
      },
    ],
  },
  inputs: [],
  outputs: ['out'],
  source,
});

export const phongNode = (
  id: string,
  name: string,
  stage: ShaderStage,
  nextStageNodeId?: string
): CodeNode => {
  return {
    id,
    name,
    type: EngineNodeType.phong,
    config: {
      version: 3,
      preprocess: true,
      inputMapping: {
        map: 'albedo',
        normalMap: 'normal',
      },
      strategies:
        stage === 'fragment'
          ? [
              {
                type: StrategyType.TEXTURE_2D,
                config: {},
              },
            ]
          : [
              {
                type: StrategyType.NAMED_ATTRIBUTE,
                config: { attributeName: 'position' },
              },
            ],
    },
    inputs: [],
    outputs: ['out'],
    source: '',
    stage,
    nextStageNodeId,
  };
};

export const physicalNode = (
  id: string,
  name: string,
  stage: ShaderStage,
  nextStageNodeId?: string
): CodeNode => {
  return {
    id,
    name,
    type: EngineNodeType.physical,
    config: {
      version: 3,
      preprocess: true,
      inputMapping: {
        map: 'albedo',
        normalMap: 'normal',
      },
      // TODO: The strategies for node need to be engine specific :O
      strategies: [
        {
          type: StrategyType.UNIFORM,
          config: {},
        },
        stage === 'fragment'
          ? {
              type: StrategyType.TEXTURE_2D,
              config: {},
            }
          : {
              type: StrategyType.NAMED_ATTRIBUTE,
              config: { attributeName: 'position' },
            },
      ],
    },
    inputs: [],
    outputs: ['out'],
    source: '',
    stage,
    nextStageNodeId,
  };
};

export const toonNode = (
  id: string,
  name: string,
  stage: ShaderStage,
  nextStageNodeId?: string
): CodeNode => {
  return {
    id,
    name,
    type: EngineNodeType.toon,
    config: {
      version: 3,
      preprocess: true,
      inputMapping: {
        map: 'albedo',
        normalMap: 'normal',
      },
      strategies: [
        {
          type: StrategyType.TEXTURE_2D,
          config: {},
        },
      ],
    },
    inputs: [],
    outputs: ['out'],
    source: '',
    stage,
    nextStageNodeId,
  };
};

export const addNode = (id: string): BinaryNode => ({
  id,
  name: 'add',
  type: NodeType.BINARY,
  config: {
    version: 3,
    preprocess: true,
    strategies: [],
  },
  inputs: [],
  outputs: ['out'],
  source: `a + b`,
  operator: '+',
  expressionOnly: true,
  biStage: true,
});

export const multiplyNode = (id: string): BinaryNode => ({
  id,
  name: 'multiply',
  type: NodeType.BINARY,
  config: {
    version: 3,
    preprocess: true,
    strategies: [],
  },
  inputs: [],
  outputs: ['out'],
  source: `a * b`,
  operator: '*',
  expressionOnly: true,
  biStage: true,
});
