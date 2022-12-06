/**
 * Categorizing / deduping parts of shaders to help merge them together
 */
import {
  AstNode,
  DeclarationStatementNode,
  PreprocessorNode,
} from '@shaderfrog/glsl-parser/ast';
import { generate } from '@shaderfrog/glsl-parser';
import { makeStatement } from './manipulate';
import { Program } from '@shaderfrog/glsl-parser/ast';
export interface ShaderSections {
  precision: DeclarationStatementNode[];
  version: AstNode[];
  preprocessor: PreprocessorNode[];
  structs: AstNode[];
  inStatements: DeclarationStatementNode[];
  outStatements: DeclarationStatementNode[];
  uniforms: DeclarationStatementNode[];
  program: AstNode[];
}

export const emptyShaderSections = (): ShaderSections => ({
  precision: [],
  preprocessor: [],
  version: [],
  structs: [],
  program: [],
  inStatements: [],
  outStatements: [],
  uniforms: [],
});

enum Precision {
  highp = 2,
  mediump = 1,
  lowp = 0,
}

export const higherPrecision = (p1: Precision, p2: Precision): Precision =>
  Precision[p1] > Precision[p2] ? p1 : p2;

export const dedupeVersions = (nodes: AstNode[]): AstNode => nodes[0];
export const highestPrecisions = (
  nodes: DeclarationStatementNode[]
): DeclarationStatementNode[] =>
  Object.entries(
    nodes.reduce(
      (precisions, stmt) => ({
        ...precisions,
        // Like "float"
        [stmt.declaration.specifier.specifier.token]: higherPrecision(
          precisions[stmt.declaration.specifier.specifier.token],
          stmt.declaration.qualifier.token
        ),
      }),
      {} as { [type: string]: Precision }
    )
  ).map(
    ([typeName, precision]) =>
      makeStatement(
        `precision ${precision} ${typeName}`
      ) as DeclarationStatementNode
  );

export const dedupeQualifiedStatements = (
  statements: DeclarationStatementNode[],
  qualifier: string
): any =>
  Object.entries(
    statements.reduce(
      (stmts, stmt) => ({
        ...stmts,
        // Like "vec2"
        [stmt.declaration.specified_type.specifier.specifier.token]: {
          ...(stmts[
            stmt.declaration.specified_type.specifier.specifier.token
          ] || {}),
          ...stmt.declaration.declarations.reduce(
            (types: { [typeName: string]: string }, decl: any) => ({
              ...types,
              [decl.identifier.identifier]: true,
            }),
            {} as { [typeName: string]: string }
          ),
        },
      }),
      {} as { [key: string]: AstNode }
    )
  ).map(([type, varNames]) =>
    makeStatement(`${qualifier} ${type} ${Object.keys(varNames).join(', ')}`)
  );

type UniformName = Record<string, { generated: string; hasInterface: boolean }>;
type UniformGroup = Record<string, UniformName>;

/**
 * Merge uniforms together into lists of identifiers under the same type.
 * There's special case handling for mixing of uniforms with "interface blocks"
 * and those without when merging to make sure the interface block definition is
 * preserved. Check out the tests for more.
 *
 * This function consumes uniforms as found by findShaderSections, so the
 * definitions must line up
 */
export const dedupeUniforms = (statements: DeclarationStatementNode[]): any => {
  const groupedByTypeName = Object.entries(
    statements.reduce<UniformGroup>((stmts, stmt) => {
      const { specified_type } = stmt.declaration;
      const { identifier, interface_type } = stmt.declaration;

      // This is the standard case, a uniform like "uniform vec2 x"
      if (specified_type) {
        const { specifier } = specified_type.specifier;
        // Token is for "vec2", "identifier" is for custom names like struct
        const type = (specifier.token || specifier.identifier) as string;

        // Groups uniforms into their return type, and for each type, collapses
        // uniform names into an object where the keys determine uniqueness
        // "vec2": { x: x[1] }
        const grouped = (
          stmt.declaration.declarations as any[]
        ).reduce<UniformName>(
          (types, decl) => ({
            ...types,
            // There's probably a bug here where one shader declares x[1],
            // another declares x[2], they both get collapsed under "x",
            // and one is wrong
            [decl.identifier.identifier as string]: stmts[type]?.[
              decl.identifier.identifier as string
            ]?.hasInterface
              ? stmts[type]?.[decl.identifier.identifier as string]
              : {
                  hasInterface: false,
                  generated:
                    decl.identifier.identifier +
                    (decl.quantifier
                      ? `[${decl.quantifier.specifiers[0].expression.token}]`
                      : ''),
                },
          }),
          {}
        );

        return {
          ...stmts,
          [type]: {
            ...(stmts[type] || {}),
            ...grouped,
          },
        };
        // This is the less common case, a uniform like "uniform Light { vec3 position; } name"
      } else if (interface_type) {
        // If this is an interface block only, like uniform Scene { mat4 view; };
        // then group the interface block declaration under ''
        const interfaceDeclaredUniform =
          (identifier?.identifier?.identifier as string) || '';
        return {
          ...stmts,
          [interface_type.identifier as string]: {
            [interfaceDeclaredUniform]: {
              generated: `${generate({
                type: 'interface_declarator',
                lp: stmt.declaration.lp,
                declarations: stmt.declaration.declarations,
                qualifiers: null,
                interface_type: null,
                rp: stmt.declaration.rp,
              })}${interfaceDeclaredUniform}`,
              hasInterface: true,
            },
          },
        };
      } else {
        console.error('Unknown uniform AST', { stmt, code: generate(stmt) });
        throw new Error(
          'Unknown uniform AST encountered when merging uniforms'
        );
      }
    }, {})
  );

  return groupedByTypeName.map(([type, variables]) => {
    return makeStatement(
      `uniform ${type} ${Object.values(variables)
        .map((v) => v.generated)
        .join(', ')}`
    );
  });
};

export const mergeShaderSections = (
  s1: ShaderSections,
  s2: ShaderSections
): ShaderSections => {
  return {
    version: [...s1.version, ...s2.version],
    precision: [...s1.precision, ...s2.precision],
    preprocessor: [...s1.preprocessor, ...s2.preprocessor],
    inStatements: [...s1.inStatements, ...s2.inStatements],
    outStatements: [...s1.outStatements, ...s2.outStatements],
    structs: [...s1.structs, ...s2.structs],
    uniforms: [...s1.uniforms, ...s2.uniforms],
    program: [...s1.program, ...s2.program],
  };
};

export type MergeOptions = {
  includePrecisions: boolean;
  includeVersion: boolean;
};

export const shaderSectionsToProgram = (
  sections: ShaderSections,
  mergeOptions: MergeOptions
): Program => ({
  type: 'program',
  scopes: [],
  program: [
    ...(mergeOptions.includeVersion ? [dedupeVersions(sections.version)] : []),
    ...(mergeOptions.includePrecisions
      ? highestPrecisions(sections.precision)
      : []),
    ...sections.preprocessor,
    // Structs before ins and uniforms as they can reference structs
    ...sections.structs,
    ...dedupeQualifiedStatements(sections.inStatements, 'in'),
    ...dedupeQualifiedStatements(sections.outStatements, 'out'),
    ...dedupeUniforms(sections.uniforms),
    ...sections.program,
  ],
});

/**
 * Group an AST into logical sections. The output of this funciton is consumed
 * by the dedupe methods, namely dedupeUniforms, so the data shapes are coupled
 */
export const findShaderSections = (ast: Program): ShaderSections => {
  const initialValue: ShaderSections = {
    precision: [],
    preprocessor: [],
    version: [],
    structs: [],
    inStatements: [],
    outStatements: [],
    uniforms: [],
    program: [],
  };

  return ast.program.reduce((sections, node) => {
    if (node.type === 'preprocessor' && node.line.startsWith('#version')) {
      return {
        ...sections,
        version: sections.version.concat(node),
      };
    } else if (
      node.type === 'declaration_statement' &&
      node.declaration.type === 'precision'
    ) {
      return {
        ...sections,
        precision: sections.precision.concat(node),
      };
    } else if (node.type === 'preprocessor') {
      return {
        ...sections,
        preprocessor: sections.preprocessor.concat(node),
      };
    } else if (
      node.type === 'declaration_statement' &&
      node.declaration?.specified_type?.specifier?.specifier?.type === 'struct'
    ) {
      return {
        ...sections,
        structs: sections.structs.concat(node),
      };
      // This definition of a uniform lines up with the processing we do in
      // dedupeUniforms
    } else if (
      node.type === 'declaration_statement' &&
      // Ignore lines like "layout(std140,column_major) uniform;"
      !node.declaration?.qualifiers?.find(
        (q: any) => q.layout?.token === 'layout'
      ) &&
      // One of these checks is for a uniform with an interface block, and the
      // other is for vanilla uniforms. I don't remember which is which
      (node.declaration?.specified_type?.qualifiers?.find(
        (n: any) => n.token === 'uniform'
      ) ||
        node.declaration?.qualifiers?.find((n: any) => n.token === 'uniform'))
    ) {
      return {
        ...sections,
        uniforms: sections.uniforms.concat(node),
      };
    } else if (
      node.type === 'declaration_statement' &&
      node.declaration?.specified_type?.qualifiers?.find(
        (n: any) => n.token === 'in'
      )
    ) {
      return {
        ...sections,
        inStatements: sections.inStatements.concat(node),
      };
    } else if (
      node.type === 'declaration_statement' &&
      node.declaration?.specified_type?.qualifiers?.find(
        (n: any) => n.token === 'out'
      )
    ) {
      return {
        ...sections,
        outStatements: sections.outStatements.concat(node),
      };
    } else {
      return {
        ...sections,
        program: sections.program.concat(node),
      };
    }
  }, initialValue);
};
