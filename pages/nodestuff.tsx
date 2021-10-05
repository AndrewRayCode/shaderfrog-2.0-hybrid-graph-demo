import { generate, parser } from '@shaderfrog/glsl-parser';
import { visit, AstNode } from '@shaderfrog/glsl-parser/dist/core/ast';
import {
  ParserProgram,
  Scope,
} from '@shaderfrog/glsl-parser/dist/parser/parser';
import preprocess from '@shaderfrog/glsl-parser/dist/preprocessor/preprocessor';
import util from 'util';

// This file is not well organized, I have no idea what goes in here for
// nodestuf vs graph

export const from2To3 = (ast: ParserProgram) => {
  const glOut = 'fragmentColor';
  ast.program.unshift({
    type: 'preprocessor',
    line: '#version 300 es',
    _: '\n',
  });
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

// index is a hack because after the descoping, frogOut gets renamed - even
// though it shouldn't because it's not in the global scope, that might be a bug
export const convertMainToReturn = (ast: ParserProgram): void => {
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

export const renameBindings = (
  scope: Scope,
  preserve: Set<string>,
  suffix: string
) => {
  Object.entries(scope.bindings).forEach(([name, binding]) => {
    binding.references.forEach((ref) => {
      if (ref.doNotDescope) {
        return;
      }
      if (ref.type === 'declaration') {
        // both are "in" vars expected in vertex shader
        if (!preserve.has(ref.identifier.identifier)) {
          ref.identifier.identifier = `${ref.identifier.identifier}_${suffix}`;
        }
      } else if (ref.type === 'identifier') {
        // TODO: does this block get called anymore??
        if (!preserve.has(ref.identifier)) {
          ref.identifier = `${ref.identifier}_${suffix}`;
        }
      } else if (ref.type === 'parameter_declaration') {
        ref.declaration.identifier.identifier = `${ref.declaration.identifier.identifier}_${suffix}`;
      } else {
        console.log(ref);
        throw new Error(`Binding for type ${ref.type} not recognized`);
      }
    });
  });
};

export const renameFunctions = (
  scope: Scope,
  suffix: string,
  map: { [name: string]: string }
) => {
  Object.entries(scope.functions).forEach(([name, binding]) => {
    binding.references.forEach((ref) => {
      if (ref.type === 'function_header') {
        ref.name.identifier =
          map[ref.name.identifier] || `${ref.name.identifier}_${suffix}`;
      } else if (ref.type === 'function_call') {
        if (ref.identifier.type === 'postfix') {
          ref.identifier.expr.identifier.specifier.identifier =
            map[ref.identifier.expr.identifier.specifier.identifier] ||
            `${ref.identifier.expr.identifier.specifier.identifier}_${suffix}`;
        } else {
          ref.identifier.specifier.identifier =
            map[ref.identifier.specifier.identifier] ||
            `${ref.identifier.specifier.identifier}_${suffix}`;
        }
      } else {
        console.log(ref);
        throw new Error(`Function for type ${ref.type} not recognized`);
      }
    });
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
out vec4 color;
void main() {
  color = vec4(1.0);
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
  phong = 'MeshPhongMaterial',
  output = 'output',
  shader = 'shader',
  add = 'add',
}

export interface ShaderSections {
  precision: AstNode[];
  version: AstNode[];
  preprocessor: Object[];
  inStatements: Object[];
  existingIns: Set<string>;
  program: AstNode[];
}

export const makeExpression = (expr: string): AstNode => {
  const ast = parser.parse(
    `void main() {
        a = ${expr};
      }`,
    { quiet: true }
  );
  // console.log(util.inspect(ast, false, null, true));
  return ast.program[0].body.statements[0].expression.right;
};

export const findShaderSections = (ast: ParserProgram): ShaderSections => {
  // console.log(util.inspect(ast, false, null, true));

  const initialValue: ShaderSections = {
    precision: [],
    preprocessor: [],
    version: [],
    inStatements: [],
    existingIns: new Set<string>(),
    program: [],
  };

  return ast.program.reduce((sections, node) => {
    if (
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
      node.declaration?.specified_type?.qualifiers?.find(
        (n: AstNode) => n.token === 'in'
      )
    ) {
      return {
        ...sections,
        existingIns: sections.existingIns.add(
          node.declaration.declarations.map(
            (decl: AstNode) => decl.identifier.identifier
          )
        ),
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

export const mergeShaderSections = (
  s1: ShaderSections,
  s2: ShaderSections
): ShaderSections => {
  return {
    precision: [...s1.precision, ...s2.precision],
    version: [...s1.version, ...s2.version],
    preprocessor: [...s1.preprocessor, ...s2.preprocessor],
    inStatements: [...s1.inStatements, ...s2.inStatements],
    existingIns: union<string>(s1.existingIns, s2.existingIns),
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
        ...sections.version,
        ...sections.preprocessor,
        ...sections.inStatements,
        ...sections.program,
      ],
    },
  ],
});

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
