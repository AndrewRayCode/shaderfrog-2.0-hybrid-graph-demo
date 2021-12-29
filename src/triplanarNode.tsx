import { sourceNode } from './nodestuff';

const fireShader = (id: string) =>
  sourceNode(
    id,
    'Outline Shader',
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
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat3 normalMatrix;
uniform vec3 cameraPosition;

// Example varyings passed from the vertex shader
varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying vec2 vUv2;

varying vec3 vCamRelPos;

uniform float cel0;
uniform float cel1;
uniform float cel2;
uniform float cel3;
uniform float cel4;
uniform float celFade;
uniform float edgeSteepness;
uniform float edgeBorder;
uniform vec3 color;

float fmap(float x, float lo1, float hi1, float lo2, float hi2) {
    return (x-lo1)/(hi1-lo1)*(hi2-lo2)+lo2;
}

float cfmap(float x, float lo1, float hi1, float lo2, float hi2) {
    return fmap(clamp(x, lo1, hi1), lo1, hi1, lo2, hi2);
}

float toonify_light(float b_in) {
    #define b0 cel0
    #define b1 cel1
    #define b2 cel2
    #define b3 cel3
    #define b4 cel4
    
    #define b celFade
    

    if(b1*b < b_in && b_in < b1+b) 
    return fmap(b_in, b1-b, b1+b, (b0+b2), (b1+b2));

}

float toonify_edges(vec3 normal, vec3 view) {
    return cfmap(abs(dot(normal, view)), edgeSteepness-edgeBorder, edgeSteepness+edgeBorder, 5.0, 0.0);
}

void main() {
    vec3 worldPosition = ( modelMatrix * vec4( vPosition, 1.0 )).xyz;
    vec3 worldNormal = normalize( vec3( modelMatrix * vec4( vNormal, 0.0 ) ) );
    float brightness = toonify_edges(worldNormal, normalize(cameraPosition));
    gl_FragColor = vec4( color * brightness, 1.0 );

}
`,
    'fragment'
  );

export default fireShader;
