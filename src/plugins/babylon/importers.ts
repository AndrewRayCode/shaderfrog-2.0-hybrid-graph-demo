import { renameBindings } from '@shaderfrog/glsl-parser/dist/parser/utils';
import { EngineImporters } from '../../graph';

const importers: EngineImporters = {
  three: {
    convertAst(ast, type) {
      renameBindings(ast.scopes[0], (name) =>
        name === 'vUv' ? 'vMainUV1' : name === 'vNormal' ? 'vNormalW' : name
      );
    },
  },
};

export default importers;
