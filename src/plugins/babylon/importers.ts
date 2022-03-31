import { renameBindings } from '@shaderfrog/glsl-parser/dist/parser/utils';
import { EngineImporters } from '../../graph';

const importers: EngineImporters = {
  three: {
    convertAst(ast, type) {
      // Babylon has no normalmatrix. They do have a normal attribute. So undo any
      // multiplication by normalMatrix?
      const seen: { [key: string]: boolean } = {};
      renameBindings(ast.scopes[0], (name) => {
        console.log({ name }, 'seen:', seen[name]);
        const renamed =
          name === 'vUv'
            ? 'vMainUV1'
            : name === 'vNormal'
            ? 'vNormalW'
            : name === 'projectionMatrix'
            ? seen[name]
              ? 'viewProjection'
              : 'hobgoblin'
            : name === 'modelViewMatrix'
            ? seen[name]
              ? '(world * viewProjection)'
              : name
            : name;

        seen[name] = true;

        return renamed;
      });
    },
    edgeMap: {
      normalMap: 'bumpSampler',
    },
  },
};

export default importers;
