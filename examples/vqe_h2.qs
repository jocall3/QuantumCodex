// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

namespace Microsoft.Quantum.Samples.Chemistry.VQE {
    open Microsoft.Quantum.Intrinsic;
    open Microsoft.Quantum.Canon;
    open Microsoft.Quantum.Math;
    open Microsoft.Quantum.Characterization;
    open Microsoft.Quantum.Arrays;

    /// # Summary
    /// This operation prepares the trial state (ansatz) for the H2 molecule
    /// using a simplified Unitary Coupled Cluster (UCC) approach.
    /// The state prepared is `cos(θ)|10⟩ + sin(θ)|01⟩`, which captures the
    /// essential physics of the H2 ground state by mixing the Hartree-Fock
    /// state (`|10⟩`) with the doubly excited state (`|01⟩`).
    ///
    /// # Input
    /// ## qubits
    /// The two qubits on which the ansatz is prepared.
    /// ## theta
    /// The variational parameter that mixes the ground and excited states.
    operation PrepareH2Ansatz(qubits : Qubit[], theta : Double) : Unit is Adj + Ctl {
        // The Hartree-Fock state for the 2-qubit H2 problem is |10⟩.
        // We prepare this from the |00⟩ state by applying an X gate to the first qubit.
        X(qubits[0]);

        // The ansatz circuit U(θ) = exp(-iθ X₀Y₁) creates the desired superposition.
        // When applied to the Hartree-Fock state |10⟩, it produces:
        // U(θ)|10⟩ = cos(θ)|10⟩ + sin(θ)|01⟩
        // This circuit can be decomposed into CNOT and Ry gates as follows:
        within {
            CNOT(qubits[0], qubits[1]);
        } apply {
            Ry(2.0 * theta, qubits[0]);
        }
    }

    /// # Summary
    /// Estimates the energy of the H2 molecule for a given ansatz and parameter.
    /// This operation constructs the molecular Hamiltonian and measures the
    /// expectation value for the state prepared by the provided ansatz.
    ///
    /// # Input
    /// ## ansatz
    /// The state preparation operation (ansatz).
    /// ## parameter
    /// The variational parameter for the ansatz.
    ///
    /// # Output
    /// The estimated energy of the Hamiltonian for the prepared state.
    operation EstimateEnergy(ansatz : ((Qubit[], Double) => Unit is Adj + Ctl), parameter : Double) : Double {
        // The Hamiltonian for the H2 molecule at bond distance 0.7414 Å,
        // after applying symmetries and transformations to reduce it to a 2-qubit problem.
        // H = c₀I + c₁Z₀ + c₂Z₁ + c₃Z₀Z₁ + c₄X₀X₁ + c₅Y₀Y₁
        let coefficients = [-0.8126, 0.1712, -0.2228, 0.1686, 0.0453, 0.0453];
        let pauliTerms = [
            [PauliI, PauliI], [PauliZ, PauliI], [PauliI, PauliZ],
            [PauliZ, PauliZ], [PauliX, PauliX], [PauliY, PauliY]
        ];

        mutable totalEnergy = 0.0;
        use qubits = Qubit[2];

        // Define a new operation that captures the `parameter` and has the
        // signature required by `EstimateExpectation`.
        operation StatePrep(qs : Qubit[]) : Unit is Adj + Ctl {
            ansatz(qs, parameter);
        }

        for (idxTerm in 0..Length(pauliTerms) - 1) {
            // EstimateExpectation measures the expectation value of a Pauli operator
            // for a given state. We use a number of shots to get a statistical estimate.
            // In a real experiment or more advanced simulation, one might group
            // compatible terms for more efficient measurement.
            let expectation = EstimateExpectation(pauliTerms[idxTerm], StatePrep, qubits, 2048);
            set totalEnergy += coefficients[idxTerm] * expectation;
        }

        // Reset qubits to |00⟩ state for reuse.
        ResetAll(qubits);

        return totalEnergy;
    }

    /// # Summary
    /// Implements the Variational Quantum Eigensolver (VQE) algorithm
    /// to find the ground state energy of the H2 molecule.
    /// This function performs a simple classical optimization (grid search)
    /// to find the parameter `theta` that minimizes the energy. This demonstrates
    /// the hybrid quantum-classical nature of the VQE algorithm.
    @EntryPoint()
    operation VQE_H2() : Unit {
        Message("VQE for H2 Molecule Ground State Energy");
        Message("---------------------------------------");

        // The classical optimization part of VQE.
        // Here, we perform a simple grid search over the parameter 'theta'.
        // A more sophisticated optimizer (e.g., gradient-based or gradient-free methods)
        // would be used in a production VQE implementation.
        let nGridPoints = 100;
        let angleStep = (2.0 * PI()) / IntAsDouble(nGridPoints);

        mutable minEnergy = 100.0;
        mutable optimalAngle = 0.0;

        Message("Scanning angles from -π to π to find the minimum energy...");
        for (i in 0..nGridPoints) {
            let angle = -PI() + (IntAsDouble(i) * angleStep);
            
            // This is the core of the hybrid loop: the classical code calls the
            // quantum computer (or simulator) to evaluate the energy for a
            // given set of parameters.
            let currentEnergy = EstimateEnergy(PrepareH2Ansatz, angle);
            
            // The classical optimizer then uses the result to choose the next
            // set of parameters. In our case, we just keep track of the minimum.
            if (currentEnergy < minEnergy) {
                set minEnergy = currentEnergy;
                set optimalAngle = angle;
            }
        }

        Message("\n--- VQE Result ---");
        Message($"Optimal angle (theta): {optimalAngle, 9:F6}");
        Message($"Minimum energy (Hartree): {minEnergy, 9:F6}");
        Message("Theoretical ground state energy for H2 at 0.7414 Å is approx. -1.137 Hartree.");
    }
}