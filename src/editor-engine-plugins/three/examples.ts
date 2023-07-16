import { Graph } from '@core/graph-types';
import {
  colorNode,
  colorUniformData,
  DataNode,
  numberNode,
  numberUniformData,
  textureNode,
  textureUniformData,
  vectorUniformData,
} from '@core/nodes/data-nodes';
import { EdgeType, makeEdge } from '@core/nodes/edge';
import { outputNode } from '@core/nodes/engine-node';
import { fireFrag, fireVert } from '../../shaders/fireNode';
import {
  heatShaderFragmentNode,
  heatShaderVertexNode,
  variation1 as heatmapV1,
} from '../../shaders/heatmapShaderNode';
import purpleNoiseNode from '../../shaders/purpleNoiseNode';
import staticShaderNode, { variation1 } from '../../shaders/staticShaderNode';
import { makeId } from '../../editor-util/id';
import { checkerboardF, checkerboardV } from '../../shaders/checkboardNode';
import normalMapify from '../../shaders/normalmapifyNode';
import { CoreNode } from '@core/nodes/core-node';
import { threngine } from '@core/plugins/three/threngine';
import perlinCloudsF from '../../shaders/perlinClouds';
import sinCosVertWarp from '../../shaders/sinCosVertWarp';
import starterVertex from '../../shaders/starterNode';

export enum Example {
  GLASS_FIREBALL = 'Glass Fireball',
  GEMSTONE = 'Gemstone',
  LIVING_DIAMOND = 'Living Diamond',
  VERTEX_NOISE = 'Vertex Noise',
  TOON = 'Toon',
  EMPTY = 'Empty',
  PHYSICAL = 'Mesh Physical Material',
  DEFAULT = 'Mesh Physical Material',
}

const edgeFrom = (
  fromNode: CoreNode,
  toId: string,
  input: string,
  type?: EdgeType
) => makeEdge(makeId(), fromNode.id, toId, outFrom(fromNode), input, type);

const outFrom = (node: CoreNode) => node.outputs[0].name;

export const makeExampleGraph = (example: Example): [Graph, string, string] => {
  console.log('🌈 Making new graph!!');
  let newGraph: Graph;
  let previewObject: string;
  let bg: string = '';

  if (example === Example.GEMSTONE) {
    const outputF = outputNode(
      makeId(),
      'Output',
      { x: 434, y: -97 },
      'fragment'
    );
    const outputV = outputNode(makeId(), 'Output', { x: 434, y: 20 }, 'vertex');

    const physicalGroupId = makeId();
    const physicalF = threngine.constructors.physical(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 178, y: -103 },
      [],
      'fragment'
    );
    const physicalV = threngine.constructors.physical(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 434, y: 130 },
      [],
      'vertex',
      physicalF.id
    );
    const staticF = staticShaderNode(
      makeId(),
      { x: -196, y: -303 },
      variation1
    );
    const heatmap = heatShaderFragmentNode(
      makeId(),
      { x: -478, y: 12 },
      heatmapV1
    );
    const heatmapV = heatShaderVertexNode(makeId(), heatmap.id, {
      x: -478,
      y: -194,
    });

    const normaled = normalMapify(makeId(), { x: -178, y: -149 });
    const normalStrength = numberNode(
      makeId(),
      'Normal Strength',
      { x: -482, y: -105 },
      '1..0'
    );

    const color = colorNode(makeId(), 'Color', { x: -187, y: -413 }, [
      '1.0',
      '0.75',
      '1.0',
    ]);
    const roughness = numberNode(
      makeId(),
      'Roughness',
      { x: -187, y: 54 },
      '0.37'
    );
    const transmission = numberNode(
      makeId(),
      'Transmission',
      { x: -187, y: 153 },
      '0.5'
    );
    const thickness = numberNode(
      makeId(),
      'Thickness',
      { x: -187, y: 240 },
      '1.0'
    );
    const ior = numberNode(makeId(), 'Ior', { x: -187, y: 328 }, '2.0');

    newGraph = {
      nodes: [
        color,
        normaled,
        normalStrength,
        roughness,
        transmission,
        thickness,
        ior,
        staticF,
        heatmap,
        heatmapV,
        outputF,
        outputV,
        physicalF,
        physicalV,
      ],
      edges: [
        edgeFrom(physicalF, outputF.id, 'filler_frogFragOut', 'fragment'),
        edgeFrom(physicalV, outputV.id, 'filler_gl_Position', 'vertex'),
        edgeFrom(staticF, physicalF.id, 'property_map', 'fragment'),
        edgeFrom(color, physicalF.id, 'property_color', 'fragment'),
        edgeFrom(roughness, physicalF.id, 'property_roughness', 'fragment'),

        edgeFrom(
          transmission,
          physicalF.id,
          'property_transmission',
          'fragment'
        ),
        edgeFrom(thickness, physicalF.id, 'property_thickness', 'fragment'),
        edgeFrom(ior, physicalF.id, 'property_ior', 'fragment'),
        edgeFrom(
          normalStrength,
          normaled.id,
          'uniform_normal_strength',
          'fragment'
        ),
        edgeFrom(heatmap, normaled.id, 'filler_normal_map', 'fragment'),
        edgeFrom(
          normaled,
          physicalF.id,
          threngine.name === 'three'
            ? 'property_normalMap'
            : 'property_bumpTexture',
          'fragment'
        ),
      ],
    };
    previewObject = 'icosahedron';
    bg = 'warehouseEnvTexture';
  } else if (example === Example.TOON) {
    const outputF = outputNode(
      makeId(),
      'Output',
      { x: 434, y: -97 },
      'fragment'
    );
    const outputV = outputNode(makeId(), 'Output', { x: 434, y: 16 }, 'vertex');

    const toonGroupId = makeId();
    const toonF = threngine.constructors.toon(
      makeId(),
      'Toon',
      toonGroupId,
      { x: 178, y: -103 },
      [],
      'fragment'
    );
    const toonV = threngine.constructors.toon(
      makeId(),
      'Toon',
      toonGroupId,
      { x: 434, y: 130 },
      [],
      'vertex',
      toonF.id
    );
    const pps: [string, DataNode][] = [
      [
        'color',
        colorNode(makeId(), 'Color', { x: -153, y: -268 }, ['0', '0.7', '0']),
      ],
      [
        'gradientMap',
        textureNode(
          makeId(),
          'Gradient Map',
          { x: -153, y: -160 },
          'threeTone'
        ),
      ],
      [
        'normalMap',
        textureNode(makeId(), 'Normal Map', { x: -153, y: -50 }, 'brickNormal'),
      ],
    ];

    newGraph = {
      nodes: [outputF, outputV, toonF, toonV, ...pps.map(([, p]) => p)],
      edges: [
        edgeFrom(toonF, outputF.id, 'filler_frogFragOut', 'fragment'),
        edgeFrom(toonV, outputV.id, 'filler_gl_Position', 'vertex'),
        ...pps.map(([name, prop]) =>
          edgeFrom(prop, toonF.id, `property_${name}`, prop.type)
        ),
      ],
    };
    previewObject = 'torusknot';
    bg = '';
  } else if (example === Example.EMPTY) {
    const outputF = outputNode(
      makeId(),
      'Output',
      { x: 778, y: -75 },
      'fragment'
    );
    const outputV = outputNode(
      makeId(),
      'Output',
      { x: 778, y: 134 },
      'vertex'
    );

    const vertex = starterVertex(makeId(), { x: 434, y: 130 });

    newGraph = {
      nodes: [outputF, outputV, vertex],
      edges: [edgeFrom(vertex, outputV.id, 'filler_gl_Position', 'vertex')],
    };
    previewObject = 'sphere';
    bg = '';
  } else if (example === Example.PHYSICAL) {
    const outputF = outputNode(
      makeId(),
      'Output',
      { x: 434, y: -97 },
      'fragment'
    );
    const outputV = outputNode(makeId(), 'Output', { x: 434, y: 16 }, 'vertex');

    const physicalGroupId = makeId();
    const physicalF = threngine.constructors.physical(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 178, y: -103 },
      [],
      'fragment'
    );
    const physicalV = threngine.constructors.physical(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 434, y: 130 },
      [],
      'vertex',
      physicalF.id
    );

    const checkerboardf = checkerboardF(makeId(), { x: -162, y: -105 });
    const checkerboardv = checkerboardV(makeId(), checkerboardf.id, {
      x: -162,
      y: 43,
    });
    newGraph = {
      nodes: [
        outputF,
        outputV,
        physicalF,
        physicalV,
        checkerboardf,
        checkerboardv,
      ],
      edges: [
        edgeFrom(physicalF, outputF.id, 'filler_frogFragOut', 'fragment'),
        edgeFrom(physicalV, outputV.id, 'filler_gl_Position', 'vertex'),
        edgeFrom(
          checkerboardf,
          physicalF.id,
          threngine.name === 'three'
            ? 'property_map'
            : 'property_albedoTexture',
          'fragment'
        ),
      ],
    };
    previewObject = 'sphere';
    bg = '';
  } else if (example === Example.LIVING_DIAMOND) {
    const outputF = outputNode(
      makeId(),
      'Output',
      { x: 434, y: -97 },
      'fragment'
    );
    const outputV = outputNode(makeId(), 'Output', { x: 434, y: 16 }, 'vertex');

    const nMap = normalMapify(makeId(), { x: -185, y: 507 });

    const purpleNoise = purpleNoiseNode(makeId(), { x: -512, y: 434 }, [
      numberUniformData('speed', threngine.name === 'babylon' ? '1.0' : '0.2'),
      numberUniformData('brightnessX', '1.0'),
      numberUniformData('permutations', '10'),
      numberUniformData('iterations', '2'),
      vectorUniformData(
        'uvScale',
        threngine.name === 'babylon' ? ['0.1', '0.1'] : ['0.9', '0.9']
      ),
      vectorUniformData('color1', ['0', '1', '1']),
      vectorUniformData('color2', ['1', '0', '1']),
      vectorUniformData('color3', ['1', '1', '0']),
    ]);

    const properties = [
      numberNode(
        makeId(),
        // threngine.name === 'three' ? 'Metalness' : 'Metallic',
        'Metalness',
        { x: -185, y: -110 },
        '0.1'
      ),
      numberNode(makeId(), 'Roughness', { x: -185, y: 0 }, '0.055'),
      numberNode(
        makeId(),
        // threngine.name === 'three' ? 'Transmission' : 'Alpha',
        'Transmission',
        { x: -185, y: 110 },
        '0.9'
      ),
      // ...(threngine.name === 'three'
      //   ? [
      numberNode(makeId(), 'Thickness', { x: -185, y: 220 }, '1.1'),
      numberNode(makeId(), 'Index of Refraction', { x: -185, y: 330 }, '2.4'),
      // ]
      // : []),
    ];

    const physicalGroupId = makeId();
    const physicalF = threngine.constructors.physical(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 178, y: -103 },
      [],
      'fragment'
    );
    const physicalV = threngine.constructors.physical(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 434, y: 130 },
      [],
      'vertex',
      physicalF.id
    );

    newGraph = {
      nodes: [
        outputF,
        outputV,
        physicalF,
        physicalV,
        purpleNoise,
        nMap,
        ...properties,
      ],
      edges: [
        edgeFrom(physicalF, outputF.id, 'filler_frogFragOut', 'fragment'),
        edgeFrom(physicalV, outputV.id, 'filler_gl_Position', 'vertex'),
        edgeFrom(purpleNoise, nMap.id, 'filler_normal_map', 'fragment'),
        edgeFrom(
          nMap,
          physicalF.id,
          'property_normalMap',
          // threngine.name === 'three'
          //   ? 'property_normalMap'
          //   : 'property_bumpTexture',
          'fragment'
        ),
        ...properties.map((prop) =>
          edgeFrom(
            prop,
            physicalF.id,
            `property_${
              prop.name === 'Index of Refraction'
                ? 'ior'
                : prop.name.toLowerCase()
            }`,
            prop.type
          )
        ),
      ],
    };
    previewObject = 'icosahedron';
    bg = 'warehouseEnvTexture';
  } else if (example === Example.VERTEX_NOISE) {
    const outputF = outputNode(
      makeId(),
      'Output',
      { x: 434, y: -97 },
      'fragment'
    );
    const outputV = outputNode(makeId(), 'Output', { x: 434, y: 16 }, 'vertex');

    const vertexNoise = sinCosVertWarp(makeId(), { x: -512, y: 0 });
    const clouds = perlinCloudsF(makeId(), { x: -512, y: 434 }, [
      colorUniformData('color', ['1', '1', '1']),
      numberUniformData('scale', '0.1'),
      textureUniformData('noiseImage', 'grayscale-noise'),
      vectorUniformData('speed', ['-0.001', '-0.001']),
      numberUniformData('cloudBrightness', '0.2'),
      numberUniformData('cloudMorphSpeed', '0.2'),
      numberUniformData('cloudMorphDirection', '1'),
      numberUniformData('cloudCover', '0.65'),
    ]);

    const properties = [
      numberNode(makeId(), 'Roughness', { x: -185, y: 0 }, '0.0'),
      numberNode(makeId(), 'Transmission', { x: -200, y: 110 }, '0.9'),
      numberNode(makeId(), 'Thickness', { x: -230, y: 220 }, '1.1'),
      numberNode(makeId(), 'Index of Refraction', { x: -245, y: 330 }, '1.5', {
        range: [0, 5],
      }),
    ];

    const physicalGroupId = makeId();
    const physicalF = threngine.constructors.physical(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 178, y: -103 },
      [],
      'fragment'
    );
    const physicalV = threngine.constructors.physical(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 434, y: 130 },
      [],
      'vertex',
      physicalF.id
    );

    newGraph = {
      nodes: [
        outputF,
        outputV,
        physicalF,
        physicalV,
        clouds,
        vertexNoise,
        ...properties,
      ],
      edges: [
        edgeFrom(physicalF, outputF.id, 'filler_frogFragOut', 'fragment'),
        edgeFrom(physicalV, outputV.id, 'filler_gl_Position', 'vertex'),
        edgeFrom(clouds, physicalF.id, 'property_map', 'fragment'),
        edgeFrom(vertexNoise, physicalV.id, 'filler_position', 'vertex'),
        ...properties.map((prop) =>
          edgeFrom(
            prop,
            physicalF.id,
            `property_${
              prop.name === 'Index of Refraction'
                ? 'ior'
                : prop.name.toLowerCase()
            }`,
            prop.type
          )
        ),
      ],
    };
    previewObject = 'sphere';
    bg = 'pondCubeMap';
  } else if (example === Example.GLASS_FIREBALL) {
    const outputF = outputNode(
      makeId(),
      'Output',
      { x: 434, y: -97 },
      'fragment'
    );
    const outputV = outputNode(makeId(), 'Output', { x: 434, y: 20 }, 'vertex');

    const physicalGroupId = makeId();
    const physicalF = threngine.constructors.physical(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 178, y: -103 },
      [],
      'fragment'
    );
    const physicalV = threngine.constructors.physical(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 434, y: 130 },
      [],
      'vertex',
      physicalF.id
    );
    const fireF = fireFrag(makeId(), { x: -88, y: -120 });
    const fireV = fireVert(makeId(), fireF.id, { x: -88, y: 610 }, [
      numberUniformData('fireSpeed', '0.768'),
      numberUniformData('pulseHeight', '0.0'),
      numberUniformData('displacementHeight', '0.481'),
      numberUniformData('turbulenceDetail', '0.907'),
    ]);

    const color = colorNode(makeId(), 'Color', { x: -97, y: -223 }, [
      '1',
      '0.8',
      '0.6',
    ]);
    const roughness = numberNode(
      makeId(),
      'Roughness',
      { x: -103, y: -16 },
      '0.1'
    );
    const metalness = numberNode(
      makeId(),
      'Metalness',
      { x: -103, y: 62 },
      '0.09'
    );
    const transmission = numberNode(
      makeId(),
      'Transmission',
      { x: -103, y: 153 },
      '0.7'
    );
    const thickness = numberNode(
      makeId(),
      'Thickness',
      { x: -103, y: 240 },
      '1.0'
    );
    const ior = numberNode(makeId(), 'Ior', { x: -103, y: 328 }, '1.75');

    newGraph = {
      nodes: [
        color,
        roughness,
        metalness,
        transmission,
        thickness,
        ior,
        fireF,
        fireV,
        outputF,
        outputV,
        physicalF,
        physicalV,
      ],
      edges: [
        edgeFrom(physicalF, outputF.id, 'filler_frogFragOut', 'fragment'),
        edgeFrom(physicalV, outputV.id, 'filler_gl_Position', 'vertex'),
        edgeFrom(
          fireF,
          physicalF.id,
          // threngine.name === 'three' ? 'property_map' : 'property_albedoTexture',
          'property_map',
          'fragment'
        ),
        edgeFrom(
          color,
          physicalF.id,
          // threngine.name === 'three' ? 'property_color' : 'property_albedoColor',
          'property_color',
          'fragment'
        ),
        edgeFrom(roughness, physicalF.id, 'property_roughness', 'fragment'),
        edgeFrom(
          metalness,
          physicalF.id,
          // threngine.name === 'three' ? 'property_metalness' : 'property_metallic',
          'property_metalness',
          'fragment'
        ),
        edgeFrom(
          transmission,
          physicalF.id,
          'property_transmission',
          'fragment'
        ),
        edgeFrom(thickness, physicalF.id, 'property_thickness', 'fragment'),
        edgeFrom(ior, physicalF.id, 'property_ior', 'fragment'),

        edgeFrom(fireV, physicalV.id, 'filler_position', 'vertex'),
      ],
    };
    previewObject = 'sphere';
    bg = 'warehouseEnvTexture';
  } else {
    const outputF = outputNode(
      makeId(),
      'Output',
      { x: 434, y: -97 },
      'fragment'
    );
    const outputV = outputNode(makeId(), 'Output', { x: 434, y: 20 }, 'vertex');

    const physicalGroupId = makeId();
    const physicalF = threngine.constructors.physical(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 178, y: -103 },
      [],
      'fragment'
    );
    const physicalV = threngine.constructors.physical(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 434, y: 130 },
      [],
      'vertex',
      physicalF.id
    );

    const purpleNoise = purpleNoiseNode(makeId(), { x: -100, y: 0 });
    // const purpleNoise =
    //   threngine.name === 'babylon'
    //     ? convertNode(purple, threngine.importers.three)
    //     : purple;

    newGraph = {
      nodes: [purpleNoise, outputF, outputV, physicalF, physicalV],
      edges: [
        edgeFrom(physicalF, outputF.id, 'filler_frogFragOut', 'fragment'),
        edgeFrom(physicalV, outputV.id, 'filler_gl_Position', 'vertex'),
        edgeFrom(
          purpleNoise,
          physicalF.id,
          // threngine.name === 'three' ? 'property_map' : 'property_albedoTexture',
          'property_map',
          'fragment'
        ),
      ],
    };
    previewObject = 'torusknot';
  }

  return [newGraph, previewObject, bg];
};
