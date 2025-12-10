/**
 * @file Defines the node structures for the multi-layered Quantum Abstract Syntax Tree (QAST).
 * @description The QAST is designed to represent hybrid quantum-classical programs. It is structured
 * into three conceptual layers that can be intermingled:
 * 1. Classical Control Flow Layer: Represents standard imperative programming constructs
 *    (e.g., loops, conditionals, variables). These nodes are similar to a standard JavaScript AST (ESTree).
 * 2. Quantum Circuit Layer: Represents quantum-specific operations like gate applications,
 *    qubit/cbit declarations, and measurements.
 * 3. Hybrid Interface Layer: This layer is not defined by distinct nodes but by the composition
 *    of nodes from the other two layers. For example, a classical `IfStatement` whose condition
 *    depends on a measurement result and whose body contains quantum gates is a hybrid construct.
 */

/**
 * The base class for all nodes in the Quantum Abstract Syntax Tree (QAST).
 */
class QASTNode {
    /**
     * @param {string} type The type of the AST node.
     * @param {?{start: {line: number, column: number}, end: {line: number, column: number}}} location Source location information.
     */
    constructor(type, location = null) {
        this.type = type;
        this.location = location;
    }
}

// --- Classical Control Flow Layer ---
// Nodes representing classical computation and program structure.

/**
 * The root node of a QAST, representing a complete program.
 * @extends QASTNode
 */
class Program extends QASTNode {
    /**
     * @param {QASTNode[]} body An array of statements that form the program body.
     * @param {?object} location
     */
    constructor(body, location) {
        super('Program', location);
        this.body = body;
    }
}

/**
 * A block statement, i.e., a sequence of statements surrounded by braces.
 * @extends QASTNode
 */
class BlockStatement extends QASTNode {
    /**
     * @param {QASTNode[]} body An array of statements within the block.
     * @param {?object} location
     */
    constructor(body, location) {
        super('BlockStatement', location);
        this.body = body;
    }
}

/**
 * A statement consisting of a single expression.
 * @extends QASTNode
 */
class ExpressionStatement extends QASTNode {
    /**
     * @param {QASTNode} expression The expression.
     * @param {?object} location
     */
    constructor(expression, location) {
        super('ExpressionStatement', location);
        this.expression = expression;
    }
}

/**
 * A variable declaration statement.
 * @extends QASTNode
 */
class VariableDeclaration extends QASTNode {
    /**
     * @param {'let' | 'const'} kind The type of declaration.
     * @param {VariableDeclarator[]} declarations The list of declarators.
     * @param {?object} location
     */
    constructor(kind, declarations, location) {
        super('VariableDeclaration', location);
        this.kind = kind;
        this.declarations = declarations;
    }
}

/**
 * A variable declarator, e.g., `x = 5` in `let x = 5;`.
 * @extends QASTNode
 */
class VariableDeclarator extends QASTNode {
    /**
     * @param {Identifier} id The identifier being declared.
     * @param {?QASTNode} init The initializer expression.
     * @param {?object} location
     */
    constructor(id, init, location) {
        super('VariableDeclarator', location);
        this.id = id;
        this.init = init;
    }
}

/**
 * An `if` statement.
 * @extends QASTNode
 */
class IfStatement extends QASTNode {
    /**
     * @param {QASTNode} test The condition expression.
     * @param {QASTNode} consequent The statement to execute if the condition is true.
     * @param {?QASTNode} alternate The statement to execute if the condition is false.
     * @param {?object} location
     */
    constructor(test, consequent, alternate, location) {
        super('IfStatement', location);
        this.test = test;
        this.consequent = consequent;
        this.alternate = alternate;
    }
}

/**
 * A `for` loop statement.
 * @extends QASTNode
 */
class ForStatement extends QASTNode {
    /**
     * @param {?(VariableDeclaration | QASTNode)} init The loop initializer.
     * @param {?QASTNode} test The loop condition.
     * @param {?QASTNode} update The loop update expression.
     * @param {QASTNode} body The loop body statement.
     * @param {?object} location
     */
    constructor(init, test, update, body, location) {
        super('ForStatement', location);
        this.init = init;
        this.test = test;
        this.update = update;
        this.body = body;
    }
}

/**
 * A `while` loop statement.
 * @extends QASTNode
 */
class WhileStatement extends QASTNode {
    /**
     * @param {QASTNode} test The loop condition.
     * @param {QASTNode} body The loop body statement.
     * @param {?object} location
     */
    constructor(test, body, location) {
        super('WhileStatement', location);
        this.test = test;
        this.body = body;
    }
}

/**
 * A function declaration.
 * @extends QASTNode
 */
class FunctionDeclaration extends QASTNode {
    /**
     * @param {Identifier} id The function name.
     * @param {Identifier[]} params The function parameters.
     * @param {BlockStatement} body The function body.
     * @param {?object} location
     */
    constructor(id, params, body, location) {
        super('FunctionDeclaration', location);
        this.id = id;
        this.params = params;
        this.body = body;
    }
}

/**
 * A `return` statement.
 * @extends QASTNode
 */
class ReturnStatement extends QASTNode {
    /**
     * @param {?QASTNode} argument The expression to return.
     * @param {?object} location
     */
    constructor(argument, location) {
        super('ReturnStatement', location);
        this.argument = argument;
    }
}

/**
 * A function call expression.
 * @extends QASTNode
 */
class CallExpression extends QASTNode {
    /**
     * @param {QASTNode} callee The expression that evaluates to a function.
     * @param {QASTNode[]} args The arguments to the function.
     * @param {?object} location
     */
    constructor(callee, args, location) {
        super('CallExpression', location);
        this.callee = callee;
        this.arguments = args;
    }
}

/**
 * An assignment expression.
 * @extends QASTNode
 */
class AssignmentExpression extends QASTNode {
    /**
     * @param {string} operator The assignment operator (e.g., '=', '+=')
     * @param {QASTNode} left The left-hand side of the assignment.
     * @param {QASTNode} right The right-hand side of the assignment.
     * @param {?object} location
     */
    constructor(operator, left, right, location) {
        super('AssignmentExpression', location);
        this.operator = operator;
        this.left = left;
        this.right = right;
    }
}

/**
 * A binary expression (e.g., `a + b`).
 * @extends QASTNode
 */
class BinaryExpression extends QASTNode {
    /**
     * @param {string} operator The binary operator.
     * @param {QASTNode} left The left operand.
     * @param {QASTNode} right The right operand.
     * @param {?object} location
     */
    constructor(operator, left, right, location) {
        super('BinaryExpression', location);
        this.operator = operator;
        this.left = left;
        this.right = right;
    }
}

/**
 * A logical expression (e.g., `a && b`).
 * @extends QASTNode
 */
class LogicalExpression extends QASTNode {
    /**
     * @param {'&&' | '||'} operator The logical operator.
     * @param {QASTNode} left The left operand.
     * @param {QASTNode} right The right operand.
     * @param {?object} location
     */
    constructor(operator, left, right, location) {
        super('LogicalExpression', location);
        this.operator = operator;
        this.left = left;
        this.right = right;
    }
}

/**
 * A unary expression (e.g., `-a`, `!b`).
 * @extends QASTNode
 */
class UnaryExpression extends QASTNode {
    /**
     * @param {string} operator The unary operator.
     * @param {QASTNode} argument The operand.
     * @param {boolean} prefix True if the operator is a prefix.
     * @param {?object} location
     */
    constructor(operator, argument, prefix, location) {
        super('UnaryExpression', location);
        this.operator = operator;
        this.argument = argument;
        this.prefix = prefix;
    }
}

/**
 * A member expression (e.g., `a.b`, `a[b]`).
 * @extends QASTNode
 */
class MemberExpression extends QASTNode {
    /**
     * @param {QASTNode} object The object.
     * @param {QASTNode} property The property.
     * @param {boolean} computed True if the property is computed (e.g., `a[b]`).
     * @param {?object} location
     */
    constructor(object, property, computed, location) {
        super('MemberExpression', location);
        this.object = object;
        this.property = property;
        this.computed = computed;
    }
}

/**
 * An identifier (e.g., a variable name).
 * @extends QASTNode
 */
class Identifier extends QASTNode {
    /**
     * @param {string} name The name of the identifier.
     * @param {?object} location
     */
    constructor(name, location) {
        super('Identifier', location);
        this.name = name;
    }
}

/**
 * A literal value (e.g., a number, string, boolean).
 * @extends QASTNode
 */
class Literal extends QASTNode {
    /**
     * @param {string | number | boolean | null} value The literal value.
     * @param {?object} location
     */
    constructor(value, location) {
        super('Literal', location);
        this.value = value;
        this.raw = String(value);
    }
}


// --- Quantum Circuit Layer ---
// Nodes representing quantum-specific concepts and operations.

/**
 * A quantum bit (qubit) register declaration.
 * @extends QASTNode
 */
class QubitDeclaration extends QASTNode {
    /**
     * @param {Identifier} identifier The name of the qubit register.
     * @param {?QASTNode} size The size of the register (an expression).
     * @param {?object} location
     */
    constructor(identifier, size, location) {
        super('QubitDeclaration', location);
        this.identifier = identifier;
        this.size = size;
    }
}

/**
 * A classical bit (cbit) register declaration.
 * @extends QASTNode
 */
class CbitDeclaration extends QASTNode {
    /**
     * @param {Identifier} identifier The name of the classical register.
     * @param {?QASTNode} size The size of the register (an expression).
     * @param {?object} location
     */
    constructor(identifier, size, location) {
        super('CbitDeclaration', location);
        this.identifier = identifier;
        this.size = size;
    }
}

/**
 * A quantum gate application.
 * @extends QASTNode
 */
class QuantumGate extends QASTNode {
    /**
     * @param {Identifier} name The name of the gate (e.g., 'H', 'CX').
     * @param {QASTNode[]} params An array of classical expressions for gate parameters (e.g., for U-gates).
     * @param {QubitIdentifier[]} qubits The target qubits for the gate.
     * @param {?object} location
     */
    constructor(name, params, qubits, location) {
        super('QuantumGate', location);
        this.name = name;
        this.params = params;
        this.qubits = qubits;
    }
}

/**
 * A measurement operation.
 * @extends QASTNode
 */
class QuantumMeasurement extends QASTNode {
    /**
     * @param {QubitIdentifier} qubit The qubit to be measured.
     * @param {CbitIdentifier} cbit The classical bit to store the result.
     * @param {?object} location
     */
    constructor(qubit, cbit, location) {
        super('QuantumMeasurement', location);
        this.qubit = qubit;
        this.cbit = cbit;
    }
}

/**
 * A reset operation on a qubit.
 * @extends QASTNode
 */
class QuantumReset extends QASTNode {
    /**
     * @param {QubitIdentifier} qubit The qubit to be reset.
     * @param {?object} location
     */
    constructor(qubit, location) {
        super('QuantumReset', location);
        this.qubit = qubit;
    }
}

/**
 * A barrier instruction, used for synchronization or visualization.
 * @extends QASTNode
 */
class Barrier extends QASTNode {
    /**
     * @param {QubitIdentifier[]} qubits The qubits to apply the barrier to.
     * @param {?object} location
     */
    constructor(qubits, location) {
        super('Barrier', location);
        this.qubits = qubits;
    }
}

/**
 * An identifier for a specific qubit or an entire qubit register.
 * @extends QASTNode
 */
class QubitIdentifier extends QASTNode {
    /**
     * @param {Identifier} name The name of the qubit register.
     * @param {?QASTNode} index The index of the qubit in the register (an expression). If null, refers to the whole register.
     * @param {?object} location
     */
    constructor(name, index, location) {
        super('QubitIdentifier', location);
        this.name = name;
        this.index = index;
    }
}

/**
 * An identifier for a specific classical bit or an entire classical register.
 * @extends QASTNode
 */
class CbitIdentifier extends QASTNode {
    /**
     * @param {Identifier} name The name of the classical register.
     * @param {?QASTNode} index The index of the bit in the register (an expression). If null, refers to the whole register.
     * @param {?object} location
     */
    constructor(name, index, location) {
        super('CbitIdentifier', location);
        this.name = name;
        this.index = index;
    }
}


module.exports = {
    // Base
    QASTNode,

    // Classical Control Flow Layer
    Program,
    BlockStatement,
    ExpressionStatement,
    VariableDeclaration,
    VariableDeclarator,
    IfStatement,
    ForStatement,
    WhileStatement,
    FunctionDeclaration,
    ReturnStatement,
    CallExpression,
    AssignmentExpression,
    BinaryExpression,
    LogicalExpression,
    UnaryExpression,
    MemberExpression,
    Identifier,
    Literal,

    // Quantum Circuit Layer
    QubitDeclaration,
    CbitDeclaration,
    QuantumGate,
    QuantumMeasurement,
    QuantumReset,
    Barrier,
    QubitIdentifier,
    CbitIdentifier,
};