/**
 * @file Implements the system for 'Contextual Quantum Overloading of Operators'.
 * This module provides the infrastructure to define and apply operators (+, *, etc.)
 * whose behavior changes based on the current execution context (e.g., simulation,
 * QPU execution, or symbolic manipulation). This allows for a single, high-level
 * quantum algorithm representation to be executed in multiple ways.
 */

/**
 * Defines the possible execution contexts for quantum operations.
 * @enum {string}
 */
export const ExecutionContext = {
    /** For running simulations on a classical computer, typically using matrices and state vectors. */
    SIMULATION: 'SIMULATION',
    /** For compiling and sending operations to a real or simulated Quantum Processing Unit. */
    QPU: 'QPU',
    /** For manipulating expressions symbolically without numerical evaluation. */
    SYMBOLIC: 'SYMBOLIC',
};

/**
 * A special key for registering a default operator implementation that is used
 * when no context-specific implementation is found.
 * @type {string}
 */
export const CONTEXT_DEFAULT = 'DEFAULT';

/**
 * A map of supported operator symbols to their semantic meaning.
 * This helps in providing clear error messages and documentation.
 * @enum {string}
 */
export const Operator = {
    ADD: '+',
    SUBTRACT: '-',
    MULTIPLY: '*',
    DIVIDE: '/',
    TENSOR_PRODUCT: '⊗',
    MATRIX_MULTIPLY: '@',
    POWER: '**',
    EQUAL: '==',
    NOT_EQUAL: '!=',
};


// --- State Management ---

let currentContext = ExecutionContext.SIMULATION;

/**
 * The central registry for all overloaded operator implementations.
 * Structure: { operatorSymbol: { context: implementationFn, ... }, ... }
 * @private
 * @type {Object<string, Object<string, Function>>}
 */
const operatorRegistry = {};


// --- Public API ---

/**
 * Sets the global execution context for all subsequent operator applications.
 * @param {ExecutionContext} newContext - The new context to set.
 * @throws {Error} If the provided context is not a valid ExecutionContext.
 */
export function setExecutionContext(newContext) {
    if (!Object.values(ExecutionContext).includes(newContext)) {
        throw new Error(`Invalid execution context: "${newContext}". Must be one of [${Object.values(ExecutionContext).join(', ')}].`);
    }
    currentContext = newContext;
}

/**
 * Gets the current global execution context.
 * @returns {ExecutionContext} The current execution context.
 */
export function getExecutionContext() {
    return currentContext;
}

/**
 * Registers an implementation for a given operator in a specific context.
 *
 * @param {Operator | string} operatorSymbol - The operator symbol (e.g., '+', '*').
 * @param {ExecutionContext | CONTEXT_DEFAULT} context - The context in which this implementation applies.
 * @param {Function} implementation - The function to execute for this operator in this context.
 *   It will receive the operands as arguments.
 * @throws {Error} If the context or implementation is invalid.
 */
export function registerOperator(operatorSymbol, context, implementation) {
    if (!Object.values(ExecutionContext).includes(context) && context !== CONTEXT_DEFAULT) {
        throw new Error(`Invalid context for registration: "${context}".`);
    }

    if (typeof implementation !== 'function') {
        throw new Error(`Implementation for operator "${operatorSymbol}" must be a function.`);
    }

    if (!operatorRegistry[operatorSymbol]) {
        operatorRegistry[operatorSymbol] = {};
    }

    operatorRegistry[operatorSymbol][context] = implementation;
}

/**
 * Applies an operator to a set of operands using the implementation for the
 * current execution context.
 *
 * If an implementation for the current context is not found, it will fall back
 * to the `CONTEXT_DEFAULT` implementation if one is registered.
 *
 * @param {Operator | string} operatorSymbol - The operator symbol (e.g., '+', '*').
 * @param {...any} operands - The operands to apply the operator to.
 * @returns {any} The result of the operation.
 * @throws {Error} If the operator is not defined or has no implementation for the
 *   current context (and no default).
 */
export function applyOperator(operatorSymbol, ...operands) {
    const context = getExecutionContext();
    const operatorSet = operatorRegistry[operatorSymbol];

    if (!operatorSet) {
        throw new Error(`Operator "${operatorSymbol}" is not defined. Register it first using registerOperator.`);
    }

    // Prioritize the specific context implementation
    let implementation = operatorSet[context];

    // Fallback to the default implementation if the specific one doesn't exist
    if (!implementation) {
        implementation = operatorSet[CONTEXT_DEFAULT];
    }

    if (!implementation) {
        throw new Error(`Operator "${operatorSymbol}" has no implementation for the current context "${context}" and no default implementation.`);
    }

    try {
        return implementation(...operands);
    } catch (e) {
        // Add more context to the error for easier debugging
        console.error(`Error applying operator "${operatorSymbol}" in context "${context}" with operands:`, operands);
        e.message = `[Operator Overload Error] ${e.message}`;
        throw e;
    }
}

/**
 * Clears all registered operator implementations.
 * Useful for testing or resetting the system state.
 */
export function clearRegistry() {
    for (const key in operatorRegistry) {
        delete operatorRegistry[key];
    }
}

/**
 * Retrieves the implementation function for a given operator and context.
 * This is useful for introspection or debugging.
 * @param {Operator | string} operatorSymbol - The operator symbol.
 * @param {ExecutionContext | CONTEXT_DEFAULT} context - The context.
 * @returns {Function | undefined} The implementation function, or undefined if not found.
 */
export function getImplementation(operatorSymbol, context) {
    return operatorRegistry[operatorSymbol]?.[context];
}

/**
 * Checks if an operator has any registered implementations.
 * @param {Operator | string} operatorSymbol - The operator symbol to check.
 * @returns {boolean} True if the operator is registered, false otherwise.
 */
export function isOperatorDefined(operatorSymbol) {
    return operatorSymbol in operatorRegistry;
}