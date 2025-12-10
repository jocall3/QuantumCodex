import { ASTNode, NodeType, Program, BlockStatement, Statement, Expression, BinaryExpression, VariableDeclaration, Identifier, FunctionDeclaration } from '../ast/Nodes';
import { Diagnostic, DiagnosticLevel, DiagnosticSource } from '../diagnostics/Diagnostic';
import { SymbolTable, SymbolFlags } from '../symbols/SymbolTable';
import { TypeChecker } from './TypeChecker';

/**
 * Represents the chirality (handedness) of a code entity within the .u language.
 * - Left: Represents 'sinister' or negative spin entities.
 * - Right: Represents 'dexter' or positive spin entities.
 * - Neutral: Represents balanced or non-polarized entities.
 */
export enum Chirality {
    Left = -1,
    Neutral = 0,
    Right = 1
}

/**
 * Context for tracking symmetry balance within a scope.
 */
interface SymmetryContext {
    balance: number;
    scopeId: string;
    parent?: SymmetryContext;
    enforceConservation: boolean;
}

/**
 * Static analysis tool to enforce Chiral Code Symmetry rules within `chiral_scope` blocks.
 * 
 * Rules of Chiral Symmetry in .u:
 * 1. Conservation: The net chirality of a `chiral_scope` must be Neutral (0) upon exit.
 * 2. Interaction: Binary operations between opposing chiralities result in Neutral (Annihilation).
 * 3. Interaction: Binary operations between same chiralities amplify the chirality.
 * 4. Assignment: A variable of specific chirality can only be assigned a value of matching chirality, 
 *    unless an explicit `transmute` operator is used.
 */
export class ChiralSymmetryChecker {
    private diagnostics: Diagnostic[] = [];
    private symbolTable: SymbolTable;
    private currentContext: SymmetryContext | null = null;

    constructor(symbolTable: SymbolTable) {
        this.symbolTable = symbolTable;
    }

    /**
     * Entry point for the analysis.
     * @param program The root of the AST.
     * @returns A list of diagnostics found during analysis.
     */
    public analyze(program: Program): Diagnostic[] {
        this.diagnostics = [];
        this.currentContext = {
            balance: 0,
            scopeId: 'global',
            enforceConservation: false
        };

        this.visit(program);
        return this.diagnostics;
    }

    private visit(node: ASTNode): void {
        if (!node) return;

        switch (node.type) {
            case NodeType.BlockStatement:
                this.visitBlock(node as BlockStatement);
                break;
            case NodeType.VariableDeclaration:
                this.visitVariableDeclaration(node as VariableDeclaration);
                break;
            case NodeType.BinaryExpression:
                this.visitBinaryExpression(node as BinaryExpression);
                break;
            case NodeType.FunctionDeclaration:
                this.visitFunctionDeclaration(node as FunctionDeclaration);
                break;
            default:
                // Traverse children for other nodes
                this.visitChildren(node);
                break;
        }
    }

    private visitChildren(node: ASTNode): void {
        const children = Object.values(node).filter(val => 
            typeof val === 'object' && val !== null && (val.type || Array.isArray(val))
        );

        for (const child of children) {
            if (Array.isArray(child)) {
                child.forEach(c => this.visit(c));
            } else {
                this.visit(child as ASTNode);
            }
        }
    }

    private visitBlock(block: BlockStatement): void {
        const isChiralScope = block.modifiers?.includes('chiral_scope');
        
        const previousContext = this.currentContext;
        this.currentContext = {
            balance: 0,
            scopeId: `block_${block.id}`,
            parent: previousContext,
            enforceConservation: isChiralScope || (previousContext?.enforceConservation ?? false)
        };

        // Visit all statements in the block
        for (const stmt of block.statements) {
            this.visit(stmt);
        }

        // Enforce conservation rule at the end of the scope
        if (isChiralScope && this.currentContext.balance !== 0) {
            this.report(
                block,
                `Chiral Symmetry Broken: Net chirality is ${this.currentContext.balance}. A chiral_scope must resolve to Neutral (0).`,
                DiagnosticLevel.Error
            );
        }

        // Propagate residual balance to parent if not a strict boundary, 
        // otherwise the balance is contained (and checked) here.
        if (!isChiralScope && previousContext) {
            previousContext.balance += this.currentContext.balance;
        }

        this.currentContext = previousContext;
    }

    private visitVariableDeclaration(decl: VariableDeclaration): void {
        // Determine chirality of the initializer
        let initChirality = Chirality.Neutral;
        if (decl.initializer) {
            initChirality = this.resolveChirality(decl.initializer);
        }

        // Check explicit type annotation for chirality constraints
        const declaredChirality = this.getChiralityFromType(decl.typeAnnotation);
        
        if (declaredChirality !== Chirality.Neutral && initChirality !== Chirality.Neutral) {
            if (declaredChirality !== initChirality) {
                this.report(
                    decl,
                    `Chiral Mismatch: Cannot assign ${Chirality[initChirality]} value to ${Chirality[declaredChirality]} variable '${decl.id.name}'.`,
                    DiagnosticLevel.Error
                );
            }
        }

        // Register variable in symbol table with its chirality
        const finalChirality = declaredChirality !== Chirality.Neutral ? declaredChirality : initChirality;
        this.symbolTable.setSymbolAttribute(decl.id.name, 'chirality', finalChirality);

        // Update context balance
        if (this.currentContext) {
            this.currentContext.balance += finalChirality;
        }
    }

    private visitBinaryExpression(expr: BinaryExpression): void {
        const leftChirality = this.resolveChirality(expr.left);
        const rightChirality = this.resolveChirality(expr.right);

        // Interaction rules
        // If we are in a chiral scope, we might want to enforce specific operator interactions
        // For now, we just calculate the resulting spin for the expression (which might be used by a parent node)
        
        // Note: Binary expressions themselves don't alter the scope balance permanently 
        // unless they are part of an assignment or a statement that consumes them.
        // However, we check for illegal interactions here.

        if (this.currentContext?.enforceConservation) {
            // Example Rule: Cannot multiply opposing chiralities directly without a buffer
            if (expr.operator === '*' && leftChirality === -rightChirality && leftChirality !== 0) {
                this.report(
                    expr,
                    `Unstable Interaction: Direct multiplication of opposing chiralities detected. Use a 'stabilize' block.`,
                    DiagnosticLevel.Warning
                );
            }
        }
        
        this.visit(expr.left);
        this.visit(expr.right);
    }

    private visitFunctionDeclaration(func: FunctionDeclaration): void {
        // Functions act as boundaries. We analyze the body, but the balance doesn't leak out 
        // unless the function is marked as 'chiral_operator'.
        
        const previousContext = this.currentContext;
        this.currentContext = {
            balance: 0,
            scopeId: `func_${func.id.name}`,
            parent: previousContext,
            enforceConservation: func.modifiers?.includes('chiral_invariant') ?? false
        };

        this.visit(func.body);

        if (this.currentContext.enforceConservation && this.currentContext.balance !== 0) {
            this.report(
                func,
                `Chiral Invariance Broken: Function '${func.id.name}' is marked invariant but has net chirality ${this.currentContext.balance}.`,
                DiagnosticLevel.Error
            );
        }

        this.currentContext = previousContext;
    }

    /**
     * Resolves the chirality of an expression.
     */
    private resolveChirality(expr: Expression): Chirality {
        if (!expr) return Chirality.Neutral;

        switch (expr.type) {
            case NodeType.Identifier:
                const name = (expr as Identifier).name;
                return this.symbolTable.getSymbolAttribute(name, 'chirality') as Chirality || Chirality.Neutral;
            
            case NodeType.Literal:
                // Literals are generally neutral unless suffixed (e.g. 1L, 1R - hypothetical syntax)
                // Assuming standard literals are neutral.
                return Chirality.Neutral;

            case NodeType.BinaryExpression:
                const binExpr = expr as BinaryExpression;
                const left = this.resolveChirality(binExpr.left);
                const right = this.resolveChirality(binExpr.right);
                return this.computeInteraction(left, right, binExpr.operator);

            case NodeType.CallExpression:
                // Function calls might return chiral values.
                // For now, assume neutral or lookup return type.
                return Chirality.Neutral; 

            default:
                return Chirality.Neutral;
        }
    }

    /**
     * Computes the resulting chirality of an operation.
     */
    private computeInteraction(left: Chirality, right: Chirality, op: string): Chirality {
        // Addition adds spins
        if (op === '+' || op === '-') {
            const sum = left + (op === '-' ? -right : right);
            if (sum > 0) return Chirality.Right;
            if (sum < 0) return Chirality.Left;
            return Chirality.Neutral;
        }
        
        // Multiplication flips spin if negative? 
        // Let's define: L * L = R, R * R = R, L * R = L (Like signs)
        // This is just a hypothetical rule for the .u language.
        if (op === '*') {
            return (left * right) as Chirality;
        }

        return Chirality.Neutral;
    }

    private getChiralityFromType(typeAnnotation: any): Chirality {
        if (!typeAnnotation) return Chirality.Neutral;
        // Assuming typeAnnotation has a name or metadata
        const typeName = typeAnnotation.name || '';
        
        if (typeName.endsWith('L') || typeName === 'Sinister') return Chirality.Left;
        if (typeName.endsWith('R') || typeName === 'Dexter') return Chirality.Right;
        
        return Chirality.Neutral;
    }

    private report(node: ASTNode, message: string, level: DiagnosticLevel): void {
        this.diagnostics.push({
            message,
            level,
            source: DiagnosticSource.ChiralAnalysis,
            location: node.loc,
            code: 'CHIRAL_001'
        });
    }
}