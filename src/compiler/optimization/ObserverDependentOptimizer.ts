import { 
    ASTNode, 
    BlockNode, 
    IfStatementNode, 
    QuantumMeasurementNode, 
    QuantumGateNode, 
    NodeType, 
    LiteralNode,
    ExpressionNode,
    StatementNode,
    ProgramNode
} from '../../ast/nodes';
import { CompilerContext } from '../CompilerContext';
import { OptimizationPass } from './OptimizationPass';
import { DiagnosticSeverity } from '../../diagnostics/Diagnostic';

/**
 * Represents the abstract state of a Qubit during static analysis.
 */
enum QubitAbstractState {
    BasisZero,          // |0>
    BasisOne,           // |1>
    Superposition,      // α|0> + β|1> (Deterministic superposition, e.g., after H gate on basis)
    Entangled,          // State depends on other qubits
    Mixed,              // Classical probability distribution or unknown
    CollapsedZero,      // Post-measurement |0>
    CollapsedOne        // Post-measurement |1>
}

/**
 * Context for tracking quantum state during control flow analysis.
 */
interface QuantumFlowContext {
    qubits: Map<string, QubitAbstractState>;
    classicalVars: Map<string, any>; // Simple constant propagation for classical vars
}

/**
 * ObserverDependentOptimizer
 * 
 * This optimization pass analyzes the quantum circuit to identify classical control flow
 * structures that depend on quantum measurements. If the quantum state prior to measurement
 * is deterministic (e.g., measuring |0> always yields 0), this pass will:
 * 
 * 1. Replace the quantum measurement operation with a classical integer literal.
 * 2. Prune dead code branches in If/Else structures resulting from the constant folding.
 * 3. Remove redundant quantum gates that do not affect the observable outcome (dead code elimination).
 */
export class ObserverDependentOptimizer implements OptimizationPass {
    public readonly name = "ObserverDependentOptimizer";
    public readonly description = "Optimizes classical control flow based on deterministic quantum measurement outcomes.";

    constructor(private context: CompilerContext) {}

    /**
     * Entry point for the optimization pass.
     */
    public run(program: ProgramNode): ProgramNode {
        this.context.logger.info(`[${this.name}] Starting analysis...`);
        
        const initialContext: QuantumFlowContext = {
            qubits: new Map<string, QubitAbstractState>(),
            classicalVars: new Map<string, any>()
        };

        // Initialize all declared qubits to BasisZero (|0>) as per .u language spec
        this.initializeQubits(program, initialContext);

        return this.visitNode(program, initialContext) as ProgramNode;
    }

    /**
     * Pre-scan to initialize qubit states.
     */
    private initializeQubits(node: ASTNode, ctx: QuantumFlowContext): void {
        if (node.type === NodeType.QubitDeclaration) {
            const decl = node as any; // Assuming QubitDeclarationNode structure
            ctx.qubits.set(decl.identifier.name, QubitAbstractState.BasisZero);
        }
        
        // Recursive scan for declarations
        if ('body' in node && Array.isArray((node as any).body)) {
            (node as any).body.forEach((child: ASTNode) => this.initializeQubits(child, ctx));
        }
    }

    /**
     * Main visitor dispatcher.
     */
    private visitNode(node: ASTNode, ctx: QuantumFlowContext): ASTNode {
        switch (node.type) {
            case NodeType.Program:
            case NodeType.Block:
                return this.visitBlock(node as BlockNode, ctx);
            
            case NodeType.IfStatement:
                return this.visitIfStatement(node as IfStatementNode, ctx);
            
            case NodeType.QuantumGate:
                return this.analyzeGate(node as QuantumGateNode, ctx);
            
            case NodeType.QuantumMeasurement:
                return this.optimizeMeasurement(node as QuantumMeasurementNode, ctx);
            
            case NodeType.VariableDeclaration:
                // Basic tracking for classical variables assigned from measurements
                return this.visitVariableDeclaration(node, ctx);

            default:
                // Generic traversal for other nodes
                if ('children' in node && Array.isArray((node as any).children)) {
                    (node as any).children = (node as any).children.map((child: ASTNode) => 
                        this.visitNode(child, ctx)
                    );
                }
                return node;
        }
    }

    /**
     * Handles block scoping and sequential execution.
     */
    private visitBlock(node: BlockNode | ProgramNode, ctx: QuantumFlowContext): ASTNode {
        // Clone context for scope isolation if necessary, though quantum state is usually global/heap
        // For this pass, we assume quantum state is global, but classical vars might be scoped.
        // We pass the reference to simulate temporal execution.
        
        const newBody: StatementNode[] = [];

        for (const stmt of node.body) {
            const optimizedStmt = this.visitNode(stmt, ctx);
            
            // If a statement was optimized away (returned null/undefined), skip it
            if (optimizedStmt) {
                newBody.push(optimizedStmt as StatementNode);
            }
        }

        node.body = newBody;
        return node;
    }

    /**
     * Analyzes and optimizes conditional branching based on quantum states.
     */
    private visitIfStatement(node: IfStatementNode, ctx: QuantumFlowContext): ASTNode | null {
        // 1. Optimize the condition expression
        node.test = this.visitNode(node.test, ctx) as ExpressionNode;

        // 2. Check if condition is a literal (result of previous constant folding)
        if (node.test.type === NodeType.Literal) {
            const literal = node.test as LiteralNode;
            const isTrue = Boolean(literal.value);

            this.context.logger.debug(`[${this.name}] Pruning branch based on deterministic condition: ${isTrue}`);

            if (isTrue) {
                // Return only the 'consequent', processing it with current context
                return this.visitNode(node.consequent, ctx);
            } else {
                // Return only the 'alternate', or null if none exists
                return node.alternate ? this.visitNode(node.alternate, ctx) : null;
            }
        }

        // 3. If not deterministic, we must process both branches.
        // Since we don't know which path is taken, the quantum state after the if-statement
        // becomes the "intersection" or "union" of states (usually Mixed/Unknown).
        
        const ctxThen = this.cloneContext(ctx);
        const ctxElse = this.cloneContext(ctx);

        node.consequent = this.visitNode(node.consequent, ctxThen) as StatementNode;
        if (node.alternate) {
            node.alternate = this.visitNode(node.alternate, ctxElse) as StatementNode;
        }

        // Merge states back into the main context
        this.mergeContexts(ctx, ctxThen, ctxElse);

        return node;
    }

    /**
     * Analyzes quantum gates to update the abstract state.
     */
    private analyzeGate(node: QuantumGateNode, ctx: QuantumFlowContext): ASTNode {
        const targetName = node.target.name;
        const currentState = ctx.qubits.get(targetName) || QubitAbstractState.Mixed;

        switch (node.gate.toUpperCase()) {
            case 'X': // Pauli-X (NOT)
                if (currentState === QubitAbstractState.BasisZero) {
                    ctx.qubits.set(targetName, QubitAbstractState.BasisOne);
                } else if (currentState === QubitAbstractState.BasisOne) {
                    ctx.qubits.set(targetName, QubitAbstractState.BasisZero);
                } else {
                    // X on superposition flips phases/amplitudes but remains superposition
                    // X on entangled remains entangled
                }
                break;

            case 'H': // Hadamard
                if (currentState === QubitAbstractState.BasisZero || currentState === QubitAbstractState.BasisOne) {
                    ctx.qubits.set(targetName, QubitAbstractState.Superposition);
                } else if (currentState === QubitAbstractState.Superposition) {
                    // H * H = I, but only if we track exact phases. 
                    // For safety, we assume Mixed unless we implement full amplitude tracking.
                    ctx.qubits.set(targetName, QubitAbstractState.Mixed); 
                }
                break;

            case 'Z': // Pauli-Z
                // Changes phase, does not change basis probability for |0> or |1>
                // State remains effectively same for standard basis measurement prediction
                break;

            case 'CNOT': // Controlled-NOT
                const controlName = node.params[0].name; // Assuming first param is control
                const controlState = ctx.qubits.get(controlName) || QubitAbstractState.Mixed;

                if (controlState === QubitAbstractState.BasisZero) {
                    // Identity operation on target
                } else if (controlState === QubitAbstractState.BasisOne) {
                    // Acts as X gate
                    this.analyzeGate({ ...node, gate: 'X', params: [] }, ctx);
                } else {
                    // Control is Superposition or Entangled -> Target becomes Entangled
                    ctx.qubits.set(targetName, QubitAbstractState.Entangled);
                    ctx.qubits.set(controlName, QubitAbstractState.Entangled);
                }
                break;
            
            case 'RESET':
                ctx.qubits.set(targetName, QubitAbstractState.BasisZero);
                break;

            default:
                // Unknown gate or unitary, assume state becomes Mixed/Unknown
                ctx.qubits.set(targetName, QubitAbstractState.Mixed);
                break;
        }

        return node;
    }

    /**
     * Optimizes measurements if the outcome is deterministic.
     */
    private optimizeMeasurement(node: QuantumMeasurementNode, ctx: QuantumFlowContext): ASTNode {
        const targetName = node.target.name;
        const state = ctx.qubits.get(targetName);

        if (state === QubitAbstractState.BasisZero) {
            this.context.report({
                message: `Measurement of qubit '${targetName}' is deterministically 0. Optimizing.`,
                severity: DiagnosticSeverity.Information,
                node: node
            });
            // Collapse state (redundant here but good for semantics)
            ctx.qubits.set(targetName, QubitAbstractState.CollapsedZero);
            return this.createLiteral(0);
        }

        if (state === QubitAbstractState.BasisOne) {
            this.context.report({
                message: `Measurement of qubit '${targetName}' is deterministically 1. Optimizing.`,
                severity: DiagnosticSeverity.Information,
                node: node
            });
            ctx.qubits.set(targetName, QubitAbstractState.CollapsedOne);
            return this.createLiteral(1);
        }

        // If state is Superposition, Entangled, or Mixed, the result is probabilistic.
        // The measurement collapses the state. Since we can't predict the outcome at compile time,
        // we must assume the state becomes either |0> or |1> (Mixed) for future analysis.
        ctx.qubits.set(targetName, QubitAbstractState.Mixed);

        return node;
    }

    /**
     * Tracks variable assignments to propagate constants from optimized measurements.
     */
    private visitVariableDeclaration(node: any, ctx: QuantumFlowContext): ASTNode {
        if (node.init) {
            node.init = this.visitNode(node.init, ctx);
            
            // If init became a literal, store it in classical vars
            if (node.init.type === NodeType.Literal) {
                ctx.classicalVars.set(node.identifier.name, (node.init as LiteralNode).value);
            } else {
                ctx.classicalVars.delete(node.identifier.name);
            }
        }
        return node;
    }

    /**
     * Helper to create a literal node.
     */
    private createLiteral(value: number): LiteralNode {
        return {
            type: NodeType.Literal,
            value: value,
            raw: value.toString(),
            loc: null // Location lost during optimization
        } as LiteralNode;
    }

    /**
     * Deep clones the analysis context.
     */
    private cloneContext(ctx: QuantumFlowContext): QuantumFlowContext {
        return {
            qubits: new Map(ctx.qubits),
            classicalVars: new Map(ctx.classicalVars)
        };
    }

    /**
     * Merges two contexts (branches) back into the main context.
     * If states differ between branches, the result is Mixed.
     */
    private mergeContexts(target: QuantumFlowContext, branchA: QuantumFlowContext, branchB: QuantumFlowContext): void {
        // Merge Qubits
        const allQubits = new Set([...branchA.qubits.keys(), ...branchB.qubits.keys()]);
        
        for (const q of allQubits) {
            const stateA = branchA.qubits.get(q);
            const stateB = branchB.qubits.get(q);

            if (stateA === stateB) {
                target.qubits.set(q, stateA!);
            } else {
                // If states diverge, we lose deterministic knowledge
                target.qubits.set(q, QubitAbstractState.Mixed);
            }
        }

        // Merge Classical Vars (Intersection)
        target.classicalVars.clear();
        for (const [key, valA] of branchA.classicalVars) {
            if (branchB.classicalVars.has(key) && branchB.classicalVars.get(key) === valA) {
                target.classicalVars.set(key, valA);
            }
        }
    }
}