export class Complex {
    constructor(public re: number, public im: number) {}

    static get ZERO(): Complex { return new Complex(0, 0); }
    static get ONE(): Complex { return new Complex(1, 0); }

    add(other: Complex): Complex {
        return new Complex(this.re + other.re, this.im + other.im);
    }

    sub(other: Complex): Complex {
        return new Complex(this.re - other.re, this.im - other.im);
    }

    mul(other: Complex): Complex {
        return new Complex(
            this.re * other.re - this.im * other.im,
            this.re * other.im + this.im * other.re
        );
    }

    magSq(): number {
        return this.re * this.re + this.im * this.im;
    }

    toString(): string {
        const sign = this.im >= 0 ? '+' : '-';
        return `${this.re.toFixed(4)} ${sign} ${Math.abs(this.im).toFixed(4)}i`;
    }
}

export type QubitId = number;

/**
 * Represents the quantum state of the system using a state vector simulation.
 * Manages allocation, unitary evolution, and measurement collapse.
 */
export class QuantumState {
    // Maps a unique QubitId to its bit position in the state vector indices (0 = LSB)
    private qubitMap: Map<QubitId, number> = new Map();
    private nextQubitId: number = 0;
    
    // The state vector amplitudes. Size is 2^N where N is number of allocated qubits.
    private stateVector: Complex[] = [Complex.ONE]; 

    /**
     * Allocates a new qubit initialized to state |0>.
     * This expands the state vector size by a factor of 2.
     */
    allocate(): QubitId {
        const id = this.nextQubitId++;
        const pos = this.qubitMap.size; // Assign next available bit position
        this.qubitMap.set(id, pos);
        
        const oldSize = this.stateVector.length;
        const newSize = oldSize * 2;
        const newState = new Array(newSize);
        
        // Tensor product: |Psi_new> = |Psi_old> (x) |0>
        // Since |0> is [1, 0], the first half is the old vector, second half is zero.
        for (let i = 0; i < oldSize; i++) {
            newState[i] = this.stateVector[i];
            newState[i + oldSize] = Complex.ZERO;
        }
        
        this.stateVector = newState;
        return id;
    }

    /**
     * Applies a single-qubit quantum gate (H, X, Y, Z).
     */
    applyGate(gate: 'H' | 'X' | 'Y' | 'Z', target: QubitId): void {
        const targetPos = this.qubitMap.get(target);
        if (targetPos === undefined) throw new Error(`Invalid qubit ID ${target}`);
        
        const size = this.stateVector.length;
        const newState = new Array(size);
        const invSqrt2 = 1 / Math.sqrt(2);
        
        for (let i = 0; i < size; i++) {
            // Check the bit at targetPos
            const bit = (i >> targetPos) & 1;
            // The index corresponding to the flipped bit state
            const pairIndex = i ^ (1 << targetPos);
            
            const ampSelf = this.stateVector[i];
            const ampPair = this.stateVector[pairIndex];
            
            let newAmp = Complex.ZERO;

            switch (gate) {
                case 'X':
                    // Pauli-X (NOT): Swaps amplitudes of |0> and |1>
                    newAmp = ampPair;
                    break;
                case 'Z':
                    // Pauli-Z: |0> -> |0>, |1> -> -|1>
                    newAmp = bit === 0 ? ampSelf : new Complex(-ampSelf.re, -ampSelf.im);
                    break;
                case 'Y':
                    // Pauli-Y: |0> -> i|1>, |1> -> -i|0>
                    if (bit === 0) {
                        // i * ampPair
                        newAmp = new Complex(-ampPair.im, ampPair.re);
                    } else {
                        // -i * ampPair
                        newAmp = new Complex(ampPair.im, -ampPair.re);
                    }
                    break;
                case 'H':
                    // Hadamard: |0> -> (|0>+|1>)/rt2, |1> -> (|0>-|1>)/rt2
                    if (bit === 0) {
                        // Component for |0>: (Old|0> + Old|1>) * invSqrt2
                        newAmp = ampSelf.add(ampPair).mul(new Complex(invSqrt2, 0));
                    } else {
                        // Component for |1>: (Old|0> - Old|1>) * invSqrt2
                        // Note: ampPair is the amplitude where bit was 0 (Old|0>)
                        newAmp = ampPair.sub(ampSelf).mul(new Complex(invSqrt2, 0));
                    }
                    break;
            }
            newState[i] = newAmp;
        }
        this.stateVector = newState;
    }

    /**
     * Applies a Controlled-NOT (CNOT) gate.
     */
    applyCNOT(control: QubitId, target: QubitId): void {
        const cPos = this.qubitMap.get(control);
        const tPos = this.qubitMap.get(target);
        if (cPos === undefined || tPos === undefined) throw new Error("Invalid qubit IDs for CNOT");
        if (cPos === tPos) throw new Error("Control and Target cannot be the same qubit");
        
        const size = this.stateVector.length;
        const newState = new Array(size);
        
        for (let i = 0; i < size; i++) {
            const cBit = (i >> cPos) & 1;
            
            if (cBit === 1) {
                // If control is 1, flip target bit (swap amplitudes)
                const pairIndex = i ^ (1 << tPos);
                newState[i] = this.stateVector[pairIndex];
            } else {
                // If control is 0, identity
                newState[i] = this.stateVector[i];
            }
        }
        this.stateVector = newState;
    }

    /**
     * Measures a qubit, collapsing the state vector and returning 0 or 1.
     */
    measure(target: QubitId): number {
        const pos = this.qubitMap.get(target);
        if (pos === undefined) throw new Error("Invalid qubit ID for measurement");
        
        let prob1 = 0;
        const size = this.stateVector.length;
        
        // Calculate probability of measuring 1
        for (let i = 0; i < size; i++) {
            if (((i >> pos) & 1) === 1) {
                prob1 += this.stateVector[i].magSq();
            }
        }
        
        // Determine outcome based on probability
        const result = Math.random() < prob1 ? 1 : 0;
        
        // Normalize the state vector after collapse
        // If result is 1, we keep only states where bit is 1, and divide by sqrt(prob1)
        // If result is 0, we keep only states where bit is 0, and divide by sqrt(1-prob1)
        const probMeasured = result === 1 ? prob1 : (1 - prob1);
        
        if (probMeasured < 1e-15) {
            // Should theoretically not happen if we selected based on probability, 
            // but handles floating point edge cases.
            throw new Error("Impossible measurement outcome occurred.");
        }

        const normFactor = 1 / Math.sqrt(probMeasured);
        
        for (let i = 0; i < size; i++) {
            const bit = (i >> pos) & 1;
            if (bit === result) {
                this.stateVector[i] = this.stateVector[i].mul(new Complex(normFactor, 0));
            } else {
                this.stateVector[i] = Complex.ZERO;
            }
        }
        
        return result;
    }

    /**
     * Debug utility to view current state probabilities.
     */
    dumpState(): string {
        let out = "";
        const size = this.stateVector.length;
        const numQubits = this.qubitMap.size;
        
        for (let i = 0; i < size; i++) {
            const mag = this.stateVector[i].magSq();
            if (mag > 0.0001) {
                const bin = i.toString(2).padStart(numQubits, '0').split('').reverse().join('');
                out += `|${bin}>: ${this.stateVector[i].toString()} (Prob: ${mag.toFixed(4)})\n`;
            }
        }
        return out;
    }
}

// --- AST Definitions for Quantum-Enriched Lambda Calculus ---

export type Expr = 
    | { kind: 'Var', name: string }
    | { kind: 'Abs', param: string, body: Expr }
    | { kind: 'App', func: Expr, arg: Expr }
    | { kind: 'Let', name: string, value: Expr, body: Expr }
    | { kind: 'Const', value: any }
    // Quantum Primitives
    | { kind: 'QAlloc' } 
    | { kind: 'QGate', gate: 'H' | 'X' | 'Y' | 'Z', target: Expr }
    | { kind: 'QCNOT', control: Expr, target: Expr }
    | { kind: 'QMeasure', target: Expr };

// --- Runtime Values ---

export type Value = 
    | { kind: 'Closure', param: string, body: Expr, env: Environment }
    | { kind: 'Qubit', id: QubitId }
    | { kind: 'Primitive', value: any }
    | { kind: 'Unit' };

export class Environment {
    private vars: Map<string, Value>;
    
    constructor(public parent?: Environment) {
        this.vars = new Map();
    }
    
    get(name: string): Value | undefined {
        return this.vars.get(name) ?? this.parent?.get(name);
    }
    
    set(name: string, value: Value): void {
        this.vars.set(name, value);
    }
}

// --- Interpreter ---

export class QuantumLambdaInterpreter {
    private qMachine: QuantumState;

    constructor() {
        this.qMachine = new QuantumState();
    }

    /**
     * Evaluates an expression in the given environment.
     */
    evaluate(expr: Expr, env: Environment): Value {
        switch (expr.kind) {
            case 'Const':
                return { kind: 'Primitive', value: expr.value };
                
            case 'Var': {
                const val = env.get(expr.name);
                if (!val) throw new Error(`Runtime Error: Undefined variable '${expr.name}'`);
                return val;
            }
            
            case 'Abs':
                return { kind: 'Closure', param: expr.param, body: expr.body, env };
                
            case 'App': {
                const funcVal = this.evaluate(expr.func, env);
                const argVal = this.evaluate(expr.arg, env);
                
                if (funcVal.kind !== 'Closure') {
                    throw new Error("Runtime Error: Attempting to call a non-function value");
                }
                
                // Static scoping: use the closure's environment extended with the argument
                const newEnv = new Environment(funcVal.env);
                newEnv.set(funcVal.param, argVal);
                
                return this.evaluate(funcVal.body, newEnv);
            }
            
            case 'Let': {
                const val = this.evaluate(expr.value, env);
                const newEnv = new Environment(env);
                newEnv.set(expr.name, val);
                return this.evaluate(expr.body, newEnv);
            }
            
            case 'QAlloc': {
                const qId = this.qMachine.allocate();
                return { kind: 'Qubit', id: qId };
            }
            
            case 'QGate': {
                const targetVal = this.evaluate(expr.target, env);
                if (targetVal.kind !== 'Qubit') {
                    throw new Error(`Runtime Error: Gate '${expr.gate}' expects a Qubit, got ${targetVal.kind}`);
                }
                
                this.qMachine.applyGate(expr.gate, targetVal.id);
                // Return the qubit to allow chaining or functional composition
                return targetVal; 
            }
            
            case 'QCNOT': {
                const cVal = this.evaluate(expr.control, env);
                const tVal = this.evaluate(expr.target, env);
                
                if (cVal.kind !== 'Qubit' || tVal.kind !== 'Qubit') {
                    throw new Error("Runtime Error: CNOT expects two Qubits");
                }
                
                this.qMachine.applyCNOT(cVal.id, tVal.id);
                return tVal;
            }
            
            case 'QMeasure': {
                const targetVal = this.evaluate(expr.target, env);
                if (targetVal.kind !== 'Qubit') {
                    throw new Error("Runtime Error: Measure expects a Qubit");
                }
                
                const result = this.qMachine.measure(targetVal.id);
                return { kind: 'Primitive', value: result };
            }
            
            default:
                const _exhaustiveCheck: never = expr;
                throw new Error(`Unknown expression kind encountered`);
        }
    }

    /**
     * Returns the internal state of the quantum machine for debugging.
     */
    getDebugState(): string {
        return this.qMachine.dumpState();
    }
}