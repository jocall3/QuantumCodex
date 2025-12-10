/**
 * @file src/compiler/grammar/DualSpaceParser.ts
 * @description The core parser for the Dual-Space Grammar Engine, capable of
 * context-switching between classical and quantum syntax rules.
 */

import { Token } from '../lexer/Token';
import { TokenType } from '../lexer/TokenType';
import * as AST from '../ast/nodes';
import { ParseError } from '../errors/ParseError';

/**
 * Represents the current parsing context or "space".
 * The parser's behavior changes depending on which space is active.
 */
export enum ParserSpace {
    CLASSICAL,
    QUANTUM,
}

/**
 * The DualSpaceParser consumes a stream of tokens and produces an Abstract Syntax Tree (AST).
 * Its key feature is the ability to switch between CLASSICAL and QUANTUM parsing contexts,
 * typically initiated by a `quantum { ... }` block.
 */
export class DualSpaceParser {
    private readonly tokens: Token[];
    private current: number = 0;
    private space: ParserSpace = ParserSpace.CLASSICAL;

    constructor(tokens: Token[]) {
        this.tokens = tokens;
    }

    /**
     * The main entry point for the parser. It parses the entire token stream
     * and returns the root of the AST.
     * @returns {AST.Program} The root Program node of the AST.
     */
    public parse(): AST.Program {
        const statements: AST.Statement[] = [];
        while (!this.isAtEnd()) {
            try {
                statements.push(this.declaration());
            } catch (error) {
                if (error instanceof ParseError) {
                    // In a real compiler, we would collect these errors in an error reporter.
                    // For now, we log and synchronize to continue parsing.
                    console.error(error.message);
                    this.synchronize();
                } else {
                    // Re-throw unexpected, non-parser errors.
                    throw error;
                }
            }
        }
        return new AST.Program(statements);
    }

    // --- Dispatcher Methods ---

    /**
     * Parses a declaration. The available declarations depend on the current space.
     */
    private declaration(): AST.Statement {
        if (this.space === ParserSpace.CLASSICAL) {
            if (this.match(TokenType.FN)) return this.functionDeclaration('function');
            if (this.match(TokenType.LET)) return this.variableDeclaration();
        } else { // Quantum Space
            if (this.match(TokenType.QUBIT)) return this.qubitDeclaration();
            if (this.match(TokenType.QREG)) return this.qregDeclaration();
        }
        
        // Statements are a subset of declarations and can exist in both spaces.
        return this.statement();
    }

    /**
     * Parses a statement.
     */
    private statement(): AST.Statement {
        if (this.match(TokenType.QUANTUM)) return this.quantumBlock();
        if (this.match(TokenType.IF)) return this.ifStatement();
        if (this.match(TokenType.WHILE)) return this.whileStatement();
        if (this.match(TokenType.RETURN)) return this.returnStatement();
        if (this.match(TokenType.LEFT_BRACE)) return new AST.BlockStatement(this.block());

        // In quantum space, an identifier at the start of a statement is likely a gate application.
        if (this.space === ParserSpace.QUANTUM && this.check(TokenType.IDENTIFIER)) {
             return this.gateApplicationStatement();
        }

        return this.expressionStatement();
    }

    // --- Space-Switching ---

    /**
     * Parses a `quantum { ... }` block, switching the parser's context to
     * QUANTUM space for the duration of the block.
     */
    private quantumBlock(): AST.QuantumBlockStatement {
        const keyword = this.previous();
        this.consume(TokenType.LEFT_BRACE, "Expect '{' after 'quantum' keyword.");
        
        const previousSpace = this.space;
        this.space = ParserSpace.QUANTUM;
        
        let statements: AST.Statement[] = [];
        try {
            // The block() method will parse statements within the new QUANTUM context.
            statements = this.block();
        } finally {
            // CRITICAL: Always restore the previous space, even if an error occurs.
            this.space = previousSpace;
        }

        return new AST.QuantumBlockStatement(keyword, statements);
    }

    // --- Quantum-Specific Parsers ---

    private qubitDeclaration(): AST.QubitDeclaration {
        const keyword = this.previous();
        const identifier = this.consume(TokenType.IDENTIFIER, "Expect qubit name.");
        this.consume(TokenType.SEMICOLON, "Expect ';' after qubit declaration.");
        return new AST.QubitDeclaration(keyword, identifier);
    }

    private qregDeclaration(): AST.QregDeclaration {
        const keyword = this.previous();
        const identifier = this.consume(TokenType.IDENTIFIER, "Expect quantum register name.");
        this.consume(TokenType.LEFT_BRACKET, "Expect '[' to specify register size.");
        const size = this.expression();
        this.consume(TokenType.RIGHT_BRACKET, "Expect ']' after register size.");
        this.consume(TokenType.SEMICOLON, "Expect ';' after quantum register declaration.");
        return new AST.QregDeclaration(keyword, identifier, size);
    }

    private gateApplicationStatement(): AST.ExpressionStatement {
        const expression = this.gateApplication();
        this.consume(TokenType.SEMICOLON, "Expect ';' after gate application.");
        return new AST.ExpressionStatement(expression);
    }

    /**
     * Parses a quantum gate application, e.g., `H q0;` or `CNOT q0, q1;` or `RZ(pi/2) q0;`.
     */
    private gateApplication(): AST.Expression {
        const gateIdentifier = this.consume(TokenType.IDENTIFIER, "Expect gate name.");
        let gate: AST.Expression = new AST.VariableExpression(gateIdentifier);

        // Handle parameterized gates like RZ(angle) by parsing a call expression.
        if (this.match(TokenType.LEFT_PAREN)) {
            gate = this.finishCall(gate);
        }

        const targets: AST.Expression[] = [];
        do {
            // Targets can be identifiers (qubits/qregs) or other primary expressions.
            targets.push(this.primary());
        } while (this.match(TokenType.COMMA));

        if (targets.length === 0) {
            throw this.error(this.peek(), "Expect at least one target qubit or qreg for a gate application.");
        }

        return new AST.GateApplicationExpression(gate, targets);
    }
    
    // --- Classical-Specific Parsers ---

    private functionDeclaration(kind: 'function'): AST.FunctionStatement {
        const name = this.consume(TokenType.IDENTIFIER, `Expect ${kind} name.`);
        this.consume(TokenType.LEFT_PAREN, `Expect '(' after ${kind} name.`);
        const params: Token[] = [];
        if (!this.check(TokenType.RIGHT_PAREN)) {
            do {
                if (params.length >= 255) {
                    this.error(this.peek(), "Can't have more than 255 parameters.");
                }
                params.push(this.consume(TokenType.IDENTIFIER, "Expect parameter name."));
            } while (this.match(TokenType.COMMA));
        }
        this.consume(TokenType.RIGHT_PAREN, "Expect ')' after parameters.");
        this.consume(TokenType.LEFT_BRACE, `Expect '{' before ${kind} body.`);
        const body = this.block();
        return new AST.FunctionStatement(name, params, body);
    }

    private variableDeclaration(): AST.VariableDeclaration {
        const name = this.consume(TokenType.IDENTIFIER, "Expect variable name.");
        let initializer: AST.Expression | null = null;
        if (this.match(TokenType.EQUAL)) {
            initializer = this.expression();
        }
        this.consume(TokenType.SEMICOLON, "Expect ';' after variable declaration.");
        return new AST.VariableDeclaration(name, initializer);
    }

    // --- Common Statement Parsers ---

    private block(): AST.Statement[] {
        const statements: AST.Statement[] = [];
        while (!this.check(TokenType.RIGHT_BRACE) && !this.isAtEnd()) {
            statements.push(this.declaration());
        }
        this.consume(TokenType.RIGHT_BRACE, "Expect '}' after block.");
        return statements;
    }

    private ifStatement(): AST.IfStatement {
        this.consume(TokenType.LEFT_PAREN, "Expect '(' after 'if'.");
        const condition = this.expression();
        this.consume(TokenType.RIGHT_PAREN, "Expect ')' after if condition.");

        const thenBranch = this.statement();
        let elseBranch: AST.Statement | null = null;
        if (this.match(TokenType.ELSE)) {
            elseBranch = this.statement();
        }

        return new AST.IfStatement(condition, thenBranch, elseBranch);
    }

    private whileStatement(): AST.WhileStatement {
        this.consume(TokenType.LEFT_PAREN, "Expect '(' after 'while'.");
        const condition = this.expression();
        this.consume(TokenType.RIGHT_PAREN, "Expect ')' after condition.");
        const body = this.statement();
        return new AST.WhileStatement(condition, body);
    }

    private returnStatement(): AST.ReturnStatement {
        const keyword = this.previous();
        let value: AST.Expression | null = null;
        if (!this.check(TokenType.SEMICOLON)) {
            value = this.expression();
        }
        this.consume(TokenType.SEMICOLON, "Expect ';' after return value.");
        return new AST.ReturnStatement(keyword, value);
    }

    private expressionStatement(): AST.ExpressionStatement {
        const expr = this.expression();
        this.consume(TokenType.SEMICOLON, "Expect ';' after expression.");
        return new AST.ExpressionStatement(expr);
    }

    // --- Expression Parsing (Pratt Parser with Precedence Climbing) ---

    private expression(): AST.Expression {
        return this.assignment();
    }

    private assignment(): AST.Expression {
        const expr = this.or();

        if (this.match(TokenType.EQUAL)) {
            const equals = this.previous();
            const value = this.assignment();

            if (expr instanceof AST.VariableExpression) {
                const name = expr.name;
                return new AST.AssignmentExpression(name, value);
            } else if (expr instanceof AST.GetExpression) {
                return new AST.SetExpression(expr.object, expr.name, value);
            }

            this.error(equals, "Invalid assignment target.");
        }

        return expr;
    }
    
    private or(): AST.Expression {
        let expr = this.and();
        while (this.match(TokenType.OR)) {
            const operator = this.previous();
            const right = this.and();
            expr = new AST.LogicalExpression(expr, operator, right);
        }
        return expr;
    }

    private and(): AST.Expression {
        let expr = this.equality();
        while (this.match(TokenType.AND)) {
            const operator = this.previous();
            const right = this.equality();
            expr = new AST.LogicalExpression(expr, operator, right);
        }
        return expr;
    }

    private equality(): AST.Expression {
        let expr = this.comparison();
        while (this.match(TokenType.BANG_EQUAL, TokenType.EQUAL_EQUAL)) {
            const operator = this.previous();
            const right = this.comparison();
            expr = new AST.BinaryExpression(expr, operator, right);
        }
        return expr;
    }

    private comparison(): AST.Expression {
        let expr = this.term();
        while (this.match(TokenType.GREATER, TokenType.GREATER_EQUAL, TokenType.LESS, TokenType.LESS_EQUAL)) {
            const operator = this.previous();
            const right = this.term();
            expr = new AST.BinaryExpression(expr, operator, right);
        }
        return expr;
    }

    private term(): AST.Expression {
        let expr = this.factor();
        while (this.match(TokenType.MINUS, TokenType.PLUS)) {
            const operator = this.previous();
            const right = this.factor();
            expr = new AST.BinaryExpression(expr, operator, right);
        }
        return expr;
    }

    private factor(): AST.Expression {
        let expr = this.unary();
        while (this.match(TokenType.SLASH, TokenType.STAR)) {
            const operator = this.previous();
            const right = this.unary();
            expr = new AST.BinaryExpression(expr, operator, right);
        }
        return expr;
    }

    private unary(): AST.Expression {
        if (this.match(TokenType.BANG, TokenType.MINUS)) {
            const operator = this.previous();
            const right = this.unary();
            return new AST.UnaryExpression(operator, right);
        }
        return this.call();
    }

    private call(): AST.Expression {
        let expr = this.primary();

        while (true) {
            if (this.match(TokenType.LEFT_PAREN)) {
                expr = this.finishCall(expr);
            } else if (this.match(TokenType.DOT)) {
                const name = this.consume(TokenType.IDENTIFIER, "Expect property name after '.'.");
                expr = new AST.GetExpression(expr, name);
            } else {
                break;
            }
        }

        return expr;
    }

    private finishCall(callee: AST.Expression): AST.Expression {
        const args: AST.Expression[] = [];
        if (!this.check(TokenType.RIGHT_PAREN)) {
            do {
                if (args.length >= 255) {
                    this.error(this.peek(), "Can't have more than 255 arguments.");
                }
                args.push(this.expression());
            } while (this.match(TokenType.COMMA));
        }

        const paren = this.consume(TokenType.RIGHT_PAREN, "Expect ')' after arguments.");
        return new AST.CallExpression(callee, paren, args);
    }

    private primary(): AST.Expression {
        if (this.match(TokenType.FALSE)) return new AST.LiteralExpression(false);
        if (this.match(TokenType.TRUE)) return new AST.LiteralExpression(true);
        if (this.match(TokenType.NIL)) return new AST.LiteralExpression(null);

        if (this.match(TokenType.NUMBER, TokenType.STRING)) {
            return new AST.LiteralExpression(this.previous().literal);
        }

        if (this.match(TokenType.IDENTIFIER)) {
            return new AST.VariableExpression(this.previous());
        }

        if (this.match(TokenType.LEFT_PAREN)) {
            const expr = this.expression();
            this.consume(TokenType.RIGHT_PAREN, "Expect ')' after expression.");
            return new AST.GroupingExpression(expr);
        }

        // Measurement is a primary expression only available in quantum space.
        if (this.space === ParserSpace.QUANTUM && this.match(TokenType.MEASURE)) {
            return this.measurementExpression();
        }

        throw this.error(this.peek(), "Expect expression.");
    }

    private measurementExpression(): AST.MeasurementExpression {
        const keyword = this.previous();
        const target = this.primary(); // e.g., a qubit identifier
        return new AST.MeasurementExpression(keyword, target);
    }

    // --- Utility and Error Handling Methods ---

    private match(...types: TokenType[]): boolean {
        for (const type of types) {
            if (this.check(type)) {
                this.advance();
                return true;
            }
        }
        return false;
    }

    private consume(type: TokenType, message: string): Token {
        if (this.check(type)) return this.advance();
        throw this.error(this.peek(), message);
    }

    private check(type: TokenType): boolean {
        if (this.isAtEnd()) return false;
        return this.peek().type === type;
    }

    private advance(): Token {
        if (!this.isAtEnd()) this.current++;
        return this.previous();
    }

    private isAtEnd(): boolean {
        return this.peek().type === TokenType.EOF;
    }

    private peek(): Token {
        return this.tokens[this.current];
    }

    private previous(): Token {
        return this.tokens[this.current - 1];
    }

    private error(token: Token, message: string): ParseError {
        const errorMessage = `[line ${token.line}] Error${token.type === TokenType.EOF ? ' at end' : ` at '${token.lexeme}'`}: ${message}`;
        return new ParseError(errorMessage);
    }

    /**
     * Recovers from a parse error by advancing until it finds a likely
     * statement boundary. This prevents the parser from halting on the first
     * error and allows it to report multiple errors in a single pass.
     */
    private synchronize(): void {
        this.advance();

        while (!this.isAtEnd()) {
            if (this.previous().type === TokenType.SEMICOLON) return;

            switch (this.peek().type) {
                case TokenType.FN:
                case TokenType.LET:
                case TokenType.QUBIT:
                case TokenType.QREG:
                case TokenType.IF:
                case TokenType.WHILE:
                case TokenType.RETURN:
                case TokenType.QUANTUM:
                    return;
            }

            this.advance();
        }
    }
}