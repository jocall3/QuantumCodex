/**
 * @file src/runtime/qvm.js
 * @description The core of the Q-Script runtime: a Quantum Virtual Machine (QVM).
 * This component executes QIR-like instructions, manages the quantum state vector,
 * and simulates quantum operations.
 */

/**
 * A simple Complex number class for quantum computations.
 * Represents a number in the form a + bi.
 */
export class Complex {
    /**
     * @param {number} re The real part.
     * @param {number} im The imaginary part.
     */
    constructor(re = 0, im = 0) {
        this.re = re;
        this.im = im;
    }

    /**
     * Adds another complex number to this one.
     * @param {Complex} other The complex number to add.
     * @returns {Complex} A new Complex number as the result.
     */
    add(other) {
        return new Complex(this.re + other.re, this.im + other.im);
    }

    /**
     * Subtracts another complex number from this one.
     * @param {Complex} other The complex number to subtract.
     * @returns {Complex} A new Complex number as the result.
     */
    sub(other) {
        return new Complex(this.re - other.re, this.im - other.im);
    }

    /**
     * Multiplies this complex number by another.
     * @param {Complex} other The complex number to multiply by.
     * @returns {Complex} A new Complex number as the result.
     */
    mul(other) {
        const re = this.re * other.re - this.im * other.im;
        const im = this.re * other.im + this.im * other.re;
        return new Complex(re, im);
    }

    /**
     * Multiplies this complex number by a real scalar.
     * @param {number} scalar The real number to multiply by.
     * @returns {Complex} A new Complex number as the result.
     */
    mulScalar(scalar) {
        return new Complex(this.re * scalar, this.im * scalar);
    }

    /**
     * Returns the complex conjugate.
     * @returns {Complex} The complex conjugate.
     */
    conjugate() {
        return new Complex(this.re, -this.im);
    }

    /**
     * Calculates the squared magnitude (|z|^2).
     * @returns {number} The squared magnitude.
     */
    magnitudeSq() {
        return this.re * this.re + this.im * this.im;
    }

    /**
     * Formats the complex number as a string.
     * @returns {string} A string representation.
     */
    toString() {
        if (Math.abs(this.im) < 1e-9) return this.re.toFixed(4);
        if (Math.abs(this.re) < 1e-9) return `${this.im.toFixed(4)}i`;
        const sign = this.im > 0 ? '+' : '-';
        return `${this.re.toFixed(4)} ${sign} ${Math.abs(this.im).toFixed(4)}i`;
    }
}

// --- Gate Matrix Definitions ---
const GATES = {
    H: [
        [new Complex(1 / Math.sqrt(2)), new Complex(1 / Math.sqrt(2))],
        [new Complex(1 / Math.sqrt(2)), new Complex(-1 / Math.sqrt(2))]
    ],
    X: [
        [new Complex(0), new Complex(1)],
        [new Complex(1), new Complex(0)]
    ],
    Y: [
        [new Complex(0), new Complex(0, -1)],
        [new Complex(0, 1), new Complex(0)]
    ],
    Z: [
        [new Complex(1), new Complex(0)],
        [new Complex(0), new Complex(-1)]
    ],
    S: [
        [new Complex(1), new Complex(0)],
        [new Complex(0), new Complex(0, 1)]
    ],
    Sdg: [
        [new Complex(1), new Complex(0)],
        [new Complex(0), new Complex(0, -1)]
    ],
    T: [
        [new Complex(1), new Complex(0)],
        [new Complex(0), new Complex(Math.cos(Math.PI / 4), Math.sin(Math.PI / 4))]
    ],
    Tdg: [
        [new Complex(1), new Complex(0)],
        [new Complex(0), new Complex(Math.cos(-Math.PI / 4), Math.sin(-Math.PI / 4))]
    ]
};


/**
 * Quantum Virtual Machine (QVM) for simulating quantum circuits.
 * Manages the state vector and applies quantum operations.
 */
export class QVM {
    /**
     * @param {number} numQubits The number of qubits for the simulation.
     */
    constructor(numQubits) {
        if (numQubits <= 0 || !Number.isInteger(numQubits)) {
            throw new Error('Number of qubits must be a positive integer.');
        }
        this.numQubits = numQubits;
        this.stateSize = 1 << numQubits; // 2^numQubits
        this.stateVector = new Array(this.stateSize);
        this.classicalBits = new Array(numQubits).fill(0);
        this.reset();
    }

    /**
     * Resets the QVM to the |0...0> state and clears classical bits.
     */
    reset() {
        for (let i = 0; i < this.stateSize; i++) {
            this.stateVector[i] = new Complex(0, 0);
        }
        this.stateVector[0] = new Complex(1, 0);
        this.classicalBits.fill(0);
    }

    /**
     * Executes a program described in a simple Quantum Intermediate Representation (QIR).
     * @param {Array<Object>} program - An array of instruction objects.
     *   e.g., [{ op: 'h', target: [0] }, { op: 'cnot', target: [0, 1] }]
     * @returns {Array<number>} The final state of the classical bits after all measurements.
     */
    execute(program) {
        for (const instruction of program) {
            this._validateInstruction(instruction);
            const op = instruction.op.toLowerCase();
            const targets = instruction.target;

            switch (op) {
                case 'h': this._applySingleQubitGate(targets[0], GATES.H); break;
                case 'x': this._applyPauliX(targets[0]); break;
                case 'y': this._applySingleQubitGate(targets[0], GATES.Y); break;
                case 'z': this._applySingleQubitGate(targets[0], GATES.Z); break;
                case 's': this._applySingleQubitGate(targets[0], GATES.S); break;
                case 'sdg': this._applySingleQubitGate(targets[0], GATES.Sdg); break;
                case 't': this._applySingleQubitGate(targets[0], GATES.T); break;
                case 'tdg': this._applySingleQubitGate(targets[0], GATES.Tdg); break;
                case 'cnot':
                case 'cx': this._applyCNOT(targets[0], targets[1]); break;
                case 'cz': this._applyCZ(targets[0], targets[1]); break;
                case 'swap': this._applySWAP(targets[0], targets[1]); break;
                case 'measure': {
                    const result = this.measure(targets[0]);
                    if (instruction.cbit !== undefined && instruction.cbit < this.classicalBits.length) {
                        this.classicalBits[instruction.cbit] = result;
                    }
                    break;
                }
                default:
                    console.warn(`Unknown operation: ${instruction.op}`);
            }
        }
        return [...this.classicalBits];
    }

    /**
     * Validates a single QIR instruction.
     * @param {Object} instruction The instruction to validate.
     * @private
     */
    _validateInstruction(instruction) {
        if (!instruction.op || !instruction.target) {
            throw new Error('Invalid instruction format. "op" and "target" are required.');
        }
        for (const qubit of instruction.target) {
            if (qubit < 0 || qubit >= this.numQubits) {
                throw new Error(`Invalid qubit index: ${qubit}. Must be between 0 and ${this.numQubits - 1}.`);
            }
        }
    }

    /**
     * Applies a generic single-qubit gate using its 2x2 matrix representation.
     * This is an efficient implementation that avoids constructing the full 2^n x 2^n matrix.
     * @param {number} targetQubit The qubit to apply the gate to.
     * @param {Array<Array<Complex>>} matrix The 2x2 unitary matrix of the gate.
     * @private
     */
    _applySingleQubitGate(targetQubit, matrix) {
        const [[u00, u01], [u10, u11]] = matrix;
        const mask = 1 << targetQubit;
        const newState = new Array(this.stateSize);

        for (let i = 0; i < this.stateSize; i++) {
            if ((i & mask) === 0) { // This index corresponds to a |...0...> on the target qubit
                const j = i | mask; // The corresponding |...1...> state index
                const psi_i = this.stateVector[i];
                const psi_j = this.stateVector[j];

                // newState[i] = u00 * psi_i + u01 * psi_j
                newState[i] = u00.mul(psi_i).add(u01.mul(psi_j));
                // newState[j] = u10 * psi_i + u11 * psi_j
                newState[j] = u10.mul(psi_i).add(u11.mul(psi_j));
            }
        }
        this.stateVector = newState;
    }

    /**
     * Optimized application of the Pauli-X (NOT) gate.
     * @param {number} targetQubit The qubit to apply the gate to.
     * @private
     */
    _applyPauliX(targetQubit) {
        const mask = 1 << targetQubit;
        const newState = new Array(this.stateSize);
        for (let i = 0; i < this.stateSize; i++) {
            if ((i & mask) === 0) {
                const j = i | mask;
                newState[i] = this.stateVector[j];
                newState[j] = this.stateVector[i];
            }
        }
        this.stateVector = newState;
    }

    /**
     * Applies the CNOT (Controlled-NOT) gate.
     * @param {number} controlQubit The control qubit.
     * @param {number} targetQubit The target qubit.
     * @private
     */
    _applyCNOT(controlQubit, targetQubit) {
        const controlMask = 1 << controlQubit;
        const targetMask = 1 << targetQubit;
        const newState = new Array(this.stateSize);

        for (let i = 0; i < this.stateSize; i++) {
            // If control bit is 0, the state is unchanged
            if ((i & controlMask) === 0) {
                newState[i] = this.stateVector[i];
            } else { // If control bit is 1, flip the target bit
                const j = i ^ targetMask; // The index with the flipped target bit
                newState[i] = this.stateVector[j];
            }
        }
        this.stateVector = newState;
    }

    /**
     * Applies the CZ (Controlled-Z) gate.
     * @param {number} controlQubit The control qubit.
     * @param {number} targetQubit The target qubit.
     * @private
     */
    _applyCZ(controlQubit, targetQubit) {
        const controlMask = 1 << controlQubit;
        const targetMask = 1 << targetQubit;
        const combinedMask = controlMask | targetMask;

        for (let i = 0; i < this.stateSize; i++) {
            // Apply a phase of -1 if both control and target bits are 1
            if ((i & combinedMask) === combinedMask) {
                this.stateVector[i] = this.stateVector[i].mulScalar(-1);
            }
        }
    }

    /**
     * Applies the SWAP gate.
     * @param {number} qubitA The first qubit to swap.
     * @param {number} qubitB The second qubit to swap.
     * @private
     */
    _applySWAP(qubitA, qubitB) {
        const maskA = 1 << qubitA;
        const maskB = 1 << qubitB;
        const newState = [...this.stateVector];

        for (let i = 0; i < this.stateSize; i++) {
            const bitA = (i & maskA) >> qubitA;
            const bitB = (i & maskB) >> qubitB;

            // Swap amplitudes if the bits are different (e.g., |01> and |10>)
            if (bitA !== bitB) {
                // Construct the index of the swapped state
                const j = (i & ~maskA & ~maskB) | (bitB << qubitA) | (bitA << qubitB);
                // Only swap once by processing i < j
                if (i < j) {
                    const temp = newState[i];
                    newState[i] = newState[j];
                    newState[j] = temp;
                }
            }
        }
        this.stateVector = newState;
    }

    /**
     * Measures a single qubit, collapsing the state vector.
     * @param {number} qubitIndex The index of the qubit to measure.
     * @returns {0 | 1} The classical measurement outcome.
     */
    measure(qubitIndex) {
        const mask = 1 << qubitIndex;
        let prob1 = 0;

        // Calculate the probability of measuring |1>
        for (let i = 0; i < this.stateSize; i++) {
            if ((i & mask) !== 0) {
                prob1 += this.stateVector[i].magnitudeSq();
            }
        }

        const rand = Math.random();
        const outcome = (rand < prob1) ? 1 : 0;

        // Collapse the state vector
        const normFactor = 1 / Math.sqrt(outcome === 1 ? prob1 : 1 - prob1);
        const newState = new Array(this.stateSize).fill(new Complex(0, 0));

        for (let i = 0; i < this.stateSize; i++) {
            const bit = (i & mask) ? 1 : 0;
            if (bit === outcome) {
                newState[i] = this.stateVector[i].mulScalar(normFactor);
            }
        }

        this.stateVector = newState;
        return outcome;
    }

    /**
     * Returns the probability distribution of all possible measurement outcomes.
     * @returns {Map<string, number>} A map from basis state string (e.g., "011") to its probability.
     */
    getProbabilities() {
        const probs = new Map();
        for (let i = 0; i < this.stateSize; i++) {
            const probability = this.stateVector[i].magnitudeSq();
            if (probability > 1e-9) { // Threshold to avoid floating point noise
                const basisState = i.toString(2).padStart(this.numQubits, '0');
                probs.set(basisState, probability);
            }
        }
        return probs;
    }

    /**
     * Returns the current state vector as a formatted string for debugging.
     * @returns {string} A string representation of the state vector.
     */
    toString() {
        return this.stateVector.map((amp, i) => {
            const basisState = i.toString(2).padStart(this.numQubits, '0');
            return `|${basisState}>: ${amp.toString()}`;
        }).join('\n');
    }
}