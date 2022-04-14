import { StrategyType } from '../core/strategy';
import { sourceNode } from '../core/node';

const solidColorNode = (id: string) =>
  sourceNode(
    id,
    'Solid Color',
    {
      version: 2,
      preprocess: true,
      strategies: [
        {
          type: StrategyType.TEXTURE_2D,
          config: {},
        },
      ],
    },
    `precision highp float;
precision highp int;

uniform vec4 kev;
uniform sampler2D image;
uniform float blorf;
varying vec2 vUv;

void main() {
    gl_FragColor = vec4(kev.rgb + texture2D(image, vUv).rgb, 1.0);
}`,
    'fragment',
    'three'
  );

export default solidColorNode;
