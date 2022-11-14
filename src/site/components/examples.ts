import { Graph } from '../../core/graph';
import {
  colorNode,
  DataNode,
  numberNode,
  numberUniformData,
  textureNode,
  textureUniformData,
  vectorNode,
  vectorUniformData,
} from '../../core/nodes/data-nodes';
import { makeEdge } from '../../core/nodes/edge';
import {
  outputNode,
  physicalNode,
  sourceNode,
  toonNode,
} from '../../core/nodes/engine-node';
import { fireFrag, fireVert } from '../../shaders/fireNode';
import fluidCirclesNode from '../../shaders/fluidCirclesNode';
import {
  heatShaderFragmentNode,
  heatShaderVertexNode,
  variation1 as heatmapV1,
} from '../../shaders/heatmapShaderNode';
import perlinCloudsFNode from '../../shaders/perlinClouds';
import { hellOnEarthFrag, hellOnEarthVert } from '../../shaders/hellOnEarth';
import { outlineShaderF, outlineShaderV } from '../../shaders/outlineShader';
import purpleNoiseNode from '../../shaders/purpleNoiseNode';
import solidColorNode from '../../shaders/solidColorNode';
import staticShaderNode, { variation1 } from '../../shaders/staticShaderNode';
import { makeId } from '../../util/id';
import { texture2DStrategy, uniformStrategy } from '../../core/strategy';
import { checkerboardF, checkerboardV } from '../../shaders/checkboardNode';
import normalMapify from '../../shaders/normalmapifyNode';

export enum Example {
  GLASS_FIRE_BALL = 'Glass Fireball',
  GEMSTONE = 'Gemstone',
  DIAMOND = 'Living Diamond',
  TOON = 'Toon',
  DEFAULT = 'Mesh Physical Material',
}

export const makeExampleGraph = (example: Example): [Graph, string] => {
  let newGraph: Graph;
  let previewObject: string;
  if (example === Example.GEMSTONE) {
    const outputF = outputNode(
      makeId(),
      'Output',
      { x: 434, y: -97 },
      'fragment'
    );
    const outputV = outputNode(
      makeId(),
      'Output',
      { x: 434, y: 20 },
      'vertex',
      outputF.id
    );

    const physicalGroupId = makeId();
    const physicalF = physicalNode(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 178, y: -103 },
      [],
      'fragment'
    );
    const physicalV = physicalNode(
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
        makeEdge(
          makeId(),
          physicalF.id,
          outputF.id,
          'out',
          'filler_frogFragOut',
          'fragment'
        ),
        makeEdge(
          makeId(),
          physicalV.id,
          outputV.id,
          'out',
          'filler_gl_Position',
          'vertex'
        ),
        makeEdge(
          makeId(),
          staticF.id,
          physicalF.id,
          'out',
          'property_map',
          'fragment'
        ),
        makeEdge(
          makeId(),
          color.id,
          physicalF.id,
          'out',
          'property_color',
          'fragment'
        ),
        makeEdge(
          makeId(),
          roughness.id,
          physicalF.id,
          'out',
          'property_roughness',
          'fragment'
        ),
        makeEdge(
          makeId(),
          transmission.id,
          physicalF.id,
          'out',
          'property_transmission',
          'fragment'
        ),
        makeEdge(
          makeId(),
          thickness.id,
          physicalF.id,
          'out',
          'property_thickness',
          'fragment'
        ),
        makeEdge(
          makeId(),
          ior.id,
          physicalF.id,
          'out',
          'property_ior',
          'fragment'
        ),
        makeEdge(
          makeId(),
          normalStrength.id,
          normaled.id,
          'out',
          'uniform_normal_strength',
          'fragment'
        ),
        makeEdge(
          makeId(),
          heatmap.id,
          normaled.id,
          'out',
          'filler_normal_map',
          'fragment'
        ),
        makeEdge(
          makeId(),
          normaled.id,
          physicalF.id,
          'out',
          'property_normalMap',
          'fragment'
        ),
      ],
    };
    previewObject = 'icosahedron';
  } else if (example === Example.TOON) {
    const outputF = outputNode(
      makeId(),
      'Output',
      { x: 434, y: -97 },
      'fragment'
    );
    const outputV = outputNode(
      makeId(),
      'Output',
      { x: 434, y: 16 },
      'vertex',
      outputF.id
    );

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
        makeEdge(
          makeId(),
          toonF.id,
          outputF.id,
          'out',
          'filler_frogFragOut',
          'fragment'
        ),
        makeEdge(
          makeId(),
          toonV.id,
          outputV.id,
          'out',
          'filler_gl_Position',
          'vertex'
        ),
        ...pps.map(([name, prop]) =>
          makeEdge(
            makeId(),
            prop.id,
            toonF.id,
            'out',
            `property_${name}`,
            prop.type
          )
        ),
      ],
    };
    previewObject = 'torusknot';
  } else if (example === Example.DEFAULT) {
    const outputF = outputNode(
      makeId(),
      'Output',
      { x: 434, y: -97 },
      'fragment'
    );
    const outputV = outputNode(
      makeId(),
      'Output',
      { x: 434, y: 16 },
      'vertex',
      outputF.id
    );

    const physicalGroupId = makeId();
    const physicalF = physicalNode(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 178, y: -103 },
      [],
      'fragment'
    );
    const physicalV = physicalNode(
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
        makeEdge(
          makeId(),
          physicalF.id,
          outputF.id,
          'out',
          'filler_frogFragOut',
          'fragment'
        ),
        makeEdge(
          makeId(),
          physicalV.id,
          outputV.id,
          'out',
          'filler_gl_Position',
          'vertex'
        ),
        makeEdge(
          makeId(),
          checkerboardf.id,
          physicalF.id,
          'out',
          'property_map',
          'fragment'
        ),
      ],
    };
    previewObject = 'sphere';
  } else if (example === Example.DIAMOND) {
    const outputF = outputNode(
      makeId(),
      'Output',
      { x: 434, y: -97 },
      'fragment'
    );
    const outputV = outputNode(
      makeId(),
      'Output',
      { x: 434, y: 16 },
      'vertex',
      outputF.id
    );

    const nMap = normalMapify(makeId(), { x: -185, y: 507 });

    const purple = purpleNoiseNode(makeId(), { x: -512, y: 434 }, [
      numberUniformData('speed', '0.2'),
      numberUniformData('brightnessX', '1.0'),
      numberUniformData('permutations', '10'),
      numberUniformData('iterations', '2'),
      vectorUniformData('uvScale', ['0.9', '0.9']),
      vectorUniformData('color1', ['0', '1', '1']),
      vectorUniformData('color2', ['1', '0', '1']),
      vectorUniformData('color3', ['1', '1', '0']),
    ]);

    const properties = [
      numberNode(makeId(), 'Metalness', { x: -185, y: -110 }, '0.1'),
      numberNode(makeId(), 'Roughness', { x: -185, y: 0 }, '0.055'),
      numberNode(makeId(), 'Transmission', { x: -185, y: 110 }, '0.9'),
      numberNode(makeId(), 'Thickness', { x: -185, y: 220 }, '1.1'),
      numberNode(makeId(), 'Index of Refraction', { x: -185, y: 330 }, '2.4'),
    ];

    const physicalGroupId = makeId();
    const physicalF = physicalNode(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 178, y: -103 },
      [],
      'fragment'
    );
    const physicalV = physicalNode(
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
        purple,
        nMap,
        ...properties,
      ],
      edges: [
        makeEdge(
          makeId(),
          physicalF.id,
          outputF.id,
          'out',
          'filler_frogFragOut',
          'fragment'
        ),
        makeEdge(
          makeId(),
          physicalV.id,
          outputV.id,
          'out',
          'filler_gl_Position',
          'vertex'
        ),
        makeEdge(
          makeId(),
          purple.id,
          nMap.id,
          'out',
          'filler_normal_map',
          'fragment'
        ),
        makeEdge(
          makeId(),
          nMap.id,
          physicalF.id,
          'out',
          'property_normalMap',
          'fragment'
        ),
        ...properties.map((prop) =>
          makeEdge(
            makeId(),
            prop.id,
            physicalF.id,
            'out',
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
  } else if (example === Example.GLASS_FIRE_BALL) {
    const outputF = outputNode(
      makeId(),
      'Output',
      { x: 434, y: -97 },
      'fragment'
    );
    const outputV = outputNode(
      makeId(),
      'Output',
      { x: 434, y: 20 },
      'vertex',
      outputF.id
    );

    const physicalGroupId = makeId();
    const physicalF = physicalNode(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 178, y: -103 },
      [],
      'fragment'
    );
    const physicalV = physicalNode(
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
        makeEdge(
          makeId(),
          physicalF.id,
          outputF.id,
          'out',
          'filler_frogFragOut',
          'fragment'
        ),
        makeEdge(
          makeId(),
          physicalV.id,
          outputV.id,
          'out',
          'filler_gl_Position',
          'vertex'
        ),
        makeEdge(
          makeId(),
          fireF.id,
          physicalF.id,
          'out',
          'property_map',
          'fragment'
        ),
        makeEdge(
          makeId(),
          color.id,
          physicalF.id,
          'out',
          'property_color',
          'fragment'
        ),
        makeEdge(
          makeId(),
          roughness.id,
          physicalF.id,
          'out',
          'property_roughness',
          'fragment'
        ),
        makeEdge(
          makeId(),
          metalness.id,
          physicalF.id,
          'out',
          'property_metalness',
          'fragment'
        ),
        makeEdge(
          makeId(),
          transmission.id,
          physicalF.id,
          'out',
          'property_transmission',
          'fragment'
        ),
        makeEdge(
          makeId(),
          thickness.id,
          physicalF.id,
          'out',
          'property_thickness',
          'fragment'
        ),
        makeEdge(
          makeId(),
          ior.id,
          physicalF.id,
          'out',
          'property_ior',
          'fragment'
        ),
        makeEdge(
          makeId(),
          fireV.id,
          physicalV.id,
          'out',
          'filler_position',
          'vertex'
        ),
      ],
    };
    previewObject = 'sphere';
  } else {
    const outputF = outputNode(
      makeId(),
      'Output',
      { x: 434, y: -97 },
      'fragment'
    );
    const outputV = outputNode(
      makeId(),
      'Output',
      { x: 434, y: 20 },
      'vertex',
      outputF.id
    );

    const physicalGroupId = makeId();
    const physicalF = physicalNode(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 178, y: -103 },
      [],
      'fragment'
    );
    const physicalV = physicalNode(
      makeId(),
      'Physical',
      physicalGroupId,
      { x: 434, y: 130 },
      [],
      'vertex',
      physicalF.id
    );

    const purpleNoise = purpleNoiseNode(makeId(), { x: -100, y: 0 });

    newGraph = {
      nodes: [purpleNoise, outputF, outputV, physicalF, physicalV],
      edges: [
        makeEdge(
          makeId(),
          physicalF.id,
          outputF.id,
          'out',
          'filler_frogFragOut',
          'fragment'
        ),
        makeEdge(
          makeId(),
          physicalV.id,
          outputV.id,
          'out',
          'filler_gl_Position',
          'vertex'
        ),
        makeEdge(
          makeId(),
          purpleNoise.id,
          physicalF.id,
          'out',
          'property_map',
          'fragment'
        ),
      ],
    };
    previewObject = 'torusknot';
  }
  return [newGraph, previewObject];
};
