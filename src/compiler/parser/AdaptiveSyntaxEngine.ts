// src/compiler/parser/AdaptiveSyntaxEngine.ts

/**
 * @file Engine for Adaptive Evolution of Syntax, allowing dynamic loading and definition of new language constructs.
 * @author AI Programmer
 * @project u-lang
 */

// --- Preliminary Type Definitions ---
// In a mature project, these would be imported from dedicated files (e.g., 'common/tokens.ts', 'ast/nodes.ts')

/**
 * Represents a single token produced by the lexer.
 */
export interface Token {
    type: string;
    lexeme: string;
    literal: any;
    line: number;
    column: number;
}

/**
 * Base interface for all Abstract Syntax Tree (AST) nodes.
 */
export interface ASTNode {
    type: string;
    line: number;
    column: number;
}

/**
 * Represents the root of the AST, a collection of statements.
 */
export interface ProgramNode extends ASTNode {
    type: 'Program';
    body: ASTNode[];
}

// --- Parser-specific Interfaces and Types ---

/**
 * A function that parses a complete statement. It is passed the engine instance
 * to access parsing helper methods.
 */
export type StatementParser = (parser: AdaptiveSyntaxEngine) => ASTNode;

/**
 * A parselet for tokens that appear at the beginning of an expression,
 * such as literals, identifiers, or unary prefix operators.
 */
export interface PrefixParselet {
    parse(parser: AdaptiveSyntaxEngine, token: Token): ASTNode;
}

/**
 * A parselet for tokens that appear in the middle of an expression,
 * such as binary operators or function call parentheses.
 */
export interface InfixParselet {
    /**
     * Parses the expression, given the left-hand side that has already been parsed.
     * @param parser The main parser engine instance.
     * @param left The AST node for the expression on the left of the token.
     * @param token The token representing the infix operator.
     */
    parse(parser: AdaptiveSyntaxEngine, left: ASTNode, token: Token): ASTNode;

    /**
     * Returns the precedence of this infix operator, which controls the order of operations.
     */
    getPrecedence(): number;
}

/**
 * Custom error class for parsing failures.
 */
export class ParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ParseError';
    }
}


/**
 * The core engine for parsing the .u language. It uses a Pratt parser design
 * that allows for the dynamic registration of syntax rules at runtime,
 * making the language's syntax extensible and adaptive.
 */
export class AdaptiveSyntaxEngine {
    private tokens: Token[] = [];
    private current: number = 0;

    private readonly statementParsers = new Map<string, StatementParser>();
    private readonly prefixParselets = new Map<string, PrefixParselet>();
    private readonly infixParselets = new Map<string, InfixParselet>();

    /**
     * Registers a parser for a top-level statement.
     * The parser is keyed by the token type that begins the statement (e.g., 'LET', 'IF').
     * @param tokenType The type of the token that identifies the statement.
     * @param parser The function that will parse this statement.
     */
    public registerStatement(tokenType: string, parser: StatementParser): void {
        if (this.statementParsers.has(tokenType)) {
            console.warn(`[AdaptiveSyntaxEngine] Overwriting existing statement parser for token type: ${tokenType}`);
        }
        this.statementParsers.set(tokenType, parser);
    }

    /**
     * Registers a prefix parselet for a given token type.
     * Prefix parselets handle literals, identifiers, unary operators, grouping, etc.
     * @param tokenType The type of the token.
     * @param parselet The parselet instance to handle this token in a prefix position.
     */
    public registerPrefix(tokenType: string, parselet: PrefixParselet): void {
        if (this.prefixParselets.has(tokenType)) {
            console.warn(`[AdaptiveSyntaxEngine] Overwriting existing prefix parselet for token type: ${tokenType}`);
        }
        this.prefixParselets.set(tokenType, parselet);
    }

    /**
     * Registers an infix parselet for a given token type.
     * Infix parselets handle binary operators, function calls, member access, etc.
     * @param tokenType The type of the token.
     * @param parselet The parselet instance to handle this token in an infix position.
     */
    public registerInfix(tokenType: string, parselet: InfixParselet): void {
        if (this.infixParselets.has(tokenType)) {
            console.warn(`[AdaptiveSyntaxEngine] Overwriting existing infix parselet for token type: ${tokenType}`);
        }
        this.infixParselets.set(tokenType, parselet);
    }

    /**
     * The main entry point for the parser.
     * Takes a stream of tokens and attempts to build an AST.
     * @param tokens The array of tokens from the lexer.
     * @returns The root ProgramNode of the generated AST.
     */
    public parse(tokens: Token[]): ProgramNode {
        this.tokens = tokens.filter(t => t.type !== 'WHITESPACE' && t.type !== 'COMMENT'); // Ignore non-essential tokens
        this.current = 0;
        const statements: ASTNode[] = [];

        while (!this.isAtEnd()) {
            try {
                statements.push(this.parseDeclaration());
            } catch (error) {
                if (error instanceof ParseError) {
                    // In a real compiler, you'd have a more sophisticated error reporting system.
                    console.error(error.message);
                    this.synchronize();
                } else {
                    // Re-throw unexpected errors
                    throw error;
                }
            }
        }

        const firstToken = tokens[0] || { line: 1, column: 1 };
        return {
            type: 'Program',
            body: statements,
            line: firstToken.line,
            column: firstToken.column,
        };
    }

    /**
     * Parses a single top-level declaration or statement.
     * This is the main dispatcher for the statement-level grammar.
     */
    private parseDeclaration(): ASTNode {
        const currentToken = this.peek();
        const statementParser = this.statementParsers.get(currentToken.type);

        if (statementParser) {
            return statementParser(this);
        }

        // If no specific statement parser is found, assume it's an expression statement.
        return this.parseExpressionStatement();
    }

    /**
     * Parses an expression statement (e.g., `myFunction();` or `x = 5;`).
     * This is a common fallback for statement parsing.
     */
    private parseExpressionStatement(): ASTNode {
        const startToken = this.peek();
        const expr = this.parseExpression();
        
        // This can be made adaptive, but a semicolon is a common requirement.
        this.consume('SEMICOLON', 'Expected \';\' after expression.');

        return {
            type: 'ExpressionStatement',
            expression: expr,
            line: startToken.line,
            column: startToken.column,
        } as ASTNode & { expression: ASTNode };
    }

    /**
     * Parses an expression using a Pratt parser (precedence climbing) algorithm.
     * This method is public so that parselets can call it recursively.
     * @param precedence The minimum precedence level to parse.
     * @returns The parsed expression as an ASTNode.
     */
    public parseExpression(precedence: number = 0): ASTNode {
        const token = this.advance();
        const prefix = this.prefixParselets.get(token.type);

        if (!prefix) {
            throw this.error(token, `Unexpected token '${token.lexeme}'. No prefix parselet found for type '${token.type}'.`);
        }

        let left = prefix.parse(this, token);

        while (precedence < this.getInfixPrecedence()) {
            const infixToken = this.advance();
            const infix = this.infixParselets.get(infixToken.type);
            if (!infix) {
                // This should not happen if getInfixPrecedence is correct, but is a safeguard.
                throw this.error(infixToken, `Unexpected token '${infixToken.lexeme}'. No infix parselet found for type '${infixToken.type}'.`);
            }
            left = infix.parse(this, left, infixToken);
        }

        return left;
    }

    // --- Parser State & Token Stream Helpers ---

    public match(...types: string[]): boolean {
        for (const type of types) {
            if (this.check(type)) {
                this.advance();
                return true;
            }
        }
        return false;
    }

    public consume(type: string, message: string): Token {
        if (this.check(type)) return this.advance();
        throw this.error(this.peek(), message);
    }

    public check(type: string): boolean {
        if (this.isAtEnd()) return false;
        return this.peek().type === type;
    }

    public advance(): Token {
        if (!this.isAtEnd()) this.current++;
        return this.previous();
    }

    public isAtEnd(): boolean {
        return this.peek().type === 'EOF';
    }

    public peek(): Token {
        return this.tokens[this.current];
    }

    public previous(): Token {
        return this.tokens[this.current - 1];
    }

    private getInfixPrecedence(): number {
        if (this.isAtEnd()) return 0;
        const nextToken = this.peek();
        const infix = this.infixParselets.get(nextToken.type);
        return infix ? infix.getPrecedence() : 0;
    }

    /**
     * Advances the parser until it finds a likely statement boundary,
     * used for recovering from a syntax error.
     */
    private synchronize(): void {
        this.advance();
        while (!this.isAtEnd()) {
            if (this.previous().type === 'SEMICOLON') return;

            // Check if the next token is a likely start of a new statement
            if (this.statementParsers.has(this.peek().type)) {
                return;
            }
            
            this.advance();
        }
    }

    /**
     * Creates a formatted ParseError.
     */
    public error(token: Token, message: string): ParseError {
        const location = token.type === 'EOF' ? 'at end' : `at '${token.lexeme}'`;
        const errorMessage = `[line ${token.line}, col ${token.column}] Error ${location}: ${message}`;
        return new ParseError(errorMessage);
    }
}