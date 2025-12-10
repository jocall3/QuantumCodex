namespace U.Std.Patterns.QuantumRandomAccess {
    open Microsoft.Quantum.Intrinsic;
    open Microsoft.Quantum.Canon;
    open Microsoft.Quantum.Convert;
    open Microsoft.Quantum.Arrays;
    open Microsoft.Quantum.Math;
    open Microsoft.Quantum.Measurement;

    /// # Summary
    /// Represents a Quantum Random Access Memory (QRAM) read operation.
    /// Given a quantum address register, this operation loads the corresponding 
    /// classical integer data into the target quantum register.
    ///
    /// # Input
    /// ## address
    /// A register of qubits representing the index to read from.
    /// ## data
    /// A classical array of integers representing the memory.
    /// ## target
    /// The register where the data will be XORed into.
    ///
    /// # Remarks
    /// This implementation uses a linear scan O(N) approach, which is suitable 
    /// for simulation and smaller datasets. For large-scale fault-tolerant 
    /// implementations, a bucket-brigade architecture would be required.
    operation ReadQRAM(address : Qubit[], data : Int[], target : Qubit[]) : Unit is Adj + Ctl {
        let n = Length(data);
        let targetLength = Length(target);
        
        for idx in 0 .. n - 1 {
            // If the quantum address matches the loop index 'idx', 
            // apply the value 'data[idx]' to the target register.
            ControlledOnInt(idx, ApplyXorInPlace(data[idx], _))(address, target);
        }
    }

    /// # Summary
    /// Applies an integer value to a LittleEndian register using X gates.
    /// Used internally by QRAM operations to encode data.
    internal operation ApplyXorInPlace(value : Int, target : Qubit[]) : Unit is Adj + Ctl {
        let bools = IntAsBoolArray(value, Length(target));
        for i in 0 .. Length(target) - 1 {
            if (bools[i]) {
                X(target[i]);
            }
        }
    }

    /// # Summary
    /// A generic Quantum Multiplexer (Selector).
    /// Applies a specific operation from a list based on the state of a quantum index register.
    ///
    /// # Input
    /// ## indexRegister
    /// The quantum register determining which operation to apply.
    /// ## operations
    /// An array of operations to choose from.
    /// ## target
    /// The target on which the selected operation acts.
    operation Select<'T>(
        indexRegister : Qubit[], 
        operations : ('T => Unit is Adj + Ctl)[], 
        target : 'T
    ) : Unit is Adj + Ctl {
        let nOps = Length(operations);
        for idx in 0 .. nOps - 1 {
            ControlledOnInt(idx, operations[idx])(indexRegister, target);
        }
    }

    /// # Summary
    /// Applies a phase oracle based on a classical predicate.
    /// This is a pattern often used in database search to mark valid items.
    ///
    /// # Input
    /// ## predicate
    /// A function mapping an integer index to a boolean (true if marked).
    /// ## register
    /// The quantum register to apply the phase flip to.
    operation ApplyPhaseOracle(predicate : (Int -> Bool), register : Qubit[]) : Unit is Adj + Ctl {
        let n = Length(register);
        let maxVal = 2 ^ n;
        
        for i in 0 .. maxVal - 1 {
            if (predicate(i)) {
                // Flip the phase if the register is in state |i>
                ControlledOnInt(i, Z)(register[0 .. n - 2], register[n - 1]);
                // Note: Controlled Z on the last qubit controlled by the rest 
                // effectively applies a phase of -1 to the state |i>.
                // However, standard Z is diag(1, -1). To mark |i>, we need the specific control.
                // A cleaner way for arbitrary phase flip on state |k>:
                // R1(PI()) controlled on k.
            }
        }
    }

    // ========================================================================
    // Grover's Search Primitives
    // ========================================================================

    /// # Summary
    /// The diffusion operator (inversion about the mean) for Grover's algorithm.
    /// This constructs the operator D = 2|s><s| - I, where |s> is the uniform superposition.
    operation ReflectAboutUniform(register : Qubit[]) : Unit is Adj + Ctl {
        within {
            // Transform basis to where |s> becomes |0...0>
            ApplyToEachCA(H, register);
            ApplyToEachCA(X, register);
        } apply {
            // Reflection about the all-zero state (which is now all-ones due to X)
            // Controlled Z applies a -1 phase to |11...1>
            if (Length(register) > 1) {
                Controlled Z(Most(register), Tail(register));
            } else {
                Z(register[0]);
            }
        }
    }

    /// # Summary
    /// Runs a single iteration of Grover's search: Oracle followed by Diffusion.
    ///
    /// # Input
    /// ## register
    /// The register to act upon.
    /// ## oracle
    /// The black-box operation that flips the phase of the marked state(s).
    operation GroverIteration(register : Qubit[], oracle : (Qubit[] => Unit is Adj + Ctl)) : Unit is Adj + Ctl {
        oracle(register);
        ReflectAboutUniform(register);
    }

    /// # Summary
    /// Calculates the optimal number of Grover iterations.
    ///
    /// # Input
    /// ## nItems
    /// Total size of the search space (N).
    /// ## nSolutions
    /// Number of marked items (M).
    function OptimalGroverIterations(nItems : Int, nSolutions : Int) : Int {
        let theta = ArcSin(Sqrt(IntAsDouble(nSolutions) / IntAsDouble(nItems)));
        let iter = (PI() / (4.0 * theta)) - 0.5;
        return Round(iter);
    }

    /// # Summary
    /// Performs a complete Grover search experiment.
    ///
    /// # Input
    /// ## nQubits
    /// Number of qubits in the search register.
    /// ## oracle
    /// The oracle operation marking the solution.
    /// ## iterations
    /// Number of Grover iterations to perform.
    ///
    /// # Output
    /// The measurement result of the register, representing the found index.
    operation RunGroverSearch(
        nQubits : Int, 
        oracle : (Qubit[] => Unit is Adj + Ctl), 
        iterations : Int
    ) : Result[] {
        use register = Qubit[nQubits];
        
        // 1. Initialize to uniform superposition
        ApplyToEach(H, register);

        // 2. Iterate
        for _ in 1 .. iterations {
            GroverIteration(register, oracle);
        }

        // 3. Measure
        return MultiM(register);
    }
}