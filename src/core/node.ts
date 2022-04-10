import { EngineNodeType } from './engine';
import {
  BinaryNode,
  CoreNode,
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

export const sourceNode = (
  id: string,
  name: string,
  config: NodeConfig,
  source: string,
  stage: ShaderStage,
  originalEngine?: string,
  nextStageNodeId?: string
): CoreNode => ({
  id,
  name,
  type: NodeType.SOURCE,
  config,
  inputs: [],
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
): CoreNode => ({
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
        assignTo: stage === 'fragment' ? 'frogFragOut' : 'gl_Position',
      },
    ],
  },
  inputs: [],
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

export const phongNode = (
  id: string,
  name: string,
  stage: ShaderStage,
  nextStageNodeId?: string
): CoreNode => {
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
              },
            ]
          : [
              {
                type: StrategyType.NAMED_ATTRIBUTE,
                attributeName: 'position',
              },
            ],
    },
    inputs: [],
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
): CoreNode => {
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
      strategies:
        stage === 'fragment'
          ? [
              {
                type: StrategyType.TEXTURE_2D,
              },
            ]
          : [
              {
                type: StrategyType.NAMED_ATTRIBUTE,
                attributeName: 'position',
              },
            ],
    },
    inputs: [],
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
): CoreNode => {
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
        },
      ],
    },
    inputs: [],
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
  source: `a * b`,
  operator: '*',
  expressionOnly: true,
  biStage: true,
});
