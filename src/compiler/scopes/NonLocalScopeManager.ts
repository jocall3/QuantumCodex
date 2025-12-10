/**
 * @file src/compiler/scopes/NonLocalScopeManager.ts
 * @description Manages Inherently Non-Local Variable Scopes (`qscope`),
 * tracking entangled state references across the program.
 */

/**
 * Represents a location in the source code.
 * This is a fundamental type used for error reporting and semantic analysis.
 */
export interface SourceLocation {
    line: number;
    column: number;
    // Optional file path, useful in multi-file projects.
    file?: string;
}

/**
 * Represents a single "Quantum Scope" (`qscope`).
 * A qscope defines a set of variables that are "entangled", meaning they
 * share a common, non-local state, regardless of their lexical scope.
 */
export interface QScope {
    /** The unique name of the qscope. */
    readonly name: string;

    /** The source code location where the qscope was declared. */
    readonly declarationLocation: SourceLocation;

    /**
     * A map of entangled variable names to their declaration details.
     * Key: variable name.
     * Value: Information about the variable's entanglement point.
     */
    readonly variables: Map<string, { declarationLocation: SourceLocation }>;

    /** A list of all locations where this qscope is referenced or used. */
    readonly references: SourceLocation[];
}

/**
 * Manages Inherently Non-Local Variable Scopes (`qscope`), tracking
 * entangled state references across the entire program.
 *
 * The `qscope` is a core concept in the .u language, allowing for state
 * synchronization between disparate parts of the code without passing
 * references explicitly through function arguments or relying on a global scope.
 * This manager acts as the single source of truth for all qscopes during compilation.
 */
export class NonLocalScopeManager {
    /**
     * A map from qscope names to their corresponding QScope objects.
     * This is the primary registry for all declared qscopes.
     * @private
     */
    private readonly qscopes: Map<string, QScope> = new Map();

    /**
     * A map from variable names to the name of the qscope they belong to.
     * This provides a fast, reverse lookup to find a variable's entangled scope.
     * @private
     */
    private readonly variableToQScopeMap: Map<string, string> = new Map();

    /**
     * Declares a new non-local scope (`qscope`).
     * Throws a compilation error if a qscope with the same name already exists.
     *
     * @param name The unique name of the qscope.
     * @param location The source code location of the `qscope` declaration.
     * @returns The newly created QScope object.
     */
    public declareQScope(name: string, location: SourceLocation): QScope {
        if (this.qscopes.has(name)) {
            const existingScope = this.qscopes.get(name)!;
            // In a real compiler, this would throw a specific CompilationError subclass.
            throw new Error(
                `Semantic Error: Non-local scope '${name}' is already declared at line ${existingScope.declarationLocation.line}.`
            );
        }

        const newQScope: QScope = {
            name,
            declarationLocation: location,
            variables: new Map(),
            references: [],
        };

        this.qscopes.set(name, newQScope);
        return newQScope;
    }

    /**
     * Entangles a variable with a specific `qscope`.
     * This action links the variable's state to the non-local scope.
     * Throws an error if the qscope does not exist or if the variable is already
     * entangled in another scope.
     *
     * @param qscopeName The name of the qscope to associate with.
     * @param variableName The name of the variable to entangle.
     * @param location The source code location of the variable's entanglement.
     */
    public entangleVariable(qscopeName: string, variableName: string, location: SourceLocation): void {
        const qscope = this.qscopes.get(qscopeName);
        if (!qscope) {
            throw new Error(`Semantic Error: Attempted to entangle variable '${variableName}' with non-existent qscope '${qscopeName}' at line ${location.line}.`);
        }

        if (this.variableToQScopeMap.has(variableName)) {
            const existingQScopeName = this.variableToQScopeMap.get(variableName)!;
            const existingQScope = this.qscopes.get(existingQScopeName)!;
            const variableInfo = existingQScope.variables.get(variableName)!;
            throw new Error(
                `Semantic Error: Variable '${variableName}' is already entangled with qscope '${existingQScopeName}' (see line ${variableInfo.declarationLocation.line}).`
            );
        }

        qscope.variables.set(variableName, { declarationLocation: location });
        this.variableToQScopeMap.set(variableName, qscopeName);
    }

    /**
     * Retrieves a `qscope` by its name.
     *
     * @param name The name of the qscope.
     * @returns The QScope object, or undefined if it doesn't exist.
     */
    public getQScope(name: string): QScope | undefined {
        return this.qscopes.get(name);
    }

    /**
     * Finds the `qscope` that a given variable is entangled with.
     * This is a highly efficient lookup.
     *
     * @param variableName The name of the variable.
     * @returns The QScope object, or undefined if the variable is not entangled.
     */
    public findQScopeForVariable(variableName: string): QScope | undefined {
        const qscopeName = this.variableToQScopeMap.get(variableName);
        return qscopeName ? this.qscopes.get(qscopeName) : undefined;
    }

    /**
     * Checks if a variable is part of any non-local scope.
     *
     * @param variableName The name of the variable to check.
     * @returns True if the variable is entangled, false otherwise.
     */
    public isVariableEntangled(variableName: string): boolean {
        return this.variableToQScopeMap.has(variableName);
    }

    /**
     * Records a reference to a qscope. This is useful for tracking usage and
     * for semantic analysis passes (e.g., detecting unused qscopes).
     *
     * @param qscopeName The name of the qscope being referenced.
     * @param location The location of the reference.
     */
    public addReference(qscopeName: string, location: SourceLocation): void {
        const qscope = this.qscopes.get(qscopeName);
        if (qscope) {
            qscope.references.push(location);
        } else {
            // This check is crucial for catching usage of undeclared qscopes.
            throw new Error(`Semantic Error: Reference to undeclared qscope '${qscopeName}' at line ${location.line}.`);
        }
    }

    /**
     * Returns a list of all declared qscopes.
     * Useful for final analysis or code generation passes.
     *
     * @returns A readonly array of all QScope objects.
     */
    public getAllQScopes(): readonly QScope[] {
        return Array.from(this.qscopes.values());
    }
}