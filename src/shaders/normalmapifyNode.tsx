import { NodePosition } from '@core/core/nodes/core-node';
import {
  numberUniformData,
  UniformDataType,
} from '@core/core/nodes/data-nodes';
import { sourceNode } from '@core/core/nodes/engine-node';
import { texture2DStrategy, uniformStrategy } from '@core/core/strategy';

const normalMapify = (id: string, position: NodePosition) =>
  sourceNode(
    id,
    'Normal Map-ify',
    position,
    {
      version: 2,
      preprocess: true,
      strategies: [uniformStrategy(), texture2DStrategy()],
      uniforms: [numberUniformData('normal_strength', '1.0')],
    },
    `
uniform sampler2D normal_map;
uniform float normal_strength;
varying vec2 vUv;

void main() {
  gl_FragColor = vec4(vec3(0.5, 0.5, 1.0) + normal_strength * texture2D(normal_map, vUv).rgb, 1.0);
}
`,
    'fragment',
    'three'
  );

export default normalMapify;
