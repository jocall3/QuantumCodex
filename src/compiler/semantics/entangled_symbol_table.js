/**
 * @file src/compiler/semantics/entangled_symbol_table.js
 * @description Implements the Entangled Symbol Table for managing quantum-contingent symbols.
 *
 * This symbol table is a specialized data structure designed for a quantum-inspired
 * programming language. Unlike a classical symbol table that maps identifiers to
 * fixed values, this table manages symbols whose values are probabilistic and
 * potentially correlated with other symbols (entangled).
 *
 * The value of a symbol is resolved (collapses from a superposition to a definite state)
 * only upon "measurement," which is triggered by its first use in a classical context.
 */

/**
 * Represents the possible states of a measured qubit.
 * @enum {number}
 */
const QubitState = {
    ZERO: 0,
    ONE: 1,
};

/**
 * Represents a group of entangled symbols. Measuring one symbol in the group
 * instantly determines the state of all other symbols according to the
 * group's entanglement properties.
 */
class EntanglementGroup {
    /**
     * @param {string} type - The type of entanglement (e.g., 'BELL_STATE_PHI_PLUS').
     * @param {EntangledSymbol[]} symbols - An array of symbols to be entangled.
     */
    constructor(type, symbols) {
        if (symbols.length < 2) {
            throw new Error("Entanglement requires at least two symbols.");
        }
        this.type = type;
        this.symbols = new Set(symbols);
        this.isMeasured = false;

        // Assign this group to each symbol
        for (const symbol of this.symbols) {
            symbol.setEntanglementGroup(this);
        }
    }

    /**
     * Measures the entire group of entangled symbols.
     * This function is the core of the entanglement logic. It collapses the state
     * of all symbols in the group based on a single probabilistic event.
     */
    measure() {
        if (this.isMeasured) {
            return;
        }

        // The measurement logic depends on the type of entanglement.
        switch (this.type) {
            case 'BELL_STATE_PHI_PLUS': // (|00> + |11>) / sqrt(2)
                this._measureBellStatePhiPlus();
                break;
            // Other entanglement types like Bell states Psi+, Psi-, Phi- can be added here.
            default:
                throw new Error(`Unsupported entanglement type: ${this.type}`);
        }

        this.isMeasured = true;
        // Mark all individual symbols as measured as well.
        for (const symbol of this.symbols) {
            symbol.markAsMeasured();
        }
    }

    /**
     * Specific measurement logic for the Bell state Φ+ (|00> + |11>).
     * In this state, all qubits will have the same measurement outcome.
     * @private
     */
    _measureBellStatePhiPlus() {
        if (this.symbols.size !== 2) {
            // For simplicity, this example only supports 2-qubit Bell states.
            // This could be extended to GHZ states for >2 qubits.
            throw new Error("BELL_STATE_PHI_PLUS currently only supports 2-symbol entanglement.");
        }
        const outcome = Math.random() < 0.5 ? QubitState.ZERO : QubitState.ONE;
        for (const symbol of this.symbols) {
            symbol.collapseToValue(outcome);
        }
    }
}


/**
 * Represents a single symbol that can exist in a superposition of states.
 * Its value is determined upon measurement.
 */
class EntangledSymbol {
    /**
     * @param {string} name - The identifier for the symbol.
     * @param {{alpha: number, beta: number}} initialState - The initial quantum state amplitudes for |0> and |1>.
     *                                                     Amplitudes are real numbers for simplicity,
     *                                                     representing sqrt(probability).
     *                                                     Must satisfy |alpha|^2 + |beta|^2 = 1.
     */
    constructor(name, initialState = { alpha: 1, beta: 0 }) { // Defaults to |0> state
        this.name = name;
        this.isMeasured = false;
        this.value = null;
        this.entanglementGroup = null;

        const probSum = initialState.alpha ** 2 + initialState.beta ** 2;
        if (Math.abs(probSum - 1.0) > 1e-9) {
            throw new Error(`Invalid initial state for symbol '${name}'. Probabilities must sum to 1.`);
        }
        this.state = initialState; // { alpha, beta }
    }

    /**
     * Associates this symbol with an entanglement group.
     * @param {EntanglementGroup} group
     */
    setEntanglementGroup(group) {
        if (this.entanglementGroup) {
            throw new Error(`Symbol '${this.name}' is already part of an entanglement group.`);
        }
        this.entanglementGroup = group;
    }

    /**
     * Performs a measurement on the symbol, collapsing its quantum state.
     * If the symbol is part of an entanglement group, it triggers the group's measurement.
     * @returns {QubitState} The collapsed value (0 or 1).
     */
    measure() {
        if (this.isMeasured) {
            return this.value;
        }

        if (this.entanglementGroup) {
            // Measurement is handled by the group to ensure correlation.
            this.entanglementGroup.measure();
        } else {
            // Standalone symbol measurement.
            const probabilityOfZero = this.state.alpha ** 2;
            const outcome = Math.random() < probabilityOfZero ? QubitState.ZERO : QubitState.ONE;
            this.collapseToValue(outcome);
            this.markAsMeasured();
        }

        return this.value;
    }

    /**
     * Forcibly collapses the symbol to a specific value.
     * This is typically called by an EntanglementGroup.
     * @param {QubitState} value - The value to collapse to.
     */
    collapseToValue(value) {
        if (this.isMeasured) {
            // This can happen if the group is measured multiple times; it's not an error.
            return;
        }
        this.value = value;
        // Update state to reflect collapse
        this.state = (value === QubitState.ZERO) ? { alpha: 1, beta: 0 } : { alpha: 0, beta: 1 };
    }

    /**
     * Marks the symbol as measured.
     * Separated from collapseToValue to allow the group to control the measurement flag.
     */
    markAsMeasured() {
        this.isMeasured = true;
    }
}


/**
 * The main Entangled Symbol Table class.
 * Manages scopes and the lifecycle of quantum-contingent symbols.
 */
export class EntangledSymbolTable {
    constructor() {
        /**
         * The scope stack. Each element is a Map of symbol names to EntangledSymbol objects.
         * The first element is the global scope.
         * @type {Map<string, EntangledSymbol>[]}
         */
        this.scopeStack = [new Map()];
    }

    /**
     * Enters a new lexical scope.
     */
    enterScope() {
        this.scopeStack.push(new Map());
    }

    /**
     * Exits the current lexical scope.
     */
    exitScope() {
        if (this.scopeStack.length <= 1) {
            throw new Error("Cannot exit the global scope.");
        }
        this.scopeStack.pop();
    }

    /**
     * Gets the current innermost scope.
     * @private
     * @returns {Map<string, EntangledSymbol>}
     */
    _getCurrentScope() {
        return this.scopeStack[this.scopeStack.length - 1];
    }

    /**
     * Defines a new quantum symbol in the current scope.
     * @param {string} name - The name of the symbol.
     * @param {{alpha: number, beta: number}} [initialState] - The initial quantum state. Defaults to |0>.
     * @returns {EntangledSymbol} The newly created symbol.
     */
    define(name, initialState) {
        const currentScope = this._getCurrentScope();
        if (currentScope.has(name)) {
            throw new Error(`Symbol '${name}' is already defined in the current scope.`);
        }
        const symbol = new EntangledSymbol(name, initialState);
        currentScope.set(name, symbol);
        return symbol;
    }

    /**
     * Looks up a symbol in the table, searching from the current scope outwards.
     * This does NOT trigger a measurement.
     * @param {string} name - The name of the symbol to look up.
     * @returns {EntangledSymbol | undefined} The symbol object, or undefined if not found.
     */
    lookup(name) {
        for (let i = this.scopeStack.length - 1; i >= 0; i--) {
            const scope = this.scopeStack[i];
            if (scope.has(name)) {
                return scope.get(name);
            }
        }
        return undefined;
    }

    /**
     * Resolves a symbol's value. If the symbol has not been measured,
     * this action will trigger its measurement, collapsing its state.
     * @param {string} name - The name of the symbol to resolve.
     * @returns {QubitState} The classical value of the symbol after measurement.
     */
    resolve(name) {
        const symbol = this.lookup(name);
        if (!symbol) {
            throw new Error(`ReferenceError: Symbol '${name}' is not defined.`);
        }
        return symbol.measure();
    }

    /**
     * Entangles two or more symbols that are already defined.
     * @param {string[]} symbolNames - An array of names of the symbols to entangle.
     * @param {string} type - The type of entanglement to create (e.g., 'BELL_STATE_PHI_PLUS').
     */
    entangle(symbolNames, type) {
        const symbolsToEntangle = symbolNames.map(name => {
            const symbol = this.lookup(name);
            if (!symbol) {
                throw new Error(`Cannot entangle '${name}': symbol is not defined.`);
            }
            if (symbol.isMeasured) {
                throw new Error(`Cannot entangle '${name}': symbol has already been measured.`);
            }
            if (symbol.entanglementGroup) {
                throw new Error(`Cannot entangle '${name}': symbol is already part of another entanglement group.`);
            }
            return symbol;
        });

        // This creates the group and also links it back to each symbol.
        new EntanglementGroup(type, symbolsToEntangle);
    }
}