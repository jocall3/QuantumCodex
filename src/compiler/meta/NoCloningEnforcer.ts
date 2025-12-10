import { 
    ASTNode, 
    NodeType, 
    Identifier, 
    MetaBlock, 
    VariableDeclaration, 
    CallExpression, 
    AssignmentExpression,
    FunctionDeclaration,
    MetaExpression
} from '../../ast/nodes';
import { CompilerContext } from '../../core/context';
import { DiagnosticCode, DiagnosticLevel } from '../../diagnostics/definitions';
import { Symbol, SymbolFlags } from '../../symbols/symbol';
import { TypeKind } from '../../types/definitions';

/**
 * Represents the state of a linear or quantum resource within a specific scope.
 */
enum ResourceState {
    /** The resource is available for use. */
    Available = 0,
    /** The resource has been consumed (moved or measured) and cannot be used again. */
    Consumed = 1,
    /** The resource has been borrowed (if borrowing is supported), implying restricted usage. */
    Borrowed = 2
}

/**
 * Tracking record for a specific symbol within the analysis flow.
 */
interface ResourceRecord {
    symbol: Symbol;
    name: string;
    state: ResourceState;
    declarationNode: ASTNode;
    lastUsageNode?: ASTNode;
}

/**
 * Compiler module that enforces the No-Cloning Theorem within metaprogramming constructs.
 * 
 * In the .u language, quantum types (linear types) cannot be copied. This enforcer
 * specifically analyzes meta-blocks, macros, and quoted expressions to ensure that
 * code generation templates do not violate linearity by duplicating references to
 * quantum states.
 */
export class NoCloningEnforcer {
    private context: CompilerContext;
    private scopeStack: Map<string, ResourceRecord>[] = [];

    constructor(context: CompilerContext) {
        this.context = context;
    }

    /**
     * Validates a metaprogramming construct (e.g., a macro definition or a meta-block)
     * to ensure no quantum resources are cloned in the generated AST.
     * 
     * @param node The root node of the meta-construct to analyze.
     */
    public validate(node: ASTNode): void {
        this.pushScope();
        try {
            this.traverse(node);
        } finally {
            this.popScope();
        }
    }

    /**
     * Pushes a new tracking scope for variable usage.
     */
    private pushScope(): void {
        this.scopeStack.push(new Map<string, ResourceRecord>());
    }

    /**
     * Pops the current tracking scope.
     */
    private popScope(): void {
        this.scopeStack.pop();
    }

    /**
     * Retrieves the current scope map.
     */
    private getCurrentScope(): Map<string, ResourceRecord> {
        return this.scopeStack[this.scopeStack.length - 1];
    }

    /**
     * Looks up a resource record by name, searching from the current scope upwards.
     */
    private getResource(name: string): ResourceRecord | undefined {
        for (let i = this.scopeStack.length - 1; i >= 0; i--) {
            if (this.scopeStack[i].has(name)) {
                return this.scopeStack[i].get(name);
            }
        }
        return undefined;
    }

    /**
     * Registers a new linear/quantum resource in the current scope.
     */
    private registerResource(symbol: Symbol, node: ASTNode): void {
        if (!this.isLinearType(symbol)) {
            return;
        }

        const scope = this.getCurrentScope();
        scope.set(symbol.name, {
            symbol,
            name: symbol.name,
            state: ResourceState.Available,
            declarationNode: node
        });
    }

    /**
     * Marks a resource as consumed. If it is already consumed, reports a violation.
     */
    private consumeResource(name: string, node: ASTNode): void {
        const record = this.getResource(name);
        
        // If the variable isn't tracked (e.g., global constant or non-linear), ignore.
        if (!record) return;

        if (record.state === ResourceState.Consumed) {
            this.reportCloningViolation(record, node);
        } else {
            record.state = ResourceState.Consumed;
            record.lastUsageNode = node;
        }
    }

    /**
     * Determines if a symbol represents a linear or quantum type that is subject to no-cloning.
     */
    private isLinearType(symbol: Symbol): boolean {
        // Check for explicit Quantum flag or TypeKind
        if ((symbol.flags & SymbolFlags.Quantum) !== 0) {
            return true;
        }
        if (symbol.type && symbol.type.kind === TypeKind.Quantum) {
            return true;
        }
        // Check for generic linear type annotation if applicable
        if (symbol.type && symbol.type.isLinear) {
            return true;
        }
        return false;
    }

    /**
     * Reports a diagnostic error when the No-Cloning Theorem is violated.
     */
    private reportCloningViolation(record: ResourceRecord, node: ASTNode): void {
        this.context.diagnostics.report({
            level: DiagnosticLevel.Error,
            code: DiagnosticCode.NoCloningViolation,
            message: `Violation of No-Cloning Theorem: Quantum resource '${record.name}' is used multiple times within a meta-construct.`,
            node: node,
            relatedInformation: record.lastUsageNode ? [{
                location: record.lastUsageNode.location,
                message: `Resource '${record.name}' was previously consumed here.`
            }] : undefined
        });
    }

    /**
     * Recursive traversal of the AST to track resource usage.
     */
    private traverse(node: ASTNode): void {
        if (!node) return;

        switch (node.kind) {
            case NodeType.MetaBlock:
            case NodeType.MetaQuote:
                // Meta blocks create a new isolation scope for linearity checks
                // to ensure captured variables aren't duplicated in the template.
                this.pushScope();
                this.visitChildren(node);
                this.popScope();
                break;

            case NodeType.FunctionDeclaration:
            case NodeType.MetaMacro:
                this.handleFunctionScope(node as FunctionDeclaration);
                break;

            case NodeType.VariableDeclaration:
                this.handleVariableDeclaration(node as VariableDeclaration);
                break;

            case NodeType.Identifier:
                this.handleIdentifier(node as Identifier);
                break;

            case NodeType.AssignmentExpression:
                this.handleAssignment(node as AssignmentExpression);
                break;

            case NodeType.CallExpression:
                this.handleCall(node as CallExpression);
                break;

            case NodeType.IfStatement:
                this.handleBranching(node);
                break;

            default:
                this.visitChildren(node);
                break;
        }
    }

    /**
     * Handles function or macro definitions, registering parameters as resources.
     */
    private handleFunctionScope(node: FunctionDeclaration): void {
        this.pushScope();
        
        // Register parameters
        if (node.parameters) {
            for (const param of node.parameters) {
                if (param.symbol) {
                    this.registerResource(param.symbol, param);
                }
            }
        }

        // Visit body
        if (node.body) {
            this.traverse(node.body);
        }
        
        this.popScope();
    }

    /**
     * Handles variable declarations.
     */
    private handleVariableDeclaration(node: VariableDeclaration): void {
        // Visit initializer first (RHS consumes resources)
        if (node.initializer) {
            this.traverse(node.initializer);
        }

        // Register the new variable (LHS creates resource)
        if (node.symbol) {
            this.registerResource(node.symbol, node);
        }
    }

    /**
     * Handles identifiers, which usually imply usage/consumption of a resource.
     */
    private handleIdentifier(node: Identifier): void {
        // In a meta-context, referencing a variable usually means splicing it into code.
        // If it's a quantum variable, it can only be spliced once.
        this.consumeResource(node.name, node);
    }

    /**
     * Handles assignments.
     */
    private handleAssignment(node: AssignmentExpression): void {
        // RHS is consumed
        this.traverse(node.right);

        // LHS: If we are assigning TO a variable, we might be overwriting a linear resource.
        // In strict linear logic, you cannot overwrite a live linear variable without consuming it first.
        // However, for this specific enforcer, we focus on the usage of the RHS resources.
        // We traverse LHS only if it contains computed properties (e.g. array indices) that consume resources.
        if (node.left.kind !== NodeType.Identifier) {
            this.traverse(node.left);
        }
    }

    /**
     * Handles function calls.
     */
    private handleCall(node: CallExpression): void {
        this.traverse(node.callee);
        for (const arg of node.arguments) {
            this.traverse(arg);
        }
    }

    /**
     * Handles branching (If/Else).
     * Note: Linear logic in branches is complex. A resource must be consumed in BOTH branches
     * or NEITHER branch to maintain linearity upon exit.
     * 
     * For this meta-enforcer, we simplify: we check for double-usage within any path.
     * We clone the scope state for branches to detect local violations, 
     * then merge states (intersection of consumption) - strictly, this requires a more complex
     * control flow analysis (CFG). 
     * 
     * For the purpose of "No Cloning", we ensure that *within* the meta-construct, 
     * no path clones the variable.
     */
    private handleBranching(node: any): void {
        // Simple traversal for now; a full CFG analysis would be needed for strict "must consume" logic.
        // Here we focus on "must not clone".
        this.traverse(node.test);
        
        // We snapshot the state before branches to ensure independence of paths regarding cloning?
        // Actually, if we use 'x' in 'if' and 'x' in 'else', that is valid (x is consumed in one path).
        // But if we use 'x' in 'test' and 'x' in 'then', that is invalid.
        
        // Since this is a single-pass AST walker, handling branching correctly requires state forking.
        // We will implement a simplified check: traverse children normally. 
        // WARNING: This is a conservative approximation. It might flag false positives 
        // (e.g. using x in then and else) if we don't fork state.
        
        // To do this correctly without full CFG:
        const startState = this.snapshotScope();

        if (node.consequent) {
            this.traverse(node.consequent);
        }

        // Restore state for the alternate branch, because usage in 'then' does not preclude usage in 'else'
        // (They are mutually exclusive paths).
        const consequentState = this.snapshotScope();
        this.restoreScope(startState);

        if (node.alternate) {
            this.traverse(node.alternate);
        }
        
        // After the if statement, the state is the union of consumption?
        // For "No Cloning" (safety), we are mostly concerned that it wasn't cloned *before* the split.
        // We merge the states: if consumed in either, it's consumed.
        this.mergeScopes(consequentState);
    }

    private snapshotScope(): Map<string, ResourceRecord> {
        // Deep copy the current scope's records
        const current = this.getCurrentScope();
        const snapshot = new Map<string, ResourceRecord>();
        for (const [key, val] of current.entries()) {
            snapshot.set(key, { ...val });
        }
        return snapshot;
    }

    private restoreScope(snapshot: Map<string, ResourceRecord>): void {
        const current = this.getCurrentScope();
        // We only restore the state enum, not the whole map structure (assuming variables don't vanish)
        for (const [key, val] of snapshot.entries()) {
            if (current.has(key)) {
                current.get(key)!.state = val.state;
                current.get(key)!.lastUsageNode = val.lastUsageNode;
            }
        }
    }

    private mergeScopes(otherBranchState: Map<string, ResourceRecord>): void {
        const current = this.getCurrentScope();
        for (const [key, val] of otherBranchState.entries()) {
            if (current.has(key)) {
                const currentRecord = current.get(key)!;
                // If it was consumed in the other branch, mark it consumed here too
                // This is a "must consume in all paths" approximation or "consumed in at least one"
                // For safety (preventing reuse after if), we mark as consumed if consumed in any branch.
                if (val.state === ResourceState.Consumed) {
                    currentRecord.state = ResourceState.Consumed;
                    currentRecord.lastUsageNode = val.lastUsageNode; // Point to one of the usages
                }
            }
        }
    }

    /**
     * Generic helper to visit all children of a node.
     */
    private visitChildren(node: ASTNode): void {
        const keys = Object.keys(node);
        for (const key of keys) {
            // Skip parent references or metadata
            if (key === 'parent' || key === 'location' || key === 'kind') continue;

            const child = (node as any)[key];
            if (Array.isArray(child)) {
                for (const c of child) {
                    if (this.isASTNode(c)) {
                        this.traverse(c);
                    }
                }
            } else if (this.isASTNode(child)) {
                this.traverse(child);
            }
        }
    }

    private isASTNode(obj: any): obj is ASTNode {
        return obj && typeof obj === 'object' && 'kind' in obj;
    }
}