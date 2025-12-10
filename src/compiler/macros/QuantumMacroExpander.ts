import {
    ASTNode,
    NodeType,
    ProgramNode,
    MacroDefinitionNode,
    MacroCallNode,
    BlockNode,
    StatementNode,
    ExpressionNode,
    IdentifierNode,
    QuantumGateNode,
    IfStatementNode,
    BinaryExpressionNode,
    LiteralNode,
    UnaryExpressionNode
} from '../ast/nodes';
import { CompilerError } from '../errors/CompilerError';

/**
 * Expands Quantum Macros at compile time, handling parameterization 
 * and conditional logic for circuit generation.
 */
export class QuantumMacroExpander {
    private macros: Map<string, MacroDefinitionNode> = new Map();
    private readonly MAX_RECURSION_DEPTH = 100;

    /**
     * Main entry point to expand macros within a program.
     * @param program The AST of the program.
     * @returns A new ProgramNode with all macros expanded.
     */
    public expand(program: ProgramNode): ProgramNode {
        // 1. Register all macro definitions
        this.registerMacros(program);

        // 2. Expand the main body
        const expandedBody = this.expandBlock(program.body, 0);

        return {
            ...program,
            body: expandedBody
        };
    }

    /**
     * Scans the program for macro definitions, stores them, and removes them from the AST.
     */
    private registerMacros(program: ProgramNode): void {
        const cleanBody: StatementNode[] = [];

        for (const statement of program.body) {
            if (statement.type === NodeType.MacroDefinition) {
                const macroDef = statement as MacroDefinitionNode;
                if (this.macros.has(macroDef.name.value)) {
                    throw new CompilerError(
                        `Duplicate macro definition: '${macroDef.name.value}'`,
                        macroDef.loc
                    );
                }
                this.macros.set(macroDef.name.value, macroDef);
            } else {
                cleanBody.push(statement);
            }
        }

        program.body = cleanBody;
    }

    /**
     * Recursively expands a block of statements.
     */
    private expandBlock(statements: StatementNode[], depth: number): StatementNode[] {
        const result: StatementNode[] = [];

        for (const stmt of statements) {
            if (stmt.type === NodeType.MacroCall) {
                const expandedStmts = this.expandMacroCall(stmt as MacroCallNode, depth);
                result.push(...expandedStmts);
            } else if (stmt.type === NodeType.IfStatement) {
                const ifStmt = stmt as IfStatementNode;
                // Recursively expand children blocks
                const expandedIf: IfStatementNode = {
                    ...ifStmt,
                    consequent: {
                        ...ifStmt.consequent,
                        body: this.expandBlock(ifStmt.consequent.body, depth)
                    },
                    alternate: ifStmt.alternate ? {
                        ...ifStmt.alternate,
                        body: this.expandBlock(ifStmt.alternate.body, depth)
                    } : undefined
                };
                result.push(expandedIf);
            } else if (stmt.type === NodeType.Block) {
                const block = stmt as BlockNode;
                const expandedBlock: BlockNode = {
                    ...block,
                    body: this.expandBlock(block.body, depth)
                };
                result.push(expandedBlock);
            } else {
                // Keep other statements (Gates, Measurements, etc.)
                result.push(stmt);
            }
        }

        return result;
    }

    /**
     * Expands a single macro call into a list of statements.
     */
    private expandMacroCall(call: MacroCallNode, depth: number): StatementNode[] {
        if (depth > this.MAX_RECURSION_DEPTH) {
            throw new CompilerError(
                `Maximum macro recursion depth (${this.MAX_RECURSION_DEPTH}) exceeded at macro '${call.name.value}'`,
                call.loc
            );
        }

        const macroDef = this.macros.get(call.name.value);
        if (!macroDef) {
            throw new CompilerError(
                `Undefined macro: '${call.name.value}'`,
                call.loc
            );
        }

        if (call.arguments.length !== macroDef.parameters.length) {
            throw new CompilerError(
                `Macro '${call.name.value}' expects ${macroDef.parameters.length} arguments, but got ${call.arguments.length}`,
                call.loc
            );
        }

        // Map parameters to arguments
        const paramMap = new Map<string, ExpressionNode>();
        macroDef.parameters.forEach((param, index) => {
            paramMap.set(param.value, call.arguments[index]);
        });

        // Substitute parameters in the macro body
        const substitutedBody = this.substituteBlock(macroDef.body.body, paramMap);

        // Recursively expand the substituted body (to handle nested macros)
        return this.expandBlock(substitutedBody, depth + 1);
    }

    /**
     * Substitutes parameters with arguments in a list of statements.
     * Also handles compile-time conditional logic if possible.
     */
    private substituteBlock(statements: StatementNode[], paramMap: Map<string, ExpressionNode>): StatementNode[] {
        const result: StatementNode[] = [];

        for (const stmt of statements) {
            const substituted = this.substituteStatement(stmt, paramMap);
            
            // If substitution resulted in a Block (e.g. from a resolved If), flatten it if desired,
            // or keep it as a block. Here we keep structure but if it's a "NoOp" or empty block we might optimize.
            if (substituted) {
                result.push(substituted);
            }
        }

        return result;
    }

    private substituteStatement(stmt: StatementNode, paramMap: Map<string, ExpressionNode>): StatementNode | null {
        switch (stmt.type) {
            case NodeType.QuantumGate:
                return this.substituteQuantumGate(stmt as QuantumGateNode, paramMap);
            
            case NodeType.MacroCall:
                return this.substituteMacroCallNode(stmt as MacroCallNode, paramMap);
            
            case NodeType.IfStatement:
                return this.resolveIfStatement(stmt as IfStatementNode, paramMap);
            
            case NodeType.Block:
                const block = stmt as BlockNode;
                return {
                    ...block,
                    body: this.substituteBlock(block.body, paramMap)
                };
            
            // Handle other statements (Assignment, Measurement, etc.)
            default:
                // For generic statements, we might need to substitute expressions inside them
                // Assuming a generic 'expression' field or similar exists for other nodes
                // For brevity, we return as is, but in production we'd traverse expressions.
                return stmt;
        }
    }

    private substituteQuantumGate(gate: QuantumGateNode, paramMap: Map<string, ExpressionNode>): QuantumGateNode {
        return {
            ...gate,
            targets: gate.targets.map(t => this.substituteIdentifier(t, paramMap)),
            parameters: gate.parameters.map(p => this.substituteExpression(p, paramMap))
        };
    }

    private substituteMacroCallNode(call: MacroCallNode, paramMap: Map<string, ExpressionNode>): MacroCallNode {
        return {
            ...call,
            arguments: call.arguments.map(arg => this.substituteExpression(arg, paramMap))
        };
    }

    private resolveIfStatement(stmt: IfStatementNode, paramMap: Map<string, ExpressionNode>): StatementNode {
        const substitutedTest = this.substituteExpression(stmt.test, paramMap);

        // Attempt compile-time evaluation
        const staticValue = this.evaluateStaticExpression(substitutedTest);

        if (staticValue !== null) {
            // If condition is statically known, return the corresponding block wrapped in a BlockNode
            // effectively unrolling the logic.
            if (staticValue === true) {
                return {
                    type: NodeType.Block,
                    body: this.substituteBlock(stmt.consequent.body, paramMap),
                    loc: stmt.consequent.loc
                } as BlockNode;
            } else {
                if (stmt.alternate) {
                    return {
                        type: NodeType.Block,
                        body: this.substituteBlock(stmt.alternate.body, paramMap),
                        loc: stmt.alternate.loc
                    } as BlockNode;
                } else {
                    // Return an empty block if false and no alternate
                    return {
                        type: NodeType.Block,
                        body: [],
                        loc: stmt.loc
                    } as BlockNode;
                }
            }
        }

        // If not static, return the IfStatement with substituted expressions
        return {
            ...stmt,
            test: substitutedTest,
            consequent: {
                ...stmt.consequent,
                body: this.substituteBlock(stmt.consequent.body, paramMap)
            },
            alternate: stmt.alternate ? {
                ...stmt.alternate,
                body: this.substituteBlock(stmt.alternate.body, paramMap)
            } : undefined
        };
    }

    private substituteExpression(expr: ExpressionNode, paramMap: Map<string, ExpressionNode>): ExpressionNode {
        if (expr.type === NodeType.Identifier) {
            const id = expr as IdentifierNode;
            if (paramMap.has(id.value)) {
                // Clone the argument to avoid reference sharing issues
                return JSON.parse(JSON.stringify(paramMap.get(id.value)));
            }
            return expr;
        }

        if (expr.type === NodeType.BinaryExpression) {
            const bin = expr as BinaryExpressionNode;
            return {
                ...bin,
                left: this.substituteExpression(bin.left, paramMap),
                right: this.substituteExpression(bin.right, paramMap)
            };
        }

        if (expr.type === NodeType.UnaryExpression) {
            const un = expr as UnaryExpressionNode;
            return {
                ...un,
                argument: this.substituteExpression(un.argument, paramMap)
            };
        }

        return expr;
    }

    private substituteIdentifier(id: IdentifierNode, paramMap: Map<string, ExpressionNode>): IdentifierNode {
        const sub = paramMap.get(id.value);
        if (sub) {
            if (sub.type === NodeType.Identifier) {
                return JSON.parse(JSON.stringify(sub));
            }
            // If a macro expects a qubit (Identifier) but gets a complex expression, 
            // it's likely a semantic error, but we return the expression cast as Identifier 
            // if the AST structure allows it, or throw. 
            // For this expander, we assume the caller passed a valid identifier.
            // If not, we return the original ID to let the semantic analyzer catch it later.
            return id; 
        }
        return id;
    }

    /**
     * Tries to evaluate an expression to a boolean or number at compile time.
     * Returns null if the expression cannot be statically evaluated.
     */
    private evaluateStaticExpression(expr: ExpressionNode): boolean | number | null {
        if (expr.type === NodeType.Literal) {
            return (expr as LiteralNode).value;
        }

        if (expr.type === NodeType.BinaryExpression) {
            const bin = expr as BinaryExpressionNode;
            const left = this.evaluateStaticExpression(bin.left);
            const right = this.evaluateStaticExpression(bin.right);

            if (left === null || right === null) return null;

            switch (bin.operator) {
                case '+': return (left as number) + (right as number);
                case '-': return (left as number) - (right as number);
                case '*': return (left as number) * (right as number);
                case '/': return (left as number) / (right as number);
                case '>': return left > right;
                case '<': return left < right;
                case '>=': return left >= right;
                case '<=': return left <= right;
                case '==': return left === right;
                case '!=': return left !== right;
                case '&&': return (left as boolean) && (right as boolean);
                case '||': return (left as boolean) || (right as boolean);
            }
        }

        if (expr.type === NodeType.UnaryExpression) {
            const un = expr as UnaryExpressionNode;
            const arg = this.evaluateStaticExpression(un.argument);
            if (arg === null) return null;

            if (un.operator === '!') return !arg;
            if (un.operator === '-') return -(arg as number);
        }

        return null;
    }
}