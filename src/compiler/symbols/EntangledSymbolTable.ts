export enum SymbolKind {
    Variable = 'Variable',
    Function = 'Function',
    Class = 'Class',
    QuantumBit = 'QuantumBit',
    EntangledPair = 'EntangledPair'
}

export interface QuantumStateOutcome {
    /** The probability weight of this outcome (0.0 to 1.0). */
    probability: number;
    /** The concrete value resulting from this outcome. */
    value: any;
}

/**
 * Base interface for all symbols in the .u language.
 */
export interface Symbol {
    name: string;
    kind: SymbolKind;
    scopeId: number;
    typeSignature: string;
    /** For runtime interpretation: stores the current value of the symbol. */
    value?: any;
}

/**
 * Represents a symbol with quantum properties, capable of superposition and entanglement.
 */
export interface EntangledSymbol extends Symbol {
    kind: SymbolKind.QuantumBit;
    isCollapsed: boolean;
    /** The ID of the entanglement group this symbol belongs to, if any. */
    entanglementGroupId: string | null;
    /** The set of possible states before measurement. */
    superposition: QuantumStateOutcome[];
}

/**
 * Manages a cluster of symbols that are entangled together.
 * When one member is measured, the state of the group must be resolved coherently.
 */
interface EntanglementGroup {
    id: string;
    members: Set<string>; // Set of symbol names
}

/**
 * A specialized Symbol Table for the .u language that handles scope management
 * and the resolution of quantum entangled states.
 */
export class EntangledSymbolTable {
    private scopes: Map<string, Symbol | EntangledSymbol>[];
    private currentScopeIndex: number;
    private entanglementGroups: Map<string, EntanglementGroup>;

    constructor() {
        this.scopes = [new Map()];
        this.currentScopeIndex = 0;
        this.entanglementGroups = new Map();
    }

    /**
     * Pushes a new scope onto the stack (e.g., entering a function or block).
     */
    public enterScope(): void {
        this.scopes.push(new Map());
        this.currentScopeIndex++;
    }

    /**
     * Pops the current scope from the stack, cleaning up local symbols.
     */
    public exitScope(): void {
        if (this.currentScopeIndex === 0) {
            throw new Error("Cannot exit the global scope.");
        }
        this.scopes.pop();
        this.currentScopeIndex--;
    }

    /**
     * Defines a standard (classical) variable in the current scope.
     * @param name The name of the variable.
     * @param typeSignature The type definition.
     * @param value Initial value.
     */
    public define(name: string, typeSignature: string, value: any = null): void {
        const scope = this.getCurrentScope();
        if (scope.has(name)) {
            throw new Error(`Symbol '${name}' is already defined in the current scope.`);
        }

        const symbol: Symbol = {
            name,
            kind: SymbolKind.Variable,
            scopeId: this.currentScopeIndex,
            typeSignature,
            value
        };

        scope.set(name, symbol);
    }

    /**
     * Defines a quantum symbol (Qubit or superposition variable).
     * @param name The name of the symbol.
     * @param typeSignature The type definition.
     * @param superposition An array of possible outcomes and their probabilities.
     */
    public defineQuantum(name: string, typeSignature: string, superposition: QuantumStateOutcome[]): void {
        const scope = this.getCurrentScope();
        if (scope.has(name)) {
            throw new Error(`Symbol '${name}' is already defined in the current scope.`);
        }

        // Verify probability normalization
        const totalProbability = superposition.reduce((sum, outcome) => sum + outcome.probability, 0);
        if (Math.abs(totalProbability - 1.0) > 0.0001) {
            throw new Error(`Superposition probabilities for '${name}' must sum to 1.0.`);
        }

        const symbol: EntangledSymbol = {
            name,
            kind: SymbolKind.QuantumBit,
            scopeId: this.currentScopeIndex,
            typeSignature,
            isCollapsed: false,
            value: null,
            entanglementGroupId: null,
            superposition
        };

        scope.set(name, symbol);
    }

    /**
     * Retrieves a symbol by name, searching from the current scope up to the global scope.
     */
    public resolve(name: string): Symbol | EntangledSymbol | undefined {
        for (let i = this.currentScopeIndex; i >= 0; i--) {
            const scope = this.scopes[i];
            if (scope.has(name)) {
                return scope.get(name);
            }
        }
        return undefined;
    }

    /**
     * Creates an entanglement link between two quantum symbols.
     * If either symbol is already part of a group, the groups are merged.
     */
    public entangle(symbolNameA: string, symbolNameB: string): void {
        const symA = this.resolve(symbolNameA);
        const symB = this.resolve(symbolNameB);

        if (!symA || !this.isQuantumSymbol(symA)) {
            throw new Error(`Symbol '${symbolNameA}' is not a valid quantum symbol.`);
        }
        if (!symB || !this.isQuantumSymbol(symB)) {
            throw new Error(`Symbol '${symbolNameB}' is not a valid quantum symbol.`);
        }

        if (symA.isCollapsed || symB.isCollapsed) {
            throw new Error("Cannot entangle symbols that have already collapsed.");
        }

        const groupA = symA.entanglementGroupId;
        const groupB = symB.entanglementGroupId;

        if (groupA && groupB && groupA !== groupB) {
            this.mergeEntanglementGroups(groupA, groupB);
        } else if (groupA) {
            this.addSymbolToGroup(groupA, symB);
        } else if (groupB) {
            this.addSymbolToGroup(groupB, symA);
        } else {
            this.createEntanglementGroup(symA, symB);
        }
    }

    /**
     * Simulates the measurement of a symbol.
     * - For classical symbols, returns the value.
     * - For quantum symbols, collapses the superposition (and any entangled partners) and returns the result.
     */
    public measure(name: string): any {
        const symbol = this.resolve(name);
        if (!symbol) {
            throw new Error(`Symbol '${name}' not found.`);
        }

        if (!this.isQuantumSymbol(symbol)) {
            return symbol.value;
        }

        if (symbol.isCollapsed) {
            return symbol.value;
        }

        // Perform collapse
        if (symbol.entanglementGroupId) {
            return this.collapseEntangledGroup(symbol.entanglementGroupId, symbol);
        } else {
            return this.collapseSingleSymbol(symbol);
        }
    }

    // --- Private Helper Methods ---

    private getCurrentScope(): Map<string, Symbol | EntangledSymbol> {
        return this.scopes[this.currentScopeIndex];
    }

    private isQuantumSymbol(symbol: Symbol): symbol is EntangledSymbol {
        return symbol.kind === SymbolKind.QuantumBit;
    }

    private generateGroupId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    private createEntanglementGroup(symA: EntangledSymbol, symB: EntangledSymbol): void {
        const id = this.generateGroupId();
        const group: EntanglementGroup = {
            id,
            members: new Set([symA.name, symB.name])
        };
        this.entanglementGroups.set(id, group);
        symA.entanglementGroupId = id;
        symB.entanglementGroupId = id;
    }

    private addSymbolToGroup(groupId: string, symbol: EntangledSymbol): void {
        const group = this.entanglementGroups.get(groupId);
        if (group) {
            group.members.add(symbol.name);
            symbol.entanglementGroupId = groupId;
        }
    }

    private mergeEntanglementGroups(groupIdA: string, groupIdB: string): void {
        const groupA = this.entanglementGroups.get(groupIdA);
        const groupB = this.entanglementGroups.get(groupIdB);

        if (!groupA || !groupB) return;

        // Move all members from B to A
        for (const memberName of groupB.members) {
            groupA.members.add(memberName);
            const memberSym = this.resolve(memberName);
            if (memberSym && this.isQuantumSymbol(memberSym)) {
                memberSym.entanglementGroupId = groupIdA;
            }
        }

        this.entanglementGroups.delete(groupIdB);
    }

    private collapseSingleSymbol(symbol: EntangledSymbol): any {
        const outcome = this.pickRandomOutcome(symbol.superposition);
        symbol.value = outcome;
        symbol.isCollapsed = true;
        return outcome;
    }

    private collapseEntangledGroup(groupId: string, triggerSymbol: EntangledSymbol): any {
        const group = this.entanglementGroups.get(groupId);
        if (!group) return this.collapseSingleSymbol(triggerSymbol);

        // 1. Determine the outcome for the trigger symbol
        const triggerOutcome = this.pickRandomOutcome(triggerSymbol.superposition);
        triggerSymbol.value = triggerOutcome;
        triggerSymbol.isCollapsed = true;

        // 2. Propagate collapse to all other members
        // In this simplified model, we assume perfect correlation (Bell state |Φ+⟩ equivalent)
        // where entangled particles collapse to the same state if possible.
        for (const memberName of group.members) {
            if (memberName === triggerSymbol.name) continue;

            const memberSym = this.resolve(memberName);
            if (memberSym && this.isQuantumSymbol(memberSym) && !memberSym.isCollapsed) {
                // For simulation purposes, we assign the same value.
                // In a more complex physics engine, this would depend on the specific entanglement type.
                memberSym.value = triggerOutcome;
                memberSym.isCollapsed = true;
            }
        }

        // 3. Remove the group as the state is now classical
        this.entanglementGroups.delete(groupId);

        return triggerOutcome;
    }

    private pickRandomOutcome(outcomes: QuantumStateOutcome[]): any {
        const rand = Math.random();
        let cumulative = 0;
        
        for (const outcome of outcomes) {
            cumulative += outcome.probability;
            if (rand <= cumulative) {
                return outcome.value;
            }
        }
        
        // Fallback for floating point rounding errors
        return outcomes[outcomes.length - 1].value;
    }
}