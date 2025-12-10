/**
 * @fileoverview The engine for the 'Quantum Macro System'.
 * This module provides the core functionality for defining, parsing, and expanding
 * context-aware quantum macros. It enables the dynamic generation of quantum
 * circuit descriptions from a higher-level macro language.
 *
 * The system is designed to be extensible, allowing users to define custom
 * macros that can perform complex, context-dependent circuit generation at
 * "compile-time".
 */

/**
 * Represents an error during macro parsing or expansion.
 */
class MacroError extends Error {
    /**
     * @param {string} message The error message.
     */
    constructor(message) {
        super(message);
        this.name = 'MacroError';
    }
}

/**
 * The core engine for the Quantum Macro System.
 * Manages macro definitions and the expansion process.
 */
class MacroEngine {
    /**
     * Initializes a new MacroEngine instance.
     */
    constructor() {
        /**
         * A map storing registered macro handlers.
         * @type {Map<string, Function>}
         * @private
         */
        this.macros = new Map();

        /**
         * A regex to find macro invocations, e.g., @MACRO_NAME(arg1, "arg2", ...);
         * It captures the name and the arguments string.
         * Note: This regex is simple and may not handle all edge cases like
         * nested parentheses within arguments. A more robust tokenizer/parser
         * would be required for a full-featured language.
         * @type {RegExp}
         * @private
         */
        this.macroRegex = /@(\w+)\s*\(([^)]*)\);/g;
    }

    /**
     * Registers a new macro.
     * @param {string} name The name of the macro (case-sensitive).
     * @param {Function} handler The function to execute when the macro is expanded.
     *   The handler receives an array of arguments and the current expansion context.
     *   It should return a string representing the expanded code.
     * @returns {this} The MacroEngine instance for chaining.
     */
    registerMacro(name, handler) {
        if (typeof name !== 'string' || name.length === 0) {
            throw new MacroError('Macro name must be a non-empty string.');
        }
        if (typeof handler !== 'function') {
            throw new MacroError(`Handler for macro '${name}' must be a function.`);
        }
        this.macros.set(name, handler);
        return this;
    }

    /**
     * Parses a raw argument string from a macro invocation into an array of values.
     * Handles numbers, identifiers, and strings in double or single quotes.
     * @param {string} argsString The raw string of arguments, e.g., 'q0, 2, "hello"'.
     * @returns {Array<string|number>} An array of parsed arguments.
     * @private
     */
    _parseArgs(argsString) {
        if (!argsString.trim()) {
            return [];
        }
        // This is a simplified parser. It splits by comma but tries to respect quotes.
        const args = [];
        const regex = /(?:"[^"]*"|'[^']*'|[^,]+)/g;
        let match;
        while ((match = regex.exec(argsString)) !== null) {
            let arg = match[0].trim();
            if (!arg) continue;

            // Remove quotes from strings
            if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
                args.push(arg.slice(1, -1));
            } else if (!isNaN(arg) && arg.trim() !== '') {
                // Convert to number if possible
                args.push(parseFloat(arg));
            } else {
                // Treat as an identifier/string literal
                args.push(arg);
            }
        }
        return args;
    }

    /**
     * Expands all macro invocations within a given source string.
     * The expansion is performed iteratively to handle nested macros, where the
     * output of one macro may contain another macro call.
     * @param {string} source The source string containing macro calls.
     * @param {object} [initialContext={}] An initial context object for the expansion.
     *   This context is passed to and can be modified by macro handlers.
     * @returns {string} The source string with all macros expanded.
     * @throws {MacroError} If an undefined macro is called, an error occurs during
     *   expansion, or an infinite loop is detected.
     */
    expand(source, initialContext = {}) {
        let currentSource = source;
        const context = { ...initialContext };
        let expansionOccurred;
        let pass = 0;
        const maxPasses = 100; // Safety break to prevent infinite loops

        do {
            expansionOccurred = false;
            pass++;
            if (pass > maxPasses) {
                throw new MacroError('Maximum expansion depth exceeded. Possible infinite macro loop.');
            }

            const nextSource = currentSource.replace(this.macroRegex, (match, name, argsString) => {
                if (this.macros.has(name)) {
                    expansionOccurred = true;
                    const handler = this.macros.get(name);
                    try {
                        const args = this._parseArgs(argsString);
                        const expansionResult = handler(args, context);
                        // Ensure the result is a string to avoid 'undefined' or other types in the output
                        return String(expansionResult ?? '');
                    } catch (error) {
                        // Propagate error with more context
                        throw new MacroError(`Error expanding macro @${name}: ${error.message}`);
                    }
                }
                // If macro is not found, throw an error to enforce strict macro usage.
                throw new MacroError(`Undefined macro: @${name}`);
            });

            currentSource = nextSource;

        } while (expansionOccurred);

        return currentSource;
    }
}

export { MacroEngine, MacroError };