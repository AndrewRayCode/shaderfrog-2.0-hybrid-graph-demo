import { generate } from '@shaderfrog/glsl-parser';
import { useEffect, useRef, useState } from 'react';
import * as three from 'three';
import {
  outputNode,
  shaderNode,
  Graph,
  shaderSectionsToAst,
  ShaderType,
} from './nodestuff';
import { compileGraph, Engine, NodeParsers } from './graph';

import { phongNode, threngine } from './threngine';

const width = 600;
const height = 600;

type EngineContext = {
  fragmentPreprocessed?: string;
  fragmentSource?: string;
  renderer: any;
  nodes: { [nodeId: string]: {} };
};

const graph: Graph = {
  nodes: [
    outputNode('1', {}),
    phongNode('2', 'Phong', {}),
    shaderNode(
      '3',
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
    ),
    shaderNode(
      '4',
      'Noise Shader',
      {},
      `
precision highp float;
precision highp int;

// (sqrt(5) - 1)/4 = F4, used once below
#define F4 0.309016994374947451
#define PI 3.14159

uniform float time;
uniform float permutations;
uniform float iterations;
uniform vec2 uvScale;
uniform vec3 color1;
uniform vec3 color2;
uniform vec3 color3;
uniform float brightnessX;
uniform float speed;

varying vec2 vUv;

// Description : Array and textureless GLSL 2D/3D/4D simplex
//               noise functions.
//      Author : Ian McEwan, Ashima Arts.
//  Maintainer : ijm
//     Lastmod : 20110822 (ijm)
//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
//               Distributed under the MIT License. See LICENSE file.
//               https://github.com/ashima/webgl-noise
//

vec4 mod289(vec4 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

float mod289(float x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
    return mod289(((x*34.0)+1.0)*x);
}

float permute(float x) {
    return mod289(((x*34.0)+1.0)*x);
}

vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
}

float taylorInvSqrt(float r) {
    return 1.79284291400159 - 0.85373472095314 * r;
}

vec4 grad4(float j, vec4 ip) {
    const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
    vec4 p,s;

    p.xyz = floor( fract (vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
    p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
    s = vec4(lessThan(p, vec4(0.0)));
    p.xyz = p.xyz + (s.xyz*2.0 - 1.0) * s.www;

    return p;
}

float snoise(vec4 v) {
    const vec4  C = vec4( 0.138196601125011,  // (5 - sqrt(5))/20  G4
            0.276393202250021,  // 2 * G4
            0.414589803375032,  // 3 * G4
            -0.447213595499958); // -1 + 4 * G4

    // First corner
    vec4 i  = floor(v + dot(v, vec4(F4)) );
    vec4 x0 = v -   i + dot(i, C.xxxx);

    // Other corners

    // Rank sorting originally contributed by Bill Licea-Kane, AMD (formerly ATI)
    vec4 i0;
    vec3 isX = step( x0.yzw, x0.xxx );
    vec3 isYZ = step( x0.zww, x0.yyz );
    //  i0.x = dot( isX, vec3( 1.0 ) );
    i0.x = isX.x + isX.y + isX.z;
    i0.yzw = 1.0 - isX;
    //  i0.y += dot( isYZ.xy, vec2( 1.0 ) );
    i0.y += isYZ.x + isYZ.y;
    i0.zw += 1.0 - isYZ.xy;
    i0.z += isYZ.z;
    i0.w += 1.0 - isYZ.z;

    // i0 now contains the unique values 0,1,2,3 in each channel
    vec4 i3 = clamp( i0, 0.0, 1.0 );
    vec4 i2 = clamp( i0-1.0, 0.0, 1.0 );
    vec4 i1 = clamp( i0-2.0, 0.0, 1.0 );

    //  x0 = x0 - 0.0 + 0.0 * C.xxxx
    //  x1 = x0 - i1  + 1.0 * C.xxxx
    //  x2 = x0 - i2  + 2.0 * C.xxxx
    //  x3 = x0 - i3  + 3.0 * C.xxxx
    //  x4 = x0 - 1.0 + 4.0 * C.xxxx
    vec4 x1 = x0 - i1 + C.xxxx;
    vec4 x2 = x0 - i2 + C.yyyy;
    vec4 x3 = x0 - i3 + C.zzzz;
    vec4 x4 = x0 + C.wwww;

    // Permutations
    i = mod289(i);
    float j0 = permute( permute( permute( permute(i.w) + i.z) + i.y) + i.x);
    vec4 j1 = permute( permute( permute( permute (
                        i.w + vec4(i1.w, i2.w, i3.w, 1.0 ))
                    + i.z + vec4(i1.z, i2.z, i3.z, 1.0 ))
                + i.y + vec4(i1.y, i2.y, i3.y, 1.0 ))
            + i.x + vec4(i1.x, i2.x, i3.x, 1.0 ));

    // Gradients: 7x7x6 points over a cube, mapped onto a 4-cross polytope
    // 7*7*6 = 294, which is close to the ring size 17*17 = 289.
    vec4 ip = vec4(1.0/294.0, 1.0/49.0, 1.0/7.0, 0.0) ;

    vec4 p0 = grad4(j0,   ip);
    vec4 p1 = grad4(j1.x, ip);
    vec4 p2 = grad4(j1.y, ip);
    vec4 p3 = grad4(j1.z, ip);
    vec4 p4 = grad4(j1.w, ip);

    // Normalise gradients
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    p4 *= taylorInvSqrt(dot(p4,p4));

    // Mix contributions from the five corners
    vec3 m0 = max(0.6 - vec3(dot(x0,x0), dot(x1,x1), dot(x2,x2)), 0.0);
    vec2 m1 = max(0.6 - vec2(dot(x3,x3), dot(x4,x4)            ), 0.0);
    m0 = m0 * m0;
    m1 = m1 * m1;
    return (
        49.0 * ( dot(m0*m0, vec3( dot( p0, x0 ), dot( p1, x1 ), dot( p2, x2 )))
            + dot(m1*m1, vec2( dot( p3, x3 ), dot( p4, x4 ) ) ) )
    );

}

// makes a pseudorandom number between 0 and 1
float hash(float n) {
    return fract(sin(n)*93942.234);
}

// rotation matrix
mat2 m = mat2(0.6,0.8,-0.8,0.6);

// fractional brownian motion (i.e. photoshop clouds)
float fbm(vec4 p) {
    float f = 0.0;
    f += 0.5 * snoise(vec4( p.xy * m, p.zw * m ));
    p *= 2.02;
    f += 0.25 * snoise(vec4( p.xy * m, p.zw * m ));
    p *= 2.01;
    f += 0.125 * snoise(vec4( p.xy * m, p.zw * m ));
    p *= 2.03;
    f += 0.0625 * snoise(vec4( p.xy * m, p.zw * m ));
    f /= 0.9375;
    return f;
}

void main() {
    // relative coordinates
    vec2 p = vUv * uvScale;
    float elapsed = time * speed * 0.01;

    float s = vUv.x * uvScale.x;
    float t = vUv.y * uvScale.y;

    // Tiling 4d noise based on
    // https://gamedev.stackexchange.com/questions/23625/how-do-you-generate-tileable-perlin-noise/23639#23639
    float multiplier = iterations / ( 2.0 * PI );
    float nx = cos( s * 2.0 * PI ) * multiplier;
    float ny = cos( t * 2.0 * PI ) * multiplier;
    float nz = sin( s * 2.0 * PI ) * multiplier;
    float nw = sin( t * 2.0 * PI ) * multiplier;

    vec4 tile4d = vec4( nx, ny, nz, nw );

    vec2 a = vec2(
        fbm( tile4d + elapsed * 1.1 ),
        fbm( tile4d - elapsed * 1.3 )
    );

    vec2 b = vec2(
        fbm( tile4d + elapsed * 1.2 + a.x * 2.0 ),
        fbm( tile4d - elapsed * 1.2 + a.x * 3.0 )
    );

    float surf = fbm( tile4d + elapsed + length( b ) * permutations );

    // mix in some color
    vec3 colorOutput = 1.0 * brightnessX * (
        ( ( b.x + surf ) * color1 ) +
        ( ( b.y + surf ) * color2 ) +
        ( ( surf + b.x ) * color3 )
    );

    gl_FragColor = vec4( colorOutput, 1.);
}
`,
      ''
    ),
  ],
  edges: [
    { from: '2', to: '1', output: 'main', input: 'color' },
    {
      // from: '3',
      from: '4',
      to: '2',
      output: 'main',
      input: 'texture2d_0',
    },
  ],
};

type Prorps = {
  engine: Engine;
  parsers: NodeParsers;
};

const ThreeScene = ({ engine, parsers }: Prorps) => {
  const domRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>();
  const [selection, setSelection] = useState<string>('final');
  const [preprocessed, setPreprocessed] = useState<string | undefined>('');
  const [vertex, setVertex] = useState<string | undefined>('');
  const [original, setOriginal] = useState<string | undefined>('');
  const [text, setText] = useState<string | undefined>('');

  useEffect(() => {
    const scene = new three.Scene();
    const camera = new three.PerspectiveCamera(75, 1 / 1, 0.1, 1000);
    camera.position.set(0, 0, 2);
    camera.lookAt(0, 0, 0);
    scene.add(camera);

    let uniforms;
    const material = new three.MeshPhongMaterial({
      color: 0x222222,
      map: new three.Texture(),
    });
    const geometry = new three.SphereBufferGeometry(0.5, 32, 32);
    const mesh = new three.Mesh(geometry, material);
    scene.add(mesh);

    const light = new three.PointLight(0xffffff);
    light.position.set(0, 0, 4);
    scene.add(light);

    const helper = new three.PointLightHelper(light, 1);
    scene.add(helper);

    const ambientLight = new three.AmbientLight(0x222222);
    scene.add(ambientLight);

    const renderer = new three.WebGLRenderer();
    renderer.setSize(width, height);
    if (domRef.current) {
      domRef.current.appendChild(renderer.domElement);
    }

    const animate = (time: number) => {
      renderer.render(scene, camera);
      mesh.rotation.x = time * 0.0003;
      mesh.rotation.y = time * -0.0003;
      mesh.rotation.z = time * 0.0003;
      light.position.x = 4.0 * Math.sin(time * 0.001);
      // @ts-ignore
      if (mesh.material.uniforms.time) {
        mesh.material.uniforms.time.value = time * 0.001;
      }
      requestRef.current = requestAnimationFrame(animate);
    };

    const engineContext: EngineContext = {
      renderer,
      nodes: {},
    };

    renderer.compile(scene, camera);
    engineContext.nodes['2'] = {
      fragment: renderer.properties.get(mesh.material).programs.values().next()
        .value.fragmentShader,
      vertex: renderer.properties.get(mesh.material).programs.values().next()
        .value.vertexShader,
      // console.log('vertexProgram', vertexProgram);
    };
    console.log('engineContext', engineContext);
    const result = compileGraph(engineContext, threngine, graph);

    const fragmentResult = generate(shaderSectionsToAst(result).program);
    setText(fragmentResult);

    setPreprocessed(engineContext.fragmentPreprocessed);
    setOriginal(engineContext.fragmentSource);

    // TODO: Right now the three shader doesn't output vPosition, and it's not
    // supported by shaderfrog to merge outputs in vertex shaders yet
    const vertex = renderer
      .getContext()
      .getShaderSource(engineContext.nodes['2'].vertex)
      ?.replace(
        'attribute vec3 position;',
        'attribute vec3 position; varying vec3 vPosition;'
      )
      .replace('void main() {', 'void main() {\nvPosition = position;\n');

    setVertex(vertex);

    console.log('oh hai birfday boi boi boiiiii');

    // the before code
    const newMat = new three.RawShaderMaterial({
      name: 'ShaderFrog Phong Material',
      lights: true,
      uniforms: {
        ...three.ShaderLib.phong.uniforms,
        diffuse: { value: new three.Color(0x333333) },
        image: { value: new three.TextureLoader().load('/contrast-noise.png') },
        time: { value: 0 },
        color: { value: new three.Color(0xffffff) },
        brightnessX_4: { value: 1 },
        resolution: { value: 0.5 },
        speed: { value: 3 },
        lightPosition: { value: new three.Vector3(10, 10, 10) },

        permutations_4: { value: 10 },
        iterations_4: { value: 1 },
        uvScale_4: { value: new three.Vector2(1, 1) },
        color1_4: { value: new three.Vector3(0.7, 0.3, 0.8) },
        color2_4: { value: new three.Vector3(0.1, 0.2, 0.9) },
        color3_4: { value: new three.Vector3(0.8, 0.3, 0.8) },
        // opacity: { value: 1 },
      },
      vertexShader: vertex,
      fragmentShader: fragmentResult,

      // @ts-ignore`
      // onBeforeCompile: (shader) => {
      //   shader.uniforms = {
      //     ...three.ShaderLib.phong.uniforms,
      //     ...shader.uniforms,
      //   };

      //   // console.log(
      //   //   'three.ShaderLib.phong.uniforms',
      //   //   three.ShaderLib.phong.uniforms
      //   // );
      //   shader.fragmentShader = addMainFunctions(fragmentSource, frag);
      //   setText(shader.fragmentShader || 'oh god no');
      //   shader.vertexShader = vertexSource;
      // },
    });

    // @ts-ignore
    mesh.material = newMat;

    const { current } = domRef;
    animate(0);

    return () => {
      if (current) {
        current.removeChild(renderer.domElement);
      }
      if (typeof requestRef.current === 'number') {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [setText]);

  return (
    <div>
      <textarea
        readOnly
        style={{
          position: 'absolute',
          top: 0,
          left: width,
          height: '100%',
          width: '400px',
          display: selection === 'vertex' ? '' : 'none',
        }}
        value={vertex}
      ></textarea>
      <textarea
        readOnly
        style={{
          position: 'absolute',
          top: 0,
          left: width,
          height: '100%',
          width: '400px',
          display: selection === 'original' ? '' : 'none',
        }}
        value={original}
      ></textarea>
      <textarea
        readOnly
        style={{
          position: 'absolute',
          top: 0,
          left: width,
          height: '100%',
          width: '400px',
          display: selection === 'preprocessed' ? '' : 'none',
        }}
        value={preprocessed}
      ></textarea>
      <textarea
        readOnly
        style={{
          position: 'absolute',
          top: 0,
          left: width,
          height: '100%',
          width: '400px',
          display: selection === 'original' ? '' : 'none',
        }}
        value={original}
      ></textarea>
      <textarea
        readOnly
        style={{
          position: 'absolute',
          top: 0,
          left: width,
          height: '100%',
          width: '400px',
          display: selection === 'final' ? '' : 'none',
        }}
        value={text}
      ></textarea>
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: width,
        }}
      >
        <button
          disabled={selection === 'vertex'}
          onClick={() => setSelection('vertex')}
        >
          Vertex
        </button>
        <button
          disabled={selection === 'original'}
          onClick={() => setSelection('original')}
        >
          Original
        </button>
        <button
          disabled={selection === 'preprocessed'}
          onClick={() => setSelection('preprocessed')}
        >
          Preprocessed
        </button>
        <button
          disabled={selection === 'final'}
          onClick={() => setSelection('final')}
        >
          Final
        </button>
      </div>
      <div
        style={{ width: `${width}px`, height: `${height}px` }}
        ref={domRef}
      ></div>
    </div>
  );
};

export default ThreeScene;
