/**
 * @file Implements the lexical analyzer (lexer) for Q-Script.
 * @description This file contains the logic for scanning Q-Script source code
 * and converting it into a stream of tokens. It recognizes keywords, identifiers,
 * operators, and literals for both classical and quantum syntax.
 */

/**
 * Enum for all token types in Q-Script.
 * @readonly
 * @enum {string}
 */
export const TokenType = {
  // Single-character tokens.
  LEFT_PAREN: 'LEFT_PAREN',     // (
  RIGHT_PAREN: 'RIGHT_PAREN',    // )
  LEFT_BRACE: 'LEFT_BRACE',      // {
  RIGHT_BRACE: 'RIGHT_BRACE',     // }
  LEFT_BRACKET: 'LEFT_BRACKET',  // [
  RIGHT_BRACKET: 'RIGHT_BRACKET',// ]
  COMMA: 'COMMA',              // ,
  DOT: 'DOT',                  // .
  MINUS: 'MINUS',              // -
  PLUS: 'PLUS',                // +
  SEMICOLON: 'SEMICOLON',        // ;
  SLASH: 'SLASH',              // /
  STAR: 'STAR',                // *
  COLON: 'COLON',              // :
  PERCENT: 'PERCENT',            // %
  BITWISE_XOR: 'BITWISE_XOR',    // ^
  BITWISE_NOT: 'BITWISE_NOT',    // ~

  // One or two character tokens.
  BANG: 'BANG',                // !
  BANG_EQUAL: 'BANG_EQUAL',      // !=
  EQUAL: 'EQUAL',              // =
  EQUAL_EQUAL: 'EQUAL_EQUAL',    // ==
  GREATER: 'GREATER',            // >
  GREATER_EQUAL: 'GREATER_EQUAL',// >=
  LESS: 'LESS',                // <
  LESS_EQUAL: 'LESS_EQUAL',      // <=
  PLUS_EQUAL: 'PLUS_EQUAL',      // +=
  MINUS_EQUAL: 'MINUS_EQUAL',    // -=
  STAR_EQUAL: 'STAR_EQUAL',      // *=
  SLASH_EQUAL: 'SLASH_EQUAL',    // /=
  QARROW: 'QARROW',            // -> (for measurement)
  BITWISE_AND: 'BITWISE_AND',    // &
  LOGICAL_AND: 'LOGICAL_AND',    // &&
  BITWISE_OR: 'BITWISE_OR',      // |
  LOGICAL_OR: 'LOGICAL_OR',      // ||
  QASMSHIFTLEFT: 'QASMSHIFTLEFT',      // <<
  QASMSHIFTRIGHT: 'QASMSHIFTRIGHT',    // >>

  // Literals.
  IDENTIFIER: 'IDENTIFIER',
  STRING: 'STRING',
  NUMBER: 'NUMBER',

  // Keywords.
  // Classical
  IF: 'IF', ELSE: 'ELSE',
  TRUE: 'TRUE', FALSE: 'FALSE',
  FOR: 'FOR', WHILE: 'WHILE',
  FUNCTION: 'FUNCTION', RETURN: 'RETURN',
  LET: 'LET', CONST: 'CONST', NULL: 'NULL',
  CLASS: 'CLASS', SUPER: 'SUPER', THIS: 'THIS',
  IMPORT: 'IMPORT', EXPORT: 'EXPORT', FROM: 'FROM',

  // Quantum
  QREG: 'QREG', CREG: 'CREG',
  GATE: 'GATE', OPAQUE: 'OPAQUE',
  MEASURE: 'MEASURE', RESET: 'RESET', BARRIER: 'BARRIER',

  EOF: 'EOF'
};

/**
 * Represents a single token.
 */
export class Token {
  /**
   * @param {TokenType} type The type of the token.
   * @param {string} lexeme The raw string from the source code.
   * @param {any} literal The literal value of the token (e.g., a number or string).
   * @param {number} line The line number where the token appears.
   */
  constructor(type, lexeme, literal, line) {
    this.type = type;
    this.lexeme = lexeme;
    this.literal = literal;
    this.line = line;
  }

  /**
   * Returns a string representation of the token.
   * @returns {string}
   */
  toString() {
    return `${this.type} ${this.lexeme} ${this.literal}`;
  }
}

/**
 * The Lexer class, responsible for turning a string of source code into a list of tokens.
 */
export class Lexer {
  /**
   * @param {string} source The source code to tokenize.
   */
  constructor(source) {
    this.source = source;
    this.tokens = [];
    this.errors = [];
    this.start = 0;
    this.current = 0;
    this.line = 1;

    this.keywords = {
      // Classical
      "if": TokenType.IF,
      "else": TokenType.ELSE,
      "true": TokenType.TRUE,
      "false": TokenType.FALSE,
      "for": TokenType.FOR,
      "while": TokenType.WHILE,
      "function": TokenType.FUNCTION,
      "return": TokenType.RETURN,
      "let": TokenType.LET,
      "const": TokenType.CONST,
      "null": TokenType.NULL,
      "class": TokenType.CLASS,
      "super": TokenType.SUPER,
      "this": TokenType.THIS,
      "import": TokenType.IMPORT,
      "export": TokenType.EXPORT,
      "from": TokenType.FROM,

      // Quantum
      "qreg": TokenType.QREG,
      "creg": TokenType.CREG,
      "gate": TokenType.GATE,
      "opaque": TokenType.OPAQUE,
      "measure": TokenType.MEASURE,
      "reset": TokenType.RESET,
      "barrier": TokenType.BARRIER,
    };
  }

  /**
   * Scans the entire source code and returns a list of tokens.
   * @returns {Token[]} The list of tokens.
   */
  scanTokens() {
    while (!this.isAtEnd()) {
      this.start = this.current;
      this.scanToken();
    }

    this.tokens.push(new Token(TokenType.EOF, "", null, this.line));
    return this.tokens;
  }

  /**
   * Scans a single token from the source code.
   * @private
   */
  scanToken() {
    const c = this.advance();
    switch (c) {
      // Single-character tokens
      case '(': this.addToken(TokenType.LEFT_PAREN); break;
      case ')': this.addToken(TokenType.RIGHT_PAREN); break;
      case '{': this.addToken(TokenType.LEFT_BRACE); break;
      case '}': this.addToken(TokenType.RIGHT_BRACE); break;
      case '[': this.addToken(TokenType.LEFT_BRACKET); break;
      case ']': this.addToken(TokenType.RIGHT_BRACKET); break;
      case ',': this.addToken(TokenType.COMMA); break;
      case '.': this.addToken(TokenType.DOT); break;
      case ';': this.addToken(TokenType.SEMICOLON); break;
      case ':': this.addToken(TokenType.COLON); break;
      case '*': this.addToken(this.match('=') ? TokenType.STAR_EQUAL : TokenType.STAR); break;
      case '%': this.addToken(TokenType.PERCENT); break;
      case '^': this.addToken(TokenType.BITWISE_XOR); break;
      case '~': this.addToken(TokenType.BITWISE_NOT); break;

      // One or two character tokens
      case '!': this.addToken(this.match('=') ? TokenType.BANG_EQUAL : TokenType.BANG); break;
      case '=': this.addToken(this.match('=') ? TokenType.EQUAL_EQUAL : TokenType.EQUAL); break;
      case '+': this.addToken(this.match('=') ? TokenType.PLUS_EQUAL : TokenType.PLUS); break;
      case '-': this.addToken(this.match('>') ? TokenType.QARROW : (this.match('=') ? TokenType.MINUS_EQUAL : TokenType.MINUS)); break;
      case '&': this.addToken(this.match('&') ? TokenType.LOGICAL_AND : TokenType.BITWISE_AND); break;
      case '|': this.addToken(this.match('|') ? TokenType.LOGICAL_OR : TokenType.BITWISE_OR); break;
      case '<': this.addToken(this.match('<') ? TokenType.QASMSHIFTLEFT : (this.match('=') ? TokenType.LESS_EQUAL : TokenType.LESS)); break;
      case '>': this.addToken(this.match('>') ? TokenType.QASMSHIFTRIGHT : (this.match('=') ? TokenType.GREATER_EQUAL : TokenType.GREATER)); break;

      // Comments and slash
      case '/':
        if (this.match('/')) {
          // A comment goes until the end of the line.
          while (this.peek() !== '\n' && !this.isAtEnd()) this.advance();
        } else if (this.match('*')) {
          this.blockComment();
        } else {
          this.addToken(this.match('=') ? TokenType.SLASH_EQUAL : TokenType.SLASH);
        }
        break;

      // Whitespace
      case ' ':
      case '\r':
      case '\t':
        // Ignore whitespace.
        break;

      case '\n':
        this.line++;
        break;

      // String literals
      case '"':
      case "'":
        this.string(c);
        break;

      default:
        if (this.isDigit(c)) {
          this.number();
        } else if (this.isAlpha(c)) {
          this.identifier();
        } else {
          this.reportError(`Unexpected character: '${c}'`);
        }
        break;
    }
  }

  /** @private */
  isAtEnd() {
    return this.current >= this.source.length;
  }

  /** @private */
  advance() {
    return this.source.charAt(this.current++);
  }

  /** @private */
  addToken(type, literal = null) {
    const text = this.source.substring(this.start, this.current);
    this.tokens.push(new Token(type, text, literal, this.line));
  }

  /** @private */
  match(expected) {
    if (this.isAtEnd()) return false;
    if (this.source.charAt(this.current) !== expected) return false;
    this.current++;
    return true;
  }

  /** @private */
  peek() {
    if (this.isAtEnd()) return '\0';
    return this.source.charAt(this.current);
  }

  /** @private */
  peekNext() {
    if (this.current + 1 >= this.source.length) return '\0';
    return this.source.charAt(this.current + 1);
  }

  /** @private */
  string(quote) {
    while (this.peek() !== quote && !this.isAtEnd()) {
      if (this.peek() === '\n') this.line++;
      if (this.peek() === '\\') { // Handle escape character
        this.advance();
      }
      this.advance();
    }

    if (this.isAtEnd()) {
      this.reportError("Unterminated string.");
      return;
    }

    this.advance(); // The closing quote.

    // Trim quotes and unescape characters.
    const value = this.source.substring(this.start + 1, this.current - 1)
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');
    this.addToken(TokenType.STRING, value);
  }

  /** @private */
  number() {
    while (this.isDigit(this.peek())) this.advance();

    // Look for a fractional part.
    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      this.advance(); // Consume the "."
      while (this.isDigit(this.peek())) this.advance();
    }

    // Look for an exponent part.
    if (this.peek() === 'e' || this.peek() === 'E') {
        this.advance(); // Consume 'e' or 'E'
        if (this.peek() === '+' || this.peek() === '-') {
            this.advance(); // Consume sign
        }
        if (!this.isDigit(this.peek())) {
            this.reportError("Invalid exponent in number literal.");
        }
        while (this.isDigit(this.peek())) this.advance();
    }

    this.addToken(TokenType.NUMBER, parseFloat(this.source.substring(this.start, this.current)));
  }

  /** @private */
  identifier() {
    while (this.isAlphaNumeric(this.peek())) this.advance();

    const text = this.source.substring(this.start, this.current);
    const type = this.keywords[text] || TokenType.IDENTIFIER;
    this.addToken(type);
  }

  /** @private */
  blockComment() {
    let nesting = 1;
    while (nesting > 0 && !this.isAtEnd()) {
        if (this.peek() === '/' && this.peekNext() === '*') {
            this.advance();
            this.advance();
            nesting++;
        } else if (this.peek() === '*' && this.peekNext() === '/') {
            this.advance();
            this.advance();
            nesting--;
        } else {
            if (this.peek() === '\n') this.line++;
            this.advance();
        }
    }

    if (nesting > 0) {
        this.reportError("Unterminated block comment.");
    }
  }

  /** @private */
  isDigit(c) {
    return c >= '0' && c <= '9';
  }

  /** @private */
  isAlpha(c) {
    return (c >= 'a' && c <= 'z') ||
           (c >= 'A' && c <= 'Z') ||
           c === '_';
  }

  /** @private */
  isAlphaNumeric(c) {
    return this.isAlpha(c) || this.isDigit(c);
  }

  /** @private */
  reportError(message) {
    this.errors.push({ line: this.line, message });
  }
}