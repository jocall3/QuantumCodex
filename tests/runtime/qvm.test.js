import { QVM } from '../../src/runtime/qvm.js';
import { Complex } from '../../src/math/complex.js';

/**
 * A helper function to compare two state vectors (arrays of Complex numbers)
 * with a given precision for floating point comparisons.
 * @param {Complex[]} actual - The actual state vector from the QVM.
 * @param {Complex[]} expected - The expected state vector.
 * @param {number} [precision=8] - The number of decimal places to check for equality.
 */
function expectStateVector(actual, expected, precision = 8) {
    expect(actual).toHaveLength(expected.length);
    for (let i = 0; i < actual.length; i++) {
        expect(actual[i].re).toBeCloseTo(expected[i].re, precision);
        expect(actual[i].im).toBeCloseTo(expected[i].im, precision);
    }
}

describe('Quantum Virtual Machine (QVM)', () => {
    const ONE_OVER_SQRT_2 = 1 / Math.sqrt(2);

    describe('Initialization', () => {
        it('should initialize a 1-qubit system to the |0> state', () => {
            const qvm = new QVM(1);
            const expectedState = [Complex.ONE, Complex.ZERO];
            expectStateVector(qvm.getStateVector(), expectedState);
        });

        it('should initialize a 2-qubit system to the |00> state', () => {
            const qvm = new QVM(2);
            const expectedState = [Complex.ONE, Complex.ZERO, Complex.ZERO, Complex.ZERO];
            expectStateVector(qvm.getStateVector(), expectedState);
        });

        it('should initialize a 3-qubit system to the |000> state', () => {
            const qvm = new QVM(3);
            const expectedState = [
                Complex.ONE, Complex.ZERO, Complex.ZERO, Complex.ZERO,
                Complex.ZERO, Complex.ZERO, Complex.ZERO, Complex.ZERO
            ];
            expectStateVector(qvm.getStateVector(), expectedState);
        });

        it('should throw an error for an invalid number of qubits', () => {
            expect(() => new QVM(0)).toThrow();
            expect(() => new QVM(-1)).toThrow();
            expect(() => new QVM(1.5)).toThrow();
        });
    });

    describe('Single-Qubit Gates', () => {
        let qvm;

        beforeEach(() => {
            qvm = new QVM(1);
        });

        it('should apply Pauli-X gate to |0> to get |1>', () => {
            qvm.x(0);
            const expectedState = [Complex.ZERO, Complex.ONE];
            expectStateVector(qvm.getStateVector(), expectedState);
        });

        it('should apply Pauli-X gate to |1> to get |0>', () => {
            qvm.x(0); // |0> -> |1>
            qvm.x(0); // |1> -> |0>
            const expectedState = [Complex.ONE, Complex.ZERO];
            expectStateVector(qvm.getStateVector(), expectedState);
        });

        it('should apply Hadamard gate to |0> to get |+>', () => {
            qvm.h(0);
            const expectedState = [
                new Complex(ONE_OVER_SQRT_2, 0),
                new Complex(ONE_OVER_SQRT_2, 0)
            ];
            expectStateVector(qvm.getStateVector(), expectedState);
        });

        it('should apply Hadamard gate to |1> to get |->', () => {
            qvm.x(0); // |0> -> |1>
            qvm.h(0);
            const expectedState = [
                new Complex(ONE_OVER_SQRT_2, 0),
                new Complex(-ONE_OVER_SQRT_2, 0)
            ];
            expectStateVector(qvm.getStateVector(), expectedState);
        });

        it('should apply Pauli-Y gate to |0> to get i|1>', () => {
            qvm.y(0);
            const expectedState = [Complex.ZERO, Complex.I];
            expectStateVector(qvm.getStateVector(), expectedState);
        });

        it('should apply Pauli-Y gate to |1> to get -i|0>', () => {
            qvm.x(0); // |0> -> |1>
            qvm.y(0);
            const expectedState = [new Complex(0, -1), Complex.ZERO];
            expectStateVector(qvm.getStateVector(), expectedState);
        });

        it('should apply Pauli-Z gate to |0> to get |0>', () => {
            qvm.z(0);
            const expectedState = [Complex.ONE, Complex.ZERO];
            expectStateVector(qvm.getStateVector(), expectedState);
        });

        it('should apply Pauli-Z gate to |1> to get -|1>', () => {
            qvm.x(0); // |0> -> |1>
            qvm.z(0);
            const expectedState = [Complex.ZERO, new Complex(-1, 0)];
            expectStateVector(qvm.getStateVector(), expectedState);
        });

        it('should apply S (Phase) gate to |+> correctly', () => {
            qvm.h(0); // |0> -> |+>
            qvm.s(0);
            const expectedState = [
                new Complex(ONE_OVER_SQRT_2, 0),
                new Complex(0, ONE_OVER_SQRT_2)
            ];
            expectStateVector(qvm.getStateVector(), expectedState);
        });

        it('should apply T gate to |+> correctly', () => {
            qvm.h(0); // |0> -> |+>
            qvm.t(0);
            const expectedState = [
                new Complex(ONE_OVER_SQRT_2, 0),
                new Complex(ONE_OVER_SQRT_2 * ONE_OVER_SQRT_2, ONE_OVER_SQRT_2 * ONE_OVER_SQRT_2) // e^(i*pi/4) / sqrt(2)
            ];
            expectStateVector(qvm.getStateVector(), expectedState);
        });
    });

    describe('Multi-Qubit Gates', () => {
        it('should apply CNOT to |00> (no change)', () => {
            const qvm = new QVM(2);
            qvm.cnot(0, 1);
            const expectedState = [Complex.ONE, Complex.ZERO, Complex.ZERO, Complex.ZERO];
            expectStateVector(qvm.getStateVector(), expectedState);
        });

        it('should apply CNOT to |01> (no change)', () => {
            const qvm = new QVM(2);
            qvm.x(1); // |00> -> |01>
            qvm.cnot(0, 1);
            const expectedState = [Complex.ZERO, Complex.ONE, Complex.ZERO, Complex.ZERO];
            expectStateVector(qvm.getStateVector(), expectedState);
        });

        it('should apply CNOT to |10> to get |11>', () => {
            const qvm = new QVM(2);
            qvm.x(0); // |00> -> |10>
            qvm.cnot(0, 1);
            const expectedState = [Complex.ZERO, Complex.ZERO, Complex.ZERO, Complex.ONE];
            expectStateVector(qvm.getStateVector(), expectedState);
        });

        it('should apply CNOT to |11> to get |10>', () => {
            const qvm = new QVM(2);
            qvm.x(0); // |00> -> |10>
            qvm.x(1); // |10> -> |11>
            qvm.cnot(0, 1);
            const expectedState = [Complex.ZERO, Complex.ZERO, Complex.ONE, Complex.ZERO];
            expectStateVector(qvm.getStateVector(), expectedState);
        });

        it('should apply SWAP to |01> to get |10>', () => {
            const qvm = new QVM(2);
            qvm.x(1); // |00> -> |01>
            qvm.swap(0, 1);
            const expectedState = [Complex.ZERO, Complex.ZERO, Complex.ONE, Complex.ZERO];
            expectStateVector(qvm.getStateVector(), expectedState);
        });

        it('should apply Toffoli (CCNOT) to |110> to get |111>', () => {
            const qvm = new QVM(3);
            qvm.x(0); // -> |100>
            qvm.x(1); // -> |110>
            qvm.ccnot(0, 1, 2);
            const expectedState = [
                Complex.ZERO, Complex.ZERO, Complex.ZERO, Complex.ZERO,
                Complex.ZERO, Complex.ZERO, Complex.ZERO, Complex.ONE
            ];
            expectStateVector(qvm.getStateVector(), expectedState);
        });

        it('should apply Toffoli (CCNOT) to |111> to get |110>', () => {
            const qvm = new QVM(3);
            qvm.x(0); // -> |100>
            qvm.x(1); // -> |110>
            qvm.x(2); // -> |111>
            qvm.ccnot(0, 1, 2);
            const expectedState = [
                Complex.ZERO, Complex.ZERO, Complex.ZERO, Complex.ZERO,
                Complex.ZERO, Complex.ZERO, Complex.ONE, Complex.ZERO
            ];
            expectStateVector(qvm.getStateVector(), expectedState);
        });

        it('should not apply Toffoli (CCNOT) if controls are not met', () => {
            const qvm = new QVM(3);
            qvm.x(0); // -> |100>
            qvm.ccnot(0, 1, 2); // Should not flip target
            const expectedState = [
                Complex.ZERO, Complex.ZERO, Complex.ZERO, Complex.ZERO,
                Complex.ONE, Complex.ZERO, Complex.ZERO, Complex.ZERO
            ];
            expectStateVector(qvm.getStateVector(), expectedState);
        });
    });

    describe('Quantum Circuits and Algorithms', () => {
        it('should create a Bell state |Φ+>', () => {
            const qvm = new QVM(2);
            qvm.h(0);
            qvm.cnot(0, 1);
            const expectedState = [
                new Complex(ONE_OVER_SQRT_2, 0),
                Complex.ZERO,
                Complex.ZERO,
                new Complex(ONE_OVER_SQRT_2, 0)
            ];
            expectStateVector(qvm.getStateVector(), expectedState);
        });

        it('should create a 3-qubit GHZ state', () => {
            const qvm = new QVM(3);
            qvm.h(0);
            qvm.cnot(0, 1);
            qvm.cnot(0, 2);
            const expectedState = [
                new Complex(ONE_OVER_SQRT_2, 0), Complex.ZERO, Complex.ZERO, Complex.ZERO,
                Complex.ZERO, Complex.ZERO, Complex.ZERO, new Complex(ONE_OVER_SQRT_2, 0)
            ];
            expectStateVector(qvm.getStateVector(), expectedState);
        });

        it('should correctly apply gates to specific qubits in a multi-qubit system', () => {
            // Test applying H to the middle qubit of a 3-qubit system |000> -> |0+0>
            const qvm = new QVM(3);
            qvm.h(1);
            // Expected state: 1/sqrt(2) * (|000> + |010>)
            const expectedState = [
                new Complex(ONE_OVER_SQRT_2, 0), Complex.ZERO,
                new Complex(ONE_OVER_SQRT_2, 0), Complex.ZERO,
                Complex.ZERO, Complex.ZERO, Complex.ZERO, Complex.ZERO
            ];
            expectStateVector(qvm.getStateVector(), expectedState);
        });
    });
});