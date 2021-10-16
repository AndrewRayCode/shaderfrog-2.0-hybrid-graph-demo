import { parser } from '@shaderfrog/glsl-parser';
import { visit, AstNode } from '@shaderfrog/glsl-parser/dist/ast';
import {
  ParserProgram,
  Scope,
} from '@shaderfrog/glsl-parser/dist/parser/parser';

// This file is not well organized, I have no idea what goes in here for
// nodestuf vs graph

export const from2To3 = (ast: ParserProgram) => {
  const glOut = 'fragmentColor';
  // TODO: add this back in when there's only one after the merge
  // ast.program.unshift({
  //   type: 'preprocessor',
  //   line: '#version 300 es',
  //   _: '\n',
  // });
  ast.program.unshift({
    type: 'declaration_statement',
    declaration: {
      type: 'declarator_list',
      specified_type: {
        type: 'fully_specified_type',
        qualifiers: [{ type: 'keyword', token: 'out', whitespace: ' ' }],
        specifier: {
          type: 'type_specifier',
          specifier: { type: 'keyword', token: 'vec4', whitespace: ' ' },
          quantifier: null,
        },
      },
      declarations: [
        {
          type: 'declaration',
          identifier: {
            type: 'identifier',
            identifier: glOut,
            whitespace: undefined,
          },
          quantifier: null,
          operator: undefined,
          initializer: undefined,
        },
      ],
      commas: [],
    },
    semi: { type: 'literal', literal: ';', whitespace: '\n    ' },
  });
  visit(ast, {
    identifier: {
      enter: (path) => {
        if (path.node.identifier === 'gl_FragColor') {
          path.node.identifier = glOut;
        }
      },
    },
    keyword: {
      enter: (path) => {
        if (
          (path.node.token === 'attribute' || path.node.token === 'varying') &&
          path.findParent((path) => path.node.type === 'declaration_statement')
        ) {
          path.node.token = 'in';
        }
      },
    },
  });
};

export const convert300MainToReturn = (ast: ParserProgram): void => {
  const mainReturnVar = `frogOut`;

  let outName: string | undefined;
  ast.program.find((line, index) => {
    if (
      line.type === 'declaration_statement' &&
      line.declaration?.specified_type?.qualifiers?.find(
        (n: AstNode) => n.token === 'out'
      ) &&
      line.declaration.specified_type.specifier.specifier.token === 'vec4'
    ) {
      // Remove the out declaration
      ast.program.splice(index, 1);
      outName = line.declaration.declarations[0].identifier.identifier;
      return true;
    }
  });
  if (!outName) {
    throw new Error('No "out vec4" line found in the fragment shader');
  }

  visit(ast, {
    identifier: {
      enter: (path) => {
        if (path.node.identifier === outName) {
          path.node.identifier = mainReturnVar;
          path.node.doNotDescope = true; // hack because this var is in the scope which gets renamed later
        }
      },
    },
    function: {
      enter: (path) => {
        if (path.node.prototype.header.name.identifier === 'main') {
          path.node.prototype.header.returnType.specifier.specifier.token =
            'vec4';
          path.node.body.statements.unshift({
            type: 'literal',
            literal: `vec4 ${mainReturnVar};\n`,
          });
          path.node.body.statements.push({
            type: 'literal',
            literal: `return ${mainReturnVar};\n`,
          });
        }
      },
    },
  });
};

export interface ProgramSource {
  fragment: string;
  vertex: string;
}

export interface ProgramAst {
  fragment: AstNode;
  vertex: string;
}

export interface Node {
  id: string;
  name: string;
  type: ShaderType;
  options: Object;
  inputs: Array<Object>;
  vertexSource: string;
  fragmentSource: string;
  expressionOnly?: boolean;
}

export const shaderNode = (
  id: string,
  name: string,
  options: Object,
  fragment: string,
  vertex: string
): Node => ({
  id,
  name,
  type: ShaderType.shader,
  options,
  inputs: [],
  fragmentSource: fragment,
  vertexSource: vertex,
});

export const outputNode = (id: string, options: Object): Node => ({
  id,
  name: 'output',
  type: ShaderType.output,
  options,
  inputs: [],
  fragmentSource: `
#version 300 es
out vec4 frogFragOut;
void main() {
  frogFragOut = vec4(1.0);
}
`,
  vertexSource: '',
});

export const addNode = (id: string, options: Object): Node => ({
  id,
  name: 'add',
  type: ShaderType.add,
  options,
  inputs: [],
  fragmentSource: `a + b`,
  vertexSource: '',
  expressionOnly: true,
});

export const multiplyNode = (id: string, options: Object): Node => ({
  id,
  name: 'multiply',
  type: ShaderType.multiply,
  options,
  inputs: [],
  fragmentSource: `a * b`,
  vertexSource: '',
  expressionOnly: true,
});

export type Edge = {
  from: string;
  to: string;
  output: string;
  input: string;
};

export interface Graph {
  nodes: Array<Node>;
  edges: Array<Edge>;
}

export enum ShaderType {
  toon = 'MeshToonMaterial',
  phong = 'MeshPhongMaterial',
  output = 'output',
  shader = 'shader',
  add = 'add',
  multiply = 'multiply',
}

export interface ShaderSections {
  precision: AstNode[];
  version: AstNode[];
  preprocessor: AstNode[];
  structs: AstNode[];
  inStatements: AstNode[];
  uniforms: AstNode[];
  program: AstNode[];
}

export const emptyShaderSections = (): ShaderSections => ({
  precision: [],
  preprocessor: [],
  version: [],
  structs: [],
  program: [],
  inStatements: [],
  uniforms: [],
});

export const mergeShaderSections = (
  s1: ShaderSections,
  s2: ShaderSections
): ShaderSections => {
  return {
    version: [...s1.version, ...s2.version],
    precision: [...s1.precision, ...s2.precision],
    preprocessor: [...s1.preprocessor, ...s2.preprocessor],
    inStatements: [...s1.inStatements, ...s2.inStatements],
    structs: [...s1.structs, ...s2.structs],
    uniforms: [...s1.uniforms, ...s2.uniforms],
    program: [...s1.program, ...s2.program],
  };
};

export const shaderSectionsToAst = (
  sections: ShaderSections
): ParserProgram => ({
  type: 'program',
  scopes: [],
  program: [
    {
      type: 'program',
      program: [
        dedupeVersions(sections.version),
        ...highestPrecisions(sections.precision),
        ...sections.preprocessor,
        // Structs before ins and uniforms as they can reference structs
        ...sections.structs,
        ...dedupeInStatements(sections.inStatements),
        ...dedupeUniforms(sections.uniforms),
        ...sections.program,
      ],
    },
  ],
});

export const makeStatement = (stmt: string): AstNode => {
  // console.log(stmt);
  let ast;
  try {
    ast = parser.parse(
      `${stmt};
`,
      { quiet: true }
    );
  } catch (error: any) {
    console.error({ stmt, error });
    throw new Error(`Error parsing stmt "${stmt}": ${error?.message}`);
  }
  // console.log(util.inspect(ast, false, null, true));
  return ast.program[0];
};

export const makeFnStatement = (fnStmt: string): AstNode => {
  let ast;
  try {
    ast = parser.parse(
      `
  void main() {
      ${fnStmt};
    }`,
      { quiet: true }
    );
  } catch (error: any) {
    console.error({ fnStmt, error });
    throw new Error(`Error parsing fnStmt "${fnStmt}": ${error?.message}`);
  }

  // console.log(util.inspect(ast, false, null, true));
  return ast.program[0].body.statements[0];
};

export const makeExpression = (expr: string): AstNode => {
  let ast;
  try {
    ast = parser.parse(
      `void main() {
          a = ${expr};
        }`,
      { quiet: true }
    );
  } catch (error: any) {
    console.error({ expr, error });
    throw new Error(`Error parsing expr "${expr}": ${error?.message}`);
  }

  // console.log(util.inspect(ast, false, null, true));
  return ast.program[0].body.statements[0].expression.right;
};

export const findShaderSections = (ast: ParserProgram): ShaderSections => {
  // console.log(util.inspect(ast, false, null, true));

  const initialValue: ShaderSections = {
    precision: [],
    preprocessor: [],
    version: [],
    structs: [],
    inStatements: [],
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
    } else if (
      node.type === 'declaration_statement' &&
      node.declaration?.specified_type?.qualifiers?.find(
        (n: AstNode) => n.token === 'uniform'
      )
    ) {
      return {
        ...sections,
        uniforms: sections.uniforms.concat(node),
      };
    } else if (
      node.type === 'declaration_statement' &&
      node.declaration?.specified_type?.qualifiers?.find(
        (n: AstNode) => n.token === 'in'
      )
    ) {
      return {
        ...sections,
        inStatements: sections.inStatements.concat(node),
      };
    } else {
      return {
        ...sections,
        program: sections.program.concat(node),
      };
    }
  }, initialValue);
};

export const union = <T extends unknown>(...iterables: Set<T>[]) => {
  const set = new Set<T>();

  for (const iterable of iterables) {
    for (const item of iterable) {
      set.add(item);
    }
  }

  return set;
};

enum Precision {
  highp = 2,
  mediump = 1,
  lowp = 0,
}

export const higherPrecision = (p1: Precision, p2: Precision): Precision =>
  Precision[p1] > Precision[p2] ? p1 : p2;

export const dedupeVersions = (nodes: AstNode[]): AstNode => nodes[0];
export const highestPrecisions = (nodes: AstNode[]): AstNode[] =>
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
  ).map(([typeName, precision]) =>
    makeStatement(`precision ${precision} ${typeName}`)
  );

export const dedupeInStatements = (statements: AstNode[]): any =>
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
            (types: { [typeName: string]: string }, decl: AstNode) => ({
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
    makeStatement(`in ${type} ${Object.keys(varNames).join(', ')}`)
  );

export const dedupeUniforms = (statements: AstNode[]): any =>
  Object.entries(
    statements.reduce((stmts, stmt) => {
      const { specifier } = stmt.declaration.specified_type.specifier;
      // Token is for "vec2", "identifier" is for custom names likes truct
      const type = specifier.token || specifier.identifier;
      return {
        ...stmts,
        [type]: {
          ...(stmts[type] || {}),
          ...stmt.declaration.declarations.reduce(
            (types: { [typeName: string]: string }, decl: AstNode) => ({
              ...types,
              [decl.identifier.identifier]:
                decl.identifier.identifier +
                (decl.quantifier
                  ? `[${decl.quantifier.specifiers[0].expression.token}]`
                  : ''),
            }),
            {} as { [typeName: string]: AstNode }
          ),
        },
      };
    }, {} as { [key: string]: AstNode })
  ).map(([type, varNames]) =>
    makeStatement(`uniform ${type} ${Object.values(varNames).join(', ')}`)
  );

export const outDeclaration = (name: string): Object => ({
  type: 'declaration_statement',
  declaration: {
    type: 'declarator_list',
    specified_type: {
      type: 'fully_specified_type',
      qualifiers: [{ type: 'keyword', token: 'out', whitespace: ' ' }],
      specifier: {
        type: 'type_specifier',
        specifier: { type: 'keyword', token: 'vec4', whitespace: ' ' },
        quantifier: null,
      },
    },
    declarations: [
      {
        type: 'declaration',
        identifier: {
          type: 'identifier',
          identifier: name,
          whitespace: undefined,
        },
        quantifier: null,
        operator: undefined,
        initializer: undefined,
      },
    ],
    commas: [],
  },
  semi: { type: 'literal', literal: ';', whitespace: '\n    ' },
});

export type NodeReducer = (
  accumulator: any,
  currentNode: Node,
  inputEdge: object | null,
  inputNode: object | null,
  graph: Graph
) => any;

const reduceNodes = <FnType extends NodeReducer>(
  graph: Graph,
  initial: any,
  node: Node,
  reduce: FnType
) => {
  let result: any;

  const inputEdges = graph.edges.filter((edge) => edge.to === node.id);
  if (!inputEdges.length) {
    result = reduce(initial, node, null, null, graph);
  } else {
    inputEdges.forEach((edge) => {
      const fromNode = graph.nodes.find((node) => edge.from === node.id);
      if (!fromNode) {
        throw new Error(`No node with id ${edge.from} in graph`);
      }
      result = reduce(
        reduceNodes(graph, initial, fromNode, reduce),
        node,
        edge,
        fromNode,
        graph
      );
      // result = reduce(result, fromNode, edge, graph);
    });
  }

  return result;
};

export const reduceGraph = (
  graph: Graph,
  initial: any,
  reduceFn: NodeReducer
) => {
  // Start on the output node
  const outputNode = graph.nodes.find((node) => node.type === 'output');
  if (!outputNode) {
    throw new Error('No output in graph');
  }
  return reduceNodes(graph, initial, outputNode, reduceFn);
};
