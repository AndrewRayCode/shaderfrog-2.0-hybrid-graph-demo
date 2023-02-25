import { EngineNodeType } from '../engine';
import { NodeType, ShaderStage, prepopulatePropertyInputs } from '../graph';
import {
  assignemntToStrategy,
  hardCodeStrategy,
  namedAttributeStrategy,
  texture2DStrategy,
  uniformStrategy,
  variableStrategy,
} from '../strategy';
import { BinaryNode, CodeNode, NodeConfig, property } from './code-nodes';
import { NodePosition } from './core-node';
import { UniformDataType } from './data-nodes';

/**
 * TODO: These definitions should live outside of core since I'm trying to
 * refactor out this core folder to only know about nodes with config config,
 * where nodes like output/phong/physical are all configured at the
 * implementation level. "phong" shouldn't be in the core
 */

export const sourceNode = (
  id: string,
  name: string,
  position: NodePosition,
  config: NodeConfig,
  source: string,
  stage: ShaderStage,
  originalEngine?: string,
  nextStageNodeId?: string
): CodeNode => ({
  id,
  name,
  groupId: undefined,
  type: NodeType.SOURCE,
  config,
  position,
  inputs: [],
  outputs: [
    {
      name: 'vector4',
      category: 'data',
      id: '1',
    },
  ],
  source,
  stage,
  originalEngine,
  nextStageNodeId,
});

export const outputNode = (
  id: string,
  name: string,
  position: NodePosition,
  stage: ShaderStage
): CodeNode => ({
  id,
  name,
  position,
  groupId: undefined,
  type: NodeType.OUTPUT,
  config: {
    version: 3,
    mangle: false,
    preprocess: false,
    uniforms: [],
    inputMapping:
      stage === 'fragment'
        ? {
            filler_frogFragOut: 'Color',
          }
        : {
            filler_gl_Position: 'Position',
          },
    strategies: [
      assignemntToStrategy(
        stage === 'fragment' ? 'frogFragOut' : 'gl_Position'
      ),
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
});

export const expressionNode = (
  id: string,
  name: string,
  position: NodePosition,
  source: string
): CodeNode => ({
  id,
  name,
  position,
  type: NodeType.SOURCE,
  expressionOnly: true,
  groupId: undefined,
  stage: undefined,
  config: {
    uniforms: [],
    version: 3,
    preprocess: false,
    inputMapping: {},
    strategies: [variableStrategy()],
  },
  inputs: [],
  outputs: [
    {
      name: 'expression',
      category: 'data',
      id: '1',
    },
  ],
  source,
});

export const phongNode = (
  id: string,
  name: string,
  groupId: string,
  position: NodePosition,
  stage: ShaderStage,
  nextStageNodeId?: string
): CodeNode =>
  prepopulatePropertyInputs({
    id,
    name,
    groupId,
    position,
    type: EngineNodeType.phong,
    config: {
      version: 3,
      uniforms: [],
      preprocess: true,
      mangle: false,
      properties: [
        property('Color', 'color', 'rgb', 'uniform_diffuse'),
        property('Emissive', 'emissive', 'rgb', 'uniform_emissive'),
        property(
          'Emissive Map',
          'emissiveMap',
          'texture',
          'filler_emissiveMap'
        ),
        property(
          'Emissive Intensity',
          'emissiveIntensity',
          'number',
          'uniform_emissive'
        ),
        property('Texture', 'map', 'texture', 'filler_map'),
        property('Normal Map', 'normalMap', 'texture', 'filler_normalMap'),
        property('Normal Scale', 'normalScale', 'vector2'),
        property('Shininess', 'shininess', 'number'),
        property('Reflectivity', 'reflectivity', 'number'),
        property('Refraction Ratio', 'refractionRatio', 'number'),
        property('Specular', 'specular', 'rgb', 'uniform_specular'),
        property(
          'Specular Map',
          'specularMap',
          'texture',
          'filler_specularMap'
        ),
        property('Displacement Map', 'displacementMap', 'texture'),
        property('Env Map', 'envMap', 'samplerCube'),
      ],
      strategies: [
        uniformStrategy(),
        stage === 'fragment'
          ? texture2DStrategy()
          : namedAttributeStrategy('position'),
      ],
    },
    inputs: [],
    outputs: [
      {
        name: 'vector4',
        category: 'data',
        id: '1',
      },
    ],
    source: '',
    stage,
    nextStageNodeId,
  });

export const addNode = (id: string, position: NodePosition): BinaryNode => ({
  id,
  name: 'add',
  position,
  type: NodeType.BINARY,
  groupId: undefined,
  stage: undefined,
  config: {
    mangle: false,
    version: 3,
    preprocess: true,
    strategies: [],
    uniforms: [],
  },
  inputs: [],
  outputs: [
    {
      name: 'sum',
      category: 'data',
      id: '1',
    },
  ],
  source: `a + b`,
  operator: '+',
  expressionOnly: true,
  biStage: true,
});

export const multiplyNode = (
  id: string,
  position: NodePosition
): BinaryNode => ({
  id,
  name: 'multiply',
  type: NodeType.BINARY,
  groupId: undefined,
  stage: undefined,
  position,
  config: {
    version: 3,
    uniforms: [],
    mangle: false,
    preprocess: true,
    strategies: [],
  },
  inputs: [],
  outputs: [
    {
      name: 'product',
      category: 'data',
      id: '1',
    },
  ],
  source: `a * b`,
  operator: '*',
  expressionOnly: true,
  biStage: true,
});
