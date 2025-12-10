/**
 * @file src/runtime/metrics/QuantumGating.ts
 * @description Implements Runtime Quantum Gating, using quantum circuits to
 * dynamically control performance metric collection.
 *
 * This module provides a mechanism to probabilistically enable or disable metric
 * collection based on the outcome of a simulated quantum circuit. This allows for
 * adaptive, non-deterministic sampling of performance data, reducing overhead
 * while maintaining statistical relevance.
 */

// --- Complex Number Utilities ---

/**
 * Represents a complex number in the form a + bi.
 */
type Complex = {
    readonly re: number;
    readonly im: number;
};

const C_ZERO: Complex = { re: 0, im: 0 };
const C_ONE: Complex = { re: 1, im: 0 };
const C_I: Complex = { re: 0, im: 1 };

/**
 * Adds two complex numbers.
 * @param a The first complex number.
 * @param b The second complex number.
 * @returns The sum of a and b.
 */
function cAdd(a: Complex, b: Complex): Complex {
    return { re: a.re + b.re, im: a.im + b.im };
}

/**
 * Multiplies two complex numbers.
 * @param a The first complex number.
 * @param b The second complex number.
 * @returns The product of a and b.
 */
function cMultiply(a: Complex, b: Complex): Complex {
    return {
        re: a.re * b.re - a.im * b.im,
        im: a.re * b.im + a.im * b.re,
    };
}

/**
 * Calculates the squared magnitude of a complex number (|z|^2).
 * This is equivalent to the probability amplitude.
 * @param a The complex number.
 * @returns The squared magnitude.
 */
function cMagnitudeSq(a: Complex): number {
    return a.re * a.re + a.im * a.im;
}


// --- Quantum Simulation Core ---

/**
 * Represents the state of a single qubit as a vector of complex amplitudes
 * [alpha, beta] corresponding to the |0> and |1> basis states.
 * alpha|0> + beta|1>
 */
type QubitState = [Complex, Complex];

/**
 * Represents a single-qubit quantum gate as a 2x2 unitary matrix.
 */
type QuantumGate = [[Complex, Complex], [Complex, Complex]];

/**
 * A list of supported quantum gate identifiers.
 */
export type GateName = 'I' | 'H' | 'X' | 'Z' | 'S' | 'T';

const INV_SQRT_2 = 1 / Math.sqrt(2);

/**
 * A dictionary of standard quantum gates.
 */
const GATES: Readonly<Record<GateName, QuantumGate>> = {
    /** Identity gate (does nothing). */
    I: [
        [C_ONE, C_ZERO],
        [C_ZERO, C_ONE],
    ],
    /** Hadamard gate (creates superposition). */
    H: [
        [{ re: INV_SQRT_2, im: 0 }, { re: INV_SQRT_2, im: 0 }],
        [{ re: INV_SQRT_2, im: 0 }, { re: -INV_SQRT_2, im: 0 }],
    ],
    /** Pauli-X gate (quantum NOT). */
    X: [
        [C_ZERO, C_ONE],
        [C_ONE, C_ZERO],
    ],
    /** Pauli-Z gate (phase flip). */
    Z: [
        [C_ONE, C_ZERO],
        [C_ZERO, { re: -1, im: 0 }],
    ],
    /** Phase gate (S gate). */
    S: [
        [C_ONE, C_ZERO],
        [C_ZERO, C_I],
    ],
    /** T gate (pi/8 gate). */
    T: [
        [C_ONE, C_ZERO],
        [C_ZERO, { re: Math.cos(Math.PI / 4), im: Math.sin(Math.PI / 4) }], // e^(i*pi/4)
    ],
};

/**
 * The initial state of a qubit, |0>.
 */
const QUBIT_ZERO: QubitState = [C_ONE, C_ZERO];

/**
 * Applies a quantum gate to a qubit state.
 * @param gate The quantum gate matrix to apply.
 * @param qubit The current state of the qubit.
 * @returns The new state of the qubit after the gate is applied.
 */
function applyGate(gate: QuantumGate, qubit: QubitState): QubitState {
    const [[g00, g01], [g10, g11]] = gate;
    const [alpha, beta] = qubit;

    const nextAlpha = cAdd(cMultiply(g00, alpha), cMultiply(g01, beta));
    const nextBeta = cAdd(cMultiply(g10, alpha), cMultiply(g11, beta));

    return [nextAlpha, nextBeta];
}

/**
 * Measures a qubit in the computational basis.
 * This collapses the qubit's superposition to either |0> or |1> based on its
 * probability amplitudes.
 * @param qubit The qubit state to measure.
 * @returns The measurement outcome, 0 or 1.
 */
function measure(qubit: QubitState): 0 | 1 {
    const [alpha] = qubit;
    const prob0 = cMagnitudeSq(alpha);
    const rand = Math.random();

    // The sum of probabilities |alpha|^2 + |beta|^2 must be 1.
    // We only need to check against the probability of being in state |0>.
    return rand < prob0 ? 0 : 1;
}


// --- QuantumGating Class ---

/**
 * Configuration for a QuantumGating instance, defining the circuit to be used.
 */
export interface QuantumGatingConfig {
    /**
     * An array of gate names that define the quantum circuit.
     * The gates are applied in sequence to a qubit initialized in the |0> state.
     * The final measurement of this qubit determines the gating decision.
     *
     * Example circuits:
     * - ['H']: 50% probability of collection.
     * - ['X', 'H']: 50% probability of collection (same as ['H']).
     * - []: 0% probability (always measures 0).
     * - ['X']: 100% probability (always measures 1).
     */
    circuit: GateName[];
}

/**
 * Implements a quantum-inspired probabilistic gate for controlling runtime features
 * like performance metric collection.
 *
 * It simulates a simple quantum circuit and uses the measurement outcome to make
 * a boolean decision. This allows for fine-grained, probabilistic control over
 * expensive runtime operations.
 */
export class QuantumGating {
    private readonly compiledCircuit: ReadonlyArray<QuantumGate>;

    /**
     * Creates a new QuantumGating instance.
     * @param config The configuration defining the quantum circuit.
     */
    constructor(config: QuantumGatingConfig) {
        this.compiledCircuit = this.compileCircuit(config.circuit);
    }

    /**
     * Compiles a list of gate names into a sequence of gate matrices.
     * @param circuit The array of gate names.
     * @returns An array of quantum gate matrices.
     */
    private compileCircuit(circuit: GateName[]): ReadonlyArray<QuantumGate> {
        return Object.freeze(circuit.map(name => {
            const gate = GATES[name];
            if (!gate) {
                // This should ideally not happen with TypeScript's type safety
                throw new Error(`Unknown quantum gate: ${name}`);
            }
            return gate;
        }));
    }

    /**
     * Runs the quantum circuit simulation and returns the measurement outcome.
     * This method is the public interface for making a probabilistic decision.
     *
     * @returns `true` if the metric should be collected (qubit measured as 1),
     *          `false` otherwise (qubit measured as 0).
     */
    public shouldCollect(): boolean {
        // 1. Initialize a qubit in the |0> state.
        let qubitState: QubitState = QUBIT_ZERO;

        // 2. Apply each gate in the compiled circuit sequentially.
        for (const gate of this.compiledCircuit) {
            qubitState = applyGate(gate, qubitState);
        }

        // 3. Measure the final state of the qubit.
        const measurement = measure(qubitState);

        // 4. The decision is true if the measurement outcome is 1.
        return measurement === 1;
    }
}