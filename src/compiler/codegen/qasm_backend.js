/**
 * @file src/compiler/codegen/qasm_backend.js
 * @description A code generator backend that translates an optimized Quantum
 * Intermediate Representation (QIR) into OpenQASM 3.0. This allows for
 * interoperability with a wide range of quantum hardware and simulators that
 * support the OpenQASM standard.
 */

/**
 * Represents a backend that compiles a QIR object into an OpenQASM 3.0 string.
 */
class QASMBackend {
    /**
     * Creates an instance of the QASMBackend.
     * @param {object} [options={}] - Configuration options for the backend.
     * @param {number} [options.precision=15] - The numerical precision for formatting gate parameters.
     */
    constructor(options = {}) {
        this.precision = options.precision || 15;
    }

    /**
     * Compiles the given QIR into an OpenQASM 3.0 program string.
     *
     * The QIR is expected to have the following structure:
     * {
     *   num_qubits: number,
     *   num_cbits: number,
     *   instructions: [
     *     {
     *       opcode: string,       // e.g., 'h', 'cx', 'measure'
     *       qubits: number[],     // Target qubit indices
     *       cbits?: number[],    // Target classical bit indices (for measure/if)
     *       params?: (number|string)[] // Gate parameters (for rx, p, u, etc.)
     *       // ... other properties for complex instructions like 'if'
     *     },
     *     // ... more instructions
     *   ]
     * }
     *
     * @param {object} qir - The Quantum Intermediate Representation object.
     * @returns {string} The generated OpenQASM 3.0 code as a single string.
     * @throws {Error} If the QIR format is invalid.
     */
    compile(qir) {
        if (!qir || !Array.isArray(qir.instructions) || typeof qir.num_qubits !== 'number') {
            throw new Error("Invalid QIR format. Expected object with 'num_qubits' and 'instructions' array.");
        }

        const header = this.generateHeader();
        const declarations = this.generateDeclarations(qir.num_qubits, qir.num_cbits || 0);
        const body = this.generateBody(qir.instructions);

        return `${header}\n\n${declarations}\n\n${body}`;
    }

    /**
     * Generates the standard OpenQASM 3.0 header.
     * @returns {string} The header string.
     * @private
     */
    generateHeader() {
        return 'OPENQASM 3.0;\ninclude "stdgates.inc";';
    }

    /**
     * Generates qubit and classical bit declarations.
     * @param {number} num_qubits - The number of qubits to declare.
     * @param {number} num_cbits - The number of classical bits to declare.
     * @returns {string} The declaration string.
     * @private
     */
    generateDeclarations(num_qubits, num_cbits) {
        const declarations = [];
        if (num_qubits > 0) {
            declarations.push(`qubit[${num_qubits}] q;`);
        }
        if (num_cbits > 0) {
            declarations.push(`bit[${num_cbits}] c;`);
        }
        return declarations.join('\n');
    }

    /**
     * Generates the main body of the QASM program from the instruction list.
     * @param {Array<object>} instructions - The list of QIR instructions.
     * @returns {string} The QASM instruction string.
     * @private
     */
    generateBody(instructions) {
        return instructions
            .map(instr => this.translateInstruction(instr))
            .filter(line => line !== null && line !== '') // Filter out empty or null lines
            .join('\n');
    }

    /**
     * Translates a single QIR instruction into an OpenQASM 3.0 statement.
     * @param {object} instr - The QIR instruction object.
     * @returns {string|null} The corresponding QASM string, or null if unsupported.
     * @private
     */
    translateInstruction(instr) {
        const { opcode, qubits, cbits, params } = instr;

        if (!opcode || !Array.isArray(qubits)) {
            console.warn("Skipping invalid instruction (missing opcode or qubits array):", instr);
            return null;
        }

        const qargs = qubits.map(i => `q[${i}]`).join(', ');

        switch (opcode.toLowerCase()) {
            // --- Standard Single-Qubit Gates ---
            case 'id':
            case 'x':
            case 'y':
            case 'z':
            case 'h':
            case 's':
            case 'sdg':
            case 't':
            case 'tdg':
                return `${opcode.toLowerCase()} ${qargs};`;

            // --- Standard Parametrized Single-Qubit Gates ---
            case 'p':
            case 'rx':
            case 'ry':
            case 'rz':
                if (!params || params.length < 1) throw new Error(`Missing params for ${opcode}`);
                return `${opcode.toLowerCase()}(${this.formatParams(params)}) ${qargs};`;

            case 'u': // General U gate (U3 in Qiskit)
            case 'u3':
                if (!params || params.length < 3) throw new Error(`Missing params for ${opcode}`);
                return `U(${this.formatParams(params)}) ${qargs};`;
            
            case 'u2':
                if (!params || params.length < 2) throw new Error(`Missing params for ${opcode}`);
                return `u2(${this.formatParams(params)}) ${qargs};`;

            case 'u1': // Equivalent to P gate in stdgates.inc
                if (!params || params.length < 1) throw new Error(`Missing params for ${opcode}`);
                return `p(${this.formatParams(params)}) ${qargs};`;

            // --- Standard Multi-Qubit Gates ---
            case 'cx':
            case 'cnot':
                return `cx ${qargs};`;
            case 'cy':
                return `cy ${qargs};`;
            case 'cz':
                return `cz ${qargs};`;
            case 'swap':
                return `swap ${qargs};`;
            case 'ccx':
            case 'toffoli':
                return `ccx ${qargs};`;
            case 'cswap':
            case 'fredkin':
                return `cswap ${qargs};`;

            // --- Non-Gate Instructions ---
            case 'measure':
                if (!cbits || qubits.length !== cbits.length) {
                    throw new Error(`Mismatched qubit/cbit counts for measure: ${JSON.stringify(instr)}`);
                }
                return qubits.map((q, i) => `c[${cbits[i]}] = measure q[${q}];`).join('\n');

            case 'reset':
                return `reset ${qargs};`;

            case 'barrier':
                // Barrier on specific qubits or all if none are specified
                return `barrier ${qargs || 'q'};`;

            // --- Classical Control Flow ---
            case 'if': {
                // Assumes a simple structure: { opcode: 'if', condition: { cbit: 0, value: 1 }, instruction: { ... } }
                const { condition, instruction } = instr;
                if (!condition || !instruction || typeof condition.cbit !== 'number') {
                    throw new Error(`Invalid 'if' instruction format: ${JSON.stringify(instr)}`);
                }
                const conditionValue = condition.value === undefined ? 1 : condition.value;
                const conditionStr = `c[${condition.cbit}] == ${conditionValue}`;
                const instructionStr = this.translateInstruction(instruction);
                
                if (!instructionStr) {
                    return `// Skipped empty or unsupported 'if' body for condition: ${conditionStr}`;
                }

                // OpenQASM 3.0 requires a block for `if`, even for a single statement.
                const indentedInstruction = instructionStr.split('\n').map(line => `  ${line}`).join('\n');
                return `if (${conditionStr}) {\n${indentedInstruction}\n}`;
            }

            default:
                console.warn(`Unsupported QIR opcode: '${opcode}'. Skipping.`);
                return `// Unsupported opcode: ${opcode}`;
        }
    }

    /**
     * Formats an array of parameters into a comma-separated string.
     * @param {Array<number|string>} params - The parameters to format.
     * @returns {string} The formatted parameter string.
     * @private
     */
    formatParams(params) {
        return params.map(p => {
            if (typeof p === 'number') {
                // Use toPrecision to control output length and avoid floating point issues.
                // Then parseFloat().toString() to remove trailing zeros and unnecessary decimal points.
                return parseFloat(p.toPrecision(this.precision)).toString();
            }
            // Assume it's a string representing a variable or expression
            return p.toString();
        }).join(', ');
    }
}

export default QASMBackend;