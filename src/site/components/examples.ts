import { Graph } from '../../core/graph';
import {
  colorNode,
  DataNode,
  numberNode,
  numberUniformData,
  textureNode,
  vectorUniformData,
} from '../../core/nodes/data-nodes';
import { EdgeType, makeEdge } from '../../core/nodes/edge';
import { outputNode, toonNode } from '../../core/nodes/engine-node';
import { fireFrag, fireVert } from '../../shaders/fireNode';
import {
  heatShaderFragmentNode,
  heatShaderVertexNode,
  variation1 as heatmapV1,
} from '../../shaders/heatmapShaderNode';
import purpleNoiseNode from '../../shaders/purpleNoiseNode';
import staticShaderNode, { variation1 } from '../../shaders/staticShaderNode';
import { makeId } from '../../util/id';
import { checkerboardF, checkerboardV } from '../../shaders/checkboardNode';
import normalMapify from '../../shaders/normalmapifyNode';
import { convertNode, Engine } from '../../core/engine';
import { babylengine } from '../../plugins/babylon/bablyengine';
import { CoreNode } from '../../core/nodes/core-node';

export enum Example {
  GLASS_FIRE_BALL = 'Glass Fireball',
  GEMSTONE = 'Gemstone',
  DIAMOND = 'Living Diamond',
  TOON = 'Toon',
  DEFAULT = 'Mesh Physical Material',
}

const edgeFrom = (
  fromNode: CoreNode,
  toId: string,
  input: string,
  type?: EdgeType
) => makeEdge(makeId(), fromNode.id, toId, outFrom(fromNode), input, type);

const outFrom = (node: CoreNode) => node.outputs[0].name;

export const makeExampleGraph = (
  engine: Engine,
  example: Example
): [Graph, string, string] => {
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
    const physicalF = engine.constructors.physical(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 178, y: -103 },
      [],
      'fragment'
    );
    const physicalV = engine.constructors.physical(
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
        edgeFrom(
          staticF,
          physicalF.id,
          engine.name === 'three' ? 'property_map' : 'property_albedoTexture',
          'fragment'
        ),
        edgeFrom(
          color,
          physicalF.id,
          engine.name === 'three' ? 'property_color' : 'property_albedoColor',
          'fragment'
        ),
        edgeFrom(roughness, physicalF.id, 'property_roughness', 'fragment'),
        ...(engine.name === 'three'
          ? [
              edgeFrom(
                transmission,
                physicalF.id,
                'property_transmission',
                'fragment'
              ),
              edgeFrom(
                thickness,
                physicalF.id,
                'property_thickness',
                'fragment'
              ),
            ]
          : []),
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
          engine.name === 'three'
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
    const toonF = toonNode(
      makeId(),
      'Toon',
      toonGroupId,
      { x: 178, y: -103 },
      [],
      'fragment'
    );
    const toonV = toonNode(
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
  } else if (example === Example.DEFAULT) {
    const outputF = outputNode(
      makeId(),
      'Output',
      { x: 434, y: -97 },
      'fragment'
    );
    const outputV = outputNode(makeId(), 'Output', { x: 434, y: 16 }, 'vertex');

    const physicalGroupId = makeId();
    const physicalF = engine.constructors.physical(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 178, y: -103 },
      [],
      'fragment'
    );
    const physicalV = engine.constructors.physical(
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
          engine.name === 'three' ? 'property_map' : 'property_albedoTexture',
          'fragment'
        ),
      ],
    };
    previewObject = 'sphere';
    bg = '';
  } else if (example === Example.DIAMOND) {
    const outputF = outputNode(
      makeId(),
      'Output',
      { x: 434, y: -97 },
      'fragment'
    );
    const outputV = outputNode(makeId(), 'Output', { x: 434, y: 16 }, 'vertex');

    const nMap = normalMapify(makeId(), { x: -185, y: 507 });

    const purple = purpleNoiseNode(makeId(), { x: -512, y: 434 }, [
      numberUniformData('speed', engine.name === 'babylon' ? '1.0' : '0.2'),
      numberUniformData('brightnessX', '1.0'),
      numberUniformData('permutations', '10'),
      numberUniformData('iterations', '2'),
      vectorUniformData(
        'uvScale',
        engine.name === 'babylon' ? ['0.1', '0.1'] : ['0.9', '0.9']
      ),
      vectorUniformData('color1', ['0', '1', '1']),
      vectorUniformData('color2', ['1', '0', '1']),
      vectorUniformData('color3', ['1', '1', '0']),
    ]);
    const purpleNoise =
      engine.name === 'babylon'
        ? convertNode(purple, babylengine.importers.three)
        : purple;

    const properties = [
      numberNode(
        makeId(),
        engine.name === 'three' ? 'Metalness' : 'Metallic',
        { x: -185, y: -110 },
        '0.1'
      ),
      numberNode(makeId(), 'Roughness', { x: -185, y: 0 }, '0.055'),
      numberNode(
        makeId(),
        engine.name === 'three' ? 'Transmission' : 'Alpha',
        { x: -185, y: 110 },
        '0.9'
      ),
      ...(engine.name === 'three'
        ? [
            numberNode(makeId(), 'Thickness', { x: -185, y: 220 }, '1.1'),
            numberNode(
              makeId(),
              'Index of Refraction',
              { x: -185, y: 330 },
              '2.4'
            ),
          ]
        : []),
    ];

    const physicalGroupId = makeId();
    const physicalF = engine.constructors.physical(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 178, y: -103 },
      [],
      'fragment'
    );
    const physicalV = engine.constructors.physical(
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
          engine.name === 'three'
            ? 'property_normalMap'
            : 'property_bumpTexture',
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
  } else if (example === Example.GLASS_FIRE_BALL) {
    const outputF = outputNode(
      makeId(),
      'Output',
      { x: 434, y: -97 },
      'fragment'
    );
    const outputV = outputNode(makeId(), 'Output', { x: 434, y: 20 }, 'vertex');

    const physicalGroupId = makeId();
    const physicalF = engine.constructors.physical(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 178, y: -103 },
      [],
      'fragment'
    );
    const physicalV = engine.constructors.physical(
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
          engine.name === 'three' ? 'property_map' : 'property_albedoTexture',
          'fragment'
        ),
        edgeFrom(
          color,
          physicalF.id,
          engine.name === 'three' ? 'property_color' : 'property_albedoColor',
          'fragment'
        ),
        edgeFrom(roughness, physicalF.id, 'property_roughness', 'fragment'),
        edgeFrom(
          metalness,
          physicalF.id,
          engine.name === 'three' ? 'property_metalness' : 'property_metallic',
          'fragment'
        ),
        ...(engine.name === 'three'
          ? [
              edgeFrom(
                transmission,
                physicalF.id,
                'property_transmission',
                'fragment'
              ),
              edgeFrom(
                thickness,
                physicalF.id,
                'property_thickness',
                'fragment'
              ),
              edgeFrom(ior, physicalF.id, 'property_ior', 'fragment'),
            ]
          : []),
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
    const physicalF = engine.constructors.physical(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 178, y: -103 },
      [],
      'fragment'
    );
    const physicalV = engine.constructors.physical(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 434, y: 130 },
      [],
      'vertex',
      physicalF.id
    );

    const purple = purpleNoiseNode(makeId(), { x: -100, y: 0 });
    const purpleNoise =
      engine.name === 'babylon'
        ? convertNode(purple, babylengine.importers.three)
        : purple;

    newGraph = {
      nodes: [purpleNoise, outputF, outputV, physicalF, physicalV],
      edges: [
        edgeFrom(physicalF, outputF.id, 'filler_frogFragOut', 'fragment'),
        edgeFrom(physicalV, outputV.id, 'filler_gl_Position', 'vertex'),
        edgeFrom(
          purpleNoise,
          physicalF.id,
          engine.name === 'three' ? 'property_map' : 'property_albedoTexture',
          'fragment'
        ),
      ],
    };
    previewObject = 'torusknot';
  }
  return [newGraph, previewObject, bg];
};
