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
        },
      ],
    },
    `
    precision highp float;
    precision highp int;

    uniform float blorf;
    
    void main() {
        gl_FragColor = vec4(vec3(1.0, 0.5, 0.7), 1.0);
    }
    
`,
    'fragment',
    'three'
  );

export default solidColorNode;
