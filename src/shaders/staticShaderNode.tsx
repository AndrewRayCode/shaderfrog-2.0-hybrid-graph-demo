import { sourceNode } from '../core/node';

const staticShaderNode = (id: string) =>
  sourceNode(
    id,
    'Static Shader',
    { version: 2, preprocess: true, strategies: [] },
    `
/**
 * Example Fragment Shader
 * Sets the color and alpha of the pixel by setting gl_FragColor
 */
    
// Set the precision for data types used in this shader
precision highp float;
precision highp int;
uniform float time;

// Example varyings passed from the vertex shader
varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying vec2 vUv2;

void main() {
    // Fragment shaders set the gl_FragColor, which is a vector4 of
    // ( red, green, blue, alpha ).
    gl_FragColor = vec4( tan(vNormal*time*time), 1.0 );
}
`,
    'fragment',
    'three'
  );

export default staticShaderNode;
