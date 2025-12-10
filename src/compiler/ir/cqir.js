/**
 * @file Defines the data structures for the Classical-Quantum Intermediate Representation (CQIR).
 * This IR is designed to represent both classical control flow and quantum circuits
 * in a unified manner, suitable for compilation and optimization.
 */

// --- Type System ---

/**
 * Base class for all types in CQIR.
 */
class Type {
    constructor(name) {
        this.name = name;
    }

    toString() {
        return this.name;
    }
}

class VoidType extends Type {
    constructor() {
        super('void');
    }
}

class IntegerType extends Type {
    constructor(bitWidth) {
        super(`i${bitWidth}`);
        this.bitWidth = bitWidth;
    }
}

class FloatType extends Type {
    constructor(bitWidth) {
        super(`f${bitWidth}`);
        this.bitWidth = bitWidth;
    }
}

class BooleanType extends Type {
    constructor() {
        super('bool');
    }
}

class QubitType extends Type {
    constructor() {
        super('qubit');
    }
}

class QRegType extends Type {
    constructor(size) {
        super(`qreg<${size}>`);
        this.size = size;
    }
}

// Singleton instances for common types
const TYPES = {
    VOID: new VoidType(),
    BOOL: new BooleanType(),
    I8: new IntegerType(8),
    I32: new IntegerType(32),
    I64: new IntegerType(64),
    F32: new FloatType(32),
    F64: new FloatType(64),
    QUBIT: new QubitType(),
};


// --- Values and Operands ---

/**
 * Base class for all values in CQIR (e.g., constants, variables, registers).
 */
class Value {
    /**
     * @param {Type} type The type of the value.
     * @param {string} name The name or identifier for the value.
     */
    constructor(type, name) {
        this.type = type;
        this.name = name;
        this.users = new Set(); // Instructions that use this value
    }

    addUser(user) {
        this.users.add(user);
    }

    removeUser(user) {
        this.users.delete(user);
    }

    toString() {
        return `${this.type} ${this.name}`;
    }
}

class Constant extends Value {
    /**
     * @param {Type} type The type of the constant.
     * @param {*} value The literal value.
     */
    constructor(type, value) {
        super(type, String(value));
        this.value = value;
    }
}

class ConstantInt extends Constant {
    constructor(bitWidth, value) {
        super(new IntegerType(bitWidth), value);
    }
}

class ConstantFloat extends Constant {
    constructor(bitWidth, value) {
        super(new FloatType(bitWidth), value);
    }
}

class ConstantBool extends Constant {
    constructor(value) {
        super(TYPES.BOOL, value);
    }
}

/**
 * Represents a function argument.
 */
class Argument extends Value {
    constructor(type, name, index) {
        super(type, name);
        this.index = index;
    }
}

/**
 * Represents a single qubit.
 */
class Qubit extends Value {
    constructor(id) {
        // The name is typically q[id]
        super(TYPES.QUBIT, `%q${id}`);
        this.id = id;
    }
}


// --- Instructions ---

/**
 * Base class for all instructions.
 */
class Instruction extends Value {
    /**
     * @param {Type} type The type of the value this instruction produces (or VoidType).
     * @param {string} opcode The operation code (e.g., 'add', 'h', 'cnot').
     * @param {Value[]} operands The operands for this instruction.
     * @param {string} name The name of the result register (if any).
     */
    constructor(type, opcode, operands = [], name = '') {
        super(type, name);
        this.opcode = opcode;
        this.operands = operands;
        this.parent = null; // The BasicBlock this instruction belongs to

        // Register this instruction as a user of its operands
        this.operands.forEach(op => {
            if (op instanceof Value) {
                op.addUser(this);
            }
        });
    }

    toString() {
        const ops = this.operands.map(op => op.name).join(', ');
        if (this.type instanceof VoidType) {
            return `  ${this.opcode} ${ops}`;
        }
        return `  ${this.name} = ${this.opcode} ${this.type} ${ops}`;
    }
}

// --- Classical Instructions ---

class BinaryOp extends Instruction {
    constructor(opcode, type, op1, op2, name) {
        super(type, opcode, [op1, op2], name);
    }

    get op1() { return this.operands[0]; }
    get op2() { return this.operands[1]; }
}

class AddInst extends BinaryOp { constructor(type, op1, op2, name) { super('add', type, op1, op2, name); } }
class SubInst extends BinaryOp { constructor(type, op1, op2, name) { super('sub', type, op1, op2, name); } }
class MulInst extends BinaryOp { constructor(type, op1, op2, name) { super('mul', type, op1, op2, name); } }
class DivInst extends BinaryOp { constructor(type, op1, op2, name) { super('div', type, op1, op2, name); } }

const CmpPredicate = {
    EQ: 'eq',  // equal
    NE: 'ne',  // not equal
    GT: 'gt',  // greater than
    GE: 'ge',  // greater or equal
    LT: 'lt',  // less than
    LE: 'le',  // less or equal
};

class CmpInst extends Instruction {
    constructor(predicate, op1, op2, name) {
        super(TYPES.BOOL, 'cmp', [op1, op2], name);
        this.predicate = predicate;
    }

    toString() {
        const ops = this.operands.map(op => `${op.type} ${op.name}`).join(', ');
        return `  ${this.name} = cmp ${this.predicate} ${ops}`;
    }
}

class AllocInst extends Instruction {
    constructor(type, name) {
        // Alloc returns a pointer to the allocated type
        super(type, 'alloc', [], name);
    }
    toString() {
        return `  ${this.name} = alloc ${this.type}`;
    }
}

class LoadInst extends Instruction {
    constructor(type, ptr, name) {
        super(type, 'load', [ptr], name);
    }
    get ptr() { return this.operands[0]; }
}

class StoreInst extends Instruction {
    constructor(value, ptr) {
        super(TYPES.VOID, 'store', [value, ptr]);
    }
    get value() { return this.operands[0]; }
    get ptr() { return this.operands[1]; }
}

// --- Quantum Instructions ---

class QuantumGate extends Instruction {
    constructor(opcode, qubits, params = []) {
        // Quantum gates typically don't produce a new value, they modify state.
        // We model them as void instructions.
        super(TYPES.VOID, opcode, [...qubits, ...params]);
    }

    get qubits() {
        // Assuming qubits are listed before params
        return this.operands.filter(op => op.type instanceof QubitType);
    }

    get params() {
        return this.operands.filter(op => !(op.type instanceof QubitType));
    }
}

// Single-qubit gates
class HGate extends QuantumGate { constructor(qubit) { super('h', [qubit]); } }
class XGate extends QuantumGate { constructor(qubit) { super('x', [qubit]); } }
class YGate extends QuantumGate { constructor(qubit) { super('y', [qubit]); } }
class ZGate extends QuantumGate { constructor(qubit) { super('z', [qubit]); } }
class SGate extends QuantumGate { constructor(qubit) { super('s', [qubit]); } }
class TGate extends QuantumGate { constructor(qubit) { super('t', [qubit]); } }

// Single-qubit rotation gates
class RxGate extends QuantumGate { constructor(theta, qubit) { super('rx', [qubit], [theta]); } }
class RyGate extends QuantumGate { constructor(theta, qubit) { super('ry', [qubit], [theta]); } }
class RzGate extends QuantumGate { constructor(theta, qubit) { super('rz', [qubit], [theta]); } }

// Multi-qubit gates
class CNOTGate extends QuantumGate { constructor(control, target) { super('cnot', [control, target]); } }
class CZGate extends QuantumGate { constructor(control, target) { super('cz', [control, target]); } }
class SWAPGate extends QuantumGate { constructor(q1, q2) { super('swap', [q1, q2]); } }

// Other quantum operations
class MeasureInst extends Instruction {
    /**
     * @param {Qubit} qubit The qubit to measure.
     * @param {string} name The name of the classical bit result.
     */
    constructor(qubit, name) {
        super(TYPES.BOOL, 'measure', [qubit], name);
    }
    get qubit() { return this.operands[0]; }
}

class ResetInst extends QuantumGate {
    constructor(qubit) {
        super('reset', [qubit]);
    }
}

// --- Terminator Instructions ---

class TerminatorInst extends Instruction {
    constructor(opcode, operands = []) {
        super(TYPES.VOID, opcode, operands);
    }

    getSuccessors() {
        return [];
    }
}

class ReturnInst extends TerminatorInst {
    constructor(value = null) {
        super('ret', value ? [value] : []);
    }

    get returnValue() {
        return this.operands.length > 0 ? this.operands[0] : null;
    }

    toString() {
        const valStr = this.returnValue ? `${this.returnValue.type} ${this.returnValue.name}` : 'void';
        return `  ret ${valStr}`;
    }
}

class BranchInst extends TerminatorInst {
    constructor(destination) {
        super('br', [destination]);
    }

    get destination() { return this.operands[0]; }

    getSuccessors() {
        return [this.destination];
    }

    toString() {
        return `  br label %${this.destination.name}`;
    }
}

class CondBranchInst extends TerminatorInst {
    constructor(condition, trueDest, falseDest) {
        super('br_cond', [condition, trueDest, falseDest]);
    }

    get condition() { return this.operands[0]; }
    get trueDest() { return this.operands[1]; }
    get falseDest() { return this.operands[2]; }

    getSuccessors() {
        return [this.trueDest, this.falseDest];
    }

    toString() {
        return `  br_cond ${this.condition.type} ${this.condition.name}, label %${this.trueDest.name}, label %${this.falseDest.name}`;
    }
}


// --- Core IR Structures ---

/**
 * Represents a Basic Block in the Control Flow Graph (CFG).
 * A basic block is a sequence of non-branching instructions,
 * ending with a terminator instruction.
 */
class BasicBlock extends Value {
    constructor(name, parentFunction) {
        // A BasicBlock can be an operand for a branch instruction.
        super(new Type('label'), name);
        this.instructions = [];
        this.parent = parentFunction;
        this.predecessors = new Set();
        this.successors = new Set();
    }

    addInstruction(inst) {
        if (this.getTerminator()) {
            throw new Error(`Cannot add instruction to a terminated block: ${this.name}`);
        }
        inst.parent = this;
        this.instructions.push(inst);
        if (inst instanceof TerminatorInst) {
            this._updateSuccessors(inst);
        }
    }

    getTerminator() {
        const lastInst = this.instructions[this.instructions.length - 1];
        return (lastInst instanceof TerminatorInst) ? lastInst : null;
    }

    _updateSuccessors(terminator) {
        // Clear old successors and their predecessor links to this block
        this.successors.forEach(succ => succ.predecessors.delete(this));
        this.successors.clear();

        // Add new successors and update their predecessor links
        const newSuccessors = terminator.getSuccessors();
        newSuccessors.forEach(succ => {
            if (succ instanceof BasicBlock) {
                this.successors.add(succ);
                succ.predecessors.add(this);
            }
        });
    }

    toString() {
        let str = `${this.name}:\n`;
        // Could add predecessor comments here: "; preds = %bb1, %bb2"
        for (const inst of this.instructions) {
            str += inst.toString() + '\n';
        }
        return str;
    }
}

/**
 * Represents a function or subroutine in the CQIR.
 * Contains a CFG of basic blocks.
 */
class CQIRFunction {
    constructor(name, returnType, argTypes = []) {
        this.name = name;
        this.returnType = returnType;
        this.args = argTypes.map((type, i) => new Argument(type, `%arg${i}`, i));
        this.blocks = [];
        this.entryBlock = null;
        this._nextReg = 0;
        this._nextBlock = 0;
    }

    createBlock(name = `bb${this._nextBlock++}`) {
        const block = new BasicBlock(name, this);
        this.blocks.push(block);
        if (!this.entryBlock) {
            this.entryBlock = block;
        }
        return block;
    }

    getNextRegName() {
        return `%${this._nextReg++}`;
    }

    toString() {
        const argStrings = this.args.map(arg => `${arg.type} ${arg.name}`).join(', ');
        let str = `define ${this.returnType} @${this.name}(${argStrings}) {\n`;
        for (const block of this.blocks) {
            str += block.toString();
        }
        str += '}\n';
        return str;
    }
}

/**
 * Top-level container for a CQIR program.
 * A program consists of functions and global declarations.
 */
class CQIRProgram {
    constructor(name) {
        this.name = name;
        this.functions = new Map();
        this.qubits = [];
        this.numQubits = 0;
    }

    addFunction(func) {
        this.functions.set(func.name, func);
    }

    getFunction(name) {
        return this.functions.get(name);
    }

    /**
     * Declares the total number of qubits available for the program.
     * @param {number} count
     */
    declareQubits(count) {
        this.numQubits = count;
        this.qubits = Array.from({ length: count }, (_, i) => new Qubit(i));
    }

    getQubit(index) {
        if (index >= this.numQubits) {
            throw new Error(`Qubit index ${index} out of bounds for ${this.numQubits} declared qubits.`);
        }
        return this.qubits[index];
    }

    toString() {
        let str = `; ModuleID = '${this.name}'\n`;
        str += `qreg_decl ${this.numQubits}\n\n`;

        for (const func of this.functions.values()) {
            str += func.toString() + '\n';
        }
        return str;
    }
}

module.exports = {
    // Types
    Type,
    VoidType,
    IntegerType,
    FloatType,
    BooleanType,
    QubitType,
    QRegType,
    TYPES,

    // Values
    Value,
    Constant,
    ConstantInt,
    ConstantFloat,
    ConstantBool,
    Argument,
    Qubit,

    // Instructions
    Instruction,
    BinaryOp,
    AddInst,
    SubInst,
    MulInst,
    DivInst,
    CmpInst,
    CmpPredicate,
    AllocInst,
    LoadInst,
    StoreInst,

    // Quantum Instructions
    QuantumGate,
    HGate,
    XGate,
    YGate,
    ZGate,
    SGate,
    TGate,
    RxGate,
    RyGate,
    RzGate,
    CNOTGate,
    CZGate,
    SWAPGate,
    MeasureInst,
    ResetInst,

    // Terminator Instructions
    TerminatorInst,
    ReturnInst,
    BranchInst,
    CondBranchInst,

    // Core IR Structures
    BasicBlock,
    CQIRFunction,
    CQIRProgram,
};