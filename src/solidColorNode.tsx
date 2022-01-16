import { sourceNode } from './nodestuff';

const solidColorNode = (id: string) =>
  sourceNode(
    id,
    'Solid Color',
    {},
    `
    precision highp float;
    precision highp int;

    uniform float blorf;
    
    void main() {
        gl_FragColor = vec4(vec3(1.0, 0.5, 0.7), 1.0);
    }
    
`,
    'fragment'
  );

export default solidColorNode;
