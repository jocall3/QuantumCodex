/**
 * @file Contains optimization passes specifically for quantum circuits represented in QIR.
 * This includes gate fusion, circuit depth reduction, and removal of redundant gates.
 *
 * The QIR (Quantum Intermediate Representation) is assumed to be an array of gate objects.
 * Each gate object has the following structure:
 * {
 *   name: string,       // The name of the gate (e.g., 'h', 'cx', 'rz')
 *   qubits: number[],   // An array of qubit indices this gate acts on
 *   params?: number[]   // (Optional) An array of parameters for the gate (e.g., rotation angles)
 * }
 */

/**
 * A set of self-inverting gates. These gates are their own inverse (U * U = I).
 * @type {Set<string>}
 */
const SELF_INVERTING_GATES = new Set(['h', 'x', 'y', 'z', 'cx', 'cy', 'cz', 'swap']);

/**
 * A map of fusable single-qubit rotation gates.
 * The key is the gate name, and the value is a function that combines parameters.
 * @type {Object.<string, function(number[], number[]): number[]>}
 */
const FUSABLE_ROTATIONS = {
    'rx': (p1, p2) => [(p1[0] + p2[0])],
    'ry': (p1, p2) => [(p1[0] + p2[0])],
    'rz': (p1, p2) => [(p1[0] + p2[0])],
    'u1': (p1, p2) => [(p1[0] + p2[0])], // Note: u1 is equivalent to rz
};

/**
 * A small number for floating point comparisons.
 * @type {number}
 */
const EPSILON = 1e-9;

/**
 * Checks if two gates commute. Two gates commute if they act on disjoint sets of qubits.
 * Note: This is a simplified check. Some gates acting on overlapping qubits can still commute
 * (e.g., a CNOT(c,t) and a Z on the control qubit 'c'), but this covers the most common case
 * for reordering.
 * @param {object} gate1 The first gate object.
 * @param {object} gate2 The second gate object.
 * @returns {boolean} True if the gates act on disjoint sets of qubits, false otherwise.
 */
function gatesCommute(gate1, gate2) {
    const qubits1 = new Set(gate1.qubits);
    for (const qubit of gate2.qubits) {
        if (qubits1.has(qubit)) {
            return false;
        }
    }
    return true;
}


/**
 * Removes redundant gates from a quantum circuit.
 * This pass removes:
 * 1. Identity gates ('id').
 * 2. Pairs of identical, self-inverting gates acting on the same qubits consecutively.
 *    (e.g., H-H, CNOT-CNOT).
 *
 * @param {object[]} circuit The input circuit as an array of gate objects.
 * @returns {object[]} A new, optimized circuit array.
 */
export function removeRedundantGates(circuit) {
    const optimizedCircuit = [];
    let i = 0;
    while (i < circuit.length) {
        const currentGate = circuit[i];

        // 1. Skip identity gates
        if (currentGate.name === 'id') {
            i++;
            continue;
        }

        // 2. Check for self-inverting pairs
        if (i + 1 < circuit.length) {
            const nextGate = circuit[i + 1];
            if (
                SELF_INVERTING_GATES.has(currentGate.name) &&
                currentGate.name === nextGate.name &&
                currentGate.qubits.length === nextGate.qubits.length &&
                currentGate.qubits.every((q, index) => q === nextGate.qubits[index])
            ) {
                // Found a pair that cancels out, skip both
                i += 2;
                continue;
            }
        }

        optimizedCircuit.push(currentGate);
        i++;
    }
    return optimizedCircuit;
}

/**
 * Fuses consecutive single-qubit rotation gates acting on the same qubit.
 * For example, RZ(a) followed by RZ(b) on the same qubit becomes a single RZ(a+b).
 * After fusion, it removes any rotation gates whose total angle is a multiple of 2*PI,
 * as they are equivalent to the identity operation.
 *
 * @param {object[]} circuit The input circuit as an array of gate objects.
 * @returns {object[]} A new, optimized circuit array.
 */
export function fuseSingleQubitRotations(circuit) {
    if (circuit.length < 2) {
        return [...circuit];
    }

    const newCircuit = [...circuit]; // Work on a copy

    let i = 0;
    while (i < newCircuit.length) {
        const currentGate = newCircuit[i];

        // We only fuse single-qubit gates that are in our fusable list
        if (
            currentGate.qubits.length === 1 &&
            FUSABLE_ROTATIONS[currentGate.name] &&
            i + 1 < newCircuit.length
        ) {
            const nextGate = newCircuit[i + 1];
            if (
                nextGate.name === currentGate.name &&
                nextGate.qubits[0] === currentGate.qubits[0]
            ) {
                // Fuse the gates
                const fusionFn = FUSABLE_ROTATIONS[currentGate.name];
                const newParams = fusionFn(currentGate.params, nextGate.params);

                // Create the new fused gate
                const fusedGate = {
                    ...currentGate,
                    params: newParams,
                };

                // Replace the current gate with the fused one and remove the next one
                newCircuit.splice(i, 2, fusedGate);

                // Stay at the current index to check for more fusion opportunities
                // with the newly created gate.
                continue;
            }
        }

        i++;
    }

    // Filter out rotations with a total angle that is effectively zero (mod 2*PI)
    // as they are equivalent to identity gates.
    return newCircuit.filter(gate => {
        if (FUSABLE_ROTATIONS[gate.name] && gate.params && gate.params.length > 0) {
            // Normalize angle to be within [-PI, PI] for comparison
            let angle = gate.params[0] % (2 * Math.PI);
            if (angle > Math.PI) angle -= 2 * Math.PI;
            if (angle < -Math.PI) angle += 2 * Math.PI;
            
            return Math.abs(angle) > EPSILON;
        }
        return true;
    });
}


/**
 * Reduces circuit depth by reordering commuting gates.
 * This is a greedy pass that attempts to move each gate as far to the "left"
 * (earlier in the circuit) as possible, allowing gates on different qubits
 * to be grouped together for parallel execution.
 *
 * @param {object[]} circuit The input circuit as an array of gate objects.
 * @returns {object[]} A new, optimized circuit array with potentially reduced depth.
 */
export function reduceCircuitDepth(circuit) {
    const optimizedCircuit = [...circuit];

    for (let i = 1; i < optimizedCircuit.length; i++) {
        let currentGate = optimizedCircuit[i];
        let j = i - 1;

        // Try to move the current gate to the left
        while (j >= 0) {
            let prevGate = optimizedCircuit[j];
            if (gatesCommute(currentGate, prevGate)) {
                // Swap the gates
                optimizedCircuit[j + 1] = prevGate;
                optimizedCircuit[j] = currentGate;
                j--;
            } else {
                // Cannot move further left, gates conflict
                break;
            }
        }
    }

    return optimizedCircuit;
}

/**
 * A list of standard optimization passes to be run in a recommended order.
 * @type {function[]}
 */
export const STANDARD_PASSES = [
    removeRedundantGates,
    fuseSingleQubitRotations,
    removeRedundantGates, // Run again to clean up identities created by fusion
    reduceCircuitDepth,
];

/**
 * Applies a sequence of optimization passes to a quantum circuit.
 *
 * @param {object[]} circuit The input QIR circuit.
 * @param {function[]} [passes=STANDARD_PASSES] An array of optimization pass functions.
 *   Each function should take a circuit and return an optimized circuit.
 *   Defaults to STANDARD_PASSES.
 * @returns {object[]} The final, optimized circuit.
 */
export function optimizeCircuit(circuit, passes = STANDARD_PASSES) {
    if (!Array.isArray(circuit)) {
        throw new Error("Input circuit must be an array of gate objects.");
    }
    
    let currentCircuit = circuit;
    for (const pass of passes) {
        currentCircuit = pass(currentCircuit);
    }
    return currentCircuit;
}