import { NodePosition } from '../core/nodes/core-node';
import { samplerCubeUniformData } from '../core/nodes/data-nodes';
import { sourceNode } from '../core/nodes/engine-node';
import { uniformStrategy } from '../core/strategy';

const cubemapReflectionF = (id: string, position: NodePosition) =>
  sourceNode(
    id,
    'cubemapReflection',
    position,
    {
      version: 2,
      preprocess: true,
      strategies: [uniformStrategy()],
      uniforms: [samplerCubeUniformData('reflectionSampler', 'pondCubeMap')],
    },
    `
precision highp float;
precision highp int;

varying vec3 vReflect;

uniform float mirrorReflection;
uniform samplerCube reflectionSampler;

void main() {
    vec4 cubeColor = texture( reflectionSampler, vReflect );
    gl_FragColor = vec4(cubeColor.rgb, 1.0);
}
`,
    'fragment',
    'three'
  );

const cubemapReflectionV = (
  id: string,
  nextStageNodeId: string,
  position: NodePosition
) =>
  sourceNode(
    id,
    'cubemapReflection',
    position,
    {
      version: 2,
      preprocess: true,
      strategies: [uniformStrategy()],
      uniforms: [],
    },
    `
precision highp float;
precision highp int;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat3 normalMatrix;
uniform vec3 cameraPosition;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
attribute vec2 uv2;

varying vec3 vReflect;

void main() {
    vec3 worldPosition = ( modelMatrix * vec4( position, 1.0 )).xyz;
    vec3 cameraToVertex = normalize( worldPosition - cameraPosition );
    vec3 worldNormal = normalize(
        mat3( modelMatrix[ 0 ].xyz, modelMatrix[ 1 ].xyz, modelMatrix[ 2 ].xyz ) * normal
    );
    vReflect = reflect( cameraToVertex, worldNormal );
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
    'vertex',
    'three',
    nextStageNodeId
  );

export { cubemapReflectionF, cubemapReflectionV };
