import { shaderNode } from '../nodestuff';

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

    // Calculate the real position of this pixel in 3d space, taking into account
    // the rotation and scale of the model. It's a useful formula for some effects.
    // This could also be done in the vertex shader
    vec3 worldPosition = ( modelMatrix * vec4( vPosition, 1.0 )).xyz;

    // Calculate the normal including the model rotation and scale
    vec3 worldNormal = normalize( vec3( modelMatrix * vec4( vNormal, 0.0 ) ) );

    vec3 lightVector = normalize( lightPosition - worldPosition );

    // An example simple lighting effect, taking the dot product of the normal
    // (which way this pixel is pointing) and a user generated light position
    float brightness = dot( worldNormal, lightVector );

    // Fragment shaders set the gl_FragColor, which is a vector4 of
    // ( red, green, blue, alpha ).
    gl_FragColor = vec4( color * tan(vNormal*time*time), 1.0 );

}
`,
    ''
  );

export default colorShaderNode;
