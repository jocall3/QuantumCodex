/**
 * @fileoverview A utility class that traverses the QAST (Quantum Abstract Syntax Tree)
 * and builds the corresponding Quantum Intermediate Representation (QIR).
 * The QIR is a structured, linear representation of the quantum circuit,
 * designed to be easily consumed by optimizers, schedulers, and simulators.
 */

/**
 * Represents a reference to a specific bit in a register.
 * @typedef {object} BitRef
 * @property {string} name - The name of the register (e.g., 'q', 'c').
 * @property {number} index - The index of the bit within the register.
 */

/**
 * Represents a quantum operation in the QIR.
 * @typedef {object} QIROperation
 * @property {string} type - The type of operation ('gate', 'measure', 'reset', 'barrier').
 * @property {string} [name] - The name of the gate (e.g., 'h', 'cx', 'u3').
 * @property {Array<BitRef>} [qubits] - The target qubits for the operation.
 * @property {Array<BitRef>} [cbits] - The target classical bits (for measurement).
 * @property {Array<number|string>} [params] - Parameters for the gate (e.g., angles).
 * @property {{creg: string, value: number}} [condition] - The classical condition for the operation to execute.
 */

/**
 * The Quantum Intermediate Representation (QIR) of a quantum program.
 * @typedef {object} QIR
 * @property {Object<string, number>} qregs - A map of quantum register names to their sizes.
 * @property {Object<string, number>} cregs - A map of classical register names to their sizes.
 * @property {Array<QIROperation>} operations - A linear sequence of quantum operations.
 */

/**
 * Builds a Quantum Intermediate Representation (QIR) from a Quantum Abstract Syntax Tree (QAST).
 * This class traverses the QAST and translates its nodes into a linear, structured
 * list of quantum operations, making it suitable for further processing like
 * optimization or simulation.
 */
class QIRBuilder {
    /**
     * @param {object} qast The Quantum Abstract Syntax Tree to process.
     */
    constructor(qast) {
        /** @private */
        this.qast = qast;
        /** @private @type {QIR} */
        this.qir = {
            qregs: {},
            cregs: {},
            operations: [],
        };
        /** @private */
        this.qregSizes = new Map();
        /** @private */
        this.cregSizes = new Map();
    }

    /**
     * Builds and returns the QIR from the QAST provided in the constructor.
     * @returns {QIR} The generated Quantum Intermediate Representation.
     */
    build() {
        this.visit(this.qast);
        return this.qir;
    }

    /**
     * Generic visit method that dispatches to the appropriate visitor function
     * based on the QAST node's type.
     * @param {object} node The QAST node to visit.
     * @private
     */
    visit(node) {
        if (!node || !node.type) {
            throw new Error('Invalid QAST node: missing type property.');
        }

        const visitorMethod = `visit${node.type}`;
        if (this[visitorMethod]) {
            this[visitorMethod](node);
        } else {
            throw new Error(`QIRBuilder: No visitor method for QAST node type "${node.type}"`);
        }
    }

    /**
     * Visits the root Program node.
     * @param {{type: 'Program', body: Array<object>}} node
     * @private
     */
    visitProgram(node) {
        for (const statement of node.body) {
            this.visit(statement);
        }
    }

    /**
     * Processes a quantum register declaration.
     * @param {{type: 'QRegDecl', name: string, size: number}} node
     * @private
     */
    visitQRegDecl(node) {
        if (this.qregSizes.has(node.name) || this.cregSizes.has(node.name)) {
            throw new Error(`Register '${node.name}' already declared.`);
        }
        this.qir.qregs[node.name] = node.size;
        this.qregSizes.set(node.name, node.size);
    }

    /**
     * Processes a classical register declaration.
     * @param {{type: 'CRegDecl', name: string, size: number}} node
     * @private
     */
    visitCRegDecl(node) {
        if (this.qregSizes.has(node.name) || this.cregSizes.has(node.name)) {
            throw new Error(`Register '${node.name}' already declared.`);
        }
        this.qir.cregs[node.name] = node.size;
        this.cregSizes.set(node.name, node.size);
    }

    /**
     * Processes a gate application.
     * @param {{type: 'GateApplication', gate: {name: string, params: Array<any>}, qubits: Array<object>}} node
     * @private
     */
    visitGateApplication(node) {
        const qubits = node.qubits.map(q => this.resolveQubitIdentifier(q));
        const params = node.gate.params ? node.gate.params.map(p => p.value) : [];

        this.qir.operations.push({
            type: 'gate',
            name: node.gate.name.toLowerCase(),
            qubits: qubits,
            params: params,
        });
    }

    /**
     * Processes a measurement operation.
     * @param {{type: 'Measurement', qubit: object, cbit: object}} node
     * @private
     */
    visitMeasurement(node) {
        const qubit = this.resolveQubitIdentifier(node.qubit);
        const cbit = this.resolveCbitIdentifier(node.cbit);

        this.qir.operations.push({
            type: 'measure',
            qubits: [qubit],
            cbits: [cbit],
        });
    }

    /**
     * Processes a reset operation.
     * @param {{type: 'Reset', qubit: object}} node
     * @private
     */
    visitReset(node) {
        const qubit = this.resolveQubitIdentifier(node.qubit);
        this.qir.operations.push({
            type: 'reset',
            qubits: [qubit],
        });
    }

    /**
     * Processes a barrier directive.
     * @param {{type: 'Barrier', qubits: Array<object>}} node
     * @private
     */
    visitBarrier(node) {
        const qubits = node.qubits.map(q => this.resolveQubitIdentifier(q));
        this.qir.operations.push({
            type: 'barrier',
            qubits: qubits,
        });
    }

    /**
     * Processes a classically-controlled 'if' statement.
     * @param {{type: 'IfStatement', creg: string, value: number, body: Array<object>}} node
     * @private
     */
    visitIfStatement(node) {
        if (!this.cregSizes.has(node.creg)) {
            throw new Error(`Conditional statement on undeclared classical register '${node.creg}'.`);
        }

        // Temporarily hijack the main operations array to capture the body's operations
        const originalOperations = this.qir.operations;
        const conditionalOps = [];
        this.qir.operations = conditionalOps;

        // Visit the body of the if statement
        for (const statement of node.body) {
            this.visit(statement);
        }

        // Restore the original operations array
        this.qir.operations = originalOperations;

        // Add the condition to all captured operations and add them to the main list
        const condition = { creg: node.creg, value: node.value };
        for (const op of conditionalOps) {
            op.condition = condition;
            this.qir.operations.push(op);
        }
    }

    /**
     * Resolves a QAST qubit identifier node into a QIR BitRef.
     * @param {{type: 'Identifier', name: string, index: {type: 'Literal', value: number}}} qIdNode
     * @returns {BitRef}
     * @private
     */
    resolveQubitIdentifier(qIdNode) {
        if (qIdNode.type !== 'Identifier') {
            throw new Error(`Expected qubit identifier, but got node type '${qIdNode.type}'.`);
        }
        const { name, index } = qIdNode;
        const regSize = this.qregSizes.get(name);

        if (regSize === undefined) {
            throw new Error(`Undeclared quantum register '${name}'.`);
        }
        if (index.value >= regSize) {
            throw new Error(`Qubit index ${index.value} is out of bounds for register '${name}' of size ${regSize}.`);
        }

        return { name: name, index: index.value };
    }

    /**
     * Resolves a QAST classical bit identifier node into a QIR BitRef.
     * @param {{type: 'Identifier', name: string, index: {type: 'Literal', value: number}}} cIdNode
     * @returns {BitRef}
     * @private
     */
    resolveCbitIdentifier(cIdNode) {
        if (cIdNode.type !== 'Identifier') {
            throw new Error(`Expected classical bit identifier, but got node type '${cIdNode.type}'.`);
        }
        const { name, index } = cIdNode;
        const regSize = this.cregSizes.get(name);

        if (regSize === undefined) {
            throw new Error(`Undeclared classical register '${name}'.`);
        }
        if (index.value >= regSize) {
            throw new Error(`Classical bit index ${index.value} is out of bounds for register '${name}' of size ${regSize}.`);
        }

        return { name: name, index: index.value };
    }
}

module.exports = { QIRBuilder };