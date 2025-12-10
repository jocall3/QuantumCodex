/**
 * @file src/compiler/codegen/simulator_backend.js
 * @description Code generator backend that targets the built-in Q-Script quantum simulator.
 * It translates an optimized Quantum Intermediate Representation (QIR) into an
 * executable instruction list for the simulator's Quantum Virtual Machine (QVM).
 */

/**
 * The SimulatorBackend is responsible for the final stage of compilation,
 * converting a high-level, optimized QIR AST into a low-level, linear
 * sequence of instructions that the QVM can execute directly.
 */
class SimulatorBackend {
    constructor() {
        this.instructions = [];
        this.qubitMap = new Map();
        this.classicalBitMap = new Map();
        this.nextQubitIndex = 0;
        this.nextClassicalBitIndex = 0;
        this.numQubits = 0;
        this.numClassicalBits = 0;
    }

    /**
     * Generates an executable QVM program from a QIR Abstract Syntax Tree.
     * @param {object} qirAst - The root node of the QIR AST. Assumed to have a `body` property containing an array of statements.
     * @returns {{instructions: Array<object>, metadata: {numQubits: number, numClassicalBits: number}}} An object representing the QVM program.
     */
    generate(qirAst) {
        this._resetState();

        if (!qirAst || !Array.isArray(qirAst.body)) {
            throw new Error("Invalid QIR AST format: Expected an object with a 'body' array.");
        }

        for (const statement of qirAst.body) {
            this.visit(statement);
        }

        // Post-process jumps to resolve labels/indices if necessary.
        // In this implementation, we directly use indices, so no post-processing is needed.

        return {
            instructions: this.instructions,
            metadata: {
                numQubits: this.numQubits,
                numClassicalBits: this.numClassicalBits,
            },
        };
    }

    /**
     * Resets the internal state of the code generator for a new compilation run.
     * @private
     */
    _resetState() {
        this.instructions = [];
        this.qubitMap = new Map();
        this.classicalBitMap = new Map();
        this.nextQubitIndex = 0;
        this.nextClassicalBitIndex = 0;
        this.numQubits = 0;
        this.numClassicalBits = 0;
    }

    /**
     * Generic visitor function that dispatches to the correct handler based on the AST node type.
     * @param {object} node - The QIR AST node to visit.
     * @private
     */
    visit(node) {
        switch (node.type) {
            case 'QubitDeclaration':
                return this.visitQubitDeclaration(node);
            case 'ClassicalBitDeclaration':
                return this.visitClassicalBitDeclaration(node);
            case 'GateApplication':
                return this.visitGateApplication(node);
            case 'Measurement':
                return this.visitMeasurement(node);
            case 'IfStatement':
                return this.visitIfStatement(node);
            case 'Reset':
                return this.visitReset(node);
            case 'Barrier':
                return this.visitBarrier(node);
            default:
                throw new Error(`Unsupported QIR node type: ${node.type}`);
        }
    }

    /**
     * Resolves a qubit reference from the AST to its corresponding integer index.
     * @param {{name: string, index: number}} qubitRef - The qubit reference object.
     * @returns {number} The integer index of the qubit.
     * @private
     */
    _resolveQubit(qubitRef) {
        const key = `${qubitRef.name}[${qubitRef.index}]`;
        if (!this.qubitMap.has(key)) {
            throw new Error(`Undeclared qubit used: ${key}`);
        }
        return this.qubitMap.get(key);
    }

    /**
     * Resolves a classical bit reference from the AST to its corresponding integer index.
     * @param {{name: string, index: number}} bitRef - The classical bit reference object.
     * @returns {number} The integer index of the classical bit.
     * @private
     */
    _resolveClassicalBit(bitRef) {
        const key = `${bitRef.name}[${bitRef.index}]`;
        if (!this.classicalBitMap.has(key)) {
            throw new Error(`Undeclared classical bit used: ${key}`);
        }
        return this.classicalBitMap.get(key);
    }

    /**
     * Processes a qubit declaration node.
     * @param {{type: 'QubitDeclaration', name: string, size: number}} node - The declaration node.
     * @private
     */
    visitQubitDeclaration(node) {
        this.numQubits += node.size;
        for (let i = 0; i < node.size; i++) {
            const key = `${node.name}[${i}]`;
            if (this.qubitMap.has(key)) {
                throw new Error(`Redeclaration of qubit: ${key}`);
            }
            this.qubitMap.set(key, this.nextQubitIndex++);
        }
    }

    /**
     * Processes a classical bit declaration node.
     * @param {{type: 'ClassicalBitDeclaration', name: string, size: number}} node - The declaration node.
     * @private
     */
    visitClassicalBitDeclaration(node) {
        this.numClassicalBits += node.size;
        for (let i = 0; i < node.size; i++) {
            const key = `${node.name}[${i}]`;
            if (this.classicalBitMap.has(key)) {
                throw new Error(`Redeclaration of classical bit: ${key}`);
            }
            this.classicalBitMap.set(key, this.nextClassicalBitIndex++);
        }
    }

    /**
     * Processes a gate application node and generates the corresponding QVM instruction.
     * @param {{type: 'GateApplication', gate: string, targets: Array, controls: Array, params: Array<number>}} node - The gate application node.
     * @private
     */
    visitGateApplication(node) {
        const gateName = node.gate.toUpperCase();
        const targets = node.targets.map(q => this._resolveQubit(q));
        const controls = (node.controls || []).map(q => this._resolveQubit(q));
        const params = node.params || [];

        const instruction = {
            opcode: gateName,
            params: params,
        };

        if (controls.length > 0) {
            instruction.controls = controls;
        }
        if (targets.length > 0) {
            // For consistency, use 'targets' array even for single-target gates
            instruction.targets = targets;
        }

        // Basic validation can be done here, but more complex validation
        // should happen in a semantic analysis phase before codegen.
        this.instructions.push(instruction);
    }

    /**
     * Processes a measurement node.
     * @param {{type: 'Measurement', qubit: object, classicalBit: object}} node - The measurement node.
     * @private
     */
    visitMeasurement(node) {
        const qubitIndex = this._resolveQubit(node.qubit);
        const classicalBitIndex = this._resolveClassicalBit(node.classicalBit);
        this.instructions.push({
            opcode: 'MEASURE',
            qubit: qubitIndex,
            cbit: classicalBitIndex,
        });
    }

    /**
     * Processes a reset operation on a qubit.
     * @param {{type: 'Reset', qubit: object}} node - The reset node.
     * @private
     */
    visitReset(node) {
        const qubitIndex = this._resolveQubit(node.qubit);
        this.instructions.push({
            opcode: 'RESET',
            targets: [qubitIndex],
        });
    }

    /**
     * Processes a barrier directive.
     * @param {{type: 'Barrier', targets: Array<object>}} node - The barrier node.
     * @private
     */
    visitBarrier(node) {
        const targets = node.targets.map(q => this._resolveQubit(q));
        // The simulator might treat this as a no-op, but it's useful for visualization and debugging.
        this.instructions.push({
            opcode: 'BARRIER',
            targets: targets,
        });
    }

    /**
     * Processes a classical if statement, generating conditional jump instructions.
     * @param {{type: 'IfStatement', condition: {bit: object, value: number}, body: Array<object>}} node - The if statement node.
     * @private
     */
    visitIfStatement(node) {
        const cbitIndex = this._resolveClassicalBit(node.condition.bit);
        const expectedValue = node.condition.value;

        // We generate a jump instruction that skips the 'if' body if the condition is false.
        // The QVM will need opcodes like JUMP_IF_ZERO (JIZ) or JUMP_IF_ONE (JIO).
        const jumpOpcode = expectedValue === 0 ? 'JIO' : 'JIZ'; // Jump if (bit != expectedValue)
        
        const jumpInstruction = {
            opcode: jumpOpcode,
            cbit: cbitIndex,
            target: -1 // Placeholder, will be filled in later
        };
        this.instructions.push(jumpInstruction);
        const jumpInstructionIndex = this.instructions.length - 1;

        // Recursively generate instructions for the body of the if statement.
        for (const statement of node.body) {
            this.visit(statement);
        }

        // Now we know where the jump should land: right after the 'if' body.
        // The target is the index of the *next* instruction to be generated.
        const targetIndex = this.instructions.length;
        this.instructions[jumpInstructionIndex].target = targetIndex;
    }
}

module.exports = { SimulatorBackend };