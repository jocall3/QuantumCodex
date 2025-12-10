/**
 * @file src/metaprog/bootstrapper.js
 * @description The engine for 'Self-Referential Quantum Bootstrapping'.
 * Provides mechanisms for Q-Script programs to dynamically generate,
 * compile, and execute new Q-Script code based on quantum outcomes.
 *
 * This module simulates a quantum environment and uses its probabilistic
 * outcomes to drive a meta-programming loop, creating an evolving,
 * self-generating software system.
 */

/**
 * Represents a single Quantum Bit (Qubit).
 * In this simulation, a qubit is defined by two complex amplitudes, alpha and beta,
 * for the |0> and |1> states, respectively. The probability of measuring
 * 0 is |alpha|^2 and 1 is |beta|^2.
 * For simplicity, we use real numbers for amplitudes, so alpha^2 + beta^2 = 1.
 */
class Qubit {
    /**
     * Initializes a qubit, typically in the |0> state.
     * @param {number} alpha - The amplitude of the |0> state.
     * @param {number} beta - The amplitude of the |1> state.
     */
    constructor(alpha = 1.0, beta = 0.0) {
        this.state = { alpha, beta };
        this.normalize();
    }

    /**
     * Ensures the state probabilities sum to 1.
     */
    normalize() {
        const magnitude = Math.sqrt(this.state.alpha ** 2 + this.state.beta ** 2);
        if (magnitude === 0) return; // Should not happen in normal operations
        this.state.alpha /= magnitude;
        this.state.beta /= magnitude;
    }

    /**
     * Measures the qubit, collapsing it to a classical bit (0 or 1).
     * The qubit's state is updated to reflect the measurement outcome.
     * @returns {0 | 1} The classical outcome of the measurement.
     */
    measure() {
        const prob0 = this.state.alpha ** 2;
        const measurement = Math.random() < prob0 ? 0 : 1;

        if (measurement === 0) {
            this.state.alpha = 1.0;
            this.state.beta = 0.0;
        } else {
            this.state.alpha = 0.0;
            this.state.beta = 1.0;
        }
        return measurement;
    }

    /**
     * Applies a Hadamard gate, creating a superposition.
     * H|0> = (|0> + |1>) / sqrt(2)
     * H|1> = (|0> - |1>) / sqrt(2)
     */
    applyHadamard() {
        const { alpha, beta } = this.state;
        const invSqrt2 = 1 / Math.sqrt(2);
        this.state.alpha = (alpha + beta) * invSqrt2;
        this.state.beta = (alpha - beta) * invSqrt2;
    }

    /**
     * Applies a Pauli-X (NOT) gate, flipping the state.
     * X|0> = |1>
     * X|1> = |0>
     */
    applyPauliX() {
        const { alpha } = this.state;
        this.state.alpha = this.state.beta;
        this.state.beta = alpha;
    }
}

/**
 * Simulates a simple quantum computer with a register of qubits.
 */
class QuantumComputerSimulator {
    /**
     * @param {number} numQubits - The number of qubits in the register.
     */
    constructor(numQubits) {
        this.qubits = Array.from({ length: numQubits }, () => new Qubit());
        this.numQubits = numQubits;
    }

    /**
     * Applies a gate to a specific qubit.
     * @param {'H' | 'X'} gateType - The type of gate to apply ('H' for Hadamard, 'X' for Pauli-X).
     * @param {number} qubitIndex - The index of the qubit.
     */
    applyGate(gateType, qubitIndex) {
        if (qubitIndex < 0 || qubitIndex >= this.numQubits) {
            throw new Error(`Qubit index ${qubitIndex} is out of bounds.`);
        }
        const qubit = this.qubits[qubitIndex];
        switch (gateType) {
            case 'H':
                qubit.applyHadamard();
                break;
            case 'X':
                qubit.applyPauliX();
                break;
            default:
                throw new Error(`Unknown gate type: ${gateType}`);
        }
    }

    /**
     * Applies a Controlled-NOT (CNOT) gate.
     * Flips the target qubit if the control qubit is |1>.
     * This is a basic form of entanglement.
     * @param {number} controlIndex - The index of the control qubit.
     * @param {number} targetIndex - The index of the target qubit.
     */
    applyCNOT(controlIndex, targetIndex) {
        // Note: A proper CNOT simulation requires operating on the full state vector.
        // This is a simplified, probabilistic interpretation for our purposes.
        // We measure the control and conditionally flip the target.
        const controlOutcome = this.qubits[controlIndex].measure();
        if (controlOutcome === 1) {
            this.qubits[targetIndex].applyPauliX();
        }
        // Restore control qubit to its pre-measurement superposition if needed for further ops.
        // For this simplified model, we'll assume measurement is the final step before generation.
    }

    /**
     * Measures a specific qubit.
     * @param {number} qubitIndex - The index of the qubit to measure.
     * @returns {0 | 1} The measurement outcome.
     */
    measure(qubitIndex) {
        if (qubitIndex < 0 || qubitIndex >= this.numQubits) {
            throw new Error(`Qubit index ${qubitIndex} is out of bounds.`);
        }
        return this.qubits[qubitIndex].measure();
    }

    /**
     * Measures all qubits and returns the results as a binary string.
     * @returns {string} A string of 0s and 1s representing the state.
     */
    measureAll() {
        return this.qubits.map(q => q.measure()).join('');
    }
}

/**
 * The core engine for Self-Referential Quantum Bootstrapping.
 * It uses a quantum simulator to generate, compile, and execute code,
 * creating a feedback loop for metaprogramming.
 */
class QuantumBootstrapper {
    /**
     * @param {object} config - Configuration for the bootstrapper.
     * @param {number} [config.numQubits=4] - Number of qubits for the simulator.
     * @param {Function} [config.codeGenerator] - A function that takes a quantum state (string) and returns Q-Script code.
     * @param {object} [config.initialContext={}] - An initial context object for executed code.
     */
    constructor({ numQubits = 4, codeGenerator, initialContext = {} } = {}) {
        this.qpu = new QuantumComputerSimulator(numQubits);
        this.codeGenerator = codeGenerator || this.defaultCodeGenerator;
        this.executionContext = { ...initialContext };
        this.cycleCount = 0;

        // Provide the execution context with a handle to the bootstrapper API.
        // This is the key to self-referential execution.
        this.executionContext.q = {
            bootstrap: this.run.bind(this),
            measure: this.qpu.measure.bind(this.qpu),
            applyGate: this.qpu.applyGate.bind(this.qpu),
            log: (message) => this.log(`[Q-Script]: ${message}`),
        };
    }

    /**
     * Logs a message to the console with a bootstrapper prefix.
     * @param {string} message - The message to log.
     */
    log(message) {
        console.log(`[Bootstrapper Cycle ${this.cycleCount}]: ${message}`);
    }

    /**
     * A default code generator function.
     * Creates simple Q-Script based on the measured quantum state.
     * @param {string} quantumState - A binary string from measuring all qubits.
     * @returns {string} The generated Q-Script code.
     */
    defaultCodeGenerator(quantumState) {
        const stateValue = parseInt(quantumState, 2);
        this.log(`Quantum state measured as '${quantumState}' (value: ${stateValue}).`);

        let script = `q.log("Executing code generated from state ${quantumState}.");\n`;

        // Example logic: different states trigger different actions.
        if (stateValue % 2 === 0) {
            script += `q.log("The universe is even.");\n`;
        } else {
            script += `q.log("The universe is odd.");\n`;
        }

        if (stateValue > (2 ** this.qpu.numQubits) / 2) {
            script += `q.log("High-energy state detected. Preparing for next cycle.");\n`;
            // Trigger another bootstrap cycle from within the generated code.
            script += `setTimeout(() => q.bootstrap(), 500);\n`;
        } else {
            script += `q.log("Low-energy state detected. System stabilizing.");\n`;
        }

        return script;
    }

    /**
     * Compiles and executes a string of Q-Script in a sandboxed environment.
     * @param {string} qScript - The code to execute.
     */
    compileAndExecute(qScript) {
        this.log('Compiling and executing generated Q-Script...');
        try {
            // Using new Function for a safer, sandboxed execution than eval().
            // We pass the context's keys as argument names to the function.
            const contextKeys = Object.keys(this.executionContext);
            const contextValues = Object.values(this.executionContext);
            
            const sandboxedFunction = new Function(...contextKeys, qScript);
            
            // Execute the function with the context.
            sandboxedFunction(...contextValues);
            this.log('Execution successful.');
        } catch (error) {
            this.log(`Error during Q-Script execution: ${error.message}`);
            console.error(error);
        }
    }

    /**
     * Runs a single bootstrap cycle.
     * 1. Prepares a quantum state (e.g., puts qubits in superposition).
     * 2. Measures the state.
     * 3. Generates code based on the outcome.
     * 4. Compiles and executes the new code.
     */
    run() {
        this.cycleCount++;
        this.log('Starting new bootstrap cycle.');

        // 1. Prepare quantum state. A simple example: put all qubits in superposition.
        this.log('Preparing quantum state (applying Hadamard to all qubits)...');
        for (let i = 0; i < this.qpu.numQubits; i++) {
            // Reset to |0> before applying gate to ensure consistent starting point
            this.qpu.qubits[i] = new Qubit(); 
            this.qpu.applyGate('H', i);
        }

        // 2. Measure the state.
        this.log('Measuring quantum state...');
        const measuredState = this.qpu.measureAll();

        // 3. Generate code.
        this.log('Generating Q-Script from measurement...');
        const qScript = this.codeGenerator(measuredState);
        this.log(`Generated Script:\n---\n${qScript}\n---`);

        // 4. Compile and execute.
        this.compileAndExecute(qScript);
    }
}

// Export the main class for use in other parts of the application.
export { QuantumBootstrapper, QuantumComputerSimulator, Qubit };