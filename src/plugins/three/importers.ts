import { renameBindings } from '@shaderfrog/glsl-parser/parser/utils';
import { EngineImporters } from '../../core/engine';

const importers: EngineImporters = {
  babylon: {
    convertAst: (ast, type?) => {
      renameBindings(ast.scopes[0], (name) =>
        name === 'vMainUV1' ? 'vUv' : name === 'vNormalW' ? 'vNormal' : name
      );
    },
    nodeInputMap: {},
    edgeMap: {
      bumpSampler: 'normalMap',
    },
  },
};

export default importers;
