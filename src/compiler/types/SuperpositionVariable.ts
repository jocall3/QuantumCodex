import { v4 as uuidv4 } from 'uuid';

/**
 * Represents a single branch of a superposition, containing a concrete value
 * and its associated probability amplitude (normalized to 0-1 range).
 */
export interface SuperpositionBranch<T> {
    value: T;
    probability: number;
    metadata?: Record<string, any>;
}

/**
 * Configuration options for creating a superposition variable.
 */
export interface SuperpositionOptions {
    normalize?: boolean;
    id?: string;
}

/**
 * The `SuperpositionVariable` represents a quantum-like variable in the .u language.
 * It holds multiple potential states (values) simultaneously, each with a probability weight.
 * 
 * It provides mechanisms to:
 * 1. Transform values while maintaining superposition (map/flatMap).
 * 2. Collapse (measure) the superposition into a single classical value.
 * 3. Inspect the probability distribution.
 */
export class SuperpositionVariable<T> {
    public readonly id: string;
    private branches: SuperpositionBranch<T>[];
    private isCollapsed: boolean = false;
    private collapsedValue: T | null = null;

    /**
     * Creates a new SuperpositionVariable.
     * @param branches An array of possible states and their probabilities.
     * @param options Configuration options.
     */
    constructor(branches: SuperpositionBranch<T>[], options: SuperpositionOptions = {}) {
        this.id = options.id || uuidv4();
        
        if (branches.length === 0) {
            throw new Error("Cannot create a SuperpositionVariable with zero states.");
        }

        if (options.normalize !== false) {
            this.branches = this.normalizeBranches(branches);
        } else {
            this.branches = branches;
            this.validateProbabilitySum();
        }
    }

    /**
     * Creates a superposition where all provided values have equal probability.
     * @param values Array of values to superpose.
     */
    public static fromValues<U>(values: U[]): SuperpositionVariable<U> {
        if (values.length === 0) return new SuperpositionVariable<U>([{ value: undefined as unknown as U, probability: 1 }]);
        
        const prob = 1.0 / values.length;
        const branches = values.map(value => ({
            value,
            probability: prob
        }));
        
        return new SuperpositionVariable(branches, { normalize: true });
    }

    /**
     * Normalizes probabilities so they sum to exactly 1.0.
     */
    private normalizeBranches(branches: SuperpositionBranch<T>[]): SuperpositionBranch<T>[] {
        const totalWeight = branches.reduce((sum, b) => sum + b.probability, 0);
        
        if (totalWeight <= 0) {
            throw new Error("Total probability weight must be greater than zero.");
        }

        return branches.map(b => ({
            ...b,
            probability: b.probability / totalWeight
        }));
    }

    /**
     * Ensures the probabilities sum to approximately 1.0.
     */
    private validateProbabilitySum(): void {
        const sum = this.branches.reduce((acc, b) => acc + b.probability, 0);
        // Allow for small floating point errors
        if (Math.abs(1.0 - sum) > 0.0001) {
            console.warn(`Warning: SuperpositionVariable ${this.id} probabilities sum to ${sum}, not 1.0.`);
        }
    }

    /**
     * "Measures" the variable, collapsing the superposition into a single concrete value
     * based on the probability distribution.
     * 
     * Once collapsed, subsequent calls return the same value (simulating state collapse),
     * unless `reset` is called.
     */
    public collapse(): T {
        if (this.isCollapsed && this.collapsedValue !== null) {
            return this.collapsedValue;
        }

        const random = Math.random();
        let cumulativeProbability = 0;

        for (const branch of this.branches) {
            cumulativeProbability += branch.probability;
            if (random <= cumulativeProbability) {
                this.isCollapsed = true;
                this.collapsedValue = branch.value;
                return branch.value;
            }
        }

        // Fallback for floating point edge cases, return the last branch
        const finalBranch = this.branches[this.branches.length - 1];
        this.isCollapsed = true;
        this.collapsedValue = finalBranch.value;
        return finalBranch.value;
    }

    /**
     * Returns the concrete value if already collapsed, otherwise throws an error.
     * Used when the compiler expects a classical value.
     */
    public getValue(): T {
        if (!this.isCollapsed) {
            return this.collapse();
        }
        return this.collapsedValue as T;
    }

    /**
     * Applies a transformation to every value in the superposition, returning a new
     * SuperpositionVariable. If multiple branches map to the same value, their
     * probabilities are summed (constructive interference).
     */
    public map<U>(transform: (value: T) => U): SuperpositionVariable<U> {
        const newBranchMap = new Map<U, number>();

        for (const branch of this.branches) {
            const newValue = transform(branch.value);
            const existingProb = newBranchMap.get(newValue) || 0;
            newBranchMap.set(newValue, existingProb + branch.probability);
        }

        const newBranches: SuperpositionBranch<U>[] = [];
        newBranchMap.forEach((prob, val) => {
            newBranches.push({ value: val, probability: prob });
        });

        return new SuperpositionVariable(newBranches, { normalize: true }); // Renormalize to handle float drift
    }

    /**
     * Similar to map, but the transformation function returns another SuperpositionVariable.
     * This flattens the resulting nested superposition.
     */
    public flatMap<U>(transform: (value: T) => SuperpositionVariable<U>): SuperpositionVariable<U> {
        const newBranchMap = new Map<U, number>();

        for (const branch of this.branches) {
            const innerSuperposition = transform(branch.value);
            const innerBranches = innerSuperposition.inspect();

            for (const innerBranch of innerBranches) {
                // Joint probability P(A and B) = P(A) * P(B)
                const combinedProb = branch.probability * innerBranch.probability;
                const existingProb = newBranchMap.get(innerBranch.value) || 0;
                newBranchMap.set(innerBranch.value, existingProb + combinedProb);
            }
        }

        const newBranches: SuperpositionBranch<U>[] = [];
        newBranchMap.forEach((prob, val) => {
            newBranches.push({ value: val, probability: prob });
        });

        return new SuperpositionVariable(newBranches, { normalize: true });
    }

    /**
     * Returns the raw probability distribution without collapsing.
     */
    public inspect(): SuperpositionBranch<T>[] {
        return [...this.branches];
    }

    /**
     * Resets the collapse state, allowing the variable to be measured again
     * (Simulating a fresh preparation of the state).
     */
    public reset(): void {
        this.isCollapsed = false;
        this.collapsedValue = null;
    }

    /**
     * Returns a string representation of the superposition for debugging.
     */
    public toString(): string {
        if (this.isCollapsed) {
            return `Collapsed<${String(this.collapsedValue)}>`;
        }
        const states = this.branches
            .map(b => `${String(b.value)}: ${(b.probability * 100).toFixed(1)}%`)
            .join(' | ');
        return `Superposition<${states}>`;
    }
}

/**
 * Specialized type for handling superposed variable names (identifiers).
 * This is used by the compiler when a variable name itself is ambiguous
 * or exists in a superposition of scopes.
 */
export class SuperposedIdentifier extends SuperpositionVariable<string> {
    /**
     * Resolves the identifier against a context lookup function.
     * This collapses the name superposition into a concrete name, then looks it up.
     * 
     * @param lookupFn A function that takes a concrete name and returns a value.
     */
    public resolve<R>(lookupFn: (name: string) => R): R {
        const concreteName = this.collapse();
        return lookupFn(concreteName);
    }

    /**
     * Performs a "quantum lookup" where the result is a superposition of the values
     * found by looking up all possible names.
     * 
     * @param lookupFn A function that takes a concrete name and returns a value.
     */
    public resolveSuperposed<R>(lookupFn: (name: string) => R): SuperpositionVariable<R> {
        return this.map(name => lookupFn(name));
    }
}