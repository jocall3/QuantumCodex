/**
 * @fileoverview Implementation of the `QuantumOps` standard library.
 * This file provides a rich set of fundamental, non-commutative quantum operators
 * represented as complex matrices. The standard representation for a complex number
 * is an array `[real, imaginary]`.
 *
 * The gates are defined for use in a quantum circuit simulator or related
 * quantum computing application.
 */

const QuantumOps = {
    /**
     * The Identity gate (I).
     * Represents no operation.
     * Matrix: [[1, 0], [0, 1]]
     * @type {Array<Array<Array<number>>>}
     */
    I: [
        [[1, 0], [0, 0]],
        [[0, 0], [1, 0]],
    ],

    /**
     * The Pauli-X gate (X), also known as the NOT gate.
     * It flips the |0> state to |1> and |1> to |0>.
     * Matrix: [[0, 1], [1, 0]]
     * @type {Array<Array<Array<number>>>}
     */
    X: [
        [[0, 0], [1, 0]],
        [[1, 0], [0, 0]],
    ],

    /**
     * The Pauli-Y gate (Y).
     * It rotates the state around the Y-axis of the Bloch sphere by π radians.
     * Matrix: [[0, -i], [i, 0]]
     * @type {Array<Array<Array<number>>>}
     */
    Y: [
        [[0, 0], [0, -1]],
        [[0, 1], [0, 0]],
    ],

    /**
     * The Pauli-Z gate (Z), also known as the phase-flip gate.
     * It leaves |0> unchanged and flips the phase of |1> to -|1>.
     * Matrix: [[1, 0], [0, -1]]
     * @type {Array<Array<Array<number>>>}
     */
    Z: [
        [[1, 0], [0, 0]],
        [[0, 0], [-1, 0]],
    ],

    /**
     * The Hadamard gate (H).
     * Creates a superposition of the basis states.
     * Matrix: 1/sqrt(2) * [[1, 1], [1, -1]]
     * @type {Array<Array<Array<number>>>}
     */
    H: [
        [[1 / Math.sqrt(2), 0], [1 / Math.sqrt(2), 0]],
        [[1 / Math.sqrt(2), 0], [-1 / Math.sqrt(2), 0]],
    ],

    /**
     * The Phase gate (S), or sqrt(Z) gate.
     * It applies a phase of i to the |1> state.
     * Matrix: [[1, 0], [0, i]]
     * @type {Array<Array<Array<number>>>}
     */
    S: [
        [[1, 0], [0, 0]],
        [[0, 0], [0, 1]],
    ],

    /**
     * The S-dagger gate (S†).
     * The conjugate transpose of the S gate.
     * Matrix: [[1, 0], [0, -i]]
     * @type {Array<Array<Array<number>>>}
     */
    Sdg: [
        [[1, 0], [0, 0]],
        [[0, 0], [0, -1]],
    ],

    /**
     * The T gate (π/8 gate).
     * A phase gate that is not in the Clifford group.
     * Matrix: [[1, 0], [0, e^(iπ/4)]]
     * @type {Array<Array<Array<number>>>}
     */
    T: [
        [[1, 0], [0, 0]],
        [[0, 0], [1 / Math.sqrt(2), 1 / Math.sqrt(2)]],
    ],

    /**
     * The T-dagger gate (T†).
     * The conjugate transpose of the T gate.
     * Matrix: [[1, 0], [0, e^(-iπ/4)]]
     * @type {Array<Array<Array<number>>>}
     */
    Tdg: [
        [[1, 0], [0, 0]],
        [[0, 0], [1 / Math.sqrt(2), -1 / Math.sqrt(2)]],
    ],

    /**
     * The Controlled-NOT gate (CNOT or CX).
     * A 2-qubit gate that flips the target qubit if the control qubit is |1>.
     * Matrix: [[1,0,0,0], [0,1,0,0], [0,0,0,1], [0,0,1,0]]
     * @type {Array<Array<Array<number>>>}
     */
    CNOT: [
        [[1, 0], [0, 0], [0, 0], [0, 0]],
        [[0, 0], [1, 0], [0, 0], [0, 0]],
        [[0, 0], [0, 0], [0, 0], [1, 0]],
        [[0, 0], [0, 0], [1, 0], [0, 0]],
    ],

    /**
     * The Controlled-Z gate (CZ).
     * A 2-qubit gate that flips the phase of the target qubit if the control qubit is |1>.
     * Matrix: [[1,0,0,0], [0,1,0,0], [0,0,1,0], [0,0,0,-1]]
     * @type {Array<Array<Array<number>>>}
     */
    CZ: [
        [[1, 0], [0, 0], [0, 0], [0, 0]],
        [[0, 0], [1, 0], [0, 0], [0, 0]],
        [[0, 0], [0, 0], [1, 0], [0, 0]],
        [[0, 0], [0, 0], [0, 0], [-1, 0]],
    ],

    /**
     * The SWAP gate.
     * A 2-qubit gate that swaps the states of the two qubits.
     * Matrix: [[1,0,0,0], [0,0,1,0], [0,1,0,0], [0,0,0,1]]
     * @type {Array<Array<Array<number>>>}
     */
    SWAP: [
        [[1, 0], [0, 0], [0, 0], [0, 0]],
        [[0, 0], [0, 0], [1, 0], [0, 0]],
        [[0, 0], [1, 0], [0, 0], [0, 0]],
        [[0, 0], [0, 0], [0, 0], [1, 0]],
    ],

    /**
     * The Toffoli gate (CCNOT).
     * A 3-qubit gate that is universal for classical computation.
     * It flips the target qubit if both control qubits are |1>.
     * @type {Array<Array<Array<number>>>}
     */
    TOFFOLI: [
        [[1,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],
        [[0,0],[1,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],
        [[0,0],[0,0],[1,0],[0,0],[0,0],[0,0],[0,0],[0,0]],
        [[0,0],[0,0],[0,0],[1,0],[0,0],[0,0],[0,0],[0,0]],
        [[0,0],[0,0],[0,0],[0,0],[1,0],[0,0],[0,0],[0,0]],
        [[0,0],[0,0],[0,0],[0,0],[0,0],[1,0],[0,0],[0,0]],
        [[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[1,0]],
        [[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[1,0],[0,0]],
    ],

    /**
     * Generates a rotation gate around the X-axis.
     * Rx(θ) = [[cos(θ/2), -i*sin(θ/2)], [-i*sin(θ/2), cos(θ/2)]]
     * @param {number} theta The angle of rotation in radians.
     * @returns {Array<Array<Array<number>>>} The Rx gate matrix.
     */
    Rx(theta) {
        const halfTheta = theta / 2;
        const cos = Math.cos(halfTheta);
        const sin = Math.sin(halfTheta);
        return [
            [[cos, 0], [0, -sin]],
            [[0, -sin], [cos, 0]],
        ];
    },

    /**
     * Generates a rotation gate around the Y-axis.
     * Ry(θ) = [[cos(θ/2), -sin(θ/2)], [sin(θ/2), cos(θ/2)]]
     * @param {number} theta The angle of rotation in radians.
     * @returns {Array<Array<Array<number>>>} The Ry gate matrix.
     */
    Ry(theta) {
        const halfTheta = theta / 2;
        const cos = Math.cos(halfTheta);
        const sin = Math.sin(halfTheta);
        return [
            [[cos, 0], [-sin, 0]],
            [[sin, 0], [cos, 0]],
        ];
    },

    /**
     * Generates a rotation gate around the Z-axis.
     * Rz(θ) = [[e^(-iθ/2), 0], [0, e^(iθ/2)]]
     * @param {number} theta The angle of rotation in radians.
     * @returns {Array<Array<Array<number>>>} The Rz gate matrix.
     */
    Rz(theta) {
        const halfTheta = theta / 2;
        const cos = Math.cos(halfTheta);
        const sin = Math.sin(halfTheta);
        return [
            [[cos, -sin], [0, 0]],
            [[0, 0], [cos, sin]],
        ];
    },

    /**
     * Generates a phase shift gate P(φ) or Rφ(φ).
     * This is equivalent to Rz(φ) up to a global phase.
     * P(φ) = [[1, 0], [0, e^(iφ)]]
     * @param {number} phi The phase angle in radians.
     * @returns {Array<Array<Array<number>>>} The Phase gate matrix.
     */
    P(phi) {
        const cos = Math.cos(phi);
        const sin = Math.sin(phi);
        return [
            [[1, 0], [0, 0]],
            [[0, 0], [cos, sin]],
        ];
    },

    /**
     * Generates a U gate, a generic single-qubit gate.
     * U(θ, φ, λ) = [[cos(θ/2), -e^(iλ)sin(θ/2)], [e^(iφ)sin(θ/2), e^(i(φ+λ))cos(θ/2)]]
     * @param {number} theta
     * @param {number} phi
     * @param {number} lambda
     * @returns {Array<Array<Array<number>>>} The U gate matrix.
     */
    U(theta, phi, lambda) {
        const halfTheta = theta / 2;
        const cosHalfTheta = Math.cos(halfTheta);
        const sinHalfTheta = Math.sin(halfTheta);

        const cosLambda = Math.cos(lambda);
        const sinLambda = Math.sin(lambda);

        const cosPhi = Math.cos(phi);
        const sinPhi = Math.sin(phi);

        const cosPhiLambda = Math.cos(phi + lambda);
        const sinPhiLambda = Math.sin(phi + lambda);

        return [
            [
                [cosHalfTheta, 0],
                [-cosLambda * sinHalfTheta, -sinLambda * sinHalfTheta]
            ],
            [
                [cosPhi * sinHalfTheta, sinPhi * sinHalfTheta],
                [cosPhiLambda * cosHalfTheta, sinPhiLambda * cosHalfTheta]
            ]
        ];
    },
};

// Make the QuantumOps object immutable to prevent accidental modifications.
Object.freeze(QuantumOps);

export default QuantumOps;