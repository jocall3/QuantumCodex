/**
 * QIRDefinitions.ts
 * 
 * Defines the Type definitions and structures for the Quantum Intermediate Representation (QIR)
 * used by the .u (Universe) language compiler.
 * 
 * This IR serves as the bridge between the high-level .u syntax and the low-level
 * execution targets (Quantum Simulators, QPUs, or Transpiled Circuits).
 */

/**
 * Enumeration of all supported Operation Codes in the QIR.
 * Includes Quantum Gates, Classical Arithmetic, Control Flow, and Memory operations.
 */
export enum QIROpCode {
    // --- Quantum Gate Operations ---
    H = 'H',           // Hadamard Gate
    X = 'X',           // Pauli-X Gate
    Y = 'Y',           // Pauli-Y Gate
    Z = 'Z',           // Pauli-Z Gate
    S = 'S',           // S Gate (Phase Gate)
    S_DAG = 'S_DAG',   // S-Dagger Gate
    T = 'T',           // T Gate
    T_DAG = 'T_DAG',   // T-Dagger Gate
    
    // Multi-Qubit Gates
    CNOT = 'CNOT',     // Controlled-NOT
    CZ = 'CZ',         // Controlled-Z
    SWAP = 'SWAP',     // Swap two qubits
    TOFFOLI = 'TOFFOLI', // CCNOT

    // Parameterized Gates
    RX = 'RX',         // Rotation around X-axis
    RY = 'RY',         // Rotation around Y-axis
    RZ = 'RZ',         // Rotation around Z-axis
    U3 = 'U3',         // Universal single-qubit rotation

    // Quantum Measurement & State
    MEASURE = 'MEASURE', // Measure qubit into classical register
    RESET = 'RESET',     // Reset qubit to |0>
    BARRIER = 'BARRIER', // Optimization barrier

    // --- Classical Control Flow ---
    LABEL = 'LABEL',     // Label definition for jumps
    JMP = 'JMP',         // Unconditional Jump
    BEQ = 'BEQ',         // Branch if Equal
    BNE = 'BNE',         // Branch if Not Equal
    BLT = 'BLT',         // Branch if Less Than
    BGT = 'BGT',         // Branch if Greater Than
    RET = 'RET',         // Return from function/kernel
    CALL = 'CALL',       // Function call

    // --- Classical Arithmetic & Logic ---
    MOV = 'MOV',         // Move value
    ADD = 'ADD',         // Addition
    SUB = 'SUB',         // Subtraction
    MUL = 'MUL',         // Multiplication
    DIV = 'DIV',         // Division
    MOD = 'MOD',         // Modulo
    AND = 'AND',         // Bitwise AND
    OR = 'OR',           // Bitwise OR
    XOR = 'XOR',         // Bitwise XOR
    NOT = 'NOT',         // Bitwise NOT
    SHL = 'SHL',         // Shift Left
    SHR = 'SHR',         // Shift Right

    // --- Memory & Allocation ---
    ALLOC_Q = 'ALLOC_Q', // Allocate Qubit(s)
    FREE_Q = 'FREE_Q',   // Free Qubit(s)
    ALLOC_C = 'ALLOC_C', // Allocate Classical Register
    STORE = 'STORE',     // Store to memory
    LOAD = 'LOAD',       // Load from memory
    PHI = 'PHI',         // Phi node for SSA form
}

/**
 * Data types supported within the QIR.
 */
export enum QIRDataType {
    QUBIT = 'QUBIT',     // Quantum Bit reference
    BIT = 'BIT',         // Classical Bit (Measurement result)
    INT = 'INT',         // Integer (width defined in type)
    FLOAT = 'FLOAT',     // Floating point number
    BOOL = 'BOOL',       // Boolean
    POINTER = 'POINTER', // Memory address
    ARRAY = 'ARRAY',     // Array of types
    VOID = 'VOID'        // No return value
}

/**
 * Represents a specific type instance in the QIR.
 */
export interface QIRType {
    kind: QIRDataType;
    width?: number;      // Bit width for INT/FLOAT (e.g., 32, 64)
    elementType?: QIRType; // For ARRAY or POINTER types
    length?: number;     // Fixed length for arrays if known
}

/**
 * Represents a source code location for debugging and error mapping.
 */
export interface SourceLocation {
    file: string;
    line: number;
    column: number;
    length: number;
}

/**
 * Discriminated union for Operands used in instructions.
 */
export type QIROperand = 
    | { kind: 'REGISTER'; id: string; type: QIRType }
    | { kind: 'IMMEDIATE'; value: number | string | boolean; type: QIRType }
    | { kind: 'LABEL'; name: string }
    | { kind: 'GLOBAL'; name: string; type: QIRType };

/**
 * Base interface for all QIR instructions.
 */
export interface QIRInstruction {
    id: string;
    opCode: QIROpCode;
    operands: QIROperand[];
    result?: QIROperand; // Destination register (SSA variable)
    location?: SourceLocation;
    metadata?: Record<string, any>;
}

/**
 * Specialized interface for Quantum Gate instructions to enforce qubit topology.
 */
export interface QIRQuantumInstruction extends QIRInstruction {
    targetQubits: QIROperand[];
    controlQubits?: QIROperand[];
    gateParams?: number[]; // Rotation angles (theta, phi, lambda)
}

/**
 * Represents a Basic Block in the Control Flow Graph (CFG).
 * A sequence of instructions with a single entry and single exit point.
 */
export interface QIRBasicBlock {
    id: string;
    label: string;
    instructions: QIRInstruction[];
    predecessors: string[]; // IDs of blocks that jump here
    successors: string[];   // IDs of blocks jumped to from here
}

/**
 * Represents a variable or constant definition.
 */
export interface QIRVariable {
    id: string;
    name: string;
    type: QIRType;
    isConst: boolean;
    isGlobal: boolean;
    initialValue?: any;
}

/**
 * Represents a Function or Quantum Kernel.
 */
export interface QIRFunction {
    id: string;
    name: string;
    parameters: QIRVariable[];
    returnType: QIRType;
    blocks: QIRBasicBlock[];
    entryBlockId: string;
    
    // Attributes
    isQuantumKernel: boolean; // True if intended for QPU execution
    isExtern: boolean;        // True if defined externally (FFI)
    attributes: Set<string>;  // e.g., 'inline', 'no-opt'
}

/**
 * The top-level container for a compiled .u unit.
 */
export interface QIRModule {
    id: string;
    name: string;
    sourceFile: string;
    
    // Symbol Tables
    functions: Map<string, QIRFunction>;
    globals: Map<string, QIRVariable>;
    
    // Entry point for execution
    entryPoint?: string; // Function ID
    
    // Configuration / Target info
    targetArchitecture?: string;
    qpuConfig?: {
        qubitCount: number;
        topology?: [number, number][]; // Connectivity graph
    };
}

/**
 * Factory helper to create a generic instruction.
 */
export function createInstruction(
    opCode: QIROpCode, 
    operands: QIROperand[], 
    result?: QIROperand,
    loc?: SourceLocation
): QIRInstruction {
    return {
        id: `instr_${Math.random().toString(36).substr(2, 9)}`,
        opCode,
        operands,
        result,
        location: loc
    };
}

/**
 * Factory helper to create a quantum instruction.
 */
export function createQuantumInstruction(
    opCode: QIROpCode,
    targetQubits: QIROperand[],
    controlQubits: QIROperand[] = [],
    gateParams: number[] = [],
    loc?: SourceLocation
): QIRQuantumInstruction {
    return {
        id: `qinstr_${Math.random().toString(36).substr(2, 9)}`,
        opCode,
        operands: [...controlQubits, ...targetQubits], // Generic operands list for visitors
        targetQubits,
        controlQubits,
        gateParams,
        location: loc
    };
}

/**
 * Type Guard to check if an instruction is a Quantum Operation.
 */
export function isQuantumInstruction(instr: QIRInstruction): instr is QIRQuantumInstruction {
    return (instr as QIRQuantumInstruction).targetQubits !== undefined;
}