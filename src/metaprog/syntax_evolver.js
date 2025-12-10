/**
 * @file Implements the 'Adaptive Evolution of Syntax Post-Deployment' feature.
 * This module provides a mechanism to dynamically define, load, and integrate
 * new syntax constructs into the terminal's compiler and runtime.
 */

const SYNTAX_STORAGE_KEY = 'terminal.evolvedSyntax';

/**
 * @typedef {Object} SyntaxDefinition
 * @property {'keyword' | 'operator' | 'block' | 'custom'} type - The type of the syntax construct.
 * @property {RegExp} pattern - A regular expression to match the syntax in an input string.
 *   The regex should typically be anchored (e.g., with `^`) to match from the start of a command.
 * @property {Function} handler - A function to execute when the syntax is matched.
 *   It receives the runtime instance and the result of `pattern.exec(input)`.
 *   It can be synchronous or asynchronous.
 * @property {string} [description] - An optional description for help systems.
 */

/**
 * Manages the dynamic evolution of the terminal's syntax.
 * It allows new commands and syntax structures to be defined and integrated
 * at runtime, without requiring a full application redeployment.
 */
export class SyntaxEvolver {
    /**
     * The central registry for dynamically defined syntax.
     * @type {Map<string, SyntaxDefinition>}
     * @private
     */
    _syntaxRegistry = new Map();

    /**
     * A reference to the terminal's command parser.
     * @type {object}
     * @private
     */
    _parser;

    /**
     * A reference to the terminal's runtime environment.
     * @type {object}
     * @private
     */
    _runtime;

    /**
     * Creates an instance of the SyntaxEvolver.
     * @param {object} parser - The terminal's command parser instance. It must have a `parse` method.
     * @param {object} runtime - The terminal's runtime environment. It will be passed to syntax handlers.
     */
    constructor(parser, runtime) {
        if (!parser || typeof parser.parse !== 'function') {
            throw new Error('SyntaxEvolver requires a parser with a `parse` method.');
        }
        if (!runtime) {
            throw new Error('SyntaxEvolver requires a runtime instance.');
        }
        this._parser = parser;
        this._runtime = runtime;

        console.log("SyntaxEvolver initialized. Ready to evolve.");
    }

    /**
     * Integrates the dynamic syntax handling into the core parser and runtime.
     * This method "patches" the system to first check for evolved syntax
     * before falling back to its native logic.
     * This should be called once after the evolver is initialized.
     */
    integrate() {
        // 1. Patch the parser
        const originalParse = this._parser.parse.bind(this._parser);
        this._parser.parse = (input) => {
            for (const [name, definition] of this._syntaxRegistry.entries()) {
                const match = definition.pattern.exec(input);
                if (match) {
                    // If a dynamic syntax matches, we create a special AST-like node
                    // that the runtime can execute directly.
                    console.log(`Evolved syntax matched: ${name}`);
                    return {
                        type: 'EvolvedSyntaxNode',
                        name: name,
                        handler: definition.handler,
                        match: match,
                        source: input,
                    };
                }
            }
            // If no evolved syntax matches, fall back to the original parser.
            return originalParse(input);
        };

        // 2. Patch the runtime's executor
        if (this._runtime && typeof this._runtime.execute === 'function') {
            const originalExecute = this._runtime.execute.bind(this._runtime);
            this._runtime.execute = async (node) => {
                if (node && node.type === 'EvolvedSyntaxNode') {
                    try {
                        // The handler is called with the runtime context and the regex match.
                        return await Promise.resolve(node.handler(this._runtime, node.match));
                    } catch (error) {
                        console.error(`Error executing evolved syntax '${node.name}':`, error);
                        if (typeof this._runtime.printError === 'function') {
                           this._runtime.printError(`Execution error in '${node.name}': ${error.message}`);
                        }
                        return { success: false, error };
                    }
                }
                return await originalExecute(node);
            };
        }

        console.log("SyntaxEvolver integrated with parser and runtime.");
    }

    /**
     * Defines a new syntax construct and adds it to the registry.
     * @param {string} name - A unique name for the new syntax (e.g., 'alias-command').
     * @param {SyntaxDefinition} definition - The definition of the syntax.
     * @returns {boolean} - True if the definition was added, false if validation fails or name exists.
     */
    define(name, definition) {
        if (this._syntaxRegistry.has(name)) {
            console.warn(`Syntax with name "${name}" already exists. Use 'redefine' to overwrite.`);
            return false;
        }
        
        if (!definition || !(definition.pattern instanceof RegExp) || typeof definition.handler !== 'function') {
            console.error(`Invalid syntax definition for "${name}". It must have a RegExp 'pattern' and a function 'handler'.`);
            return false;
        }

        this._syntaxRegistry.set(name, definition);
        console.log(`New syntax defined: "${name}"`);
        return true;
    }

    /**
     * Updates an existing syntax definition or defines a new one if it doesn't exist.
     * @param {string} name - The unique name for the syntax.
     * @param {SyntaxDefinition} definition - The definition of the syntax.
     */
    redefine(name, definition) {
        if (!definition || !(definition.pattern instanceof RegExp) || typeof definition.handler !== 'function') {
            console.error(`Invalid syntax definition for "${name}". It must have a RegExp 'pattern' and a function 'handler'.`);
            return;
        }
        this._syntaxRegistry.set(name, definition);
        console.log(`Syntax redefined: "${name}"`);
    }

    /**
     * Removes a syntax definition from the registry.
     * @param {string} name - The name of the syntax to remove.
     * @returns {boolean} - True if the syntax was found and removed, false otherwise.
     */
    undefine(name) {
        const deleted = this._syntaxRegistry.delete(name);
        if (deleted) {
            console.log(`Syntax undefined: "${name}"`);
        }
        return deleted;
    }

    /**
     * Retrieves a syntax definition by name.
     * @param {string} name - The name of the syntax to retrieve.
     * @returns {SyntaxDefinition | undefined}
     */
    getDefinition(name) {
        return this._syntaxRegistry.get(name);
    }

    /**
     * Lists the names of all currently defined dynamic syntax constructs.
     * @returns {string[]}
     */
    list() {
        return Array.from(this._syntaxRegistry.keys());
    }

    /**
     * Saves the current syntax registry to the browser's localStorage.
     * Note: This serializes handler functions to strings. Deserialization
     * requires `new Function`, which can have security implications if the
     * stored data is compromised.
     */
    saveToStorage() {
        try {
            const serializable = Array.from(this._syntaxRegistry.entries()).map(([name, def]) => ({
                name,
                type: def.type,
                pattern: { source: def.pattern.source, flags: def.pattern.flags },
                handler: def.handler.toString(),
                description: def.description,
            }));
            localStorage.setItem(SYNTAX_STORAGE_KEY, JSON.stringify(serializable));
            console.log("Evolved syntax registry saved to localStorage.");
        } catch (error) {
            console.error("Failed to save syntax registry to localStorage:", error);
        }
    }

    /**
     * Loads and rehydrates syntax definitions from localStorage.
     * This uses `new Function` to reconstruct handler functions from their
     * string representation. Use with caution.
     */
    loadFromStorage() {
        try {
            const storedSyntax = localStorage.getItem(SYNTAX_STORAGE_KEY);
            if (!storedSyntax) return;

            const parsed = JSON.parse(storedSyntax);
            if (!Array.isArray(parsed)) {
                console.error("Invalid syntax data in localStorage.");
                return;
            }

            this._syntaxRegistry.clear();
            for (const item of parsed) {
                try {
                    const definition = {
                        type: item.type,
                        pattern: new RegExp(item.pattern.source, item.pattern.flags),
                        // SECURITY NOTE: Reconstructing a function from a string is powerful
                        // but can be a security risk. In the context of a user's own localStorage,
                        // the risk is primarily to the user themselves.
                        handler: new Function('runtime', 'match', `return (${item.handler})(runtime, match);`),
                        description: item.description,
                    };
                    this.define(item.name, definition);
                } catch (e) {
                    console.error(`Failed to rehydrate syntax definition "${item.name}":`, e);
                }
            }
            console.log("Evolved syntax registry loaded from localStorage.");
        } catch (error) {
            console.error("Failed to load syntax registry from localStorage:", error);
        }
    }

    /**
     * Loads syntax definitions from a remote JSON file.
     * The file format should be the same as the one used for localStorage.
     * @param {string} url - The URL to fetch the syntax definitions from.
     * @param {object} [options] - Configuration options.
     * @param {boolean} [options.merge=false] - If true, merges with existing definitions. If false, replaces them.
     */
    async loadFromUrl(url, { merge = false } = {}) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            if (!Array.isArray(data)) {
                throw new Error("Fetched data is not a valid syntax definition array.");
            }

            if (!merge) {
                this._syntaxRegistry.clear();
            }

            for (const item of data) {
                 try {
                    const definition = {
                        type: item.type,
                        pattern: new RegExp(item.pattern.source, item.pattern.flags),
                        handler: new Function('runtime', 'match', `return (${item.handler})(runtime, match);`),
                        description: item.description,
                    };
                    this.redefine(item.name, definition); // Use redefine to allow overwriting
                } catch (e) {
                    console.error(`Failed to load syntax definition "${item.name}" from URL:`, e);
                }
            }
            console.log(`Evolved syntax loaded from ${url}.`);
        } catch (error) {
            console.error(`Failed to load syntax from URL "${url}":`, error);
            throw error; // Re-throw for the caller to handle
        }
    }
}