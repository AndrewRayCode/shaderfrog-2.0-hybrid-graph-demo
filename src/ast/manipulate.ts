/**
 * Utility functions to work with ASTs
 */
import { parser, generate } from '@shaderfrog/glsl-parser';
import {
  visit,
  AstNode,
  NodeVisitors,
  ExpressionStatementNode,
  FunctionNode,
  AssignmentNode,
  DeclarationStatementNode,
  KeywordNode,
  DeclarationNode,
} from '@shaderfrog/glsl-parser/ast';
import { Program } from '@shaderfrog/glsl-parser/ast';
import { ShaderStage } from '../core/graph';

export const findVec4Constructor = (ast: AstNode): AstNode | undefined => {
  let parent: AstNode | undefined;
  const visitors: NodeVisitors = {
    function_call: {
      enter: (path) => {
        if (
          'specifier' in path.node.identifier &&
          path.node.identifier?.specifier?.token === 'vec4'
        ) {
          parent = path.findParent((p) => 'right' in p.node)?.node;
          path.skip();
        }
      },
    },
  };
  visit(ast, visitors);
  return parent;
};

export const findAssignmentTo = (
  ast: AstNode | Program,
  assignTo: string
): ExpressionStatementNode | undefined => {
  let assign: ExpressionStatementNode | undefined;
  const visitors: NodeVisitors = {
    expression_statement: {
      enter: (path) => {
        if (path.node.expression?.left?.identifier === assignTo) {
          assign = path.node;
        }
        path.skip();
      },
    },
  };
  visit(ast, visitors);
  return assign;
};

export const findDeclarationOf = (
  ast: AstNode | Program,
  declarationOf: string
): DeclarationNode | undefined => {
  let declaration: DeclarationNode | undefined;
  const visitors: NodeVisitors = {
    declaration_statement: {
      enter: (path) => {
        const foundDecl = path.node.declaration?.declarations?.find(
          (decl: any) => decl?.identifier?.identifier === declarationOf
        );
        if (foundDecl) {
          declaration = foundDecl;
        }
        path.skip();
      },
    },
  };
  visit(ast, visitors);
  return declaration;
};

export const from2To3 = (ast: Program, stage: ShaderStage) => {
  const glOut = 'fragmentColor';
  // TODO: add this back in when there's only one after the merge
  // ast.program.unshift({
  //   type: 'preprocessor',
  //   line: '#version 300 es',
  //   _: '\n',
  // });
  if (stage === 'fragment') {
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
  }
  visit(ast, {
    function_call: {
      enter: (path) => {
        const identifier = path.node.identifier;
        if (
          'specifier' in identifier &&
          identifier.specifier?.identifier === 'texture2D'
        ) {
          identifier.specifier.identifier = 'texture';
        }
      },
    },
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
          path.node.token =
            stage === 'vertex' && path.node.token === 'varying' ? 'out' : 'in';
        }
      },
    },
  });
};

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
  return (ast.program[0] as FunctionNode).body.statements[0];
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
  return (ast.program[0] as FunctionNode).body.statements[0].expression.right;
};

export const makeExpressionWithScopes = (expr: string): Program => {
  let ast: Program;
  try {
    ast = parser.parse(
      `void main() {
          ${expr};
        }`,
      { quiet: true }
    );
  } catch (error: any) {
    console.error({ expr, error });
    throw new Error(`Error parsing expr "${expr}": ${error?.message}`);
  }

  // console.log(util.inspect(ast, false, null, true));
  return {
    type: 'program',
    // Set the main() fn body scope as the global one
    scopes: [ast.scopes[1]],
    program: [(ast.program[0] as FunctionNode).body.statements[0].expression],
  };
};

export const findFn = (ast: Program, name: string): FunctionNode | undefined =>
  ast.program.find(
    (stmt): stmt is FunctionNode =>
      stmt.type === 'function' && stmt.prototype.header.name.identifier === name
  );

export const returnGlPosition = (fnName: string, ast: Program): void =>
  convertVertexMain(fnName, ast, 'vec4', (assign) => assign.expression.right);

export const returnGlPositionHardCoded = (
  fnName: string,
  ast: Program,
  returnType: string,
  hardCodedReturn: string
): void =>
  convertVertexMain(fnName, ast, returnType, () =>
    makeExpression(hardCodedReturn)
  );

export const returnGlPositionVec3Right = (fnName: string, ast: Program): void =>
  convertVertexMain(fnName, ast, 'vec3', (assign) => {
    let found: AstNode | undefined;
    visit(assign, {
      function_call: {
        enter: (path) => {
          const { node } = path;
          if (
            // @ts-ignore
            node?.identifier?.specifier?.token === 'vec4' &&
            node?.args?.[2]?.token?.includes('1.')
          ) {
            found = node.args[0];
          }
        },
      },
    });
    if (!found) {
      console.error(generate(ast));
      throw new Error(
        'Could not find position assignment to convert to return!'
      );
    }
    return found;
  });

const convertVertexMain = (
  fnName: string,
  ast: Program,
  returnType: string,
  generateRight: (positionAssign: ExpressionStatementNode) => AstNode
) => {
  const mainReturnVar = `frogOut`;

  const main = findFn(ast, fnName);
  if (!main) {
    throw new Error(`No ${fnName} fn found!`);
  }

  // Convert the main function to one that returns
  (main.prototype.header.returnType.specifier.specifier as KeywordNode).token =
    returnType;

  // Find the gl_position assignment line
  const assign = main.body.statements.find(
    (stmt: AstNode) =>
      stmt.type === 'expression_statement' &&
      stmt.expression.left?.identifier === 'gl_Position'
  );
  if (!assign) {
    throw new Error(`No gl position assign found in main fn!`);
  }

  const rtnStmt = makeFnStatement(
    `${returnType} ${mainReturnVar} = 1.0`
  ) as DeclarationStatementNode;
  rtnStmt.declaration.declarations[0].initializer = generateRight(assign);

  main.body.statements.splice(main.body.statements.indexOf(assign), 1, rtnStmt);
  main.body.statements.push(makeFnStatement(`return ${mainReturnVar}`));
};

export const convert300MainToReturn = (fnName: string, ast: Program): void => {
  const mainReturnVar = `frogOut`;

  // Find the output variable, as in "pc_fragColor" from  "out highp vec4 pc_fragColor;"
  let outName: string | undefined;
  ast.program.find((line, index) => {
    if (
      line.type === 'declaration_statement' &&
      line.declaration?.specified_type?.qualifiers?.find(
        (n: KeywordNode) => n.token === 'out'
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
    console.error(generate(ast));
    throw new Error('No "out vec4" line found in the fragment shader');
  }

  visit(ast, {
    identifier: {
      enter: (path) => {
        if (path.node.identifier === outName) {
          path.node.identifier = mainReturnVar;
          // @ts-ignore
          path.node.doNotDescope = true; // hack because this var is in the scope which gets renamed later
        }
      },
    },
    function: {
      enter: (path) => {
        if (path.node.prototype.header.name.identifier === fnName) {
          (
            path.node.prototype.header.returnType.specifier
              .specifier as KeywordNode
          ).token = 'vec4';
          path.node.body.statements.unshift(
            makeFnStatement(`vec4 ${mainReturnVar}`)
          );
          path.node.body.statements.push(
            makeFnStatement(`return ${mainReturnVar}`)
          );
        }
      },
    },
  });
};
