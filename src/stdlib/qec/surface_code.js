/**
 * @file src/stdlib/qec/surface_code.js
 * @description A standard library implementation of the planar surface code, a leading
 * quantum error correction (QEC) code. This file provides a class to simulate the
 * surface code, including lattice initialization, stabilizer measurements, syndrome
 * extraction, and logical operations. The simulation tracks Pauli errors on a
 * classical computer, which is sufficient for studying the error-correcting
 * properties of the code.
 */

/**
 * Represents a single physical qubit in the surface code lattice.
 * This is a helper class and is not exported.
 */
class Qubit {
    /**
     * @param {number} x The x-coordinate in the lattice.
     * @param {number} y The y-coordinate in the lattice.
     * @param {string} type The type of qubit, e.g., 'data'.
     */
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        /** @type {'I'|'X'|'Y'|'Z'} */
        this.pauliError = 'I'; // Initially, no error.
    }
}

/**
 * Implements a classical simulation of the planar surface code.
 * This class allows for creating a surface code of a given distance,
 * introducing Pauli errors, measuring error syndromes, applying logical
 * operators, and reading out the logical state.
 */
export class SurfaceCode {
    /**
     * Creates a new surface code lattice.
     * @param {number} distance The code distance `d`. Must be an odd integer >= 3.
     * The number of physical data qubits is d*d.
     * The code can correct up to (d-1)/2 errors.
     */
    constructor(distance) {
        if (typeof distance !== 'number' || distance % 2 === 0 || distance < 3) {
            throw new Error('Surface code distance must be an odd integer >= 3.');
        }
        this.distance = distance;
        
        /** @type {Map<string, Qubit>} */
        this.dataQubits = new Map(); // Key: "x,y", Value: Qubit object
        
        /** @type {Array<object>} */
        this.stabilizers = []; // Array of stabilizer definitions

        this._initializeLattice();
    }

    /**
     * Initializes the surface code lattice structure.
     * We model a d x d grid of data qubits.
     * Z-stabilizers (plaquettes) and X-stabilizers (stars) are defined
     * based on these data qubits. This implementation includes both bulk
     * stabilizers of weight 4 and boundary stabilizers of weight 2.
     * @private
     */
    _initializeLattice() {
        const d = this.distance;

        // Create d x d data qubits
        for (let y = 0; y < d; y++) {
            for (let x = 0; x < d; x++) {
                const q = new Qubit(x, y, 'data');
                this.dataQubits.set(`${x},${y}`, q);
            }
        }

        // Define Z-stabilizers (plaquettes) in the bulk
        for (let y = 0; y < d - 1; y++) {
            for (let x = 0; x < d - 1; x++) {
                this.stabilizers.push({
                    type: 'Z',
                    x: x + 0.5, y: y + 0.5, // Center coordinate for visualization
                    dataQubits: [
                        this.dataQubits.get(`${x},${y}`),
                        this.dataQubits.get(`${x+1},${y}`),
                        this.dataQubits.get(`${x},${y+1}`),
                        this.dataQubits.get(`${x+1},${y+1}`),
                    ],
                    outcome: 1
                });
            }
        }

        // Define X-stabilizers (stars) in the bulk
        // A star is centered on a vertex and acts on the 4 surrounding data qubits.
        for (let y = 1; y < d; y++) {
            for (let x = 1; x < d; x++) {
                this.stabilizers.push({
                    type: 'X',
                    x: x - 0.5, y: y - 0.5, // Center coordinate on the dual lattice
                    dataQubits: [
                        this.dataQubits.get(`${x-1},${y-1}`),
                        this.dataQubits.get(`${x},${y-1}`),
                        this.dataQubits.get(`${x-1},${y}`),
                        this.dataQubits.get(`${x},${y}`),
                    ],
                    outcome: 1
                });
            }
        }
        
        // Define boundary stabilizers for the planar code.
        
        // Z-type boundaries (top and bottom, "rough" boundaries)
        for (let x = 0; x < d - 1; x++) {
            // Top boundary (weight 2)
            this.stabilizers.push({
                type: 'Z', x: x + 0.5, y: -0.5, isBoundary: true,
                dataQubits: [this.dataQubits.get(`${x},0`), this.dataQubits.get(`${x+1},0`)],
                outcome: 1
            });
            // Bottom boundary (weight 2)
            this.stabilizers.push({
                type: 'Z', x: x + 0.5, y: d - 1.5, isBoundary: true,
                dataQubits: [this.dataQubits.get(`${x},${d-1}`), this.dataQubits.get(`${x+1},${d-1}`)],
                outcome: 1
            });
        }

        // X-type boundaries (left and right, "smooth" boundaries)
        for (let y = 0; y < d - 1; y++) {
            // Left boundary (weight 2)
            this.stabilizers.push({
                type: 'X', x: -0.5, y: y + 0.5, isBoundary: true,
                dataQubits: [this.dataQubits.get(`0,${y}`), this.dataQubits.get(`0,${y+1}`)],
                outcome: 1
            });
            // Right boundary (weight 2)
            this.stabilizers.push({
                type: 'X', x: d - 1.5, y: y + 0.5, isBoundary: true,
                dataQubits: [this.dataQubits.get(`${d-1},${y}`), this.dataQubits.get(`${d-1},${y+1}`)],
                outcome: 1
            });
        }
    }

    /**
     * Measures a single stabilizer and updates its outcome.
     * @param {object} stabilizer The stabilizer to measure.
     * @returns {number} The measurement outcome, 1 (trivial) or -1 (non-trivial).
     * @private
     */
    _measureStabilizer(stabilizer) {
        let parity = 0;
        if (stabilizer.type === 'Z') {
            // Z stabilizers detect X and Y errors.
            for (const qubit of stabilizer.dataQubits) {
                if (qubit.pauliError === 'X' || qubit.pauliError === 'Y') {
                    parity++;
                }
            }
        } else { // 'X'
            // X stabilizers detect Z and Y errors.
            for (const qubit of stabilizer.dataQubits) {
                if (qubit.pauliError === 'Z' || qubit.pauliError === 'Y') {
                    parity++;
                }
            }
        }
        stabilizer.outcome = (parity % 2 === 0) ? 1 : -1;
        return stabilizer.outcome;
    }

    /**
     * Runs a full round of stabilizer measurements to find the error syndrome.
     * @returns {Array<object>} A list of stabilizers with non-trivial outcomes (-1),
     * which constitutes the error syndrome.
     */
    runSyndromeMeasurement() {
        const syndrome = [];
        for (const stabilizer of this.stabilizers) {
            const outcome = this._measureStabilizer(stabilizer);
            if (outcome === -1) {
                syndrome.push(stabilizer);
            }
        }
        return syndrome;
    }

    /**
     * Introduces a Pauli error on a specific data qubit.
     * If an error already exists, this operation is equivalent to
     * multiplying the Pauli matrices (e.g., applying X then Z is a Y).
     * @param {number} x The x-coordinate of the data qubit.
     * @param {number} y The y-coordinate of the data qubit.
     * @param {'I'|'X'|'Y'|'Z'} errorType The Pauli error to apply.
     */
    introduceError(x, y, errorType) {
        const qubit = this.dataQubits.get(`${x},${y}`);
        if (!qubit) {
            throw new Error(`No data qubit at (${x}, ${y})`);
        }
        if (!['I', 'X', 'Y', 'Z'].includes(errorType)) {
            throw new Error('Invalid error type. Must be I, X, Y, or Z.');
        }

        const currentError = qubit.pauliError;
        const newError = errorType;
        
        if (currentError === newError) {
            qubit.pauliError = 'I';
        } else if (currentError === 'I') {
            qubit.pauliError = newError;
        } else if (newError === 'I') {
            // No change
        } else {
            const errors = new Set([currentError, newError]);
            if (errors.has('X') && errors.has('Y')) qubit.pauliError = 'Z';
            else if (errors.has('X') && errors.has('Z')) qubit.pauliError = 'Y';
            else if (errors.has('Y') && errors.has('Z')) qubit.pauliError = 'X';
        }
    }

    /**
     * Applies a logical X operator.
     * In this planar code layout, a logical X is a string of single-qubit X
     * operators on all data qubits in a column, connecting the top and bottom
     * (rough) boundaries. We apply it to the first column (x=0) by convention.
     */
    logicalX() {
        for (let y = 0; y < this.distance; y++) {
            this.introduceError(0, y, 'X');
        }
    }

    /**
     * Applies a logical Z operator.
     * A logical Z is a string of single-qubit Z operators on all data qubits
     * in a row, connecting the left and right (smooth) boundaries. We apply it
     * to the first row (y=0) by convention.
     */
    logicalZ() {
        for (let x = 0; x < this.distance; x++) {
            this.introduceError(x, 0, 'Z');
        }
    }

    /**
     * Reads the logical Z state of the encoded qubit.
     * This is done by measuring the logical Z operator, which anti-commutes with
     * the logical X operator. The measurement outcome is the parity of Z/Y errors
     * along the path of a logical X operator.
     * @returns {number} 1 for logical |0⟩, -1 for logical |1⟩.
     */
    readLogicalZ() {
        let parity = 0;
        // The logical X operator is a string of X's along a column.
        // We check for anti-commuting errors (Z or Y) along this path.
        for (let y = 0; y < this.distance; y++) {
            const qubit = this.dataQubits.get(`0,${y}`);
            if (qubit.pauliError === 'Z' || qubit.pauliError === 'Y') {
                parity++;
            }
        }
        return (parity % 2 === 0) ? 1 : -1;
    }
    
    /**
     * Reads the logical X state of the encoded qubit.
     * This is done by measuring the logical X operator, which anti-commutes with
     * the logical Z operator. The measurement outcome is the parity of X/Y errors
     * along the path of a logical Z operator.
     * @returns {number} 1 for logical |+⟩, -1 for logical |−⟩.
     */
    readLogicalX() {
        let parity = 0;
        // The logical Z operator is a string of Z's along a row.
        // We check for anti-commuting errors (X or Y) along this path.
        for (let x = 0; x < this.distance; x++) {
            const qubit = this.dataQubits.get(`${x},0`);
            if (qubit.pauliError === 'X' || qubit.pauliError === 'Y') {
                parity++;
            }
        }
        return (parity % 2 === 0) ? 1 : -1;
    }

    /**
     * A placeholder for the decoding and correction step.
     * A full implementation requires a Minimum Weight Perfect Matching (MWPM) decoder
     * (like the Blossom algorithm), which is complex. This function provides a
     * conceptual outline and a warning.
     * @param {Array<object>} syndrome The list of violated stabilizers.
     */
    decodeAndCorrect(syndrome) {
        if (syndrome.length === 0) {
            // No errors detected, nothing to do.
            return;
        }

        console.warn(
            'Decoding required. A full Minimum Weight Perfect Matching (MWPM) ' +
            'decoder is needed for robust error correction. This function is a placeholder.'
        );

        // A real decoder would perform these steps:
        // 1. Separate syndromes by type (X and Z).
        // 2. For each type, build a graph where syndromes are nodes.
        // 3. Edge weights are the "distance" (number of qubits) between syndromes.
        // 4. Find the minimum weight perfect matching on this graph.
        // 5. The matching indicates the most likely error chains.
        // 6. Convert these chains into a series of Pauli corrections.
        // 7. Apply the corrections using introduceError().
        
        // Example: const correctionChain = mwpmDecoder(syndrome);
        // for (const op of correctionChain) {
        //     this.introduceError(op.x, op.y, op.op);
        // }
    }
    
    /**
     * Resets all Pauli errors on data qubits to Identity and stabilizer
     * outcomes to trivial.
     */
    reset() {
        for (const qubit of this.dataQubits.values()) {
            qubit.pauliError = 'I';
        }
        for (const stabilizer of this.stabilizers) {
            stabilizer.outcome = 1;
        }
    }

    /**
     * Returns a string representation of the current error state on the grid.
     * @returns {string} A grid showing the errors ('I', 'X', 'Y', 'Z') on data qubits.
     */
    displayGrid() {
        let output = '';
        for (let y = 0; y < this.distance; y++) {
            let row = [];
            for (let x = 0; x < this.distance; x++) {
                const qubit = this.dataQubits.get(`${x},${y}`);
                row.push(qubit.pauliError);
            }
            output += row.join(' ') + '\n';
        }
        return output;
    }
}