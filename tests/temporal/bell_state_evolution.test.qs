// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

namespace Quantum.Terminal.Tests.Temporal {
    open Microsoft.Quantum.Canon;
    open Microsoft.Quantum.Intrinsic;
    open Microsoft.Quantum.Diagnostics;

    /// # Summary
    /// This test verifies the evolution of a quantum state through multiple steps,
    /// simulating a "temporal" process within a single quantum context.
    ///
    /// # Description
    /// The test proceeds as follows:
    /// 1.  **Preparation**: Two qubits are allocated and prepared in the Bell state |Φ⁺⟩.
    /// 2.  **Initial Assertion**: The state is verified to be |Φ⁺⟩.
    /// 3.  **Evolution**: A Pauli X gate is applied to the first qubit, transforming
    ///     the state from |Φ⁺⟩ to |Ψ⁺⟩.
    /// 4.  **Final Assertion**: The evolved state is verified to be |Ψ⁺⟩.
    ///
    /// This entire sequence occurs within a single `use` block, ensuring the quantum
    /// state persists and evolves from one step to the next.
    @Test("QuantumSimulator")
    operation VerifyBellStateEvolution() : Unit {
        // Use a block to manage the lifetime of the qubits. They are allocated
        // at the beginning and automatically released at the end, providing a
        // persistent context for the duration of the test.
        use (q0, q1) = (Qubit(), Qubit());

        // Step 1: Prepare the initial Bell state |Φ⁺⟩ = (|00⟩ + |11⟩) / sqrt(2).
        // This is a standard preparation circuit using a Hadamard and a CNOT gate.
        H(q0);
        CNOT(q0, q1);

        // Step 2: Assert that the qubits are in the expected |Φ⁺⟩ state.
        // The |Φ⁺⟩ state corresponds to the Bell basis state with parities (PauliI, PauliX).
        // This assertion confirms the initial state without collapsing or altering it.
        AssertBellState(PauliI, PauliX, q0, q1);

        // Step 3: Evolve the state by applying a gate.
        // We apply an X gate to the first qubit.
        // This transforms |Φ⁺⟩ into |Ψ⁺⟩ = (|01⟩ + |10⟩) / sqrt(2).
        X(q0);

        // Step 4: Assert the final, evolved state.
        // The |Ψ⁺⟩ state corresponds to the Bell basis state with parities (PauliX, PauliX).
        // This verifies that the evolution step produced the correct outcome.
        AssertBellState(PauliX, PauliX, q0, q1);

        // The 'use' statement requires that qubits are returned to the |0⟩ state
        // before they are deallocated. We explicitly reset them to ensure this condition is met.
        ResetAll([q0, q1]);
    }
}