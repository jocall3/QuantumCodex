import { Token, TokenType } from '../lexer/Token';
import { TokenStream } from '../lexer/TokenStream';
import {
    ExpressionNode,
    TypeNode,
    IdentifierNode,
} from '../ast/nodes';
import { ParserError } from '../errors/ParserError';
import { BaseParser } from './BaseParser';
import { TypeParser } from './TypeParser';
import { IExpressionParser } from './interfaces/IExpressionParser';

//================================================================================
// AST Node Interfaces for Polarization-Dependent Syntax
//================================================================================

/**
 * Represents a polarized type, such as `polarized<bool>`.
 * This is a wrapper type that indicates the base type has quantum properties.
 */
export interface PolarizedTypeNode extends TypeNode {
    kind: 'PolarizedType';
    /** The inner, classical type being polarized, e.g., `bool` in `polarized<bool>`. */
    baseType: TypeNode;
}

/**
 * Represents a basis state literal, such as `|0>` or `|+>`.
 * This is an expression used to initialize a polarized variable to a specific quantum state.
 */
export interface BasisLiteralNode extends ExpressionNode {
    kind: 'BasisLiteral';
    /** The identifier of the state, e.g., "0", "1", "+", "-". */
    state: string;
}

/**
 * Represents a measurement operation, e.g., `measure_z(q)`.
 * This is an expression that resolves to a classical value by measuring a polarized variable.
 */
export interface MeasurementExpressionNode extends ExpressionNode {
    kind: 'MeasurementExpression';
    /** The basis of measurement, e.g., 'x', 'y', 'z'. */
    basis: IdentifierNode;
    /** The polarized variable or expression being measured. */
    target: ExpressionNode;
}


//================================================================================
// Polarization Syntax Parser
//================================================================================

/**
 * Parses syntax elements related to the `polarized` type system.
 * This includes type specifiers (`polarized<T>`), basis-state literals (`|0>`),
 * and basis-aware operations like measurement (`measure_z(...)`).
 *
 * It is designed to be used by a primary parser which delegates to this
 * class when polarization-specific keywords or tokens are encountered.
 */
export class PolarizationSyntaxParser extends BaseParser {
    private typeParser: TypeParser;
    private expressionParser: IExpressionParser;

    /**
     * Creates an instance of PolarizationSyntaxParser.
     * @param tokenStream The stream of tokens to parse.
     * @param expressionParser A reference to the main expression parser to handle nested expressions.
     */
    constructor(tokenStream: TokenStream, expressionParser: IExpressionParser) {
        super(tokenStream);
        this.typeParser = new TypeParser(tokenStream);
        this.expressionParser = expressionParser;
    }

    /**
     * Checks if the current token stream position is the start of a polarized type.
     * This is the entry point for delegation from a parent parser.
     * @returns {boolean} True if the current token is the identifier 'polarized'.
     */
    public isPolarizedTypeStart(): boolean {
        const token = this.peek();
        return token.type === TokenType.Identifier && token.value === 'polarized';
    }

    /**
     * Parses a polarized type specifier, e.g., `polarized<bool>`.
     * It consumes tokens from `polarized` to the closing `>`.
     * @returns {PolarizedTypeNode} The AST node for the polarized type.
     * @throws {ParserError} If the syntax is incorrect.
     */
    public parsePolarizedType(): PolarizedTypeNode {
        const startToken = this.expectValue(TokenType.Identifier, 'polarized', "Expected 'polarized' keyword.");

        this.expect(TokenType.LessThan, "Expected '<' after 'polarized' to specify the base type.");

        if (this.peek().type === TokenType.GreaterThan) {
            throw new ParserError("Expected a base type inside polarized<T> but found '>'.", this.peek());
        }

        const baseType = this.typeParser.parseType();

        this.expect(TokenType.GreaterThan, "Expected '>' to close the polarized type specifier.");

        return {
            kind: 'PolarizedType',
            baseType,
            token: startToken,
        };
    }

    /**
     * Checks if the current token indicates the start of a basis literal.
     * @returns {boolean} True if the current token is '|'.
     */
    public isBasisLiteralStart(): boolean {
        return this.peek().type === TokenType.Pipe;
    }

    /**
     * Parses a basis literal, e.g., `|0>`, `|+>`.
     * It consumes tokens from `|` to `>`.
     * @returns {BasisLiteralNode} The AST node for the basis literal.
     * @throws {ParserError} If the syntax is incorrect.
     */
    public parseBasisLiteral(): BasisLiteralNode {
        const startToken = this.expect(TokenType.Pipe, "Expected '|' to start a basis literal.");

        // The state can be a number, identifier, or an operator symbol like '+' or '-'.
        // We accept a limited set of token types for flexibility.
        const stateToken = this.peek();
        if (
            stateToken.type !== TokenType.IntegerLiteral &&
            stateToken.type !== TokenType.Identifier &&
            stateToken.type !== TokenType.Plus &&
            stateToken.type !== TokenType.Minus
        ) {
            throw new ParserError(
                `Invalid token '${stateToken.value}' for basis state. Expected a state identifier like '0', '1', '+', or '-'.`,
                stateToken
            );
        }
        this.consume(); // Consume the state token.

        this.expect(TokenType.GreaterThan, "Expected '>' to end the basis literal.");

        return {
            kind: 'BasisLiteral',
            state: stateToken.value,
            token: startToken,
        };
    }

    /**
     * Checks if the current token is the start of a measurement expression,
     * which is an identifier starting with `measure_`.
     * @returns {boolean} True if the token matches the measurement function pattern.
     */
    public isMeasurementExpressionStart(): boolean {
        const token = this.peek();
        return token.type === TokenType.Identifier && token.value.startsWith('measure_');
    }

    /**
     * Parses a measurement expression, e.g., `measure_z(q)`.
     * It consumes the entire function call syntax.
     * @returns {MeasurementExpressionNode} The AST node for the measurement expression.
     * @throws {ParserError} If the syntax is incorrect.
     */
    public parseMeasurementExpression(): MeasurementExpressionNode {
        const measureToken = this.consume(); // e.g., 'measure_z'
        const basisStr = measureToken.value.substring(8);

        if (basisStr.length === 0) {
             throw new ParserError(`Invalid measurement function '${measureToken.value}'. A basis must be specified, e.g., 'measure_x'.`, measureToken);
        }

        // Create a synthetic IdentifierNode for the basis.
        // In a real implementation, we might want to adjust token positions for more accurate source mapping.
        const basisIdentifier: IdentifierNode = {
            kind: 'Identifier',
            name: basisStr,
            token: { ...measureToken, value: basisStr },
        };

        this.expect(TokenType.LeftParen, `Expected '(' after measurement function '${measureToken.value}'.`);

        const target = this.expressionParser.parseExpression();

        this.expect(TokenType.RightParen, `Expected ')' to close measurement call for '${measureToken.value}'.`);

        return {
            kind: 'MeasurementExpression',
            basis: basisIdentifier,
            target: target,
            token: measureToken,
        };
    }
}