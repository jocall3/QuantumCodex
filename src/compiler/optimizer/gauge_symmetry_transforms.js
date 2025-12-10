/**
 * @file Implements Gauge-Symmetry Code Transformations for quantum circuit optimization.
 *
 * This module provides a set of functions to apply logically equivalent
 * transformations to a quantum circuit. These transformations can simplify the circuit,
 * reduce its depth, or adapt it to the constraints of a specific quantum hardware
 * backend. The transformations are based on commutation rules, gate identities,
 * and other principles of quantum mechanics that preserve the overall unitary
 * operation of the circuit (up to a global phase).
 *
 * The primary export is `applyGaugeTransforms`, a function that iteratively
 * applies a series of optimization rules to a given circuit until no further
 * simplification is possible.
 */

// --- Gate Definitions and Utilities ---

/**
 * A map of gate names to their inverses. For self-inverse (Hermitian) gates,
 * the inverse is the gate itself.
 * @type {Object<string, string>}
 */
const GATE_INVERSES = {
    'X': 'X', 'Y': 'Y', 'Z': 'Z', 'H': 'H', 'CX': 'CX', 'CY': 'CY', 'CZ': 'CZ', 'SWAP': 'SWAP',
    'S': 'SDG', 'SDG': 'S',
    'T': 'TDG', 'TDG': 'T',
    'RX': 'RX', 'RY': 'RY', 'RZ': 'RZ', // Inverse is rotation by -theta
};

/**
 * Checks if two gates are on the same qubits, irrespective of order for symmetric gates.
 * @param {object} gate1 - The first gate object.
 * @param {object} gate2 - The second gate object.
 * @returns {boolean} True if the gates act on the same set of qubits.
 */
function onSameQubits(gate1, gate2) {
    if (gate1.qubits.length !== gate2.qubits.length) {
        return false;
    }
    // For single-qubit gates, the check is simple.
    if (gate1.qubits.length === 1) {
        return gate1.qubits[0] === gate2.qubits[0];
    }
    // For multi-qubit gates, we need to consider if the gate is symmetric.
    const symmetricGates = new Set(['CZ', 'SWAP']); // Add other symmetric gates here
    if (symmetricGates.has(gate1.name) && symmetricGates.has(gate2.name)) {
        const q1 = new Set(gate1.qubits);
        const q2 = new Set(gate2.qubits);
        return q1.size === q2.size && [...q1].every(q => q2.has(q));
    }
    // For non-symmetric gates, order matters.
    return gate1.qubits.every((q, i) => q === gate2.qubits[i]);
}

/**
 * Creates a deep copy of a circuit object.
 * @param {object} circuit - The circuit to copy.
 * @returns {object} A new circuit object.
 */
function cloneCircuit(circuit) {
    return {
        ...circuit,
        gates: circuit.gates.map(gate => ({
            ...gate,
            qubits: [...gate.qubits],
            params: gate.params ? [...gate.params] : [],
        })),
    };
}


// --- Transformation Rules ---
// Each rule is a function that takes a list of gates and an index `i`.
// It checks if a transformation can be applied starting at gate `i`.
// If so, it returns an object `{ newGates: [...], consumed: N }` where
// `newGates` is the replacement sequence and `consumed` is the number of
// original gates (from index `i`) that were replaced.
// If not, it returns null.

/**
 * Rule: Remove adjacent inverse gates.
 * e.g., H, H -> I (removed)
 * e.g., S, SDG -> I (removed)
 * e.g., RX(t), RX(-t) -> I (removed)
 * @param {Array<object>} gates - The list of gates in the circuit.
 * @param {number} i - The index of the current gate to check.
 * @returns {{newGates: Array<object>, consumed: number}|null}
 */
function cancelInverseGates(gates, i) {
    if (i + 1 >= gates.length) return null;

    const g1 = gates[i];
    const g2 = gates[i + 1];

    if (!onSameQubits(g1, g2)) return null;

    const inverseName = GATE_INVERSES[g1.name];
    if (g2.name === inverseName) {
        // Handle parameterized gates
        if (g1.params && g1.params.length > 0) {
            // For RX, RY, RZ, inverse means negative angle.
            if (Math.abs(g1.params[0] + g2.params[0]) < 1e-9) {
                return { newGates: [], consumed: 2 };
            }
        } else {
            // Non-parameterized gates
            return { newGates: [], consumed: 2 };
        }
    }
    return null;
}

/**
 * Rule: Merge adjacent single-qubit rotations of the same type.
 * e.g., RZ(a), RZ(b) -> RZ(a+b)
 * @param {Array<object>} gates - The list of gates in the circuit.
 * @param {number} i - The index of the current gate to check.
 * @returns {{newGates: Array<object>, consumed: number}|null}
 */
function mergeRotations(gates, i) {
    if (i + 1 >= gates.length) return null;

    const g1 = gates[i];
    const g2 = gates[i + 1];

    const rotationGates = new Set(['RX', 'RY', 'RZ']);
    if (rotationGates.has(g1.name) && g1.name === g2.name && onSameQubits(g1, g2)) {
        const newAngle = (g1.params[0] + g2.params[0]) % (2 * Math.PI);
        // If the new angle is effectively zero, remove the gate entirely.
        if (Math.abs(newAngle) < 1e-9) {
            return { newGates: [], consumed: 2 };
        }
        const newGate = {
            name: g1.name,
            qubits: [...g1.qubits],
            params: [newAngle],
        };
        return { newGates: [newGate], consumed: 2 };
    }
    return null;
}

/**
 * Rule: Commute single-qubit gates through CNOTs.
 * This rule moves single-qubit gates to be adjacent to other single-qubit
 * gates on the same qubit, allowing for more merging opportunities.
 *
 * Commutation relations for CX(c, t):
 * 1. Z-rotation on control commutes: [RZ_c, CX] = 0
 * 2. X-rotation on target commutes: [RX_t, CX] = 0
 *
 * @param {Array<object>} gates - The list of gates in the circuit.
 * @param {number} i - The index of the current gate to check.
 * @returns {{newGates: Array<object>, consumed: number}|null}
 */
function commuteThroughCX(gates, i) {
    if (i + 1 >= gates.length) return null;

    const g1 = gates[i];
    const g2 = gates[i + 1];

    // Case 1: RZ on control followed by CX
    if (g1.name === 'RZ' && g2.name === 'CX' && g1.qubits[0] === g2.qubits[0]) {
        return { newGates: [g2, g1], consumed: 2 };
    }

    // Case 2: CX followed by RZ on control
    if (g1.name === 'CX' && g2.name === 'RZ' && g1.qubits[0] === g2.qubits[0]) {
        return { newGates: [g2, g1], consumed: 2 };
    }

    // Case 3: RX on target followed by CX
    if (g1.name === 'RX' && g2.name === 'CX' && g1.qubits[0] === g2.qubits[1]) {
        return { newGates: [g2, g1], consumed: 2 };
    }

    // Case 4: CX followed by RX on target
    if (g1.name === 'CX' && g2.name === 'RX' && g1.qubits[1] === g2.qubits[0]) {
        return { newGates: [g2, g1], consumed: 2 };
    }

    return null;
}

/**
 * Rule: Convert CNOT to CZ and back using Hadamards.
 * CX(c,t) = (I ⊗ H_t) * CZ(c,t) * (I ⊗ H_t)
 * This can be useful if it creates cancellation opportunities.
 *
 * This rule looks for H-CZ-H or H-CX-H patterns.
 *
 * @param {Array<object>} gates - The list of gates in the circuit.
 * @param {number} i - The index of the current gate to check.
 * @returns {{newGates: Array<object>, consumed: number}|null}
 */
function convertCXCZ(gates, i) {
    if (i + 2 >= gates.length) return null;

    const g1 = gates[i];
    const g2 = gates[i + 1];
    const g3 = gates[i + 2];

    // Pattern: H_t, CZ(c,t), H_t -> CX(c,t)
    if (g1.name === 'H' && g3.name === 'H' && g2.name === 'CZ' && onSameQubits(g1, g3)) {
        const h_qubit = g1.qubits[0];
        const [c, t] = g2.qubits;
        if (h_qubit === t) {
            const newGate = { name: 'CX', qubits: [c, t] };
            return { newGates: [newGate], consumed: 3 };
        }
        if (h_qubit === c) {
            // CZ is symmetric, so we can flip control and target
            const newGate = { name: 'CX', qubits: [t, c] };
            return { newGates: [newGate], consumed: 3 };
        }
    }

    // Pattern: H_t, CX(c,t), H_t -> CZ(c,t)
    if (g1.name === 'H' && g3.name === 'H' && g2.name === 'CX' && onSameQubits(g1, g3)) {
        const h_qubit = g1.qubits[0];
        const [c, t] = g2.qubits;
        if (h_qubit === t) {
            const newGate = { name: 'CZ', qubits: [c, t] };
            return { newGates: [newGate], consumed: 3 };
        }
    }

    return null;
}

/**
 * Rule: CNOT direction reversal.
 * CX(c,t) -> H_c, H_t, CX(t,c), H_c, H_t
 * This is an expansion, so we only apply it in reverse.
 * H_c, H_t, CX(t,c), H_c, H_t -> CX(c,t)
 *
 * @param {Array<object>} gates - The list of gates in the circuit.
 * @param {number} i - The index of the current gate to check.
 * @returns {{newGates: Array<object>, consumed: number}|null}
 */
function reverseCX(gates, i) {
    if (i + 4 >= gates.length) return null;

    const h1c = gates[i];
    const h1t = gates[i+1];
    const cx  = gates[i+2];
    const h2c = gates[i+3];
    const h2t = gates[i+4];

    if (h1c.name !== 'H' || h1t.name !== 'H' || cx.name !== 'CX' || h2c.name !== 'H' || h2t.name !== 'H') {
        return null;
    }

    const [c, t] = cx.qubits;
    // Check if Hadamards are on the correct qubits and match up
    if (h1c.qubits[0] === c && h1t.qubits[0] === t &&
        h2c.qubits[0] === c && h2t.qubits[0] === t) {
        const newGate = { name: 'CX', qubits: [t, c] }; // Reversed CX
        return { newGates: [newGate], consumed: 5 };
    }

    return null;
}


// --- Main Optimizer ---

const TRANSFORMATION_RULES = [
    cancelInverseGates,
    mergeRotations,
    convertCXCZ,
    reverseCX,
    commuteThroughCX, // Commutation is often best run last to group gates for the next pass
];

/**
 * Applies gauge symmetry transformations to a quantum circuit to simplify it.
 *
 * The function iteratively applies a set of predefined optimization rules to the
 * circuit. The process continues until a full pass over the circuit results in
 * no further changes, indicating that a local optimum has been reached.
 *
 * @param {object} circuit - The quantum circuit to optimize. A circuit is an
 *   object with a `gates` property, which is an array of gate objects.
 *   Each gate object has `name` (string), `qubits` (array of numbers),
 *   and optional `params` (array of numbers).
 * @param {number} [maxPasses=10] - The maximum number of optimization passes to perform.
 * @returns {object} The optimized quantum circuit.
 */
export function applyGaugeTransforms(circuit, maxPasses = 10) {
    let optimizedCircuit = cloneCircuit(circuit);
    let changedInPass = true;
    let passes = 0;

    while (changedInPass && passes < maxPasses) {
        changedInPass = false;
        passes++;
        let i = 0;
        const currentGates = optimizedCircuit.gates;
        const newGates = [];

        while (i < currentGates.length) {
            let ruleApplied = false;
            for (const rule of TRANSFORMATION_RULES) {
                const result = rule(currentGates, i);
                if (result) {
                    newGates.push(...result.newGates);
                    i += result.consumed;
                    changedInPass = true;
                    ruleApplied = true;
                    break; // Move to the next position after applying a rule
                }
            }

            if (!ruleApplied) {
                newGates.push(currentGates[i]);
                i++;
            }
        }
        optimizedCircuit.gates = newGates;
    }

    return optimizedCircuit;
}