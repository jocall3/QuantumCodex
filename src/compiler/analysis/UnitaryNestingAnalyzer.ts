/**
 * @file src/compiler/analysis/UnitaryNestingAnalyzer.ts
 * @description Analyzes nested quantum functions to optimize the composition of unitary operators.
 *
 * This compiler pass walks the Abstract Syntax Tree (AST) to identify patterns
 * of nested function calls where all functions in the chain are declared as `unitary`.
 * For example, an expression like `H(X(q))` would be identified.
 *
 * Once such a chain is found, it is replaced by a single `ComposedUnitaryNode`.
 * This new node represents the mathematical composition of all the unitary operators
 * in the chain. This transformation allows the backend (e.g., the quantum circuit
 * synthesizer or the code generator) to treat the sequence as a single logical operation.
 *
 * This optimization is crucial for:
 * 1. Reducing circuit depth: A synthesized unitary can often be implemented more
 *    efficiently than the sequence of individual gates.
 * 2. Improving performance: Fewer nodes in the AST and fewer operations to process
 *    in later compiler stages.
 * 3. Enabling advanced synthesis: Backends can use techniques like KAK decomposition
 *    or other synthesis algorithms on the composed unitary.
 *
 * This analyzer primarily targets single-argument unitary functions, which is the
 * most common pattern for quantum gate application on a single qubit or register.
 */

import {
    ASTNode,
    ProgramNode,
    FunctionCallNode,
    IdentifierNode,
    ExpressionNode,
    ComposedUnitaryNode,
    StatementNode,
    BlockStatementNode,
    ExpressionStatementNode,
    ReturnStatementNode,
    IfStatementNode,
    FunctionDeclarationNode,
} from '../parser/ast';
import { ASTVisitor } from '../utils/ASTVisitor';
import { SymbolTable, FunctionSymbol, SymbolType } from '../symbols/SymbolTable';

/**
 * Represents a detected chain of nested unitary function calls,
 * culminating in a final target expression (e.g., a qubit register).
 */
interface UnitaryChain {
    functions: IdentifierNode[];
    target: ExpressionNode;
}

/**
 * Traverses the AST to find and replace nested calls to unitary functions
 * with a single `ComposedUnitaryNode`.
 */
export class UnitaryNestingAnalyzer extends ASTVisitor<ASTNode> {
    private hasChanges: boolean = false;

    /**
     * @param symbolTable The symbol table populated by a previous semantic analysis pass.
     *                    It's used to verify if a function is indeed unitary.
     */
    constructor(private readonly symbolTable: SymbolTable) {
        super();
    }

    /**
     * Analyzes the entire AST for nested unitary calls.
     * This is the main entry point for the analyzer pass.
     * @param program The root node of the AST.
     * @returns The transformed AST with nested calls optimized.
     */
    public analyze(program: ProgramNode): ProgramNode {
        this.hasChanges = false;
        const transformedProgram = this.visit(program) as ProgramNode;

        // Note: In a more complex compiler, this pass might be run multiple times
        // until no more changes are detected, as one optimization can create
        // opportunities for another. For this implementation, a single pass is sufficient.
        
        return transformedProgram;
    }

    /**
     * Overrides the default visit method to return the node itself if no specific
     * visitor method modifies it. This is crucial for AST transformation where
     * nodes are replaced.
     * @param node The node to visit.
     * @returns The original or a transformed ASTNode.
     */
    protected visit(node: ASTNode): ASTNode {
        // The `super.visit(node)` call will dispatch to the specific `visit<NodeType>` method.
        // If a transformation occurs, the specific method returns a new node.
        // If not, it returns the original node (or nothing). We default to returning the original.
        return super.visit(node) ?? node;
    }

    /**
     * Visits a function call node, the primary target for this optimization.
     * @param node The function call node from the AST.
     * @returns A `ComposedUnitaryNode` if optimization is performed, otherwise the original `FunctionCallNode`.
     */
    public visitFunctionCall(node: FunctionCallNode): ASTNode {
        // First, recursively visit the arguments. This ensures that optimizations
        // are applied from the inside out. For `F(G(H(q)))`, `G(H(q))` will be
        // processed before `F(...)`.
        node.args = node.args.map(arg => this.visit(arg) as ExpressionNode);

        const chain = this.extractUnitaryChain(node);

        // A chain of length 1 is just a single call, no nesting to optimize.
        // We only act if we find two or more nested calls.
        if (chain && chain.functions.length > 1) {
            this.hasChanges = true;
            
            // Replace the entire nested call structure with a single node
            // representing the composed operation.
            const composedNode = new ComposedUnitaryNode(
                chain.functions,
                chain.target,
                node.location
            );
            
            // The symbol and implementation for this new composed operation will be
            // handled by later compiler passes like synthesis or code generation.
            return composedNode;
        }

        // No optimization was possible for this node, return it as is
        // (though its arguments may have been transformed).
        return node;
    }

    /**
     * Recursively unwraps a `FunctionCallNode` to extract a chain of nested
     * unitary function calls.
     * @param node The AST node to analyze, starting with a `FunctionCallNode`.
     * @returns A `UnitaryChain` object if a valid chain is found, otherwise `null`.
     */
    private extractUnitaryChain(node: ASTNode): UnitaryChain | null {
        if (!(node instanceof FunctionCallNode)) {
            return null; // The chain ends here, this is the target.
        }

        // We only handle direct function calls by name (e.g., `H(q)` not `get_gate("H")(q)`).
        if (!(node.callee instanceof IdentifierNode)) {
            return null;
        }
        const callee: IdentifierNode = node.callee;

        const symbol = this.symbolTable.lookup(callee.name);

        // The function must be a known, unitary function.
        if (
            !symbol ||
            symbol.type !== SymbolType.Function ||
            !(symbol as FunctionSymbol).isUnitary
        ) {
            return null;
        }

        // This optimization is focused on the common case of single-argument gates.
        // Extending this to multi-argument functions would require more complex analysis
        // to ensure the composition is valid (e.g., matching qubit counts).
        if (node.args.length !== 1) {
            return null;
        }

        const arg = node.args[0];

        // Recurse on the argument to see if it's another link in the chain.
        const nestedChain = this.extractUnitaryChain(arg);

        if (nestedChain) {
            // An inner chain was found. Prepend the current function to it.
            return {
                functions: [callee, ...nestedChain.functions],
                target: nestedChain.target,
            };
        } else {
            // The argument is not another optimizable unitary call.
            // This marks the end of the chain. The argument is the final target.
            return {
                functions: [callee],
                target: arg,
            };
        }
    }

    // --- Standard Visitor Traversal Methods ---
    // These methods ensure that the analyzer visits all parts of the AST
    // where a FunctionCallNode might appear.

    public visitProgram(node: ProgramNode): ASTNode {
        node.body = node.body.map(stmt => this.visit(stmt) as StatementNode);
        return node;
    }

    public visitFunctionDeclaration(node: FunctionDeclarationNode): ASTNode {
        if (node.body) {
            node.body = this.visit(node.body) as BlockStatementNode;
        }
        return node;
    }

    public visitBlockStatement(node: BlockStatementNode): ASTNode {
        node.statements = node.statements.map(stmt => this.visit(stmt) as StatementNode);
        return node;
    }

    public visitExpressionStatement(node: ExpressionStatementNode): ASTNode {
        node.expression = this.visit(node.expression) as ExpressionNode;
        return node;
    }

    public visitReturnStatement(node: ReturnStatementNode): ASTNode {
        if (node.argument) {
            node.argument = this.visit(node.argument) as ExpressionNode;
        }
        return node;
    }

    public visitIfStatement(node: IfStatementNode): ASTNode {
        node.test = this.visit(node.test) as ExpressionNode;
        node.consequent = this.visit(node.consequent) as StatementNode;
        if (node.alternate) {
            node.alternate = this.visit(node.alternate) as StatementNode;
        }
        return node;
    }

    // Other visitor methods for loops, assignments, etc., would follow a similar pattern,
    // ensuring that expressions within them are visited. The base ASTVisitor handles
    // generic traversal, but explicit implementations can provide clarity and control.
}