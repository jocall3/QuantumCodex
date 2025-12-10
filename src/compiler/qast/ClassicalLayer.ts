import { Token } from '../lexer/Token';

/**
 * Represents the source location of an AST node.
 */
export interface SourceLocation {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
    file?: string;
}

/**
 * Base class for all nodes in the Quantum Abstract Syntax Tree (QAST).
 */
export abstract class QASTNode {
    constructor(public loc?: SourceLocation) {}
    abstract get type(): string;
}

/**
 * Enumeration of Classical Node Types.
 */
export enum ClassicalNodeType {
    Identifier = 'Identifier',
    Literal = 'Literal',
    BinaryExpression = 'BinaryExpression',
    UnaryExpression = 'UnaryExpression',
    CallExpression = 'CallExpression',
    MemberExpression = 'MemberExpression',
    BlockStatement = 'BlockStatement',
    ExpressionStatement = 'ExpressionStatement',
    VariableDeclaration = 'VariableDeclaration',
    AssignmentStatement = 'AssignmentStatement',
    IfStatement = 'IfStatement',
    WhileStatement = 'WhileStatement',
    ForStatement = 'ForStatement',
    ReturnStatement = 'ReturnStatement',
    FunctionDeclaration = 'FunctionDeclaration',
    TypeAnnotation = 'TypeAnnotation'
}

// ----------------------------------------------------------------------
// Expressions
// ----------------------------------------------------------------------

export abstract class Expression extends QASTNode {}

export class Identifier extends Expression {
    readonly type = ClassicalNodeType.Identifier;
    constructor(
        public name: string,
        loc?: SourceLocation
    ) {
        super(loc);
    }
}

export class Literal extends Expression {
    readonly type = ClassicalNodeType.Literal;
    constructor(
        public value: string | number | boolean | null,
        public raw: string,
        public valueType: 'string' | 'integer' | 'float' | 'boolean' | 'null',
        loc?: SourceLocation
    ) {
        super(loc);
    }
}

export class BinaryExpression extends Expression {
    readonly type = ClassicalNodeType.BinaryExpression;
    constructor(
        public left: Expression,
        public operator: string,
        public right: Expression,
        loc?: SourceLocation
    ) {
        super(loc);
    }
}

export class UnaryExpression extends Expression {
    readonly type = ClassicalNodeType.UnaryExpression;
    constructor(
        public operator: string,
        public argument: Expression,
        public prefix: boolean = true,
        loc?: SourceLocation
    ) {
        super(loc);
    }
}

export class CallExpression extends Expression {
    readonly type = ClassicalNodeType.CallExpression;
    constructor(
        public callee: Expression,
        public args: Expression[],
        loc?: SourceLocation
    ) {
        super(loc);
    }
}

export class MemberExpression extends Expression {
    readonly type = ClassicalNodeType.MemberExpression;
    constructor(
        public object: Expression,
        public property: Identifier,
        public computed: boolean = false,
        loc?: SourceLocation
    ) {
        super(loc);
    }
}

// ----------------------------------------------------------------------
// Statements
// ----------------------------------------------------------------------

export abstract class Statement extends QASTNode {}

export class BlockStatement extends Statement {
    readonly type = ClassicalNodeType.BlockStatement;
    constructor(
        public body: Statement[],
        loc?: SourceLocation
    ) {
        super(loc);
    }
}

export class ExpressionStatement extends Statement {
    readonly type = ClassicalNodeType.ExpressionStatement;
    constructor(
        public expression: Expression,
        loc?: SourceLocation
    ) {
        super(loc);
    }
}

export class TypeAnnotation extends QASTNode {
    readonly type = ClassicalNodeType.TypeAnnotation;
    constructor(
        public name: string,
        public isArray: boolean = false,
        public genericArgs: TypeAnnotation[] = [],
        loc?: SourceLocation
    ) {
        super(loc);
    }
}

export class VariableDeclaration extends Statement {
    readonly type = ClassicalNodeType.VariableDeclaration;
    constructor(
        public kind: 'let' | 'const' | 'var',
        public identifier: Identifier,
        public init: Expression | null,
        public typeAnnotation: TypeAnnotation | null,
        loc?: SourceLocation
    ) {
        super(loc);
    }
}

export class AssignmentStatement extends Statement {
    readonly type = ClassicalNodeType.AssignmentStatement;
    constructor(
        public left: Identifier | MemberExpression,
        public operator: string,
        public right: Expression,
        loc?: SourceLocation
    ) {
        super(loc);
    }
}

export class IfStatement extends Statement {
    readonly type = ClassicalNodeType.IfStatement;
    constructor(
        public test: Expression,
        public consequent: Statement,
        public alternate: Statement | null = null,
        loc?: SourceLocation
    ) {
        super(loc);
    }
}

export class WhileStatement extends Statement {
    readonly type = ClassicalNodeType.WhileStatement;
    constructor(
        public test: Expression,
        public body: Statement,
        loc?: SourceLocation
    ) {
        super(loc);
    }
}

export class ForStatement extends Statement {
    readonly type = ClassicalNodeType.ForStatement;
    constructor(
        public init: VariableDeclaration | AssignmentStatement | null,
        public test: Expression | null,
        public update: Expression | null,
        public body: Statement,
        loc?: SourceLocation
    ) {
        super(loc);
    }
}

export class ReturnStatement extends Statement {
    readonly type = ClassicalNodeType.ReturnStatement;
    constructor(
        public argument: Expression | null,
        loc?: SourceLocation
    ) {
        super(loc);
    }
}

export class FunctionDeclaration extends Statement {
    readonly type = ClassicalNodeType.FunctionDeclaration;
    constructor(
        public identifier: Identifier,
        public params: { identifier: Identifier; typeAnnotation: TypeAnnotation | null }[],
        public body: BlockStatement,
        public returnType: TypeAnnotation | null,
        public isAsync: boolean = false,
        loc?: SourceLocation
    ) {
        super(loc);
    }
}

/**
 * Union type for all Classical AST Nodes.
 */
export type ClassicalNode =
    | Identifier
    | Literal
    | BinaryExpression
    | UnaryExpression
    | CallExpression
    | MemberExpression
    | BlockStatement
    | ExpressionStatement
    | VariableDeclaration
    | AssignmentStatement
    | IfStatement
    | WhileStatement
    | ForStatement
    | ReturnStatement
    | FunctionDeclaration
    | TypeAnnotation;

/**
 * Visitor interface for traversing the Classical Layer AST.
 */
export interface ClassicalVisitor<R = void> {
    visitIdentifier(node: Identifier): R;
    visitLiteral(node: Literal): R;
    visitBinaryExpression(node: BinaryExpression): R;
    visitUnaryExpression(node: UnaryExpression): R;
    visitCallExpression(node: CallExpression): R;
    visitMemberExpression(node: MemberExpression): R;
    visitBlockStatement(node: BlockStatement): R;
    visitExpressionStatement(node: ExpressionStatement): R;
    visitVariableDeclaration(node: VariableDeclaration): R;
    visitAssignmentStatement(node: AssignmentStatement): R;
    visitIfStatement(node: IfStatement): R;
    visitWhileStatement(node: WhileStatement): R;
    visitForStatement(node: ForStatement): R;
    visitReturnStatement(node: ReturnStatement): R;
    visitFunctionDeclaration(node: FunctionDeclaration): R;
    visitTypeAnnotation(node: TypeAnnotation): R;
}