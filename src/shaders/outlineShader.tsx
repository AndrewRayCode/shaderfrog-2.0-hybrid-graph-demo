import { sourceNode } from '../core/nodes/engine-node';

const outlineShaderF = (id: string) =>
  sourceNode(
    id,
    'Outline Shader',
    { version: 2, preprocess: true, strategies: [] },
    `
precision highp float;

uniform vec3 color;
uniform float start;
uniform float end;
uniform float alpha;

varying vec3 fPosition;
varying vec3 fNormal;

void main()
{
    vec3 normal = normalize(fNormal);
    vec3 eye = normalize(-fPosition.xyz);
    float rim = smoothstep(start, end, 1.0 - dot(normal, eye));
    gl_FragColor = vec4( clamp(rim, 0.0, 1.0) * alpha * color, 1.0 );
}
`,
    'fragment'
  );

const outlineShaderV = (id: string, nextStageNodeId: string) =>
  sourceNode(
    id,
    'Outline Shader',
    { version: 2, preprocess: true, strategies: [] },
    `
precision highp float;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
attribute vec2 uv2;

uniform mat3 normalMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

varying vec3 fNormal;
varying vec3 fPosition;
varying vec2 fUv;

void main()
{
    fNormal = normalize(normalMatrix * normal);
    vec4 pos = modelViewMatrix * vec4(position, 1.0);
    fPosition = pos.xyz;
    fUv = uv;
    gl_Position = projectionMatrix * pos;
}
`,
    'vertex',
    'three',
    nextStageNodeId
  );

// TODO: The outline shader above doesn't work because it doesn't find the
// position to return. One option now is to use the "returns position?"
// checkbox on shaders. Another is to walk back n steps from the gl_Position
// line until a vec() call is found.
export { outlineShaderF, outlineShaderV };
