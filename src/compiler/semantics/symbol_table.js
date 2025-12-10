/**
 * @fileoverview Implements the classical symbol table for managing scopes,
 * variables, and function declarations. It will handle variable binding and
 * resolution for the classical parts of the Q-Script code.
 *
 * This symbol table uses a stack-based approach to manage nested lexical scopes.
 */

/**
 * Defines the types of symbols that can be stored in the table.
 * Using an object as a pseudo-enum for clarity and consistency.
 * @enum {string}
 */
export const SymbolType = {
    VARIABLE: 'variable',
    CONSTANT: 'const',
    FUNCTION: 'function',
    PARAMETER: 'parameter',
    BUILTIN: 'builtin',
    CLASS: 'class',
    MODULE: 'module',
};

/**
 * Represents a single symbol (variable, function, etc.) in the symbol table.
 * This is a plain object structure for simplicity.
 * @typedef {object} Symbol
 * @property {string} name - The identifier of the symbol.
 * @property {SymbolType} type - The type of the symbol.
 * @property {number} scopeLevel - The nesting level of the scope where the symbol is defined.
 * @property {any} [metadata=null] - Optional additional data, such as a reference to the AST node.
 */

/**
 * Manages scopes and symbols for the Q-Script compiler.
 * It uses a stack of scopes to handle lexical scoping rules, where each scope
 * is a map of symbol names to their corresponding Symbol objects.
 */
export class SymbolTable {
    constructor() {
        /**
         * A stack of scopes. Each scope is a Map from a symbol name (string) to a Symbol object.
         * The last element in the array is the current, most deeply nested scope.
         * @type {Array<Map<string, Symbol>>}
         * @private
         */
        this.scopeStack = [];

        /**
         * The current nesting level of the scope. The global scope is at level 0.
         * @type {number}
         * @private
         */
        this.scopeLevel = -1;

        this.init();
    }

    /**
     * Initializes the symbol table by creating the global scope.
     * This is the place where built-in functions and constants would be defined.
     * @private
     */
    init() {
        this.enterScope(); // Create the global scope (level 0)
    }

    /**
     * Enters a new scope, increasing the scope level.
     * This is typically called when the semantic analyzer encounters a new block,
     * function definition, or other constructs that create a new lexical scope.
     */
    enterScope() {
        this.scopeLevel++;
        const newScope = new Map();
        this.scopeStack.push(newScope);
    }

    /**
     * Exits the current scope, decreasing the scope level.
     * This is called when the semantic analyzer leaves a block or function.
     * @throws {Error} If an attempt is made to exit the global scope, which indicates a bug in the compiler.
     */
    exitScope() {
        if (this.scopeLevel <= 0) {
            throw new Error("Compiler error: Cannot exit global scope.");
        }
        this.scopeStack.pop();
        this.scopeLevel--;
    }

    /**
     * Defines a new symbol in the current (innermost) scope.
     *
     * @param {string} name - The name of the symbol to define.
     * @param {SymbolType} type - The type of the symbol (e.g., VARIABLE, FUNCTION).
     * @param {any} [metadata=null] - Optional metadata associated with the symbol (e.g., an AST node).
     * @returns {Symbol | null} The created Symbol object if successful, or null if a symbol
     *                          with the same name is already defined in the current scope.
     */
    define(name, type, metadata = null) {
        const currentScope = this.getCurrentScope();
        if (currentScope.has(name)) {
            // Symbol is already defined in this scope, which is a semantic error.
            return null;
        }

        const symbol = {
            name,
            type,
            scopeLevel: this.scopeLevel,
            metadata,
        };

        currentScope.set(name, symbol);
        return symbol;
    }

    /**
     * Resolves a symbol name by searching from the current scope outwards to the global scope.
     * This mimics how lexical scoping works in most languages.
     *
     * @param {string} name - The name of the symbol to resolve.
     * @returns {Symbol | null} The found Symbol object, or null if the symbol is not defined
     *                          in any accessible scope.
     */
    resolve(name) {
        // Iterate backwards from the current scope to the global scope.
        for (let i = this.scopeStack.length - 1; i >= 0; i--) {
            const scope = this.scopeStack[i];
            if (scope.has(name)) {
                return scope.get(name);
            }
        }
        return null; // Symbol not found in any scope.
    }

    /**
     * Resolves a symbol name only within the current scope.
     * This is primarily useful for checking for re-declarations within the same block.
     *
     * @param {string} name - The name of the symbol to look for.
     * @returns {Symbol | null} The found Symbol object, or null if it's not in the current scope.
     */
    resolveInCurrentScope(name) {
        const currentScope = this.getCurrentScope();
        return currentScope.get(name) || null;
    }

    /**
     * Gets the current scope object (the one at the top of the stack).
     * @returns {Map<string, Symbol>} The current scope map.
     * @throws {Error} If there is no active scope, which indicates a bug.
     */
    getCurrentScope() {
        if (this.scopeStack.length === 0) {
            throw new Error("Compiler error: Symbol table has no active scope.");
        }
        return this.scopeStack[this.scopeStack.length - 1];
    }

    /**
     * Gets the current scope's nesting level.
     * @returns {number} The current scope level (0 for global).
     */
    getCurrentScopeLevel() {
        return this.scopeLevel;
    }
}

// Default export for easy importing in other compiler modules.
export default SymbolTable;