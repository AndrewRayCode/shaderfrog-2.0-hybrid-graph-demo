import { ParserProgram } from '@shaderfrog/glsl-parser/dist/parser/parser';
import { renameBindings } from '@shaderfrog/glsl-parser/dist/parser/utils';
import { EngineImporters } from '../../graph';
import { ShaderStage } from '../../nodestuff';

const importers: EngineImporters = {
  babylon: {
    convertAst: (ast, type?) => {
      renameBindings(ast.scopes[0], (name) =>
        name === 'vMainUV1' ? 'vUv' : name === 'vNormalW' ? 'vNormal' : name
      );
    },
  },
};

export default importers;
