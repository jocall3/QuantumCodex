/**
 * @fileoverview Implements the parser which consumes the token stream from the lexer.
 * It will build the initial Abstract Syntax Tree (AST) according to the Dual-Space Grammar,
 * creating a hierarchical representation of the code.
 */

import { TokenType } from '../lexer/token.js';

/**
 * Represents a node in the Abstract Syntax Tree.
 * @class
 */
class AstNode {
    /**
     * @param {string} type The type of the AST node.
     */
    constructor(type) {
        this.type = type;
    }
}

// --- AST Node Definitions ---

export class Program extends AstNode {
    /**
     * @param {AstNode[]} body An array of statements.
     */
    constructor(body) {
        super('Program');
        this.body = body;
    }
}

export class CommandStatement extends AstNode {
    /**
     * @param {Identifier} command The command to execute.
     * @param {AstNode[]} args The arguments, options, and redirections for the command.
     */
    constructor(command, args) {
        super('CommandStatement');
        this.command = command;
        this.args = args;
    }
}

export class PipelineStatement extends AstNode {
    /**
     * @param {CommandStatement[]} commands An array of commands in the pipeline.
     */
    constructor(commands) {
        super('PipelineStatement');
        this.commands = commands;
    }
}

export class ContentBlock extends AstNode {
    /**
     * @param {Identifier} tagName The name of the tag.
     * @param {Attribute[]} attributes An array of attributes.
     * @param {AstNode[]} children An array of child nodes.
     * @param {boolean} selfClosing Whether the tag is self-closing.
     */
    constructor(tagName, attributes, children, selfClosing = false) {
        super('ContentBlock');
        this.tagName = tagName;
        this.attributes = attributes;
        this.children = children;
        this.selfClosing = selfClosing;
    }
}

export class Attribute extends AstNode {
    /**
     * @param {Identifier} name The attribute name.
     * @param {Literal} value The attribute value.
     */
    constructor(name, value) {
        super('Attribute');
        this.name = name;
        this.value = value;
    }
}

export class TextNode extends AstNode {
    /**
     * @param {string} value The text content.
     */
    constructor(value) {
        super('TextNode');
        this.value = value;
    }
}

export class Identifier extends AstNode {
    /**
     * @param {string} name The identifier name.
     */
    constructor(name) {
        super('Identifier');
        this.name = name;
    }
}

export class Literal extends AstNode {
    /**
     * @param {string|number|boolean} value The literal value.
     */
    constructor(value) {
        super('Literal');
        this.value = value;
    }
}

export class Redirection extends AstNode {
    /**
     * @param {string} operator The redirection operator (e.g., '>', '>>', '<').
     * @param {Identifier|Literal} target The target of the redirection.
     */
    constructor(operator, target) {
        super('Redirection');
        this.operator = operator;
        this.target = target;
    }
}

// --- Parser Error ---

class ParseError extends Error {}

// --- The Parser ---

/**
 * The Parser for the Dual-Space Grammar.
 * It constructs an AST from a stream of tokens.
 */
export class Parser {
    /**
     * @param {import('../lexer/token.js').Token[]} tokens The array of tokens from the lexer.
     */
    constructor(tokens) {
        this.tokens = tokens;
        this.current = 0;
    }

    /**
     * Main parsing method.
     * @returns {Program} The root of the AST.
     */
    parse() {
        const body = [];
        while (!this.isAtEnd()) {
            try {
                body.push(this.statement());
            } catch (error) {
                if (error instanceof ParseError) {
                    console.error(error);
                    this.synchronize();
                } else {
                    throw error;
                }
            }
        }
        return new Program(body);
    }

    // --- Statement Parsers ---

    /**
     * Parses a single statement. This is the entry point for the "Dual-Space" logic.
     * @returns {AstNode}
     */
    statement() {
        if (this.peek().type === TokenType.LEFT_ANGLE) {
            return this.contentBlock();
        }
        // Anything else is treated as a command or pipeline
        return this.commandPipeline();
    }

    /**
     * Parses a command pipeline (e.g., `ls -l | grep .js`).
     * @returns {PipelineStatement|CommandStatement}
     */
    commandPipeline() {
        let command = this.commandStatement();
        const commands = [command];

        while (this.match(TokenType.PIPE)) {
            const nextCommand = this.commandStatement();
            commands.push(nextCommand);
        }
        
        // If there's only one command, don't wrap it in a PipelineStatement
        if (commands.length === 1) {
            return commands[0];
        }

        return new PipelineStatement(commands);
    }

    /**
     * Parses a single command statement (e.g., `echo "hello" > file.txt`).
     * @returns {CommandStatement}
     */
    commandStatement() {
        const commandToken = this.consume(TokenType.IDENTIFIER, "Expect command name.");
        const command = new Identifier(commandToken.lexeme);
        const args = [];

        while (!this.isAtEnd() && !this.check(TokenType.NEWLINE) && !this.check(TokenType.PIPE)) {
            if (this.check(TokenType.GREATER) || this.check(TokenType.DOUBLE_GREATER) || this.check(TokenType.LESS)) {
                args.push(this.redirection());
            } else {
                args.push(this.argument());
            }
        }
        
        // Consume the trailing newline if it exists
        this.match(TokenType.NEWLINE);

        return new CommandStatement(command, args);
    }

    /**
     * Parses a command argument, which can be a literal or an identifier.
     * @returns {Literal|Identifier}
     */
    argument() {
        if (this.match(TokenType.STRING, TokenType.NUMBER)) {
            return new Literal(this.previous().literal);
        }
        if (this.match(TokenType.IDENTIFIER, TokenType.DASH, TokenType.DOUBLE_DASH)) {
            // This handles simple identifiers, flags (-f), and options (--file)
            return new Identifier(this.previous().lexeme);
        }
        
        // Handle cases like `-f=value` or `--file=value`
        if (this.peek().type === TokenType.IDENTIFIER && this.peekNext().type === TokenType.EQUAL) {
            const identifier = this.advance();
            this.advance(); // consume '='
            const value = this.argument();
            return new Identifier(`${identifier.lexeme}=${value.value || value.name}`);
        }

        throw this.error(this.peek(), "Expect argument.");
    }

    /**
     * Parses an I/O redirection.
     * @returns {Redirection}
     */
    redirection() {
        const operatorToken = this.advance(); // Consumes '>', '>>', or '<'
        const targetToken = this.consume(TokenType.IDENTIFIER, "Expect redirection target.");
        const target = new Identifier(targetToken.lexeme);
        return new Redirection(operatorToken.lexeme, target);
    }

    /**
     * Parses a content block, similar to an HTML/XML element.
     * @returns {ContentBlock}
     */
    contentBlock() {
        this.consume(TokenType.LEFT_ANGLE, "Expect '<' to start a content block.");
        const tagName = new Identifier(this.consume(TokenType.IDENTIFIER, "Expect tag name.").lexeme);
        const attributes = [];

        while (!this.check(TokenType.RIGHT_ANGLE) && !this.check(TokenType.SLASH)) {
            attributes.push(this.attribute());
        }

        const selfClosing = this.match(TokenType.SLASH);
        this.consume(TokenType.RIGHT_ANGLE, "Expect '>' or '/>' to close tag.");

        if (selfClosing) {
            return new ContentBlock(tagName, attributes, [], true);
        }

        const children = [];
        while (!this.isAtEnd() && !(this.check(TokenType.LEFT_ANGLE) && this.peekNext().type === TokenType.SLASH)) {
            if (this.check(TokenType.TEXT_CONTENT)) {
                children.push(new TextNode(this.advance().lexeme));
            } else {
                children.push(this.statement());
            }
        }

        // Consume closing tag
        this.consume(TokenType.LEFT_ANGLE, `Expect closing tag for <${tagName.name}>.`);
        this.consume(TokenType.SLASH, `Expect '/' in closing tag for <${tagName.name}>.`);
        const closingTagName = this.consume(TokenType.IDENTIFIER, "Expect tag name in closing tag.");
        if (closingTagName.lexeme !== tagName.name) {
            throw this.error(closingTagName, `Mismatched closing tag. Expected </${tagName.name}> but got </${closingTagName.lexeme}>.`);
        }
        this.consume(TokenType.RIGHT_ANGLE, "Expect '>' to close tag.");

        return new ContentBlock(tagName, attributes, children);
    }

    /**
     * Parses a key-value attribute for a content block.
     * @returns {Attribute}
     */
    attribute() {
        const name = new Identifier(this.consume(TokenType.IDENTIFIER, "Expect attribute name.").lexeme);
        this.consume(TokenType.EQUAL, "Expect '=' after attribute name.");
        const value = new Literal(this.consume(TokenType.STRING, "Expect string literal for attribute value.").literal);
        return new Attribute(name, value);
    }

    // --- Utility Methods ---

    /**
     * Checks if the current token is of the given type without consuming it.
     * @param {TokenType} type The token type to check for.
     * @returns {boolean}
     */
    check(type) {
        if (this.isAtEnd()) return false;
        return this.peek().type === type;
    }

    /**
     * Consumes the current token and advances the parser.
     * @returns {import('../lexer/token.js').Token} The consumed token.
     */
    advance() {
        if (!this.isAtEnd()) this.current++;
        return this.previous();
    }

    /**
     * Checks if the parser has reached the end of the token stream.
     * @returns {boolean}
     */
    isAtEnd() {
        return this.peek().type === TokenType.EOF;
    }

    /**
     * Returns the current token without consuming it.
     * @returns {import('../lexer/token.js').Token}
     */
    peek() {
        return this.tokens[this.current];
    }
    
    /**
     * Returns the next token without consuming it.
     * @returns {import('../lexer/token.js').Token}
     */
    peekNext() {
        if (this.isAtEnd()) return this.peek();
        return this.tokens[this.current + 1];
    }

    /**
     * Returns the previously consumed token.
     * @returns {import('../lexer/token.js').Token}
     */
    previous() {
        return this.tokens[this.current - 1];
    }

    /**
     * Checks if the current token matches any of the given types. If so, consumes it.
     * @param {...TokenType} types The token types to match.
     * @returns {boolean} True if a match was found and the token was consumed.
     */
    match(...types) {
        for (const type of types) {
            if (this.check(type)) {
                this.advance();
                return true;
            }
        }
        return false;
    }

    /**
     * Consumes the current token if it's of the expected type, otherwise throws an error.
     * @param {TokenType} type The expected token type.
     * @param {string} message The error message to throw if the type doesn't match.
     * @returns {import('../lexer/token.js').Token} The consumed token.
     */
    consume(type, message) {
        if (this.check(type)) return this.advance();
        throw this.error(this.peek(), message);
    }

    /**
     * Creates a ParseError.
     * @param {import('../lexer/token.js').Token} token The token where the error occurred.
     * @param {string} message The error message.
     * @returns {ParseError}
     */
    error(token, message) {
        const errorMessage = `[line ${token.line}] Error at '${token.lexeme}': ${message}`;
        return new ParseError(errorMessage);
    }

    /**
     * Recovers from a parse error by advancing until a likely statement boundary.
     */
    synchronize() {
        this.advance();

        while (!this.isAtEnd()) {
            if (this.previous().type === TokenType.NEWLINE) return;

            switch (this.peek().type) {
                // These tokens often start a new statement.
                case TokenType.IDENTIFIER:
                case TokenType.LEFT_ANGLE:
                    return;
            }

            this.advance();
        }
    }
}