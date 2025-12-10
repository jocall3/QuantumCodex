// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

namespace Quantum.Examples {

    open Microsoft.Quantum.Intrinsic;
    open Microsoft.Quantum.Diagnostics;
    open Microsoft.Quantum.Math;
    open Microsoft.Quantum.Canon;

    /// # Summary
    /// This example demonstrates quantum teleportation, a protocol that moves a
    /// quantum state from one location to another, without physically moving the
    /// particle carrying the state. It uses an entangled pair of qubits and
    /// classical communication.
    ///
    /// # Description
    /// The protocol involves three qubits:
    /// 1. A message qubit (`msg`) in an unknown state |ψ⟩, held by Alice.
    /// 2. An entangled pair of qubits, one held by Alice (`aliceQubit`) and one
    ///    by Bob (`bobQubit`).
    ///
    /// The steps are as follows:
    /// 1. An entangled Bell pair is created and shared between Alice and Bob.
    /// 2. Alice performs a set of operations on her message qubit and her half
    ///    of the entangled pair.
    /// 3. Alice measures her two qubits, obtaining two classical bits of information.
    /// 4. Alice sends these two classical bits to Bob.
    /// 5. Bob applies specific quantum gates to his qubit based on the classical
    ///    bits he received.
    ///
    /// After these steps, Bob's qubit will be in the exact state |ψ⟩ that Alice's
    /// message qubit was originally in. The original message qubit's state is
    /// destroyed in the process.
    ///
    /// This operation simulates the entire process and verifies its success.
    @EntryPoint()
    operation TeleportationExample() : Unit {
        // Allocate three qubits for the simulation.
        use (msg = Qubit(), aliceQubit = Qubit(), bobQubit = Qubit()) {

            // === STEP 0: PREPARATION ===
            // Alice wants to teleport the state of the `msg` qubit to Bob.
            // Let's prepare `msg` in a non-trivial quantum state.
            // For this example, we'll use the state cos(π/8)|0⟩ + sin(π/8)|1⟩.
            // This is created by applying a Y-rotation of π/4.
            Ry(PI() / 4.0, msg);

            Message("--- Initial State ---");
            Message("Alice's message qubit is prepared. The state of the 3-qubit system is:");
            // DumpMachine shows the state of all allocated qubits.
            DumpMachine();

            // === STEP 1: ENTANGLEMENT ===
            // Alice and Bob create an entangled pair (a Bell pair) between
            // `aliceQubit` and `bobQubit`.
            // The state becomes (|00⟩ + |11⟩) / sqrt(2).
            H(aliceQubit);
            CNOT(aliceQubit, bobQubit);

            Message("\n--- Step 1: Entanglement ---");
            Message("An entangled Bell pair is created between Alice's second qubit and Bob's qubit.");
            DumpMachine();

            // === STEP 2: ALICE'S OPERATIONS ===
            // Alice entangles her message qubit with her part of the Bell pair.
            // This is part of a Bell-basis measurement.
            CNOT(msg, aliceQubit);
            H(msg);

            Message("\n--- Step 2: Alice's Operations ---");
            Message("Alice applies CNOT and Hadamard gates to her two qubits.");
            DumpMachine();

            // === STEP 3: ALICE'S MEASUREMENT ===
            // Alice measures her two qubits, `msg` and `aliceQubit`.
            // The outcomes are two classical bits.
            let classicalBit1 = M(msg);
            let classicalBit2 = M(aliceQubit);

            Message("\n--- Step 3: Alice's Measurement ---");
            Message($"Alice measures her qubits and gets classical bits: ({classicalBit1}, {classicalBit2}).");
            Message("The quantum state collapses after measurement:");
            DumpMachine();

            // === STEP 4: BOB'S CORRECTION ===
            // Alice sends the two classical bits to Bob.
            // Bob performs corrective operations on his qubit (`bobQubit`)
            // based on the values of the bits.
            Message("\n--- Step 4: Bob's Correction ---");
            Message("Bob applies corrective gates based on the classical bits.");

            // If the second bit is 1, Bob applies an X gate.
            if classicalBit2 == One {
                X(bobQubit);
            }
            // If the first bit is 1, Bob applies a Z gate.
            if classicalBit1 == One {
                Z(bobQubit);
            }

            Message("Final state of the system after Bob's corrections:");
            DumpMachine();

            // === STEP 5: VERIFICATION ===
            // At this point, `bobQubit` should be in the original state of `msg`.
            // To verify this, we can apply the adjoint of the initial preparation
            // operation to `bobQubit`. If the teleportation was successful,
            // `bobQubit` will return to the |0⟩ state.
            Message("\n--- Step 5: Verification ---");
            Message("Applying the adjoint of the initial preparation to Bob's qubit...");
            Adjoint Ry(PI() / 4.0, bobQubit);

            // Measure Bob's qubit. The result should be Zero.
            let finalResult = M(bobQubit);

            Message($"Verification measurement result: {finalResult}");
            if finalResult == Zero {
                Message("SUCCESS: The state was teleported correctly!");
            } else {
                Message("FAILURE: The state was not teleported correctly.");
            }

            // It's good practice to reset all qubits to the |0⟩ state before releasing them.
            ResetAll((msg, aliceQubit, bobQubit));
        }
    }
}