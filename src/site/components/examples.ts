import { Graph } from '../../core/graph';
import {
  colorNode,
  numberNode,
  numberUniformData,
} from '../../core/nodes/data-nodes';
import { makeEdge } from '../../core/nodes/edge';
import {
  outputNode,
  physicalNode,
  sourceNode,
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

export enum Example {
  GLASS_FIRE_BALL = 'Glass Fireball',
  GEMSTONE = 'Gemstone',
  ALL_NODES_TOGETHER = 'All Example Nodes',
}

const normaledSource = `
uniform sampler2D normal_map;
uniform float normal_strength;
varying vec2 vUv;

void main() {
  gl_FragColor = vec4(normal_strength * texture2D(normal_map, vUv).rgb, 1.0);
}
`;

export const makeExampleGraph = (example: Example): [Graph, string] => {
  let newGraph, previewObject;
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

    const normaled = sourceNode(
      makeId(),
      'Normal Map-ify',
      { x: -178, y: -149 },
      {
        version: 2,
        preprocess: true,
        strategies: [uniformStrategy(), texture2DStrategy()],
      },
      normaledSource,
      'fragment',
      'three'
    );
    const normalStrength = numberNode(
      makeId(),
      'Normal Strength',
      { x: -482, y: -105 },
      '1..0'
    );

    const color = colorNode(makeId(), 'Color (rgb)', { x: -187, y: -413 }, [
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
  } else if (example === Example.ALL_NODES_TOGETHER) {
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

    // const phongGroupId = makeId();
    // const phongF = phongNode(makeId(), 'Phong', phongGroupId, 'fragment');
    // const phongV = phongNode(
    //   makeId(),
    //   'Phong',
    //   phongGroupId,
    //   'vertex',
    //   phongF.id
    // );

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

    // const toonGroupId = makeId();
    // const toonF = toonNode(makeId(), 'Toon', toonGroupId, 'fragment');
    // const toonV = toonNode(makeId(), 'Toon', toonGroupId, 'vertex', toonF.id);

    let y = -400;
    const nextY = () => {
      let ret = y;
      y += 250;
      return ret;
    };
    const fluidF = fluidCirclesNode(makeId(), { x: -250, y: nextY() });
    const staticShader = staticShaderNode(makeId(), { x: -250, y: nextY() });
    const purpleNoise = purpleNoiseNode(makeId(), { x: -250, y: nextY() });
    const heatShaderF = heatShaderFragmentNode(makeId(), {
      x: -250,
      y: nextY(),
    });
    const heatShaderV = heatShaderVertexNode(makeId(), heatShaderF.id, {
      x: -250,
      y: nextY(),
    });
    const fireF = fireFrag(makeId(), { x: -250, y: nextY() });
    const fireV = fireVert(makeId(), fireF.id, { x: -250, y: nextY() });
    const outlineF = outlineShaderF(makeId(), { x: -250, y: nextY() });
    const outlineV = outlineShaderV(makeId(), outlineF.id, {
      x: -250,
      y: nextY(),
    });
    const solidColorF = solidColorNode(makeId(), { x: -250, y: nextY() });
    const hellOnEarthF = hellOnEarthFrag(makeId(), { x: -250, y: nextY() });
    const hellOnEarthV = hellOnEarthVert(makeId(), hellOnEarthF.id, {
      x: -250,
      y: nextY(),
    });
    const perlinCloudsF = perlinCloudsFNode(makeId(), { x: -250, y: nextY() });

    newGraph = {
      nodes: [
        physicalF,
        physicalV,
        solidColorF,
        fireF,
        fireV,
        fluidF,
        outputF,
        outputV,
        outlineF,
        outlineV,
        hellOnEarthF,
        hellOnEarthV,
        perlinCloudsF,
        purpleNoise,
        heatShaderF,
        heatShaderV,
        staticShader,
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
        // makeEdge(
        //   makeId(),
        //   transmissionNumber.id,
        //   physicalF.id,
        //   'out',
        //   'property_transmission',
        //   'fragment'
        // ),
      ],
    };
    previewObject = 'sphere';
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

    const color = colorNode(makeId(), 'Color (rgb)', { x: -97, y: -223 }, [
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
