/**
 * @file src/compiler/optimization/GaugeSymmetryOptimizer.ts
 * @purpose Optimizer that applies Gauge-Symmetry Code Transformations to simplify circuits without changing observables.
 */

// Note: The following imports assume a project structure where these types are defined,
// for example, in 'src/compiler/circuit/index.ts' and 'src/compiler/optimization/Optimizer.ts'.
import { QuantumCircuit, Gate } from '../circuit';
import { Optimizer } from './Optimizer';

/**
 * Optimizer that applies Gauge-Symmetry Code Transformations to simplify circuits.
 *
 * Gauge transformations are a set of local unitary transformations that can be applied
 * to a quantum circuit without changing the final measurement outcomes (observables).
 * This optimizer uses these transformations to move single-qubit gates through
 * two-qubit gates (specifically CNOTs) to group them together. Once grouped,
 * adjacent single-qubit gates on the same qubit can be "fused" into a single,
 * more efficient gate, reducing the overall gate count and circuit depth.
 *
 * The primary strategy is to "push" single-qubit gates (like Rx, Rz) across
 * CNOT gates according to known commutation rules. This process is repeated
 * until no further simplifications can be made.
 */
export class GaugeSymmetryOptimizer implements Optimizer {
    private readonly maxPasses: number;
    private readonly tolerance: number;

    /**
     * Creates an instance of the GaugeSymmetryOptimizer.
     * @param options - Configuration options for the optimizer.
     * @param options.maxPasses - The maximum number of optimization passes to run. Defaults to 10.
     * @param options.tolerance - The tolerance for floating point comparisons, e.g., for angles close to zero. Defaults to 1e-9.
     */
    constructor(options: { maxPasses?: number; tolerance?: number } = {}) {
        this.maxPasses = options.maxPasses ?? 10;
        this.tolerance = options.tolerance ?? 1e-9;
    }

    /**
     * Optimizes the given quantum circuit using gauge transformations.
     * @param circuit - The quantum circuit to optimize.
     * @returns A new, optimized quantum circuit.
     */
    public optimize(circuit: QuantumCircuit): QuantumCircuit {
        let optimizedCircuit = this.cloneCircuit(circuit);
        let changed = true;
        
        for (let pass = 0; pass < this.maxPasses && changed; pass++) {
            const initialGatesJSON = JSON.stringify(optimizedCircuit.gates);
            const newGates = this.runSinglePass(optimizedCircuit.gates);
            
            optimizedCircuit.gates = newGates;
            const newGatesJSON = JSON.stringify(newGates);

            if (newGatesJSON === initialGatesJSON) {
                changed = false;
            }
        }

        return optimizedCircuit;
    }

    /**
     * Runs a single optimization pass over the gates.
     * This involves repeatedly trying to push gates forward and fusing them
     * until no more local changes can be made in one sweep.
     * @param gates - The list of gates to process.
     * @returns The new list of gates after one full pass.
     */
    private runSinglePass(gates: Gate[]): Gate[] {
        let currentGates = [...gates];
        let changedInSubPass = true;

        // Repeat until a full sweep results in no changes.
        while (changedInSubPass) {
            changedInSubPass = false;
            const nextGates: Gate[] = [];
            let i = 0;

            while (i < currentGates.length) {
                const gate1 = currentGates[i];
                const gate2 = i + 1 < currentGates.length ? currentGates[i + 1] : null;

                // Pattern: single-qubit gate followed by CNOT on one of its qubits.
                if (gate2 && this.isCNOT(gate2) && this.isSingleQubitGate(gate1) && this.qubitsOverlap(gate1, gate2)) {
                    const transformed = this.pushGateForward(gate1, gate2);
                    if (transformed) {
                        nextGates.push(...transformed);
                        i += 2; // Consumed two gates, pushed transformed gates.
                        changedInSubPass = true;
                        continue;
                    }
                }
                
                // No transformation, just add the current gate.
                nextGates.push(gate1);
                i++;
            }
            
            const fusedGates = this.fuseAdjacentGates(nextGates);
            if (fusedGates.length < currentGates.length) {
                changedInSubPass = true;
            }
            currentGates = fusedGates;
        }
        return currentGates;
    }

    /**
     * Pushes a single-qubit gate `g1` forward through a CNOT gate `g2`.
     * Implements CNOT commutation rules.
     * @param g1 - The single-qubit gate.
     * @param g2 - The CNOT gate.
     * @returns The new sequence of gates if transformation is possible, otherwise null.
     */
    private pushGateForward(g1: Gate, g2: Gate): Gate[] | null {
        const [control, target] = g2.qubits;
        const q1 = g1.qubits[0];

        if (q1 === control) {
            // g1 is on the control qubit
            switch (g1.name.toUpperCase()) {
                case 'RZ': case 'S': case 'SDG': case 'T': case 'TDG': case 'Z':
                    // Z-rotations on control commute through.
                    return [g2, g1];
                case 'RX': case 'X':
                    // X-rotations on control propagate to target.
                    // (Rx(a) ⊗ I) CNOT = CNOT (Rx(a) ⊗ Rx(a))
                    return [g2, { ...g1, qubits: [control] }, { ...g1, qubits: [target] }];
                default:
                    // Other gates (like H, Ry) have more complex rules not implemented here for simplicity.
                    return null;
            }
        } else if (q1 === target) {
            // g1 is on the target qubit
            switch (g1.name.toUpperCase()) {
                case 'RX': case 'X':
                    // X-rotations on target commute through.
                    return [g2, g1];
                case 'RZ': case 'S': case 'SDG': case 'T': case 'TDG': case 'Z':
                    // Z-rotations on target propagate to control.
                    // (I ⊗ Rz(a)) CNOT = CNOT (Rz(a) ⊗ Rz(a))
                    return [g2, { ...g1, qubits: [control] }, { ...g1, qubits: [target] }];
                default:
                    return null;
            }
        }
        // Gate g1 does not act on a qubit involved in CNOT g2. This case should be filtered by qubitsOverlap.
        return null;
    }

    /**
     * Iteratively fuses adjacent single-qubit gates on the same qubit.
     * @param gates - The list of gates to process.
     * @returns A new list of gates with fusions applied.
     */
    private fuseAdjacentGates(initialGates: Gate[]): Gate[] {
        if (initialGates.length < 2) {
            return initialGates;
        }

        let gates = [...initialGates];
        let changedInPass = true;
        while (changedInPass) {
            changedInPass = false;
            const fusedGates: Gate[] = [];
            let i = 0;
            while (i < gates.length) {
                if (i + 1 < gates.length) {
                    const g1 = gates[i];
                    const g2 = gates[i + 1];
                    if (this.isSingleQubitGate(g1) && this.isSingleQubitGate(g2) && g1.qubits[0] === g2.qubits[0]) {
                        const fused = this.tryFuse(g1, g2);
                        if (fused !== 'cannot_fuse') {
                            if (fused !== null) { // Fused into a new gate
                                fusedGates.push(fused);
                            }
                            // If fused is null, it means they cancelled to Identity, so we add nothing.
                            i += 2; // Skip both original gates
                            changedInPass = true;
                            continue;
                        }
                    }
                }
                fusedGates.push(gates[i]);
                i++;
            }
            gates = fusedGates;
        }
        return gates;
    }

    /**
     * Tries to fuse two adjacent single-qubit gates.
     * @returns The fused gate, `null` if they cancel to Identity, or the string 'cannot_fuse'.
     */
    private tryFuse(g1: Gate, g2: Gate): Gate | null | 'cannot_fuse' {
        const g1Name = g1.name.toUpperCase();
        const g2Name = g2.name.toUpperCase();

        // Rule: R(a) R(b) = R(a+b) for the same rotation axis
        if (g1Name === g2Name && ['RX', 'RY', 'RZ'].includes(g1Name)) {
            const newAngle = (g1.parameters[0] + g2.parameters[0]);
            if (Math.abs(newAngle % (2 * Math.PI)) < this.tolerance) {
                return null; // Angle is effectively zero, gates cancel.
            }
            return { name: g1.name, qubits: g1.qubits, parameters: [newAngle] };
        }

        // Rule: G G = I for G in {X, Y, Z, H}
        if (g1Name === g2Name && ['X', 'Y', 'Z', 'H'].includes(g1Name)) {
            return null; // Cancel to Identity
        }

        // Rule: S S = Z, T T = S
        if (g1Name === 'S' && g2Name === 'S') return { name: 'Z', qubits: g1.qubits, parameters: [] };
        if (g1Name === 'T' && g2Name === 'T') return { name: 'S', qubits: g1.qubits, parameters: [] };

        // Rule: G G_dagger = I
        if ((g1Name === 'S' && g2Name === 'SDG') || (g1Name === 'SDG' && g2Name === 'S')) return null;
        if ((g1Name === 'T' && g2Name === 'TDG') || (g1Name === 'TDG' && g2Name === 'T')) return null;

        return 'cannot_fuse';
    }

    // --- Helper Methods ---

    private isCNOT(gate: Gate): boolean {
        return gate.name.toUpperCase() === 'CNOT' && gate.qubits.length === 2;
    }

    private isSingleQubitGate(gate: Gate): boolean {
        return gate.qubits.length === 1;
    }

    private qubitsOverlap(g1: Gate, g2: Gate): boolean {
        // This check is simple since g1 is a single-qubit gate.
        return g2.qubits.includes(g1.qubits[0]);
    }

    private cloneCircuit(circuit: QuantumCircuit): QuantumCircuit {
        // A deep clone to avoid modifying the original circuit object.
        return JSON.parse(JSON.stringify(circuit));
    }
}