import { NodePosition } from '../core/nodes/core-node';
import { sourceNode } from '../core/nodes/engine-node';
import { uniformStrategy } from '../core/strategy';

export const variation0 = `
precision highp float;
precision highp int;
uniform float time;

varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying vec2 vUv2;

void main() {
    // Fragment shaders set the gl_FragColor, which is a vector4 of
    // ( red, green, blue, alpha ).
    gl_FragColor = vec4( tan(vNormal*time*time), 1.0 );
}
`;

export const variation1 = `
precision highp float;
precision highp int;
uniform float time;

varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying vec2 vUv2;

const float PI = 3.14159;

void main() {
    vec2 scaledUv = sin(vUv * PI);
    gl_FragColor = vec4(
        clamp(
            1.0 + vNormal * vec3(scaledUv, -scaledUv.y) * (1.0 + vec3(viewMatrix[0])),
            vec3(0.0),
            vec3(1.0)
        ),
        1.0
    );
}
`;

const staticShaderNode = (
  id: string,
  position: NodePosition,
  source = variation0
) =>
  sourceNode(
    id,
    'Static Shader',
    position,
    { version: 2, preprocess: true, strategies: [uniformStrategy()] },
    source,
    'fragment',
    'three'
  );

export default staticShaderNode;
