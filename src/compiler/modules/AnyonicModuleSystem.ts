/**
 * @file Implements the logic for treating Quantum Modules as Anyons,
 * enforcing braiding and fusion rules.
 *
 * This system models the .u language's module composition using concepts from
 * Topological Quantum Field Theory (TQFT). Each module is treated as an "anyon",
 * a quasi-particle whose quantum statistics are more complex than simple bosons
 * or fermions. The interactions between modules (e.g., importing, composing) are
 * governed by "fusion" and "braiding" rules, analogous to the physical behavior
 * of anyons. This enforces a robust, topologically-aware module system that can
 * prevent certain classes of errors and enable powerful, context-dependent
 * compositions.
 */

// --- Core Type Definitions ---

/**
 * Represents the type of an anyon. In our system, this corresponds to the
 * fundamental category of a module.
 * e.g., 'I' (Vacuum/Identity), 'τ' (Fibonacci), 'σ' (Ising).
 */
export type AnyonType = string;

/**
 * The identity or vacuum anyon type. Represents an empty or base-state module.
 */
export const VACUUM_TYPE: AnyonType = 'I';

/**
 * Represents a complex number, essential for defining braiding phases.
 */
export interface Complex {
    real: number;
    imag: number;
}

/**
 * The potential outcomes of fusing two anyons. The result can be a superposition
 * of multiple anyon types.
 */
export type FusionOutcome = AnyonType[];

/**
 * Defines the fusion algebra for a given anyonic model.
 * It's a map where: Map<AnyonA, Map<AnyonB, Outcome>>
 */
export type FusionRules = Map<AnyonType, Map<AnyonType, FusionOutcome>>;

/**
 * Defines the R-matrices for braiding operations.
 * It's a map where: Map<AnyonA, Map<AnyonB, Map<FusionOutcomeChannel, Phase>>>
 * For simplicity, we map to a single complex phase per outcome channel.
 * The key for the innermost map is the string representation of the outcome AnyonType.
 */
export type BraidingMatrices = Map<AnyonType, Map<AnyonType, Map<AnyonType, Complex>>>;


// --- Anyon Module Representation ---

/**
 * Represents a single module instance within the anyonic system.
 * It tracks its topological type and holds a reference to its actual content.
 */
export class AnyonModule {
    /** A unique identifier for this specific module instance. */
    public readonly id: string;

    /** The topological type of this module (e.g., 'τ'). */
    public readonly type: AnyonType;

    /**
     * A reference to the actual module content, such as an Abstract Syntax Tree (AST)
     * or a compiled artifact. The anyonic system primarily cares about the type,
     * but the payload is what makes the module useful.
     */
    public readonly payload: unknown;

    /**
     * Creates a new AnyonModule instance.
     * @param id A unique identifier for the module instance.
     * @param type The anyonic type of the module.
     * @param payload The actual content or data associated with the module.
     */
    constructor(id: string, type: AnyonType, payload: unknown) {
        this.id = id;
        this.type = type;
        this.payload = payload;
    }
}

// --- System Configuration ---

/**
 * Configuration object for initializing the AnyonicModuleSystem.
 * It contains the complete set of rules for a specific anyon model.
 */
export interface AnyonicSystemConfiguration {
    name: string;
    anyonTypes: AnyonType[];
    fusionRules: FusionRules;
    braidingMatrices: BraidingMatrices;
}

/**
 * Pre-defined configuration for the Fibonacci Anyon model.
 * This model is universal for quantum computation and provides a simple yet
 * powerful example with one non-trivial particle 'τ'.
 *
 * Fusion Rules:
 *   I x I = I
 *   I x τ = τ
 *   τ x τ = I + τ
 */
export const FibonacciModelConfiguration: AnyonicSystemConfiguration = {
    name: 'Fibonacci',
    anyonTypes: [VACUUM_TYPE, 'τ'],
    fusionRules: new Map<AnyonType, Map<AnyonType, FusionOutcome>>([
        [VACUUM_TYPE, new Map<AnyonType, FusionOutcome>([
            [VACUUM_TYPE, [VACUUM_TYPE]],
            ['τ', ['τ']],
        ])],
        ['τ', new Map<AnyonType, FusionOutcome>([
            [VACUUM_TYPE, ['τ']],
            ['τ', [VACUUM_TYPE, 'τ']], // The non-trivial fusion
        ])],
    ]),
    // R-matrices for the τ x τ fusion channels
    // R_ττ^I = e^(i * 4π/5)
    // R_ττ^τ = e^(-i * 3π/5)
    braidingMatrices: new Map<AnyonType, Map<AnyonType, Map<AnyonType, Complex>>>([
        ['τ', new Map<AnyonType, Map<AnyonType, Complex>>([
            ['τ', new Map<AnyonType, Complex>([
                [VACUUM_TYPE, { real: Math.cos(4 * Math.PI / 5), imag: Math.sin(4 * Math.PI / 5) }],
                ['τ', { real: Math.cos(-3 * Math.PI / 5), imag: Math.sin(-3 * Math.PI / 5) }],
            ])],
        ])],
    ]),
};


// --- Main System Logic ---

/**
 * Manages the lifecycle and interactions of AnyonModules.
 * This class is the core of the topological module system, enforcing the rules
 * defined by a given anyonic model (e.g., Fibonacci).
 */
export class AnyonicModuleSystem {
    private readonly config: AnyonicSystemConfiguration;
    private modules: Map<string, AnyonModule> = new Map();
    private nextModuleId: number = 0;

    /**
     * Initializes the module system with a specific set of anyonic rules.
     * @param configuration The configuration defining the anyon model.
     */
    constructor(configuration: AnyonicSystemConfiguration) {
        this.config = configuration;
        this.validateConfiguration(configuration);
    }

    /**
     * Validates the provided system configuration for consistency.
     * @param config The configuration to validate.
     */
    private validateConfiguration(config: AnyonicSystemConfiguration): void {
        if (!config.anyonTypes.includes(VACUUM_TYPE)) {
            throw new Error(`Configuration "${config.name}" must include the VACUUM_TYPE ('${VACUUM_TYPE}').`);
        }
        // Further validation can be added here, e.g., checking for rule completeness.
    }

    /**
     * Creates and registers a new module in the system.
     * @param type The anyonic type of the module to create.
     * @param payload The actual module content (e.g., AST).
     * @returns The newly created AnyonModule instance.
     */
    public createModule(type: AnyonType, payload: unknown): AnyonModule {
        if (!this.config.anyonTypes.includes(type)) {
            throw new Error(`Anyon type "${type}" is not valid for the "${this.config.name}" model.`);
        }
        const id = `module_${this.nextModuleId++}`;
        const module = new AnyonModule(id, type, payload);
        this.modules.set(id, module);
        return module;
    }

    /**
     * Retrieves a module instance by its ID.
     * @param moduleId The ID of the module to retrieve.
     * @returns The AnyonModule instance, or undefined if not found.
     */
    public getModule(moduleId: string): AnyonModule | undefined {
        return this.modules.get(moduleId);
    }

    /**
     * Performs a fusion operation between two modules.
     * This operation consumes the input modules and may produce one or more
     * new modules representing the possible outcomes of the fusion.
     *
     * @param moduleAId The ID of the first module.
     * @param moduleBId The ID of the second module.
     * @returns An array of possible outcome types. In a real compiler, this would
     *          likely result in a new module with a union type or a compiler error
     *          if the fusion is disallowed or ambiguous.
     */
    public fuse(moduleAId: string, moduleBId: string): FusionOutcome {
        const moduleA = this.modules.get(moduleAId);
        const moduleB = this.modules.get(moduleBId);

        if (!moduleA || !moduleB) {
            throw new Error('One or both modules for fusion not found.');
        }

        const outcome = this.config.fusionRules
            .get(moduleA.type)
            ?.get(moduleB.type);

        if (outcome === undefined) {
            throw new Error(`Fusion rule for types "${moduleA.type}" x "${moduleB.type}" is not defined.`);
        }

        // In a real compiler, we would consume the old modules and create new ones.
        // For this simulation, we just return the possible types.
        // this.modules.delete(moduleAId);
        // this.modules.delete(moduleBId);

        return outcome;
    }

    /**
     * Performs a braiding operation between two modules.
     * Braiding represents an exchange in the order of module operations.
     * It doesn't change the modules' types but introduces a topological phase,
     * which can affect subsequent computations.
     *
     * @param moduleAId The ID of the module "crossing over".
     * @param moduleBId The ID of the module "being crossed".
     * @param fusionChannel The specific fusion outcome channel that determines the braiding phase.
     *                      For example, for τ x τ, this could be 'I' or 'τ'.
     * @returns An object containing the braiding phase (an R-matrix element).
     */
    public braid(moduleAId: string, moduleBId: string, fusionChannel: AnyonType): { phase: Complex } {
        const moduleA = this.modules.get(moduleAId);
        const moduleB = this.modules.get(moduleBId);

        if (!moduleA || !moduleB) {
            throw new Error('One or both modules for braiding not found.');
        }

        // Check if the fusion channel is a valid outcome for A x B
        const possibleOutcomes = this.config.fusionRules.get(moduleA.type)?.get(moduleB.type) ?? [];
        if (!possibleOutcomes.includes(fusionChannel)) {
            throw new Error(`Invalid fusion channel "${fusionChannel}" for braiding "${moduleA.type}" and "${moduleB.type}".`);
        }

        const phase = this.config.braidingMatrices
            .get(moduleA.type)
            ?.get(moduleB.type)
            ?.get(fusionChannel);

        // If no specific R-matrix is defined, assume a trivial phase (1 + 0i).
        // This is common for braiding with the vacuum or in abelian anyon models.
        if (phase === undefined) {
            return { phase: { real: 1, imag: 0 } };
        }

        return { phase };
    }

    /**
     * Verifies if a sequence of module interactions (a "worldline diagram") is
     * topologically valid according to the loaded anyon model.
     *
     * @param initialTypes The initial types of anyons in the system.
     * @returns True if the process can result in a single vacuum particle, false otherwise.
     */
    public canAnnihilateToVacuum(initialTypes: AnyonType[]): boolean {
        if (initialTypes.length === 0) {
            return true;
        }

        // This is a simplified checker. A full implementation requires tracking
        // the Hilbert space of possible states. Here, we recursively check if
        // any valid fusion path leads to a single vacuum particle.
        const memo: Map<string, boolean> = new Map();

        const check = (types: AnyonType[]): boolean => {
            const key = types.join(',');
            if (memo.has(key)) {
                return memo.get(key)!;
            }

            if (types.length === 1) {
                const result = types[0] === VACUUM_TYPE;
                memo.set(key, result);
                return result;
            }

            // Try fusing every adjacent pair
            for (let i = 0; i < types.length - 1; i++) {
                const typeA = types[i];
                const typeB = types[i + 1];
                const outcomes = this.config.fusionRules.get(typeA)?.get(typeB);

                if (outcomes) {
                    for (const outcome of outcomes) {
                        const nextTypes = [...types.slice(0, i), outcome, ...types.slice(i + 2)];
                        if (check(nextTypes)) {
                            memo.set(key, true);
                            return true; // Found a valid path to vacuum
                        }
                    }
                }
            }

            memo.set(key, false);
            return false;
        }

        return check(initialTypes);
    }
}

// --- Complex Number Utilities (for phase calculations) ---

/**
 * Multiplies two complex numbers.
 * @param a The first complex number.
 * @param b The second complex number.
 * @returns The product of a and b.
 */
export function multiplyComplex(a: Complex, b: Complex): Complex {
    return {
        real: a.real * b.real - a.imag * b.imag,
        imag: a.real * b.imag + a.imag * b.real,
    };
}

/**
 * Returns a string representation of a complex number.
 * @param c The complex number.
 * @returns A formatted string (e.g., "a + bi").
 */
export function complexToString(c: Complex): string {
    const realPart = c.real.toFixed(4);
    const imagPart = c.imag.toFixed(4);

    if (Math.abs(c.imag) < 1e-9) {
        return realPart;
    }
    if (Math.abs(c.real) < 1e-9) {
        return `${imagPart}i`;
    }
    const sign = c.imag > 0 ? '+' : '-';
    return `${realPart} ${sign} ${Math.abs(c.imag).toFixed(4)}i`;
}