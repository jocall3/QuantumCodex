// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

namespace Quantum.Terminal.Tests.Stability {

    open Microsoft.Quantum.Characterization;
    open Microsoft.Quantum.Diagnostics;
    open Microsoft.Quantum.Intrinsic;
    open Microsoft.Quantum.Math;
    open Microsoft.Quantum.Arrays;

    /// # Summary
    /// This file implements a Randomized Benchmarking (RB) protocol to
    /// characterize the average error rate of a target quantum processing unit (QPU)
    /// or simulator. It provides tests for both single-qubit and two-qubit gates.
    ///
    /// # Description
    /// Randomized Benchmarking is a standard protocol for measuring the performance
    /// of quantum gates. It works by applying long sequences of random Clifford
    /// group operations that should, in the absence of errors, compose to the
    /// identity. By measuring the probability of returning to the initial state
    /// (the "survival probability") as a function of sequence length, we can
    /// extract an average error rate per Clifford gate.
    ///
    /// This implementation leverages the built-in RB functionalities of the
    /// Microsoft.Quantum.Characterization namespace, which provides robust and
    /// efficient methods for generating Clifford sequences, running experiments,
    /// and fitting the resulting decay curves.

    /// # Summary
    /// Runs a single-qubit randomized benchmarking experiment on a given qubit.
    ///
    /// # Input
    /// ## nQubits
    /// The number of qubits to use for the test. Must be 1.
    /// ## nRepetitions
    /// The number of random sequences to sample for each sequence length.
    /// ## maxLength
    /// The maximum length of a Clifford sequence to test.
    /// ## nLengths
    /// The number of different sequence lengths to test, spaced between 1 and maxLength.
    operation SingleQubitRandomizedBenchmarkingTest(nQubits : Int, nRepetitions : Int, maxLength : Int, nLengths : Int) : Unit {
        Fact(nQubits == 1, "SingleQubitRandomizedBenchmarkingTest requires exactly one qubit.");
        Message("Running Single-Qubit Randomized Benchmarking Test...");

        use qubit = Qubit();

        // Define the sequence lengths for the experiment.
        // We use a power-law spacing to get good coverage of the decay curve.
        let lengths = SteppedRange(1, maxLength / nLengths, maxLength);
        Message($"Sequence lengths: {lengths}");
        Message($"Number of random sequences per length: {nRepetitions}");

        // Use the standard library to run the RB experiment and fit the results.
        // This function returns a tuple (A, p, B) for the decay curve f(m) = A * p^m + B.
        let (a, p, b) = EstimateSingleQubitRandomizedBenchmarkingCharacterization(nRepetitions, lengths, qubit);

        Message($"Fit result: f(m) = {a} * ({p})^m + {b}");

        // From the decay parameter 'p', we can calculate the average gate fidelity.
        // For the single-qubit Clifford group, the average error rate per Clifford 'r' is
        // r = (d - 1)(1 - p) / d, where d = 2^n = 2 for a single qubit.
        // The average gate fidelity is F = 1 - r.
        let d = 2.0; // Dimension of the system
        let avgErrorRatePerClifford = (d - 1.0) * (1.0 - p) / d;
        let avgFidelityPerClifford = 1.0 - avgErrorRatePerClifford;

        // Each Clifford gate is composed of, on average, ~1.875 physical gates.
        // This number can be used to estimate the fidelity of the underlying physical gates.
        let avgGatesPerClifford = 1.875;
        let avgErrorRatePerGate = avgErrorRatePerClifford / avgGatesPerClifford;
        let avgFidelityPerGate = 1.0 - avgErrorRatePerGate;

        Message("--- Single-Qubit RB Results ---");
        Message($"Decay parameter (p): {p}");
        Message($"Average Fidelity per Clifford Gate: {avgFidelityPerClifford}");
        Message($"Average Error Rate per Clifford Gate: {avgErrorRatePerClifford}");
        Message($"Estimated Average Fidelity per Physical Gate: {avgFidelityPerGate}");
        Message("---------------------------------");

        // For a perfect simulator, we expect fidelity to be very close to 1.0.
        // We set a reasonable threshold for the test to pass.
        Fact(avgFidelityPerClifford > 0.99, $"Single-qubit Clifford fidelity ({avgFidelityPerClifford}) is below the 0.99 threshold.");
    }


    /// # Summary
    /// Runs a two-qubit randomized benchmarking experiment on a given pair of qubits.
    ///
    /// # Input
    /// ## nQubits
    /// The number of qubits to use for the test. Must be 2.
    /// ## nRepetitions
    /// The number of random sequences to sample for each sequence length.
    /// ## maxLength
    /// The maximum length of a Clifford sequence to test.
    /// ## nLengths
    /// The number of different sequence lengths to test, spaced between 1 and maxLength.
    operation TwoQubitRandomizedBenchmarkingTest(nQubits : Int, nRepetitions : Int, maxLength : Int, nLengths : Int) : Unit {
        Fact(nQubits == 2, "TwoQubitRandomizedBenchmarkingTest requires exactly two qubits.");
        Message("\nRunning Two-Qubit Randomized Benchmarking Test...");

        use qubits = Qubit[2];

        // Define the sequence lengths for the experiment.
        let lengths = SteppedRange(1, maxLength / nLengths, maxLength);
        Message($"Sequence lengths: {lengths}");
        Message($"Number of random sequences per length: {nRepetitions}");

        // Use the standard library to run the two-qubit RB experiment.
        let (a, p, b) = EstimateTwoQubitRandomizedBenchmarkingCharacterization(nRepetitions, lengths, qubits);

        Message($"Fit result: f(m) = {a} * ({p})^m + {b}");

        // Calculate the average gate fidelity from the decay parameter 'p'.
        // For the two-qubit Clifford group, d = 2^n = 4.
        let d = 4.0; // Dimension of the system
        let avgErrorRatePerClifford = (d - 1.0) * (1.0 - p) / d;
        let avgFidelityPerClifford = 1.0 - avgErrorRatePerClifford;

        Message("--- Two-Qubit RB Results ---");
        Message($"Decay parameter (p): {p}");
        Message($"Average Fidelity per Clifford Gate: {avgFidelityPerClifford}");
        Message($"Average Error Rate per Clifford Gate: {avgErrorRatePerClifford}");
        Message("------------------------------");

        // For a perfect simulator, we expect fidelity to be very close to 1.0.
        Fact(avgFidelityPerClifford > 0.98, $"Two-qubit Clifford fidelity ({avgFidelityPerClifford}) is below the 0.98 threshold.");
    }


    /// # Summary
    /// Main entry point for the Randomized Benchmarking stability test suite.
    /// This operation runs both single-qubit and two-qubit RB protocols
    /// with predefined parameters suitable for a quick stability check on a simulator.
    @Test("QuantumSimulator")
    operation RunRandomizedBenchmarkingSuite() : Unit {
        Message("==================================================");
        Message("=   Starting Randomized Benchmarking Suite       =");
        Message("==================================================");

        // Parameters for the single-qubit test
        let nRepetitions1Q = 25;
        let maxLength1Q = 100;
        let nLengths1Q = 8;

        SingleQubitRandomizedBenchmarkingTest(1, nRepetitions1Q, maxLength1Q, nLengths1Q);

        // Parameters for the two-qubit test
        let nRepetitions2Q = 20;
        let maxLength2Q = 50;
        let nLengths2Q = 6;

        TwoQubitRandomizedBenchmarkingTest(2, nRepetitions2Q, maxLength2Q, nLengths2Q);

        Message("\n==================================================");
        Message("=   Randomized Benchmarking Suite Complete       =");
        Message("==================================================");
    }
}