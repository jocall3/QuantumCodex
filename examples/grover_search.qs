// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

namespace Quantum.Examples {

    open Microsoft.Quantum.Intrinsic;
    open Microsoft.Quantum.Canon;
    open Microsoft.Quantum.Diagnostics;
    open Microsoft.Quantum.Convert;
    open Microsoft.Quantum.Arrays;
    open Microsoft.Quantum.Math;

    /// # Summary
    /// This example demonstrates Grover's search algorithm for finding a unique
    /// marked element in a database.
    ///
    /// # Description
    /// Grover's algorithm is one of the most famous quantum algorithms. It solves
    /// the unstructured search problem: given a black-box function (oracle) that
    /// identifies a "marked" item, find that item.
    ///
    /// Classically, this requires, on average, N/2 queries to the oracle for a
    /// database of size N. Grover's algorithm achieves this with only about
    /// sqrt(N) queries, providing a quadratic speedup.
    ///
    /// This implementation showcases:
    /// - An Oracle: A quantum operation that "marks" the solution by flipping its phase.
    /// - Amplitude Amplification: The core of Grover's algorithm, which iteratively
    ///   increases the probability of measuring the marked state. This is achieved by
    ///   repeatedly applying the Grover operator, which consists of the oracle
    ///   followed by a reflection about the uniform superposition state.
    /// - Quantum Random Access: The oracle acts as a quantum random access memory (QRAM)
    ///   query, checking all possible inputs in superposition.

    /// # Summary
    /// Implements the oracle for Grover's algorithm.
    /// This operation marks a specific computational basis state by flipping its phase.
    ///
    /// # Input
    /// ## markedElement
    /// The integer representation of the computational basis state to be marked.
    /// ## databaseRegister
    /// The register of qubits representing the search space.
    operation MarkIntegerOracle(markedElement : Int, databaseRegister : Qubit[]) : Unit is Adj + Ctl {
        // The goal is to apply a Z gate to the state |markedElement⟩.
        // A multi-controlled Z gate flips the phase of |1...1⟩.
        // We can transform |markedElement⟩ to |1...1⟩, apply the multi-controlled Z,
        // and then transform back.
        
        // Convert the integer to its binary representation.
        let bits = IntAsBoolArray(markedElement, Length(databaseRegister));
        
        // The `within-apply` block ensures the transformations are automatically undone.
        within {
            // Apply X gates to qubits corresponding to a '0' in the marked element's
            // binary representation. This transforms |markedElement⟩ into |1...1⟩.
            for (idx in 0..Length(databaseRegister)-1) {
                if (not bits[idx]) {
                    X(databaseRegister[idx]);
                }
            }
        } apply {
            // Apply a multi-controlled Z gate. This flips the phase of the |1...1⟩ state.
            // The `Controlled` functor applies the Z gate to the last qubit,
            // controlled by all other qubits in the register.
            Controlled Z(Most(databaseRegister), Tail(databaseRegister));
        }
    }

    /// # Summary
    /// Implements the Grover diffusion operator, which reflects the state
    /// about the uniform superposition.
    ///
    /// # Input
    /// ## databaseRegister
    /// The register of qubits on which to apply the reflection.
    operation ReflectAboutUniform(databaseRegister : Qubit[]) : Unit is Adj + Ctl {
        // The diffusion operator D is given by D = H^n (2|0⟩⟨0| - I) H^n.
        // The term (2|0⟩⟨0| - I) flips the phase of the |0...0⟩ state and leaves
        // others unchanged. This can be implemented by transforming |0...0⟩ to |1...1⟩,
        // applying a multi-controlled Z, and transforming back.
        
        within {
            // Transform from computational basis to superposition basis.
            ApplyToEachA(H, databaseRegister);
            // Transform |0...0⟩ to |1...1⟩.
            ApplyToEachA(X, databaseRegister);
        } apply {
            // Apply a multi-controlled Z gate to flip the phase of |1...1⟩.
            Controlled Z(Most(databaseRegister), Tail(databaseRegister));
        }
    }

    /// # Summary
    /// Performs a single iteration of Grover's algorithm, which consists of
    /// applying the oracle and then the diffusion operator.
    ///
    /// # Input
    /// ## oracle
    /// The oracle operation that marks the desired state(s).
    /// ## databaseRegister
    /// The register of qubits for the search.
    operation GroverIteration(oracle : (Qubit[] => Unit is Adj + Ctl), databaseRegister : Qubit[]) : Unit is Adj + Ctl {
        // 1. Apply the oracle to mark the solution.
        oracle(databaseRegister);
        
        // 2. Apply the diffusion operator to amplify the amplitude of the marked state.
        ReflectAboutUniform(databaseRegister);
    }

    /// # Summary
    /// Runs the complete Grover search algorithm.
    ///
    /// # Input
    /// ## nQubits
    /// The number of qubits to use, defining the size of the search space (2^nQubits).
    /// ## nIterations
    /// The number of times to apply the Grover iteration.
    /// ## oracle
    /// The oracle operation that marks the desired state(s).
    ///
    /// # Output
    /// An array of measurement results for the qubits in the database register.
    operation GroverSearch(nQubits : Int, nIterations : Int, oracle : (Qubit[] => Unit is Adj + Ctl)) : Result[] {
        use qs = Qubit[nQubits];
        
        // 1. Initialize the register to a uniform superposition of all states.
        ApplyToEachA(H, qs);
        
        // 2. Apply the Grover iteration the specified number of times.
        for _ in 1..nIterations {
            GroverIteration(oracle, qs);
        }
        
        // 3. Measure the qubits to get the result.
        let results = MultiM(qs);
        
        // Reset qubits to the |0⟩ state before releasing them.
        ResetAll(qs);
        
        return results;
    }

    /// # Summary
    /// The main entry point for the Grover search example program.
    @EntryPoint()
    operation Main() : Unit {
        Message("Grover's Search Algorithm Example");
        Message("---------------------------------");

        let nQubits = 5;
        let searchSpaceSize = 2.0^IntAsDouble(nQubits);

        // Define the element we are searching for.
        // For nQubits = 5, this can be any integer from 0 to 31.
        let markedElement = 21; // Binary 10101

        Message($"Number of qubits: {nQubits}");
        Message($"Search space size (N): {searchSpaceSize}");
        Message($"Searching for state |{markedElement}>");

        // Create the specific oracle for our marked element using partial application.
        let oracle = MarkIntegerOracle(markedElement, _);

        // Calculate the optimal number of iterations for a single marked item.
        // The formula is approximately (π/4) * sqrt(N).
        let optimalIterations = Round(PI() / 4.0 * Sqrt(searchSpaceSize));
        Message($"Optimal number of iterations: {optimalIterations}");

        // Run the search algorithm.
        let results = GroverSearch(nQubits, optimalIterations, oracle);
        
        // Convert the measurement results (an array of Result) to an integer.
        let measuredInteger = ResultArrayAsInt(results);

        Message($"\nMeasurement result: |{measuredInteger}>");

        if (measuredInteger == markedElement) {
            Message("Success! The marked element was found.");
        } else {
            Message("Failure. A different element was found.");
        }
        
        // To visualize the amplitude amplification, we can dump the final state vector.
        // This requires running on a simulator that supports the DumpMachine function.
        Message("\nFinal state amplitudes (for simulation):");
        using (qs = Qubit[nQubits]) {
            ApplyToEachA(H, qs);
            for _ in 1..optimalIterations {
                GroverIteration(oracle, qs);
            }
            // The DumpMachine intrinsic prints the simulator's state vector.
            // The amplitude of the marked element should be very high.
            DumpMachine();
        }
    }
}