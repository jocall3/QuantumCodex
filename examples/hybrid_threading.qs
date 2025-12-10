// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

namespace Quantum.Examples.HybridThreading {

    open Microsoft.Quantum.Canon;
    open Microsoft.Quantum.Intrinsic;
    open Microsoft.Quantum.Measurement;
    open Microsoft.Quantum.Math;
    open Microsoft.Quantum.Convert;
    open Microsoft.Quantum.Arrays;

    // This file provides a collection of quantum operations designed to be called
    // concurrently from a classical host program. This demonstrates a hybrid
    // quantum-classical programming model where multiple, independent quantum
    // tasks can be dispatched to available quantum hardware or simulators in parallel.
    //
    // The classical host program (e.g., in C# or Python) would be responsible for
    // managing the threads or asynchronous tasks that call these Q# operations.

    /// # Summary
    /// Generates a single random bit by preparing a qubit in a superposition
    /// and measuring it. This represents a simple, quick quantum task.
    ///
    /// # Output
    /// A classical `Result` which is `Zero` or `One` with 50% probability.
    operation GenerateRandomBit() : Result {
        use q = Qubit();
        H(q);
        return M(q);
    }

    /// # Summary
    /// Prepares a Bell pair |Φ⁺⟩ = (|00⟩ + |11⟩) / sqrt(2), and then measures
    /// each qubit in a specified Pauli basis. This represents a task with
    /// classical input parameters.
    ///
    /// # Input
    /// ## basis
    /// The Pauli basis (`PauliX`, `PauliY`, or `PauliZ`) in which to measure the qubits.
    ///
    /// # Output
    /// A tuple containing the measurement results for the two qubits.
    operation PrepareAndMeasureBellState(basis : Pauli) : (Result, Result) {
        use (q1, q2) = (Qubit(), Qubit());
        
        // Create the Bell state |Φ⁺⟩
        H(q1);
        CNOT(q1, q2);

        // Measure both qubits in the specified basis.
        // The Measure operation from Microsoft.Quantum.Measurement is used for
        // measuring in bases other than the computational (Z) basis.
        let result1 = Measure([basis], [q1]);
        let result2 = Measure([basis], [q2]);

        // Reset qubits to ensure they are returned to the |0⟩ state before deallocation.
        Reset(q1);
        Reset(q2);

        return (result1, result2);
    }

    /// # Summary
    /// Implements Grover's search algorithm to find a single marked element in a database.
    /// This is a more computationally intensive task suitable for demonstrating
    /// longer-running concurrent quantum jobs.
    ///
    /// # Input
    /// ## nQubits
    /// The number of qubits to use for the search space, which will be of size 2^nQubits.
    /// ## markedElement
    /// The integer index of the element to be marked. This value must be between 0 and 2^nQubits - 1.
    ///
    /// # Output
    /// The integer index found by the search algorithm. With high probability, this
    /// will be the `markedElement`.
    operation RunGroverSearch(nQubits : Int, markedElement : Int) : Int {
        // The number of iterations is chosen to be optimal for a single marked element.
        let nIterations = Round(PI() / 4.0 * Sqrt(IntAsDouble(2^nQubits)) - 0.5);

        use register = Qubit[nQubits];

        // Prepare uniform superposition over all basis states.
        ApplyToEach(H, register);

        // Main Grover loop: alternate between oracle and diffusion operator.
        for _ in 1..nIterations {
            StateOracle(markedElement, register);
            GroverDiffusion(register);
        }

        // Measure the register and convert the result from a Result[] to an Int.
        let resultArray = MultiM(register);
        let resultInt = ResultArrayAsInt(resultArray);

        // Reset all qubits before they are released.
        ResetAll(register);
        return resultInt;
    }


    // --- Helper functions for Grover's Algorithm ---

    /// # Summary
    /// Oracle that marks the `markedElement` by flipping its phase.
    internal operation StateOracle(markedElement : Int, register : Qubit[]) : Unit is Adj + Ctl {
        // Get the binary representation of the marked element as a Bool array.
        let markedBits = IntAsBoolArray(markedElement, Length(register));

        // The `within-apply` statement applies and then un-applies a set of
        // operations around a central operation. Here, it transforms the basis
        // so that the marked state becomes |11...1⟩, applies a multi-controlled
        // Z-gate, and then transforms back.
        within {
            // Apply X gates to qubits corresponding to 0s in the marked state's
            // binary representation.
            for (idx, bit) in Enumerate(markedBits) {
                if not bit {
                    X(register[idx]);
                }
            }
        } apply {
            // Apply controlled-Z gate on the target state. This flips the phase
            // of the marked element, as it is now in the |11...1⟩ state.
            if Length(register) > 1 {
                Controlled Z(register[0..Length(register)-2], register[Length(register)-1]);
            } elif Length(register) == 1 {
                Z(register[0]);
            }
        }
    }

    /// # Summary
    /// The Grover diffusion operator, which amplifies the amplitude of the marked state
    /// by reflecting the state vector about the uniform superposition state.
    internal operation GroverDiffusion(register : Qubit[]) : Unit is Adj + Ctl {
        // The diffusion operator is H^{\otimes n} (2|0⟩⟨0| - I) H^{\otimes n}.
        // The (2|0⟩⟨0| - I) part flips the phase of the |0...0⟩ state and leaves
        // others unchanged. This is implemented by sandwiching a controlled-Z
        // that targets the |1...1⟩ state with X gates.
        within {
            ApplyToEach(H, register);
            ApplyToEach(X, register);
        } apply {
            // Apply controlled-Z gate on the |0...0⟩ state (which is now |1...1⟩).
            if Length(register) > 1 {
                Controlled Z(register[0..Length(register)-2], register[Length(register)-1]);
            } elif Length(register) == 1 {
                Z(register[0]);
            }
        }
    }
}