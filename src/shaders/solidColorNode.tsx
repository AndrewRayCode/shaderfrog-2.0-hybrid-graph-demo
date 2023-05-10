import {
  texture2DStrategy,
  uniformStrategy,
} from '@shaderfrog/core/src/core/strategy';
import { sourceNode } from '@shaderfrog/core/src/core/nodes/engine-node';
import { NodePosition } from '@shaderfrog/core/src/core/nodes/core-node';

const solidColorNode = (id: string, position: NodePosition) =>
  sourceNode(
    id,
    'Solid Color',
    position,
    {
      version: 2,
      preprocess: true,
      strategies: [uniformStrategy(), texture2DStrategy()],
      uniforms: [],
    },
    `precision highp float;
precision highp int;

uniform float blorf;

void main() {
    gl_FragColor = vec4(
        vec3(blorf),
        1.0
    );
}
    
`,
    'fragment',
    'three'
  );

export default solidColorNode;
