/**
 * @file Implements the semantic analysis phase, specifically for type checking.
 * It will traverse the QAST and enforce the rules of the Holographic Type System,
 * ensuring type safety across the classical-quantum boundary.
 *
 * @author AI Programmer
 * @date 2024-07-29
 */

// --- Type Definitions ---

/**
 * The basic types of the language, covering both classical and quantum domains.
 * @enum {string}
 */
export const HolographicType = {
    INT: 'int',
    FLOAT: 'float',
    BOOL: 'bool',
    STRING: 'string',
    VOID: 'void',
    QUBIT: 'qubit',
    QREG: 'qreg',
    FUNCTION: 'function',
    // Future types: CREG, ARRAY, etc.
};

// --- Custom Error ---

/**
 * Represents a type error found during semantic analysis.
 */
class TypeError extends Error {
    /**
     * @param {string} message The error message.
     * @param {object} node The QAST node where the error occurred.
     */
    constructor(message, node) {
        const location = node.loc ? `at line ${node.loc.start.line}, column ${node.loc.start.column}` : '';
        super(`${message} ${location}`);
        this.name = 'TypeError';
        this.node = node;
    }
}

// --- Symbol Table for Scope Management ---

/**
 * Manages scopes and symbols (variables, functions) during semantic analysis.
 */
class SymbolTable {
    constructor() {
        // A stack of scopes, with the global scope at the bottom.
        // Each scope is a Map<string, object>.
        this.scopes = [new Map()];
    }

    /** Enters a new scope (e.g., for a function body or block). */
    enterScope() {
        this.scopes.push(new Map());
    }

    /** Exits the current scope. */
    exitScope() {
        if (this.scopes.length > 1) {
            this.scopes.pop();
        }
    }

    /**
     * Inserts a symbol into the current (innermost) scope.
     * @param {string} name The name of the symbol.
     * @param {object} symbol The symbol's data (e.g., { type, node }).
     */
    insert(name, symbol) {
        this.scopes[this.scopes.length - 1].set(name, symbol);
    }

    /**
     * Looks for a symbol, starting from the innermost scope and going outwards.
     * @param {string} name The name of the symbol to find.
     * @returns {object|null} The symbol data or null if not found.
     */
    lookup(name) {
        for (let i = this.scopes.length - 1; i >= 0; i--) {
            if (this.scopes[i].has(name)) {
                return this.scopes[i].get(name);
            }
        }
        return null;
    }

    /**
     * Looks for a symbol only in the current scope.
     * @param {string} name The name of the symbol to find.
     * @returns {object|null} The symbol data or null if not found.
     */
    lookupCurrentScope(name) {
        const currentScope = this.scopes[this.scopes.length - 1];
        return currentScope.get(name) || null;
    }
}


// --- The Main Type Checker Class ---

/**
 * Traverses a Quantum Abstract Syntax Tree (QAST) to perform type checking.
 */
export class TypeChecker {
    constructor() {
        this.symbolTable = new SymbolTable();
        this.errors = [];
        this.currentFunctionReturnType = null;
    }

    /**
     * The main entry point for the type checker.
     * @param {object} qast - The root of the Quantum Abstract Syntax Tree.
     * @returns {Array<TypeError>} A list of type errors found.
     */
    check(qast) {
        this.errors = [];
        this.symbolTable = new SymbolTable();
        this.currentFunctionReturnType = null;
        try {
            this.visit(qast);
        } catch (e) {
            if (e instanceof TypeError) {
                this.errors.push(e);
            } else {
                // Re-throw unexpected, non-semantic errors
                console.error("An unexpected error occurred during type checking:", e);
                throw e;
            }
        }
        return this.errors;
    }

    /**
     * Generic visit method that dispatches to the specific node type visitor.
     * @param {object} node - The QAST node to visit.
     * @returns {string|null} The type of the expression node, or null for statements.
     */
    visit(node) {
        if (!node || !node.type) {
            return null;
        }

        const visitorMethod = `visit${node.type}`;
        if (this[visitorMethod]) {
            return this[visitorMethod](node);
        } else {
            throw new Error(`No visitor method found for QAST node type: ${node.type}`);
        }
    }

    // --- Visitor Methods for Statements ---

    visitProgram(node) {
        node.body.forEach(statement => this.visit(statement));
    }

    visitVariableDeclaration(node) {
        const varName = node.id.name;
        const declaredType = node.qtype;

        if (this.symbolTable.lookupCurrentScope(varName)) {
            throw new TypeError(`Identifier '${varName}' has already been declared`, node.id);
        }

        if (node.init) {
            const initType = this.visit(node.init);
            if (!this.isAssignable(declaredType, initType)) {
                throw new TypeError(`Cannot initialize variable of type '${declaredType}' with a value of type '${initType}'`, node.init);
            }
        }

        this.symbolTable.insert(varName, { type: declaredType, node });
    }

    visitFunctionDeclaration(node) {
        const funcName = node.id.name;
        const returnType = node.returnType;

        if (this.symbolTable.lookupCurrentScope(funcName)) {
            throw new TypeError(`Identifier '${funcName}' has already been declared`, node.id);
        }

        const paramTypes = node.params.map(p => p.qtype);
        this.symbolTable.insert(funcName, {
            type: HolographicType.FUNCTION,
            returnType: returnType,
            paramTypes: paramTypes,
            node
        });

        this.symbolTable.enterScope();
        this.currentFunctionReturnType = returnType;

        node.params.forEach(param => {
            const paramName = param.id.name;
            if (this.symbolTable.lookupCurrentScope(paramName)) {
                throw new TypeError(`Duplicate parameter name '${paramName}'`, param.id);
            }
            this.symbolTable.insert(paramName, { type: param.qtype, node: param });
        });

        this.visit(node.body);

        this.currentFunctionReturnType = null;
        this.symbolTable.exitScope();
    }

    visitBlockStatement(node) {
        this.symbolTable.enterScope();
        node.body.forEach(stmt => this.visit(stmt));
        this.symbolTable.exitScope();
    }

    visitReturnStatement(node) {
        if (this.currentFunctionReturnType === null) {
            throw new TypeError(`'return' statement is only allowed inside a function`, node);
        }

        const returnValueType = node.argument ? this.visit(node.argument) : HolographicType.VOID;

        if (!this.isAssignable(this.currentFunctionReturnType, returnValueType)) {
            throw new TypeError(`Type '${returnValueType}' is not assignable to the function's return type '${this.currentFunctionReturnType}'`, node);
        }
    }

    visitExpressionStatement(node) {
        this.visit(node.expression);
    }

    visitIfStatement(node) {
        const testType = this.visit(node.test);
        if (testType !== HolographicType.BOOL) {
            throw new TypeError(`If statement condition must be a boolean, but got '${testType}'`, node.test);
        }
        this.visit(node.consequent);
        if (node.alternate) {
            this.visit(node.alternate);
        }
    }

    // --- Visitor Methods for Expressions ---

    visitAssignmentExpression(node) {
        const leftType = this.visit(node.left);
        const rightType = this.visit(node.right);

        if (!this.isAssignable(leftType, rightType)) {
            throw new TypeError(`Cannot assign type '${rightType}' to a variable of type '${leftType}'`, node);
        }
        return leftType;
    }

    visitBinaryExpression(node) {
        const leftType = this.visit(node.left);
        const rightType = this.visit(node.right);

        switch (node.operator) {
            case '+':
            case '-':
            case '*':
            case '/':
                if (this.isNumeric(leftType) && this.isNumeric(rightType)) {
                    return (leftType === HolographicType.FLOAT || rightType === HolographicType.FLOAT) ? HolographicType.FLOAT : HolographicType.INT;
                }
                if (leftType === HolographicType.STRING && rightType === HolographicType.STRING && node.operator === '+') {
                    return HolographicType.STRING;
                }
                throw new TypeError(`Operator '${node.operator}' cannot be applied to types '${leftType}' and '${rightType}'`, node);

            case '>':
            case '<':
            case '>=':
            case '<=':
                if (this.isNumeric(leftType) && this.isNumeric(rightType)) {
                    return HolographicType.BOOL;
                }
                throw new TypeError(`Comparison operator '${node.operator}' cannot be applied to types '${leftType}' and '${rightType}'`, node);

            case '==':
            case '!=':
                if (this.isComparable(leftType, rightType)) {
                    return HolographicType.BOOL;
                }
                throw new TypeError(`Equality operator '${node.operator}' cannot be applied to types '${leftType}' and '${rightType}'`, node);

            case '&&':
            case '||':
                if (leftType === HolographicType.BOOL && rightType === HolographicType.BOOL) {
                    return HolographicType.BOOL;
                }
                throw new TypeError(`Logical operator '${node.operator}' requires boolean operands, but got '${leftType}' and '${rightType}'`, node);

            default:
                throw new TypeError(`Unsupported binary operator '${node.operator}'`, node);
        }
    }

    visitUnaryExpression(node) {
        const operandType = this.visit(node.argument);
        switch (node.operator) {
            case '-':
                if (this.isNumeric(operandType)) {
                    return operandType;
                }
                throw new TypeError(`Operator '-' cannot be applied to type '${operandType}'`, node);
            case '!':
                if (operandType === HolographicType.BOOL) {
                    return HolographicType.BOOL;
                }
                throw new TypeError(`Operator '!' cannot be applied to type '${operandType}'`, node);
            default:
                throw new TypeError(`Unsupported unary operator '${node.operator}'`, node);
        }
    }

    visitCallExpression(node) {
        const calleeName = node.callee.name;
        const symbol = this.symbolTable.lookup(calleeName);

        if (!symbol || symbol.type !== HolographicType.FUNCTION) {
            throw new TypeError(`'${calleeName}' is not a function`, node.callee);
        }

        const { paramTypes: expectedArgTypes, returnType } = symbol;
        const actualArgs = node.arguments;

        if (expectedArgTypes.length !== actualArgs.length) {
            throw new TypeError(`Function '${calleeName}' expects ${expectedArgTypes.length} arguments, but received ${actualArgs.length}`, node);
        }

        actualArgs.forEach((arg, i) => {
            const actualType = this.visit(arg);
            const expectedType = expectedArgTypes[i];
            if (!this.isAssignable(expectedType, actualType)) {
                throw new TypeError(`Argument ${i + 1} of function '${calleeName}' has wrong type. Expected '${expectedType}', but got '${actualType}'`, arg);
            }
        });

        return returnType;
    }

    // --- Quantum-specific Visitors ---

    visitQuantumGate(node) {
        // Gate application is a statement, doesn't return a value.
        const gateName = node.gate.name;

        node.targets.forEach(target => {
            const targetType = this.visit(target);
            if (!this.isQuantumType(targetType)) {
                throw new TypeError(`Quantum gate '${gateName}' can only target qubits or qregs, not '${targetType}'`, target);
            }
        });

        if (node.controls) {
            node.controls.forEach(control => {
                const controlType = this.visit(control);
                if (!this.isQuantumType(controlType)) {
                    throw new TypeError(`Control for gate '${gateName}' must be a qubit or qreg, not '${controlType}'`, control);
                }
            });
        }
    }

    visitMeasureStatement(node) {
        const quantumSourceType = this.visit(node.quantum);
        if (!this.isQuantumType(quantumSourceType)) {
            throw new TypeError(`Can only measure a qubit or qreg, not '${quantumSourceType}'`, node.quantum);
        }

        const classicalDestType = this.visit(node.classical);
        // Measurement result is a bit or a collection of bits.
        // We enforce that it must be stored in a classical type like 'bool' or 'int'.
        if (classicalDestType !== HolographicType.BOOL && classicalDestType !== HolographicType.INT) {
            throw new TypeError(`Measurement result must be stored in a 'bool' or 'int', not '${classicalDestType}'`, node.classical);
        }
    }

    // --- Leaf Node Visitors ---

    visitIdentifier(node) {
        const symbol = this.symbolTable.lookup(node.name);
        if (!symbol) {
            throw new TypeError(`Undefined identifier '${node.name}'`, node);
        }
        if (symbol.type === HolographicType.FUNCTION) {
            throw new TypeError(`Cannot use function '${node.name}' as a value without calling it`, node);
        }
        return symbol.type;
    }

    visitLiteral(node) {
        switch (typeof node.value) {
            case 'number':
                return Number.isInteger(node.value) ? HolographicType.INT : HolographicType.FLOAT;
            case 'string':
                return HolographicType.STRING;
            case 'boolean':
                return HolographicType.BOOL;
            default:
                throw new TypeError(`Unknown literal type for value: ${node.value}`, node);
        }
    }

    // --- Type Helper Methods ---

    /**
     * Checks if a type is numeric (int or float).
     * @param {string} type The type to check.
     * @returns {boolean}
     */
    isNumeric(type) {
        return type === HolographicType.INT || type === HolographicType.FLOAT;
    }

    /**
     * Checks if a type is quantum (qubit or qreg).
     * @param {string} type The type to check.
     * @returns {boolean}
     */
    isQuantumType(type) {
        return type === HolographicType.QUBIT || type === HolographicType.QREG;
    }

    /**
     * Checks if a value of `sourceType` can be assigned to a variable of `targetType`.
     * Allows for implicit casting, e.g., int to float.
     * @param {string} targetType The type of the variable being assigned to.
     * @param {string} sourceType The type of the value being assigned.
     * @returns {boolean}
     */
    isAssignable(targetType, sourceType) {
        if (targetType === sourceType) {
            return true;
        }
        // Allow assigning an int to a float
        if (targetType === HolographicType.FLOAT && sourceType === HolographicType.INT) {
            return true;
        }
        return false;
    }

    /**
     * Checks if two types can be compared with '==' or '!='.
     * @param {string} leftType
     * @param {string} rightType
     * @returns {boolean}
     */
    isComparable(leftType, rightType) {
        if (leftType === rightType) {
            return true;
        }
        if (this.isNumeric(leftType) && this.isNumeric(rightType)) {
            return true;
        }
        // Quantum states cannot be directly compared for equality in this manner.
        if (this.isQuantumType(leftType) || this.isQuantumType(rightType)) {
            return false;
        }
        return false;
    }
}