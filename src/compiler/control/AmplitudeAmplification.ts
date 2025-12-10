import { 
    ASTNode, 
    QuantumIfStatement, 
    BinaryExpression, 
    Expression, 
    Identifier, 
    Literal 
} from '../ast/AST';
import { 
    QuantumCircuit, 
    QuantumInstruction, 
    GateType, 
    Qubit 
} from '../quantum/QuantumCircuit';
import { CompilerContext } from '../context/CompilerContext';
import { CompilationError } from '../errors/CompilationError';

/**
 * Handles the transformation of `quantum_if` control structures into 
 * Amplitude Amplification (Grover's Algorithm) sequences.
 * 
 * This transformer interprets the condition of the `quantum_if` as the Oracle
 * definition and generates the corresponding Diffusion operator to amplify
 * the probability amplitude of the states satisfying the condition.
 */
export class AmplitudeAmplification {

    private context: CompilerContext;

    constructor(context: CompilerContext) {
        this.context = context;
    }

    /**
     * Transforms a QuantumIfStatement into a sequence of quantum gates
     * implementing Amplitude Amplification.
     * 
     * @param statement The quantum_if statement node from the AST.
     * @param targetCircuit The circuit to append instructions to.
     */
    public transform(statement: QuantumIfStatement, targetCircuit: QuantumCircuit): void {
        // 1. Identify the qubits involved in the condition (the search space)
        const involvedQubits = this.extractQubitsFromCondition(statement.condition);
        
        if (involvedQubits.length === 0) {
            throw new CompilationError("quantum_if condition must involve at least one quantum variable.", statement.location);
        }

        // 2. Calculate optimal number of iterations: k ≈ (π/4) * √N
        // N = 2^n where n is number of qubits
        const n = involvedQubits.length;
        const N = Math.pow(2, n);
        const iterations = Math.floor((Math.PI / 4) * Math.sqrt(N));

        // 3. Generate the Oracle (Phase Flip of marked states)
        const oracleCircuit = this.synthesizeOracle(statement.condition, involvedQubits);

        // 4. Generate the Diffusion Operator (Inversion about the mean)
        const diffusionCircuit = this.synthesizeDiffusion(involvedQubits);

        // 5. Apply the Amplitude Amplification sequence
        // Sequence: (Diffusion * Oracle)^k
        for (let i = 0; i < iterations; i++) {
            // Apply Oracle
            targetCircuit.appendCircuit(oracleCircuit);
            // Apply Diffusion
            targetCircuit.appendCircuit(diffusionCircuit);
        }

        // 6. The body of the quantum_if is executed assuming the state has been amplified.
        // In a real quantum computer, this implies we are now in the high-probability state.
        // We compile the body into the circuit following the amplification.
        this.compileBody(statement.body, targetCircuit);
    }

    /**
     * Extracts unique qubit references from the condition expression.
     */
    private extractQubitsFromCondition(condition: Expression): Qubit[] {
        const qubits: Set<string> = new Set();
        const qubitObjects: Qubit[] = [];

        const visitor = (node: ASTNode) => {
            if (node.type === 'Identifier') {
                const symbol = this.context.getSymbol((node as Identifier).name);
                if (symbol && symbol.type === 'Qubit') {
                    if (!qubits.has(symbol.id)) {
                        qubits.add(symbol.id);
                        qubitObjects.push(symbol.value as Qubit);
                    }
                }
            }
            // Recursively visit children
            for (const key in node) {
                if (typeof (node as any)[key] === 'object' && (node as any)[key] !== null) {
                    if ((node as any)[key].type) {
                        visitor((node as any)[key]);
                    }
                }
            }
        };

        visitor(condition);
        return qubitObjects.sort((a, b) => a.index - b.index);
    }

    /**
     * Synthesizes a quantum oracle that flips the phase of states satisfying the condition.
     * Logic: f(x) = 1 -> Phase flip (-1).
     * 
     * This implementation currently supports basic equality checks and boolean logic.
     * Complex arithmetic in conditions requires arithmetic circuits (not implemented here).
     */
    private synthesizeOracle(condition: Expression, qubits: Qubit[]): QuantumCircuit {
        const circuit = new QuantumCircuit();

        // For a simple boolean formula, we can construct a phase oracle.
        // Strategy: Compute the boolean function into an ancilla qubit, apply Z to ancilla, uncompute.
        // Optimization: For simple conjunctions (q0 == 1 && q1 == 0), we can use Multi-Controlled Z directly.

        if (this.isSimpleConjunction(condition)) {
            this.generateConjunctionOracle(condition, circuit);
        } else {
            // General case: Compute f(x) into ancilla, Z ancilla, Uncompute
            const ancilla = this.context.allocateAncilla();
            
            // 1. Compute condition into ancilla
            this.compileClassicalLogicToQuantum(condition, qubits, ancilla, circuit);
            
            // 2. Phase flip if ancilla is |1>
            circuit.addGate(GateType.Z, [ancilla]);
            
            // 3. Uncompute (Reverse the computation)
            // In a reversible circuit, the inverse is the reverse sequence of adjoint gates.
            // Since basic logic gates (Toffoli, CNOT, X) are self-adjoint, we just reverse the order.
            const computationInstructions = [...circuit.getInstructions()];
            // Remove the Z gate we just added
            computationInstructions.pop(); 
            
            // Append inverse
            for (let i = computationInstructions.length - 1; i >= 0; i--) {
                circuit.addInstruction(computationInstructions[i]);
            }

            this.context.releaseAncilla(ancilla);
        }

        return circuit;
    }

    /**
     * Synthesizes the Grover Diffusion operator: 2|s><s| - I
     * Circuit: H^n -> X^n -> MCZ -> X^n -> H^n
     */
    private synthesizeDiffusion(qubits: Qubit[]): QuantumCircuit {
        const circuit = new QuantumCircuit();
        const n = qubits.length;

        // 1. Apply Hadamard to all qubits
        qubits.forEach(q => circuit.addGate(GateType.H, [q]));

        // 2. Apply X to all qubits
        qubits.forEach(q => circuit.addGate(GateType.X, [q]));

        // 3. Multi-Controlled Z (H -> MCX -> H equivalent for phase flip on |11...1>)
        // We need to flip the phase of the |11...1> state.
        if (n > 1) {
            const controls = qubits.slice(0, n - 1);
            const target = qubits[n - 1];
            
            // H on target to convert X to Z basis for the multi-control operation
            circuit.addGate(GateType.H, [target]);
            circuit.addGate(GateType.MCX, [...controls, target]);
            circuit.addGate(GateType.H, [target]);
        } else {
            // Single qubit diffusion
            circuit.addGate(GateType.Z, [qubits[0]]);
        }

        // 4. Apply X to all qubits
        qubits.forEach(q => circuit.addGate(GateType.X, [q]));

        // 5. Apply Hadamard to all qubits
        qubits.forEach(q => circuit.addGate(GateType.H, [q]));

        return circuit;
    }

    /**
     * Checks if the expression is a simple conjunction of qubit states
     * e.g., (q0 == 1 && q1 == 0 && q2 == 1)
     */
    private isSimpleConjunction(expr: Expression): boolean {
        if (expr.type === 'BinaryExpression') {
            const binExpr = expr as BinaryExpression;
            if (binExpr.operator === '&&') {
                return this.isSimpleConjunction(binExpr.left) && this.isSimpleConjunction(binExpr.right);
            }
            if (binExpr.operator === '==') {
                // Check if one side is identifier and other is 0 or 1 literal
                return true; // Simplified check
            }
        }
        return false;
    }

    /**
     * Generates an optimized oracle for simple conjunctions using X gates and MCZ.
     * E.g., for state |101>, apply X on q1, then MCZ(q0, q1, q2), then X on q1.
     */
    private generateConjunctionOracle(expr: Expression, circuit: QuantumCircuit): void {
        const requiredStates: Map<string, number> = new Map();
        
        // Helper to traverse the AND tree
        const traverse = (node: Expression) => {
            if (node.type === 'BinaryExpression') {
                const bin = node as BinaryExpression;
                if (bin.operator === '&&') {
                    traverse(bin.left);
                    traverse(bin.right);
                } else if (bin.operator === '==') {
                    // Assume format: Identifier == Literal or Literal == Identifier
                    let id: Identifier | null = null;
                    let val: number | null = null;

                    if (bin.left.type === 'Identifier' && bin.right.type === 'Literal') {
                        id = bin.left as Identifier;
                        val = parseInt((bin.right as Literal).value);
                    } else if (bin.right.type === 'Identifier' && bin.left.type === 'Literal') {
                        id = bin.right as Identifier;
                        val = parseInt((bin.left as Literal).value);
                    }

                    if (id && val !== null) {
                        const symbol = this.context.getSymbol(id.name);
                        if (symbol && symbol.type === 'Qubit') {
                            requiredStates.set(symbol.id, val);
                        }
                    }
                }
            }
        };

        traverse(expr);

        const qubits: Qubit[] = [];
        const xGatesToApply: Qubit[] = [];

        requiredStates.forEach((val, qubitId) => {
            const qubit = this.context.getQubitById(qubitId);
            if (qubit) {
                qubits.push(qubit);
                if (val === 0) {
                    // If we want to select for |0>, we wrap in X gates
                    xGatesToApply.push(qubit);
                }
            }
        });

        // 1. Apply X gates for 0-requirements
        xGatesToApply.forEach(q => circuit.addGate(GateType.X, [q]));

        // 2. Apply Multi-Controlled Z
        if (qubits.length > 0) {
            const n = qubits.length;
            const controls = qubits.slice(0, n - 1);
            const target = qubits[n - 1];

            circuit.addGate(GateType.H, [target]);
            circuit.addGate(GateType.MCX, [...controls, target]);
            circuit.addGate(GateType.H, [target]);
        }

        // 3. Uncompute X gates
        xGatesToApply.forEach(q => circuit.addGate(GateType.X, [q]));
    }

    /**
     * Compiles a general boolean expression into quantum gates (reversible logic).
     * Result is stored in the target qubit (XORed).
     */
    private compileClassicalLogicToQuantum(
        expr: Expression, 
        scopeQubits: Qubit[], 
        target: Qubit, 
        circuit: QuantumCircuit
    ): void {
        // This is a simplified recursive compiler for boolean logic.
        // It maps AND -> Toffoli, NOT -> X, OR -> De Morgan + Toffoli.
        
        if (expr.type === 'BinaryExpression') {
            const bin = expr as BinaryExpression;
            
            if (bin.operator === '&&') {
                // Allocate ancillas for left and right operands
                const leftRes = this.context.allocateAncilla();
                const rightRes = this.context.allocateAncilla();

                this.compileClassicalLogicToQuantum(bin.left, scopeQubits, leftRes, circuit);
                this.compileClassicalLogicToQuantum(bin.right, scopeQubits, rightRes, circuit);

                // Toffoli(left, right, target)
                circuit.addGate(GateType.MCX, [leftRes, rightRes, target]);

                // Uncompute ancillas (not strictly necessary if we are inside the oracle wrapper which uncomputes everything,
                // but good practice for modularity. However, for the oracle wrapper logic above, we need the result to stay
                // on target, but intermediate ancillas should be cleaned up to |0>).
                
                // To uncompute, we reverse the operations.
                // Note: This simple implementation doesn't fully uncompute intermediate steps recursively 
                // within this function call, relying on the top-level uncompute. 
                // For production, a dedicated reversible synthesis pass is needed.
                
                this.context.releaseAncilla(leftRes);
                this.context.releaseAncilla(rightRes);
            }
            // Additional operators (||, ^, etc.) would be implemented here
        } else if (expr.type === 'Identifier') {
            // Copy qubit state to target via CNOT
            const id = expr as Identifier;
            const symbol = this.context.getSymbol(id.name);
            if (symbol && symbol.type === 'Qubit') {
                circuit.addGate(GateType.CNOT, [symbol.value as Qubit, target]);
            }
        }
    }

    private compileBody(body: ASTNode, circuit: QuantumCircuit): void {
        // Delegate back to the main compiler context to process the body statements
        // This ensures that statements inside the quantum_if are generated
        // sequentially after the amplification.
        this.context.compileNode(body, circuit);
    }
}