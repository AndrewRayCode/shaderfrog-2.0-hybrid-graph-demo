import { renameBindings } from '@shaderfrog/glsl-parser/parser/utils';
import { EngineImporters } from '../../core/engine';

const importers: EngineImporters = {
  three: {
    // TODO: For hell:
    // the renames below don't really work, the "seen" thing is confusing - I
    // don't remember why I did that - is that to avoid renaming the original
    // declaration? the original declaraitons need to be renamed or stripped
    // from the original shader and the right imports added
    //
    // Also need to show babylon compile errors in the UI
    convertAst(ast, type) {
      // Babylon has no normalmatrix. They do have a normal attribute. So undo any
      // multiplication by normalMatrix?
      const seen: Record<string, boolean> = {};
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
            : name === 'modelMatrix'
            ? seen[name]
              ? 'world'
              : name
            : name === 'modelViewMatrix'
            ? seen[name]
              ? '(world * viewProjection)'
              : name
            : name === 'vPosition'
            ? seen[name]
              ? 'vPositionW'
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
