import { shaderNode } from './nodestuff';

const colorShaderNode = (id: string) =>
  shaderNode(
    id,
    'Color Shader',
    {},
    `
/**
 * Example Fragment Shader
 * Sets the color and alpha of the pixel by setting gl_FragColor
 */
    
// Set the precision for data types used in this shader
precision highp float;
precision highp int;

// Default THREE.js uniforms available to both fragment and vertex shader
uniform mat4 modelMatrix;
//  uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
//  uniform mat4 viewMatrix;
uniform mat3 normalMatrix;

// Default uniforms provided by ShaderFrog.
//  uniform vec3 cameraPosition;
uniform float time;

// A uniform unique to this shader. You can modify it to the using the form
// below the shader preview. Any uniform you add is automatically given a form
uniform vec3 color;
uniform vec3 lightPosition;

// Example varyings passed from the vertex shader
varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying vec2 vUv2;

void main() {
    // Fragment shaders set the gl_FragColor, which is a vector4 of
    // ( red, green, blue, alpha ).
    gl_FragColor = vec4( color * tan(vNormal*time*time), 1.0 );
}
`,
    ''
  );

export default colorShaderNode;
