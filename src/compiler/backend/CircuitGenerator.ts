import { 
    QASTNode, 
    QASTNodeType, 
    QuantumBlockNode, 
    QubitDeclNode, 
    GateNode, 
    MeasureNode 
} from '../qast/QuantumAST'; // Assumed location of AST definitions

// --- Circuit Intermediate Representation (IR) ---

export enum CircuitInstructionType {
    GATE = 'GATE',
    MEASURE = 'MEASURE',
    BARRIER = 'BARRIER',
    RESET = 'RESET'
}

export interface CircuitInstruction {
    type: CircuitInstructionType;
    opcode: string;
    qubits: number[]; // Physical/Virtual qubit indices
    cbits?: number[]; // Classical bit indices
    params?: number[]; // Parameters for rotation gates, etc.
    metadata?: Record<string, any>;
}

export class QuantumCircuit {
    public readonly numQubits: number;
    public readonly numClassicalBits: number;
    public instructions: CircuitInstruction[];
    
    // Symbol tables for mapping identifiers to indices
    private qubitMap: Map<string, number[]>;
    private cbitMap: Map<string, number>;
    private qubitCounter: number;
    private cbitCounter: number;

    constructor() {
        this.instructions = [];
        this.qubitMap = new Map();
        this.cbitMap = new Map();
        this.qubitCounter = 0;
        this.cbitCounter = 0;
        this.numQubits = 0;
        this.numClassicalBits = 0;
    }

    /**
     * Allocates a register of qubits.
     * @param name Identifier for the qubit register
     * @param size Number of qubits
     */
    public allocateQubitRegister(name: string, size: number = 1): number[] {
        if (this.qubitMap.has(name)) {
            throw new Error(`Qubit register '${name}' already declared.`);
        }
        const indices: number[] = [];
        for (let i = 0; i < size; i++) {
            indices.push(this.qubitCounter++);
        }
        this.qubitMap.set(name, indices);
        // Update readonly public property via casting or internal tracker
        (this as any).numQubits = this.qubitCounter;
        return indices;
    }

    /**
     * Allocates a classical bit or register.
     */
    public allocateClassicalBit(name: string): number {
        if (this.cbitMap.has(name)) {
            return this.cbitMap.get(name)!;
        }
        const index = this.cbitCounter++;
        this.cbitMap.set(name, index);
        (this as any).numClassicalBits = this.cbitCounter;
        return index;
    }

    public getQubitIndices(name: string): number[] {
        const indices = this.qubitMap.get(name);
        if (!indices) {
            throw new Error(`Reference to undefined qubit register: ${name}`);
        }
        return indices;
    }

    public getClassicalBitIndex(name: string): number {
        const index = this.cbitMap.get(name);
        if (index === undefined) {
            throw new Error(`Reference to undefined classical bit: ${name}`);
        }
        return index;
    }

    public addInstruction(instr: CircuitInstruction): void {
        this.instructions.push(instr);
    }

    /**
     * Exports the circuit to a standard OpenQASM 2.0 string representation.
     */
    public toOpenQASM(): string {
        let qasm = 'OPENQASM 2.0;\ninclude "qelib1.inc";\n';
        qasm += `qreg q[${this.qubitCounter}];\n`;
        qasm += `creg c[${this.cbitCounter}];\n`;

        for (const instr of this.instructions) {
            switch (instr.type) {
                case CircuitInstructionType.GATE:
                    const paramStr = instr.params && instr.params.length > 0 
                        ? `(${instr.params.join(',')})` 
                        : '';
                    const qubitsStr = instr.qubits.map(q => `q[${q}]`).join(',');
                    qasm += `${instr.opcode.toLowerCase()}${paramStr} ${qubitsStr};\n`;
                    break;
                case CircuitInstructionType.MEASURE:
                    if (instr.cbits && instr.cbits.length > 0) {
                        qasm += `measure q[${instr.qubits[0]}] -> c[${instr.cbits[0]}];\n`;
                    }
                    break;
                case CircuitInstructionType.BARRIER:
                    qasm += `barrier ${instr.qubits.map(q => `q[${q}]`).join(',')};\n`;
                    break;
            }
        }
        return qasm;
    }
}

// --- Circuit Generator ---

export interface GeneratorOptions {
    optimize: boolean;
    targetArchitecture?: string;
}

export class CircuitGenerator {
    private circuit: QuantumCircuit;
    private options: GeneratorOptions;

    constructor(options: GeneratorOptions = { optimize: true }) {
        this.circuit = new QuantumCircuit();
        this.options = options;
    }

    /**
     * Synthesizes a quantum circuit from the provided QAST root.
     * @param root The root node of the Quantum Abstract Syntax Tree
     */
    public generate(root: QASTNode): QuantumCircuit {
        this.visit(root);
        
        if (this.options.optimize) {
            this.optimize();
        }
        
        return this.circuit;
    }

    private visit(node: QASTNode): void {
        if (!node) return;

        switch (node.type) {
            case QASTNodeType.PROGRAM:
            case QASTNodeType.QUANTUM_BLOCK:
                // Traverse children for container nodes
                if ('statements' in node) {
                    (node as QuantumBlockNode).statements.forEach(stmt => this.visit(stmt));
                } else if (node.children) {
                    node.children.forEach(child => this.visit(child));
                }
                break;

            case QASTNodeType.QUBIT_DECLARATION:
                this.visitQubitDecl(node as QubitDeclNode);
                break;

            case QASTNodeType.GATE_OPERATION:
                this.visitGate(node as GateNode);
                break;

            case QASTNodeType.MEASURE_OPERATION:
                this.visitMeasure(node as MeasureNode);
                break;

            default:
                // Handle other nodes or ignore non-quantum nodes (like classical control flow handled elsewhere)
                if (node.children) {
                    node.children.forEach(child => this.visit(child));
                }
                break;
        }
    }

    private visitQubitDecl(node: QubitDeclNode): void {
        // Assuming node.identifier is the variable name and node.size is the register size
        this.circuit.allocateQubitRegister(node.identifier, node.size || 1);
    }

    private visitGate(node: GateNode): void {
        const flatQubits: number[] = [];

        // 1. Resolve Control Qubits
        if (node.controls) {
            for (const ctrlName of node.controls) {
                const indices = this.circuit.getQubitIndices(ctrlName);
                flatQubits.push(...indices);
            }
        }

        // 2. Resolve Target Qubits
        for (const targetName of node.targets) {
            const indices = this.circuit.getQubitIndices(targetName);
            flatQubits.push(...indices);
        }

        // Note: A robust compiler would handle broadcasting here (e.g. applying H to a register of 5 qubits).
        // For this implementation, we assume explicit 1-to-1 mapping or that the AST has already unrolled loops.
        // If the gate is a standard single-qubit gate but applied to a register, we might need to emit multiple instructions.
        
        // Simple case: Emit one instruction
        this.circuit.addInstruction({
            type: CircuitInstructionType.GATE,
            opcode: node.gateName.toUpperCase(),
            qubits: flatQubits,
            params: node.params
        });
    }

    private visitMeasure(node: MeasureNode): void {
        const qIndices = this.circuit.getQubitIndices(node.qubit);
        
        // Ensure classical bit exists
        let cIndex: number;
        try {
            cIndex = this.circuit.getClassicalBitIndex(node.targetBit);
        } catch {
            cIndex = this.circuit.allocateClassicalBit(node.targetBit);
        }

        // Emit measure instruction
        // Assuming measurement of the specific qubit index. 
        // If node.qubit refers to a register, we might measure index 0 or need an index accessor in the AST.
        // Defaulting to index 0 of the resolved register for safety.
        this.circuit.addInstruction({
            type: CircuitInstructionType.MEASURE,
            opcode: 'MEASURE',
            qubits: [qIndices[0]],
            cbits: [cIndex]
        });
    }

    private optimize(): void {
        const optimizer = new CircuitOptimizer(this.circuit);
        optimizer.run();
    }
}

// --- Circuit Optimizer ---

class CircuitOptimizer {
    private circuit: QuantumCircuit;

    constructor(circuit: QuantumCircuit) {
        this.circuit = circuit;
    }

    public run(): void {
        let modified = true;
        let passes = 0;
        const MAX_PASSES = 10;

        while (modified && passes < MAX_PASSES) {
            modified = false;
            modified = this.cancelSelfInverseGates() || modified;
            modified = this.mergeRotationGates() || modified;
            passes++;
        }
    }

    /**
     * Optimization Pass: Cancel adjacent self-inverse gates.
     * e.g., H followed by H -> Identity (removed)
     * e.g., CNOT(0,1) followed by CNOT(0,1) -> Identity (removed)
     */
    private cancelSelfInverseGates(): boolean {
        const instrs = this.circuit.instructions;
        const newInstrs: CircuitInstruction[] = [];
        let modified = false;
        
        // Set of gates that are their own inverse
        const selfInverseOps = new Set(['H', 'X', 'Y', 'Z', 'CNOT', 'SWAP', 'CX', 'CZ']);

        for (let i = 0; i < instrs.length; i++) {
            // Look ahead
            if (i + 1 < instrs.length) {
                const current = instrs[i];
                const next = instrs[i + 1];

                if (current.type === CircuitInstructionType.GATE &&
                    next.type === CircuitInstructionType.GATE &&
                    current.opcode === next.opcode &&
                    selfInverseOps.has(current.opcode)) {
                    
                    // Check if qubits match exactly
                    if (this.areQubitsEqual(current.qubits, next.qubits)) {
                        // Cancel both
                        i++; // Skip next instruction
                        modified = true;
                        continue;
                    }
                }
            }
            newInstrs.push(instrs[i]);
        }

        if (modified) {
            this.circuit.instructions = newInstrs;
        }
        return modified;
    }

    /**
     * Optimization Pass: Merge adjacent rotation gates on the same axis.
     * e.g., RZ(theta) followed by RZ(phi) -> RZ(theta + phi)
     */
    private mergeRotationGates(): boolean {
        const instrs = this.circuit.instructions;
        const newInstrs: CircuitInstruction[] = [];
        let modified = false;

        const rotationOps = new Set(['RX', 'RY', 'RZ', 'PHASE', 'P']);

        for (let i = 0; i < instrs.length; i++) {
            if (i + 1 < instrs.length) {
                const current = instrs[i];
                const next = instrs[i + 1];

                if (current.type === CircuitInstructionType.GATE &&
                    next.type === CircuitInstructionType.GATE &&
                    current.opcode === next.opcode &&
                    rotationOps.has(current.opcode)) {

                    if (this.areQubitsEqual(current.qubits, next.qubits)) {
                        // Merge parameters
                        const p1 = current.params?.[0] || 0;
                        const p2 = next.params?.[0] || 0;
                        const sum = p1 + p2;

                        // If sum is effectively 0 (modulo 2pi), we could remove it.
                        // For now, we just merge into one gate.
                        const mergedInstr: CircuitInstruction = {
                            ...current,
                            params: [sum]
                        };

                        newInstrs.push(mergedInstr);
                        i++; // Skip next
                        modified = true;
                        continue;
                    }
                }
            }
            newInstrs.push(instrs[i]);
        }

        if (modified) {
            this.circuit.instructions = newInstrs;
        }
        return modified;
    }

    private areQubitsEqual(q1: number[], q2: number[]): boolean {
        if (q1.length !== q2.length) return false;
        for (let i = 0; i < q1.length; i++) {
            if (q1[i] !== q2[i]) return false;
        }
        return true;
    }
}