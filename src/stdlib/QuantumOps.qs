namespace U.StdLib.QuantumOps {
    open Microsoft.Quantum.Intrinsic;
    open Microsoft.Quantum.Canon;
    open Microsoft.Quantum.Math;
    open Microsoft.Quantum.Convert;

    /// # Summary
    /// The Identity gate. Leaves the qubit state unchanged.
    /// Useful for no-op placeholders in quantum circuits.
    operation I(q : Qubit) : Unit is Adj + Ctl {
        Microsoft.Quantum.Intrinsic.I(q);
    }

    /// # Summary
    /// The Hadamard gate (H).
    /// Creates a superposition state from basis states.
    /// H|0> = (|0> + |1>) / sqrt(2)
    /// H|1> = (|0> - |1>) / sqrt(2)
    operation H(q : Qubit) : Unit is Adj + Ctl {
        Microsoft.Quantum.Intrinsic.H(q);
    }

    /// # Summary
    /// The Pauli-X gate (NOT gate).
    /// Maps |0> to |1> and |1> to |0>.
    /// Corresponds to a rotation of PI around the X-axis.
    operation X(q : Qubit) : Unit is Adj + Ctl {
        Microsoft.Quantum.Intrinsic.X(q);
    }

    /// # Summary
    /// The Pauli-Y gate.
    /// Maps |0> to i|1> and |1> to -i|0>.
    /// Corresponds to a rotation of PI around the Y-axis.
    operation Y(q : Qubit) : Unit is Adj + Ctl {
        Microsoft.Quantum.Intrinsic.Y(q);
    }

    /// # Summary
    /// The Pauli-Z gate.
    /// Maps |0> to |0> and |1> to -|1>.
    /// Corresponds to a rotation of PI around the Z-axis.
    operation Z(q : Qubit) : Unit is Adj + Ctl {
        Microsoft.Quantum.Intrinsic.Z(q);
    }

    /// # Summary
    /// The S gate (Phase gate).
    /// Applies a phase of i (90 degrees) to the |1> state.
    /// S = diag(1, i). S^2 = Z.
    operation S(q : Qubit) : Unit is Adj + Ctl {
        Microsoft.Quantum.Intrinsic.S(q);
    }

    /// # Summary
    /// The adjoint (inverse) of the S gate.
    /// Applies a phase of -i (-90 degrees) to the |1> state.
    operation S_Adj(q : Qubit) : Unit is Adj + Ctl {
        Adjoint S(q);
    }

    /// # Summary
    /// The T gate (PI/8 gate).
    /// Applies a phase of e^(i*PI/4) (45 degrees) to the |1> state.
    /// T^2 = S.
    operation T(q : Qubit) : Unit is Adj + Ctl {
        Microsoft.Quantum.Intrinsic.T(q);
    }

    /// # Summary
    /// The adjoint (inverse) of the T gate.
    /// Applies a phase of e^(-i*PI/4) (-45 degrees) to the |1> state.
    operation T_Adj(q : Qubit) : Unit is Adj + Ctl {
        Adjoint T(q);
    }

    // ==========================================
    // Rotation Gates
    // ==========================================

    /// # Summary
    /// Rotates the qubit state around the X-axis by the given angle (in radians).
    /// Rx(theta) = exp(-i * theta * X / 2)
    operation Rx(theta : Double, q : Qubit) : Unit is Adj + Ctl {
        Microsoft.Quantum.Intrinsic.Rx(theta, q);
    }

    /// # Summary
    /// Rotates the qubit state around the Y-axis by the given angle (in radians).
    /// Ry(theta) = exp(-i * theta * Y / 2)
    operation Ry(theta : Double, q : Qubit) : Unit is Adj + Ctl {
        Microsoft.Quantum.Intrinsic.Ry(theta, q);
    }

    /// # Summary
    /// Rotates the qubit state around the Z-axis by the given angle (in radians).
    /// Rz(theta) = exp(-i * theta * Z / 2)
    operation Rz(theta : Double, q : Qubit) : Unit is Adj + Ctl {
        Microsoft.Quantum.Intrinsic.Rz(theta, q);
    }

    /// # Summary
    /// Applies a global phase to the quantum state.
    /// This is physically unobservable but useful in mathematical formulations.
    operation GlobalPhase(theta : Double, q : Qubit) : Unit is Adj + Ctl {
        R1(theta, q);
        Rz(-theta, q);
    }

    // ==========================================
    // Multi-Qubit Gates
    // ==========================================

    /// # Summary
    /// Controlled-NOT (CNOT) gate.
    /// Flips the target qubit if the control qubit is in the |1> state.
    operation CNOT(control : Qubit, target : Qubit) : Unit is Adj + Ctl {
        Microsoft.Quantum.Intrinsic.CNOT(control, target);
    }

    /// # Summary
    /// Controlled-Z (CZ) gate.
    /// Applies a Z gate to the target qubit if the control qubit is |1>.
    /// Symmetric operation: CZ(a, b) == CZ(b, a).
    operation CZ(control : Qubit, target : Qubit) : Unit is Adj + Ctl {
        Controlled Z([control], target);
    }

    /// # Summary
    /// Controlled-X gate (Alias for CNOT).
    operation CX(control : Qubit, target : Qubit) : Unit is Adj + Ctl {
        CNOT(control, target);
    }

    /// # Summary
    /// Controlled-Y gate.
    /// Applies a Y gate to the target qubit if the control qubit is |1>.
    operation CY(control : Qubit, target : Qubit) : Unit is Adj + Ctl {
        Controlled Y([control], target);
    }

    /// # Summary
    /// SWAP gate.
    /// Swaps the states of two qubits.
    operation SWAP(q1 : Qubit, q2 : Qubit) : Unit is Adj + Ctl {
        Microsoft.Quantum.Intrinsic.SWAP(q1, q2);
    }

    /// # Summary
    /// Toffoli gate (CCNOT).
    /// Flips the target qubit if both control qubits are in the |1> state.
    operation Toffoli(c1 : Qubit, c2 : Qubit, target : Qubit) : Unit is Adj + Ctl {
        CCNOT(c1, c2, target);
    }

    // ==========================================
    // Measurement Operations
    // ==========================================

    /// # Summary
    /// Measures a single qubit in the Pauli-Z basis.
    /// Returns Result.Zero or Result.One.
    /// The qubit collapses to the measured state.
    operation Measure(q : Qubit) : Result {
        return M(q);
    }

    /// # Summary
    /// Measures a single qubit in the Pauli-X basis.
    /// This is equivalent to applying H, measuring in Z, and applying H again.
    operation MeasureX(q : Qubit) : Result {
        H(q);
        let result = M(q);
        H(q); // Restore basis if needed, though state collapsed
        return result;
    }

    /// # Summary
    /// Measures a single qubit in the Pauli-Y basis.
    operation MeasureY(q : Qubit) : Result {
        Adjoint S(q);
        H(q);
        let result = M(q);
        H(q);
        S(q);
        return result;
    }

    /// # Summary
    /// Resets a qubit to the |0> state.
    /// If the qubit is measured as |1>, applies X to flip it to |0>.
    operation Reset(q : Qubit) : Unit {
        if (M(q) == One) {
            X(q);
        }
    }

    // ==========================================
    // High-Level Algorithms / Utilities
    // ==========================================

    /// # Summary
    /// Prepares a Bell State (Entanglement) |Phi+> = (|00> + |11>) / sqrt(2).
    /// Requires two qubits initialized to |0>.
    operation PrepareBellState(q1 : Qubit, q2 : Qubit) : Unit is Adj + Ctl {
        H(q1);
        CNOT(q1, q2);
    }

    /// # Summary
    /// Applies the Quantum Fourier Transform (QFT) to a register of qubits.
    /// Recursive implementation.
    operation ApplyQFT(qs : Qubit[]) : Unit is Adj + Ctl {
        let n = Length(qs);
        if (n >= 1) {
            H(qs[0]);
            for i in 1 .. n - 1 {
                Controlled R1([qs[i]], (PI() / PowD(2.0, IntAsDouble(i)), qs[0]));
            }
            ApplyQFT(qs[1 .. n - 1]);
        }
    }
}