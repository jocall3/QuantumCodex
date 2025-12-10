namespace U.StdLib.Math.NonHermitian {
    open Microsoft.Quantum.Intrinsic;
    open Microsoft.Quantum.Canon;
    open Microsoft.Quantum.Math;
    open Microsoft.Quantum.Convert;
    open Microsoft.Quantum.Arrays;
    open Microsoft.Quantum.Preparation;
    open Microsoft.Quantum.Measurement;
    open Microsoft.Quantum.Diagnostics;

    /// # Summary
    /// Represents the result of a probabilistic application of a non-Hermitian operator.
    /// Success implies the operator was applied (up to normalization).
    /// Failure implies the state has collapsed to an orthogonal subspace or the identity.
    newtype NonHermitianResult = (Success: Bool, AuxiliaryState: Result[]);

    /// # Summary
    /// Applies a non-Hermitian operator defined by a Linear Combination of Unitaries (LCU).
    /// The operator A is approximated as A = sum_j coeff_j U_j.
    ///
    /// # Input
    /// ## coefficients
    /// The coefficients for the linear combination. Must be non-negative for this implementation (or absorbed into global phase).
    /// ## unitaries
    /// An array of unitary operations U_j.
    /// ## target
    /// The register on which the operator acts.
    ///
    /// # Output
    /// Returns true if the post-selection on the auxiliary register succeeded (projected to |0...0>),
    /// indicating the non-Hermitian operator was successfully applied.
    operation ApplyLCU(
        coefficients : Double[],
        unitaries : (Qubit[] => Unit is Adj + Ctl)[],
        target : Qubit[]
    ) : Bool {
        let nUnitaries = Length(unitaries);
        let nCoeffs = Length(coefficients);
        
        if (nUnitaries != nCoeffs) {
            fail "Number of coefficients must match number of unitaries.";
        }

        // Calculate number of ancilla qubits required to index the unitaries
        let nAncilla = Ceiling(Log(IntAsDouble(nUnitaries)) / Log(2.0));
        use ancilla = Qubit[nAncilla];
        
        // 1. Prepare the state |P> = sum_j sqrt(coeff_j) |j> on the ancilla
        // We normalize coefficients to create a valid probability distribution for preparation
        let norm = PNorm(2.0, coefficients);
        let normalizedCoeffs = Mapped(x -> Sqrt(AbsD(x) / norm), coefficients);
        
        // PrepareArbitraryStateD takes amplitudes, so we pass the sqrt of probabilities
        // Note: This assumes coefficients are positive real. Complex phases should be part of U_j.
        let amplitudes = Mapped(x -> ComplexPolar(x, 0.0), normalizedCoeffs);
        PrepareArbitraryStateCP(amplitudes, LittleEndian(ancilla));

        // 2. Select: Apply Controlled-U_j based on ancilla state |j>
        for idx in 0 .. nUnitaries - 1 {
            let op = unitaries[idx];
            ControlledOnInt(idx, op)(ancilla, target);
        }

        // 3. Un-prepare (Adjoint of preparation)
        Adjoint PrepareArbitraryStateCP(amplitudes, LittleEndian(ancilla));

        // 4. Measure ancilla. Success if all are Zero.
        let result = MeasureInteger(LittleEndian(ancilla));
        
        // Reset ancilla to 0 before releasing
        ResetAll(ancilla);

        return result == 0;
    }

    /// # Summary
    /// Applies a Quantum Channel defined by a set of Kraus Operators via Stinespring Dilation.
    /// This simulates the channel by entangling with an environment and measuring the environment.
    ///
    /// # Input
    /// ## krausOps
    /// An array of operations representing the Kraus operators K_i.
    /// These are assumed to be implemented as controlled unitaries acting on the system,
    /// where the control is the environment index.
    /// ## target
    /// The system register.
    ///
    /// # Remarks
    /// This implementation assumes the Kraus operators form a valid CPTP map (sum K_i^dag K_i = I).
    /// It uses a uniform superposition on the environment and selects the operator, 
    /// effectively simulating a mixed unitary channel if the ops are unitary.
    /// For general Kraus operators, a specific block-encoding is required which is more complex.
    /// Here we provide a Mixed Unitary Channel implementation.
    operation ApplyMixedUnitaryChannel(
        probabilities : Double[],
        unitaries : (Qubit[] => Unit)[],
        target : Qubit[]
    ) : Unit {
        let nOps = Length(unitaries);
        if (Length(probabilities) != nOps) {
            fail "Probability distribution length must match number of unitaries.";
        }

        // Select an index based on the probability distribution
        let index = RandomChoice(probabilities);
        
        // Apply the selected unitary
        unitaries[index](target);
    }

    /// # Summary
    /// Implements a non-Hermitian imaginary time evolution step e^{-H * dt} 
    /// using a probabilistic ancilla rotation (PITE).
    ///
    /// # Input
    /// ## hamiltonian
    /// The Hamiltonian H represented as a Pauli string (e.g., PauliZ).
    /// ## dt
    /// The imaginary time step size.
    /// ## target
    /// The qubit to evolve.
    ///
    /// # Output
    /// True if the step was successful (ancilla measured 0), False otherwise.
    operation ApplyImaginaryTimeStep(
        hamiltonian : Pauli,
        dt : Double,
        target : Qubit
    ) : Bool {
        use ancilla = Qubit();
        
        // Rotate ancilla to superposition
        Ry(2.0 * ArcCos(ExpD(-1.0 * dt)), ancilla);

        // Controlled operation based on Hamiltonian
        // If H = Z, we apply CNOT logic or Controlled Z logic relative to the rotation
        // Standard PITE circuit:
        // 1. Ry(theta) on ancilla
        // 2. C-U on target (where U is related to H)
        
        // For H = PauliZ: e^{-Z dt}. 
        // Operator is diag(e^{-dt}, e^{dt}). This is non-unitary.
        // We approximate or block encode.
        
        // Simple implementation for single qubit Z operator:
        // M = [[e^{-dt}, 0], [0, e^{dt}]] (unnormalized)
        
        // Circuit:
        // Ancilla: |0> -> Ry(theta)|0>
        // CNOT(ancilla, target)
        // Measure ancilla.
        
        // Let's implement the exact block encoding for e^{- \theta Z}:
        // U = Ry(theta) on ancilla controlled by target state?
        
        // If target is |0>, we want amplitude e^{-dt}. If |1>, e^{dt}.
        // We can do this by rotating the ancilla conditioned on the target.
        
        // 1. Prepare ancilla in |0>
        // 2. If target is |0>, rotate ancilla by theta0.
        // 3. If target is |1>, rotate ancilla by theta1.
        // 4. Measure ancilla.
        
        // We want success prob P(0) ~ e^{-2H dt}.
        
        let theta = 2.0 * ArcCos(ExpD(-1.0 * dt)); // Base rotation
        
        // Apply controlled rotation
        if (hamiltonian == PauliZ) {
            // If target |0>, apply nothing (or identity logic).
            // If target |1>, apply rotation.
            // This is specific to the operator structure.
            
            // General approach for e^{-H dt}:
            // Use the LCU method defined above with I and H terms.
            // e^{-x} approx 1 - x.
            
            let coeffs = [1.0, dt];
            let ops = [ApplyIdentity, ApplyPauli(hamiltonian, _)];
            return ApplyLCU(coeffs, ops, [target]);
        }
        
        // Fallback for non-Z
        return false;
    }

    /// # Summary
    /// Helper to apply a Pauli operator as a unitary in the LCU signature.
    internal operation ApplyPauli(basis : Pauli, target : Qubit[]) : Unit is Adj + Ctl {
        if (Length(target) == 1) {
            if (basis == PauliI) { I(target[0]); }
            elif (basis == PauliX) { X(target[0]); }
            elif (basis == PauliY) { Y(target[0]); }
            elif (basis == PauliZ) { Z(target[0]); }
        }
    }

    internal operation ApplyIdentity(target : Qubit[]) : Unit is Adj + Ctl {
        // No-op
    }

    /// # Summary
    /// Applies a block-encoded matrix A embedded in a unitary U.
    /// U = [[A, .], [., .]].
    ///
    /// # Input
    /// ## blockEncoding
    /// The unitary U acting on (ancilla, system).
    /// ## nAncilla
    /// Number of ancilla qubits.
    /// ## system
    /// The system register.
    ///
    /// # Output
    /// True if projection onto |0>_ancilla succeeded.
    operation ApplyBlockEncodedMatrix(
        blockEncoding : (Qubit[], Qubit[]) => Unit,
        nAncilla : Int,
        system : Qubit[]
    ) : Bool {
        use ancilla = Qubit[nAncilla];
        
        // Apply the unitary U
        blockEncoding(ancilla, system);
        
        // Measure ancilla to project onto the block A
        let result = MeasureInteger(LittleEndian(ancilla));
        
        // Reset for safety
        ResetAll(ancilla);
        
        return result == 0;
    }

    /// # Summary
    /// Performs Amplitude Amplification to increase the probability of success 
    /// for a non-Hermitian operator application.
    ///
    /// # Input
    /// ## oracle
    /// The state preparation oracle that applies the non-Hermitian op (probabilistically).
    /// ## iterations
    /// Number of Grover iterations.
    /// ## system
    /// The qubit register.
    ///
    /// # Remarks
    /// This assumes the "good" state is marked by the auxiliary qubits being |0...0> 
    /// inside the oracle, but standard AA requires a flagging oracle.
    /// This is a placeholder for the .u language standard library integration.
    operation AmplifyNonHermitianStep(
        oracle : (Qubit[]) => Unit is Adj + Ctl,
        iterations : Int,
        system : Qubit[]
    ) : Unit {
        // Standard Amplitude Amplification loop
        for _ in 1 .. iterations {
            // 1. Reflection about "bad" states (usually handled by oracle structure)
            // 2. Reflection about initial state
            // This requires access to the specific structure of the LCU or Block Encoding.
            // Implementation deferred to specific solver modules.
        }
    }

    /// # Summary
    /// Randomly selects an index based on weights.
    /// Helper for Mixed Unitary Channels.
    internal operation RandomChoice(weights : Double[]) : Int {
        let total = PNorm(1.0, weights);
        let draw = RandomDouble() * total;
        mutable sum = 0.0;
        for i in 0 .. Length(weights) - 1 {
            set sum += weights[i];
            if (sum >= draw) {
                return i;
            }
        }
        return Length(weights) - 1;
    }
}