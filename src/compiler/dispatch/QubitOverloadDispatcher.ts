/**
 * @file src/compiler/dispatch/QubitOverloadDispatcher.ts
 * @description Handles Qubit-Based Function Overloading, dispatching calls
 * based on the observed quantum state of arguments.
 *
 * This file is a critical component of the .u language compiler, enabling a unique
 * feature where functions can be overloaded not just by the type of their arguments,
 * but by the quantum state of their qubit arguments. This allows for writing highly
 * specialized quantum algorithms in a clear and expressive way.
 *
 * For example:
 *   fn apply_if_zero(q: qubit|0>) { H(q); } // Apply Hadamard only if q is |0>
 *   fn apply_if_one(q: qubit|1>)  { X(q); } // Apply Pauli-X only if q is |1>
 *
 * A call like `apply(my_qubit)` will be dispatched to the correct function at
 * compile time based on the statically analyzed state of `my_qubit`.
 */

// =============================================================================
// NOTE: The following types and classes are simplified stubs for demonstration.
// In the actual compiler, they would be imported from their respective modules.
// For example:
// import { SymbolTable, FunctionSymbol, VariableSymbol } from '../symbol/SymbolTable';
// import { U_Type, QubitType, isQubitType, QubitState } from '../types/U_Types';
// import { CallExpression, FunctionDeclaration, Identifier, Expression } from '../parser/ast';
// import { QuantumStateTracker } from '../analysis/QuantumStateTracker';
// import { CompilationError } from '../errors/CompilationError';
// =============================================================================

// --- Compiler Infrastructure Stubs ---

/** Represents a position in the source code. */
interface SourcePosition {
    line: number;
    column: number;
}

/** Base class for all compilation errors. */
class CompilationError extends Error {
    constructor(message: string, public pos: SourcePosition) {
        super(`${message} at L${pos.line}:${pos.column}`);
        this.name = 'CompilationError';
    }
}

/** Represents the possible classical basis states of a qubit for dispatching. */
export enum QubitState {
    Zero = '|0>',
    One = '|1>',
    Superposition = 'superposition',
    Any = 'any', // Represents a generic qubit parameter that doesn't care about state
    Unknown = 'unknown', // The static analyzer couldn't determine the state
}

/** Base interface for all types in the .u language. */
interface U_Type {
    name: string;
    toString(): string;
}

/** Represents the quantum bit type. It can be specialized with a required state. */
class QubitType implements U_Type {
    readonly name: 'qubit' = 'qubit';
    constructor(public state: QubitState = QubitState.Any) {}

    toString(): string {
        return this.state === QubitState.Any ? 'qubit' : `qubit<${this.state}>`;
    }
}

function isQubitType(type: U_Type): type is QubitType {
    return type instanceof QubitType;
}

// --- Abstract Syntax Tree (AST) Node Stubs ---

interface ASTNode {
    kind: string;
    pos: SourcePosition;
}
interface Expression extends ASTNode {}
interface Identifier extends ASTNode { kind: 'Identifier'; name: string; }
interface ParameterNode extends ASTNode { kind: 'Parameter'; name: Identifier; type: U_Type; }
interface FunctionDeclaration extends ASTNode { kind: 'FunctionDeclaration'; name: Identifier; params: ParameterNode[]; }
interface CallExpression extends Expression { kind: 'CallExpression'; callee: Identifier; args: Expression[]; }

// --- Symbol and Symbol Table Stubs ---

type Symbol = { name: string; kind: 'function' | 'variable'; type: U_Type; };
type VariableSymbol = Symbol & { kind: 'variable'; };
type FunctionSymbol = Symbol & { kind: 'function'; parameters: VariableSymbol[]; declaration: FunctionDeclaration; };

class SymbolTable {
    lookup(name: string): Symbol | undefined {
        // In a real implementation, this would search the current scope stack.
        return undefined;
    }
}

// --- Analysis Stubs ---

/** A stub for the static analysis component that tracks qubit states. */
class QuantumStateTracker {
    getState(variableName: string, pos: SourcePosition): QubitState {
        // A real implementation performs sophisticated flow analysis.
        // This mock provides deterministic behavior for demonstration.
        if (variableName.endsWith('_is_zero')) return QubitState.Zero;
        if (variableName.endsWith('_is_one')) return QubitState.One;
        if (variableName.endsWith('_is_super')) return QubitState.Superposition;
        return QubitState.Unknown;
    }
}

// =============================================================================
// --- Core Implementation ---
// =============================================================================

/**
 * Represents a specific, registered overload of a function.
 */
interface IFunctionOverload {
    /** The AST node for the function declaration. */
    declaration: FunctionDeclaration;
    /** A unique signature string generated from parameter types and qubit states. */
    signature: string;
    /** The formal parameters from the symbol table. */
    parameters: VariableSymbol[];
}

/** A map from a function name to its list of available overloads. */
type OverloadMap = Map<string, IFunctionOverload[]>;

/**
 * Handles Qubit-Based Function Overloading.
 *
 * This dispatcher resolves function calls by matching not only the types of arguments
 * but also the statically-inferred quantum state of qubit arguments. It allows the
 * compiler to select the most specific function implementation based on compile-time
 * knowledge of the quantum state.
 */
export class QubitOverloadDispatcher {
    private readonly overloads: OverloadMap = new Map();

    constructor(
        private readonly symbolTable: SymbolTable,
        private readonly stateTracker: QuantumStateTracker
    ) {}

    /**
     * Generates a unique signature for a function declaration based on its
     * name, parameter types, and specific qubit states.
     * @param funcDecl The function declaration AST node.
     * @returns A unique signature string (e.g., "my_func(int,qubit<|0>)").
     */
    public static generateSignature(funcDecl: FunctionDeclaration): string {
        const paramSignatures = funcDecl.params.map(p => p.type.toString());
        return `${funcDecl.name.name}(${paramSignatures.join(',')})`;
    }

    /**
     * Registers a function declaration as a potential overload.
     * @param funcSymbol The symbol for the function being registered.
     * @throws {CompilationError} if an overload with the same signature already exists.
     */
    public registerOverload(funcSymbol: FunctionSymbol): void {
        const funcName = funcSymbol.name;
        const funcDecl = funcSymbol.declaration;

        if (!this.overloads.has(funcName)) {
            this.overloads.set(funcName, []);
        }

        const overloadList = this.overloads.get(funcName)!;
        const signature = QubitOverloadDispatcher.generateSignature(funcDecl);

        if (overloadList.some(o => o.signature === signature)) {
            throw new CompilationError(
                `Duplicate function overload detected with signature: ${signature}`,
                funcDecl.pos
            );
        }

        overloadList.push({
            declaration: funcDecl,
            signature: signature,
            parameters: funcSymbol.parameters,
        });
    }

    /**
     * Resolves a function call expression to a specific overload.
     * It matches argument types and, for qubits, their inferred states at the call site.
     * @param callExpr The call expression AST node to resolve.
     * @returns The FunctionDeclaration AST node of the matched overload.
     * @throws {CompilationError} if no suitable overload is found or if the call is ambiguous.
     */
    public resolveCall(callExpr: CallExpression): FunctionDeclaration {
        const funcName = callExpr.callee.name;
        const potentialOverloads = this.overloads.get(funcName);

        if (!potentialOverloads || potentialOverloads.length === 0) {
            throw new CompilationError(`No user-defined overloads for function '${funcName}'`, callExpr.pos);
        }

        const matchingOverloads = potentialOverloads.filter(overload =>
            this.isMatch(overload, callExpr)
        );

        if (matchingOverloads.length === 0) {
            // TODO: Provide a more detailed error message, e.g., listing available signatures.
            throw new CompilationError(
                `No matching overload for call to '${funcName}' with the given argument states.`,
                callExpr.pos
            );
        }

        if (matchingOverloads.length > 1) {
            const bestMatch = this.findBestMatch(matchingOverloads);
            if (!bestMatch) {
                throw new CompilationError(
                    `Ambiguous call to function '${funcName}'. Multiple overloads match:\n` +
                    matchingOverloads.map(o => `  - ${o.signature}`).join('\n'),
                    callExpr.pos
                );
            }
            return bestMatch.declaration;
        }

        return matchingOverloads[0].declaration;
    }

    /**
     * Checks if a given overload is a match for a call expression.
     * @param overload The candidate overload.
     * @param callExpr The full call expression for context.
     * @returns True if the overload is a match, false otherwise.
     */
    private isMatch(overload: IFunctionOverload, callExpr: CallExpression): boolean {
        const params = overload.parameters;
        const args = callExpr.args;

        if (params.length !== args.length) {
            return false;
        }

        for (let i = 0; i < params.length; i++) {
            const param = params[i];
            const arg = args[i];
            const paramType = param.type;

            if (isQubitType(paramType)) {
                const requiredState = paramType.state;
                if (requiredState === QubitState.Any) continue;

                if (arg.kind !== 'Identifier') {
                    // Cannot statically determine the state of a complex expression argument.
                    return false;
                }

                const inferredState = this.stateTracker.getState(arg.name, callExpr.pos);

                if (inferredState !== requiredState) {
                    return false; // States do not match.
                }
            }
            // Note: Assumes classical type checking is handled in a preceding compiler stage.
        }

        return true;
    }

    /**
     * From a list of matching overloads, find the "best" one based on specificity.
     * The best match is the most specific one. Specificity is determined by
     * how many parameters have a specific qubit state requirement.
     * e.g., `fn(q: qubit<|0>)` is more specific than `fn(q: qubit)`.
     * @param matches A list of overloads that all match the call.
     * @returns The single best overload, or null if there's an ambiguity.
     */
    private findBestMatch(matches: IFunctionOverload[]): IFunctionOverload | null {
        let bestMatch: IFunctionOverload | null = null;
        let highestSpecificity = -1;
        let isAmbiguous = false;

        for (const match of matches) {
            const specificity = this.calculateSpecificity(match);

            if (specificity > highestSpecificity) {
                highestSpecificity = specificity;
                bestMatch = match;
                isAmbiguous = false;
            } else if (specificity === highestSpecificity) {
                isAmbiguous = true;
            }
        }

        return isAmbiguous ? null : bestMatch;
    }

    /**
     * Calculates a numeric "specificity" score for an overload.
     * Higher scores mean more specific. A parameter with a required state
     * (`qubit<|0>`) is more specific than one without (`qubit`).
     * @param overload The overload to score.
     * @returns A numeric score representing the overload's specificity.
     */
    private calculateSpecificity(overload: IFunctionOverload): number {
        return overload.parameters.reduce((score, param) => {
            if (isQubitType(param.type) && param.type.state !== QubitState.Any) {
                return score + 1;
            }
            return score;
        }, 0);
    }
}