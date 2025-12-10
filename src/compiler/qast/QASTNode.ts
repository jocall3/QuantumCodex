/**
 * @file QASTNode.ts
 * @description Defines the base class, enums, and interfaces for the Multi-Layered Quantum Abstract Syntax Tree (QAST).
 * This structure supports the .u language's ability to interleave classical, quantum, and hybrid execution flows.
 */

/**
 * Represents the execution layer a node belongs to.
 * - CLASSICAL: Standard CPU-bound operations.
 * - QUANTUM: QPU-bound operations (gates, qubit allocation).
 * - HYBRID: Operations bridging the two (measurement, classical control of quantum gates).
 * - META: Compiler directives, imports, and type definitions.
 */
export enum QASTLayer {
    CLASSICAL = 'CLASSICAL',
    QUANTUM = 'QUANTUM',
    HYBRID = 'HYBRID',
    META = 'META'
}

/**
 * Enumeration of all possible node types in the .u language QAST.
 */
export enum QASTNodeType {
    // Root
    PROGRAM = 'PROGRAM',
    BLOCK = 'BLOCK',

    // Meta / Declarations
    IMPORT = 'IMPORT',
    FUNCTION_DECL = 'FUNCTION_DECL',
    CLASS_DECL = 'CLASS_DECL',
    Q_REGISTER_DECL = 'Q_REGISTER_DECL', // Quantum Register Declaration

    // Classical Statements
    VAR_DECL = 'VAR_DECL',
    ASSIGNMENT = 'ASSIGNMENT',
    RETURN = 'RETURN',
    
    // Control Flow
    IF_STATEMENT = 'IF_STATEMENT',
    WHILE_LOOP = 'WHILE_LOOP',
    FOR_LOOP = 'FOR_LOOP',

    // Quantum Operations
    QUBIT_ALLOC = 'QUBIT_ALLOC',
    QUANTUM_GATE = 'QUANTUM_GATE',       // e.g., H, X, Z, CNOT
    QUANTUM_MEASURE = 'QUANTUM_MEASURE', // Collapses state to classical bit
    QUANTUM_RESET = 'QUANTUM_RESET',
    QUANTUM_BARRIER = 'QUANTUM_BARRIER',
    
    // Expressions
    BINARY_EXPR = 'BINARY_EXPR',
    UNARY_EXPR = 'UNARY_EXPR',
    LITERAL = 'LITERAL',
    IDENTIFIER = 'IDENTIFIER',
    CALL_EXPR = 'CALL_EXPR',
    ARRAY_ACCESS = 'ARRAY_ACCESS',
    
    // Hybrid Specific
    PHASE_ESTIMATION = 'PHASE_ESTIMATION', // High-level hybrid construct
    AMPLITUDE_AMPLIFICATION = 'AMPLITUDE_AMPLIFICATION'
}

/**
 * Represents a specific location in the source code.
 */
export interface SourceLocation {
    file: string;
    start: {
        line: number;
        column: number;
        offset: number;
    };
    end: {
        line: number;
        column: number;
        offset: number;
    };
}

/**
 * Interface for the Visitor pattern to traverse the QAST.
 */
export interface QASTVisitor<T = void> {
    visitProgram(node: QASTNode): T;
    visitBlock(node: QASTNode): T;
    visitStatement(node: QASTNode): T;
    visitExpression(node: QASTNode): T;
    visitQuantumOp(node: QASTNode): T;
    visit(node: QASTNode): T;
}

/**
 * Abstract base class for all nodes in the Quantum Abstract Syntax Tree.
 */
export abstract class QASTNode {
    /**
     * The specific type of the node (e.g., IF_STATEMENT, QUANTUM_GATE).
     */
    public abstract readonly type: QASTNodeType;

    /**
     * The execution layer (Classical, Quantum, Hybrid).
     * Used by the compiler to determine backend routing (CPU vs QPU).
     */
    public abstract readonly layer: QASTLayer;

    /**
     * Source code location for debugging and error reporting.
     */
    public loc: SourceLocation;

    /**
     * Parent node reference (optional, populated during traversal/parsing).
     */
    public parent: QASTNode | null = null;

    /**
     * Metadata storage for compiler passes (type checking, optimization flags).
     */
    public metadata: Map<string, any>;

    constructor(loc: SourceLocation) {
        this.loc = loc;
        this.metadata = new Map();
    }

    /**
     * Accepts a visitor for traversing the tree.
     * @param visitor The visitor implementation.
     */
    public abstract accept<T>(visitor: QASTVisitor<T>): T;

    /**
     * Returns the children of this node.
     */
    public abstract getChildren(): QASTNode[];

    /**
     * Serializes the node to a JSON-compatible object.
     */
    public toJSON(): object {
        return {
            type: this.type,
            layer: this.layer,
            loc: this.loc,
            metadata: Object.fromEntries(this.metadata)
        };
    }
}

/**
 * Base class for all Statements (nodes that perform an action but do not return a value).
 */
export abstract class QASTStatement extends QASTNode {
    // Marker class for type safety
}

/**
 * Base class for all Expressions (nodes that evaluate to a value).
 */
export abstract class QASTExpression extends QASTNode {
    /**
     * The resolved type of the expression (populated during semantic analysis).
     * e.g., "int", "qubit", "bool".
     */
    public resolvedType: string | null = null;
}

/**
 * Base class for Quantum Operations.
 */
export abstract class QASTQuantumOp extends QASTStatement {
    public readonly layer = QASTLayer.QUANTUM;
}

/**
 * Represents a generic identifier in the code.
 */
export class IdentifierNode extends QASTExpression {
    public readonly type = QASTNodeType.IDENTIFIER;
    public readonly layer = QASTLayer.CLASSICAL; // Identifiers themselves are classical references

    constructor(
        public name: string,
        loc: SourceLocation
    ) {
        super(loc);
    }

    public accept<T>(visitor: QASTVisitor<T>): T {
        return visitor.visitExpression(this);
    }

    public getChildren(): QASTNode[] {
        return [];
    }

    public toJSON(): object {
        return {
            ...super.toJSON(),
            name: this.name
        };
    }
}

/**
 * Represents a literal value (Number, String, Boolean, Complex).
 */
export class LiteralNode extends QASTExpression {
    public readonly type = QASTNodeType.LITERAL;
    public readonly layer = QASTLayer.CLASSICAL;

    constructor(
        public value: any,
        public raw: string,
        public valueType: 'int' | 'float' | 'string' | 'bool' | 'complex',
        loc: SourceLocation
    ) {
        super(loc);
    }

    public accept<T>(visitor: QASTVisitor<T>): T {
        return visitor.visitExpression(this);
    }

    public getChildren(): QASTNode[] {
        return [];
    }
}