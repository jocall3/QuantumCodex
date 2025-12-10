/**
 * src/compiler/qast/QuantumLayer.ts
 * 
 * Implementation of the Quantum Circuit Layer of the QAST.
 * This module defines the structures for representing quantum programs as a graph of operations,
 * including qubit allocation, gate application, and measurement.
 */

/**
 * Unique identifier for a Qubit within the quantum context.
 */
export type QubitId = number;

/**
 * Unique identifier for a Classical Bit (cbit) used for measurement results.
 */
export type ClassicalBitId = number;

/**
 * Enumeration of supported Quantum Gate types.
 * Includes standard Clifford+T set, Pauli gates, and parameterized rotations.
 */
export enum QuantumGateType {
    // Single Qubit Gates
    Identity = 'I',
    Hadamard = 'H',
    PauliX = 'X',
    PauliY = 'Y',
    PauliZ = 'Z',
    PhaseS = 'S',
    PhaseT = 'T',
    PhaseS_Dagger = 'S_DAG',
    PhaseT_Dagger = 'T_DAG',
    
    // Parameterized Single Qubit Gates
    RotateX = 'RX',
    RotateY = 'RY',
    RotateZ = 'RZ',
    PhaseShift = 'P',
    U3 = 'U3', // Universal single-qubit gate
    
    // Multi Qubit Gates
    CNOT = 'CX',
    CZ = 'CZ',
    SWAP = 'SWAP',
    ISWAP = 'ISWAP',
    Toffoli = 'CCX',
    Fredkin = 'CSWAP',
    
    // Custom Unitary
    Custom = 'CUSTOM'
}

/**
 * Represents the category of a quantum operation node in the graph.
 */
export enum QuantumNodeType {
    Allocation = 'ALLOC',
    Deallocation = 'FREE',
    Gate = 'GATE',
    Measure = 'MEASURE',
    Barrier = 'BARRIER',
    Reset = 'RESET'
}

/**
 * Base interface for any node in the Quantum Circuit Graph.
 */
export interface IQuantumNode {
    readonly id: string;
    readonly type: QuantumNodeType;
    
    /**
     * The qubits involved in this operation.
     */
    readonly qubitIds: QubitId[];
    
    /**
     * Metadata or annotations for the node (e.g., source code location).
     */
    metadata?: Record<string, any>;
}

/**
 * Represents the allocation of a new qubit.
 */
export class QubitAllocationNode implements IQuantumNode {
    readonly type = QuantumNodeType.Allocation;
    readonly id: string;
    
    constructor(
        public readonly qubitId: QubitId,
        public readonly name: string = `q_${qubitId}`
    ) {
        this.id = `alloc_${qubitId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    get qubitIds(): QubitId[] {
        return [this.qubitId];
    }
}

/**
 * Represents a quantum gate operation.
 */
export class QuantumGateNode implements IQuantumNode {
    readonly type = QuantumNodeType.Gate;
    readonly id: string;

    constructor(
        public readonly gateType: QuantumGateType,
        public readonly targetQubits: QubitId[],
        public readonly controlQubits: QubitId[] = [],
        public readonly params: number[] = [], // For rotation angles, etc.
        public readonly label?: string
    ) {
        this.id = `gate_${gateType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    get qubitIds(): QubitId[] {
        return [...this.controlQubits, ...this.targetQubits];
    }

    /**
     * Returns a string representation of the gate (e.g., "CX q[0], q[1]").
     */
    toString(): string {
        const controls = this.controlQubits.map(q => `q[${q}]`).join(',');
        const targets = this.targetQubits.map(q => `q[${q}]`).join(',');
        const paramsStr = this.params.length > 0 ? `(${this.params.join(',')})` : '';
        
        let s = `${this.gateType}${paramsStr}`;
        if (controls) s += ` ${controls},`;
        s += ` ${targets}`;
        return s;
    }
}

/**
 * Represents a measurement operation collapsing a qubit state into a classical bit.
 */
export class QuantumMeasureNode implements IQuantumNode {
    readonly type = QuantumNodeType.Measure;
    readonly id: string;

    constructor(
        public readonly qubitId: QubitId,
        public readonly classicalBitId: ClassicalBitId
    ) {
        this.id = `meas_${qubitId}_to_c${classicalBitId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    get qubitIds(): QubitId[] {
        return [this.qubitId];
    }
}

/**
 * Represents a barrier to prevent optimization across specific points in the circuit.
 */
export class QuantumBarrierNode implements IQuantumNode {
    readonly type = QuantumNodeType.Barrier;
    readonly id: string;

    constructor(public readonly involvedQubits: QubitId[]) {
        this.id = `barrier_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    get qubitIds(): QubitId[] {
        return this.involvedQubits;
    }
}

/**
 * The QuantumLayer acts as the container and manager for the quantum circuit graph.
 * It maintains the state of allocations and the sequence of operations.
 */
export class QuantumLayer {
    private nodes: IQuantumNode[] = [];
    private qubitCounter: number = 0;
    private classicalCounter: number = 0;
    
    // Maps qubit ID to its current active node in the graph (for DAG construction if needed later)
    // Currently used to track active qubits.
    private activeQubits: Set<QubitId> = new Set();

    constructor(public readonly name: string = "main_circuit") {}

    /**
     * Allocates a new qubit in the circuit.
     * @param name Optional name for the qubit variable.
     * @returns The ID of the allocated qubit.
     */
    public allocateQubit(name?: string): QubitId {
        const id = this.qubitCounter++;
        const node = new QubitAllocationNode(id, name);
        this.nodes.push(node);
        this.activeQubits.add(id);
        return id;
    }

    /**
     * Allocates a register of qubits.
     * @param size Number of qubits.
     * @param baseName Base name for the register.
     */
    public allocateRegister(size: number, baseName: string = "q"): QubitId[] {
        const ids: QubitId[] = [];
        for (let i = 0; i < size; i++) {
            ids.push(this.allocateQubit(`${baseName}[${i}]`));
        }
        return ids;
    }

    /**
     * Adds a gate operation to the circuit.
     * @param type The type of gate.
     * @param targets Target qubit IDs.
     * @param controls Control qubit IDs (optional).
     * @param params Parameters for the gate (optional).
     */
    public addGate(
        type: QuantumGateType, 
        targets: QubitId | QubitId[], 
        controls: QubitId | QubitId[] = [], 
        params: number[] = []
    ): void {
        const targetArray = Array.isArray(targets) ? targets : [targets];
        const controlArray = Array.isArray(controls) ? controls : [controls];

        this.validateQubits([...targetArray, ...controlArray]);

        const node = new QuantumGateNode(type, targetArray, controlArray, params);
        this.nodes.push(node);
    }

    /**
     * Adds a measurement operation.
     * @param qubitId The qubit to measure.
     * @returns The ID of the classical bit storing the result.
     */
    public measure(qubitId: QubitId): ClassicalBitId {
        this.validateQubits([qubitId]);
        
        const cbitId = this.classicalCounter++;
        const node = new QuantumMeasureNode(qubitId, cbitId);
        this.nodes.push(node);
        
        // Note: In some formalisms, measuring deallocates or resets. 
        // Here we keep it active but collapsed.
        return cbitId;
    }

    /**
     * Adds a barrier across specified qubits or all active qubits if none specified.
     */
    public barrier(qubitIds?: QubitId[]): void {
        const targets = qubitIds || Array.from(this.activeQubits);
        this.validateQubits(targets);
        const node = new QuantumBarrierNode(targets);
        this.nodes.push(node);
    }

    /**
     * Validates that the referenced qubits are currently active/allocated.
     */
    private validateQubits(ids: QubitId[]): void {
        for (const id of ids) {
            if (!this.activeQubits.has(id)) {
                throw new Error(`QuantumLayer Error: Qubit ${id} is not allocated or has been freed.`);
            }
        }
    }

    /**
     * Returns the linear sequence of operations (the AST nodes).
     */
    public getOperations(): ReadonlyArray<IQuantumNode> {
        return this.nodes;
    }

    /**
     * Returns the number of qubits allocated in this layer.
     */
    public get width(): number {
        return this.activeQubits.size;
    }

    /**
     * Returns the number of operations (depth approximation).
     */
    public get size(): number {
        return this.nodes.length;
    }

    /**
     * Generates a simple text-based representation of the circuit.
     */
    public dump(): string {
        let output = `QuantumLayer: ${this.name}\n`;
        output += `Qubits: ${this.width}, Classical Bits: ${this.classicalCounter}\n`;
        output += `Operations:\n`;
        
        this.nodes.forEach((node, index) => {
            let desc = '';
            switch (node.type) {
                case QuantumNodeType.Allocation:
                    const alloc = node as QubitAllocationNode;
                    desc = `ALLOC ${alloc.name} (id: ${alloc.qubitId})`;
                    break;
                case QuantumNodeType.Gate:
                    desc = (node as QuantumGateNode).toString();
                    break;
                case QuantumNodeType.Measure:
                    const meas = node as QuantumMeasureNode;
                    desc = `MEASURE q[${meas.qubitId}] -> c[${meas.classicalBitId}]`;
                    break;
                case QuantumNodeType.Barrier:
                    desc = `BARRIER`;
                    break;
                default:
                    desc = node.type;
            }
            output += `  ${index}: ${desc}\n`;
        });
        return output;
    }

    /**
     * Exports the circuit to OpenQASM 2.0 format (basic implementation).
     */
    public toQASM(): string {
        const lines: string[] = [];
        lines.push('OPENQASM 2.0;');
        lines.push('include "qelib1.inc";');
        lines.push(`qreg q[${this.qubitCounter}];`);
        lines.push(`creg c[${this.classicalCounter}];`);

        for (const node of this.nodes) {
            switch (node.type) {
                case QuantumNodeType.Gate:
                    const g = node as QuantumGateNode;
                    const t = g.targetQubits.map(id => `q[${id}]`);
                    const c = g.controlQubits.map(id => `q[${id}]`);
                    const allQ = [...c, ...t];
                    
                    let name = g.gateType.toLowerCase();
                    // Map internal types to QASM
                    if (g.gateType === QuantumGateType.CNOT) name = 'cx';
                    if (g.gateType === QuantumGateType.Toffoli) name = 'ccx';
                    
                    if (g.params.length > 0) {
                        lines.push(`${name}(${g.params.join(',')}) ${allQ.join(',')};`);
                    } else {
                        lines.push(`${name} ${allQ.join(',')};`);
                    }
                    break;
                case QuantumNodeType.Measure:
                    const m = node as QuantumMeasureNode;
                    lines.push(`measure q[${m.qubitId}] -> c[${m.classicalBitId}];`);
                    break;
                case QuantumNodeType.Barrier:
                    const b = node as QuantumBarrierNode;
                    lines.push(`barrier ${b.involvedQubits.map(id => `q[${id}]`).join(',')};`);
                    break;
            }
        }

        return lines.join('\n');
    }
}