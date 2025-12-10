/**
 * @file src/language/lambda_calculus.js
 * @description The core engine for the 'Quantum-Enriched Lambda Calculus Integration'.
 * It handles the parsing and evaluation of functional quantum expressions, combining
 * classical lambda calculus with quantum computing primitives.
 */

// --- Part 1: Quantum Mechanics Primitives ---

/**
 * A simple class for representing complex numbers.
 */
class Complex {
    constructor(re = 0, im = 0) {
        this.re = re;
        this.im = im;
    }

    add(other) {
        return new Complex(this.re + other.re, this.im + other.im);
    }

    mul(other) {
        if (typeof other === 'number') {
            return new Complex(this.re * other, this.im * other);
        }
        const re = this.re * other.re - this.im * other.im;
        const im = this.re * other.im + this.im * other.re;
        return new Complex(re, im);
    }

    magnitudeSq() {
        return this.re * this.re + this.im * this.im;
    }

    toString() {
        if (this.im === 0) return this.re.toFixed(4);
        if (this.re === 0) return `${this.im.toFixed(4)}i`;
        return `(${this.re.toFixed(4)} ${this.im > 0 ? '+' : '-'} ${Math.abs(this.im).toFixed(4)}i)`;
    }
}

Complex.ZERO = new Complex(0, 0);
Complex.ONE = new Complex(1, 0);

/**
 * Represents the state of a single qubit.
 */
class Qubit {
    constructor(alpha, beta) {
        // Ensure normalization: |alpha|^2 + |beta|^2 = 1
        const norm = Math.sqrt(alpha.magnitudeSq() + beta.magnitudeSq());
        if (Math.abs(norm - 1.0) > 1e-9) {
            // Auto-normalize for convenience
            this.alpha = new Complex(alpha.re / norm, alpha.im / norm);
            this.beta = new Complex(beta.re / norm, beta.im / norm);
        } else {
            this.alpha = alpha;
            this.beta = beta;
        }
    }

    /**
     * Applies a 2x2 quantum gate (matrix) to this qubit.
     * @param {Complex[][]} matrix The gate matrix.
     * @returns {Qubit} A new Qubit with the transformed state.
     */
    applyGate(matrix) {
        const [[m00, m01], [m10, m11]] = matrix;
        const newAlpha = m00.mul(this.alpha).add(m01.mul(this.beta));
        const newBeta = m10.mul(this.alpha).add(m11.mul(this.beta));
        return new Qubit(newAlpha, newBeta);
    }

    /**
     * Measures the qubit in the computational basis.
     * @returns {number} The classical result (0 or 1).
     */
    measure() {
        const prob0 = this.alpha.magnitudeSq();
        if (Math.random() < prob0) {
            return 0;
        } else {
            return 1;
        }
    }

    toString() {
        const parts = [];
        if (this.alpha.magnitudeSq() > 1e-9) {
            parts.push(`${this.alpha.toString()}|0>`);
        }
        if (this.beta.magnitudeSq() > 1e-9) {
            const sign = this.beta.re > 0 || (this.beta.re === 0 && this.beta.im > 0) ? '+' : '';
            if (parts.length > 0) {
                 parts.push(` ${sign} ${this.beta.toString()}|1>`);
            } else {
                 parts.push(`${this.beta.toString()}|1>`);
            }
        }
        if (parts.length === 0) return "Zero-amplitude state";
        return parts.join('').trim();
    }
}

// Pre-defined quantum states
const QUBIT_ZERO = new Qubit(Complex.ONE, Complex.ZERO);
const QUBIT_ONE = new Qubit(Complex.ZERO, Complex.ONE);

// Pre-defined quantum gates (matrices)
const GATES = {
    I: [ [Complex.ONE, Complex.ZERO], [Complex.ZERO, Complex.ONE] ],
    H: [
        [new Complex(1 / Math.sqrt(2)), new Complex(1 / Math.sqrt(2))],
        [new Complex(1 / Math.sqrt(2)), new Complex(-1 / Math.sqrt(2))]
    ],
    X: [ [Complex.ZERO, Complex.ONE], [Complex.ONE, Complex.ZERO] ],
    Y: [ [Complex.ZERO, new Complex(0, -1)], [new Complex(0, 1), Complex.ZERO] ],
    Z: [ [Complex.ONE, Complex.ZERO], [Complex.ZERO, new Complex(-1)] ],
};


// --- Part 2: AST Node Definitions ---

class Var { constructor(name) { this.name = name; } }
class Abs { constructor(param, body) { this.param = param; this.body = body; } }
class App { constructor(func, arg) { this.func = func; this.arg = arg; } }
class Let { constructor(name, value, body) { this.name = name; this.value = value; this.body = body; } }
class Literal { constructor(value) { this.value = value; } }


// --- Part 3: Parser ---
// A simple recursive descent parser for our language.

function parse(code) {
    const tokens = code.match(/\(|\)|[a-zA-Z0-9_]+|\\|\.|=>|=/g) || [];
    let position = 0;

    function peek() { return tokens[position]; }
    function consume() { return tokens[position++]; }
    function expect(token) {
        if (peek() === token) {
            return consume();
        }
        throw new Error(`Parse Error: Expected '${token}' but found '${peek()}'`);
    }

    function parseAtom() {
        const token = consume();
        if (token === '(') {
            const expr = parseExpression();
            expect(')');
            return expr;
        }
        if (token === '\\' || token === 'lambda') {
            const param = consume();
            expect('.');
            const body = parseExpression();
            return new Abs(param, body);
        }
        if (token === 'let') {
            const name = consume();
            expect('=');
            const value = parseExpression();
            expect('in');
            const body = parseExpression();
            return new Let(name, value, body);
        }
        if (!isNaN(token)) {
            return new Literal(parseFloat(token));
        }
        // Check for built-in quantum constants
        if (token === 'q0') return new Literal(QUBIT_ZERO);
        if (token === 'q1') return new Literal(QUBIT_ONE);
        
        return new Var(token);
    }

    function parseApplication() {
        let expr = parseAtom();
        while (peek() && peek() !== ')' && peek() !== 'in') {
            expr = new App(expr, parseAtom());
        }
        return expr;
    }

    function parseExpression() {
        return parseApplication();
    }

    const ast = parseExpression();
    if (position < tokens.length) {
        throw new Error(`Parse Error: Unexpected token '${peek()}' at end of input.`);
    }
    return ast;
}


// --- Part 4: Evaluator ---

class Closure {
    constructor(abstraction, env) {
        this.param = abstraction.param;
        this.body = abstraction.body;
        this.env = env;
    }
    toString() {
        return `[Function: λ${this.param}]`;
    }
}

const BUILTIN_FUNCTIONS = {
    // Quantum Gates
    'H': (qubit) => {
        if (!(qubit instanceof Qubit)) throw new Error("H gate requires a Qubit argument.");
        return qubit.applyGate(GATES.H);
    },
    'X': (qubit) => {
        if (!(qubit instanceof Qubit)) throw new Error("X gate requires a Qubit argument.");
        return qubit.applyGate(GATES.X);
    },
    'Y': (qubit) => {
        if (!(qubit instanceof Qubit)) throw new Error("Y gate requires a Qubit argument.");
        return qubit.applyGate(GATES.Y);
    },
    'Z': (qubit) => {
        if (!(qubit instanceof Qubit)) throw new Error("Z gate requires a Qubit argument.");
        return qubit.applyGate(GATES.Z);
    },
    // Measurement
    'measure': (qubit) => {
        if (!(qubit instanceof Qubit)) throw new Error("measure requires a Qubit argument.");
        return qubit.measure();
    },
    // State creation
    'superposition': (alpha, beta) => {
        if (typeof alpha !== 'number' || typeof beta !== 'number') {
            throw new Error("superposition requires two number arguments for amplitudes.");
        }
        return new Qubit(new Complex(alpha), new Complex(beta));
    }
};

function evaluate(ast, env) {
    if (ast instanceof Var) {
        if (ast.name in env) {
            return env[ast.name];
        }
        if (ast.name in BUILTIN_FUNCTIONS) {
            return BUILTIN_FUNCTIONS[ast.name];
        }
        throw new Error(`Runtime Error: Unbound variable '${ast.name}'`);
    }
    if (ast instanceof Literal) {
        return ast.value;
    }
    if (ast instanceof Abs) {
        return new Closure(ast, env);
    }
    if (ast instanceof Let) {
        const value = evaluate(ast.value, env);
        const newEnv = { ...env, [ast.name]: value };
        return evaluate(ast.body, newEnv);
    }
    if (ast instanceof App) {
        const func = evaluate(ast.func, env);
        const arg = evaluate(ast.arg, env);

        if (func instanceof Closure) {
            // Beta-reduction
            const newEnv = { ...func.env, [func.param]: arg };
            return evaluate(func.body, newEnv);
        }
        if (typeof func === 'function') {
            // Apply built-in function
            return func(arg);
        }
        throw new Error(`Runtime Error: Cannot apply non-function type.`);
    }
    throw new Error("Runtime Error: Unknown AST node type.");
}


// --- Part 5: Public API ---

/**
 * Parses and evaluates a string of Quantum-Enriched Lambda Calculus code.
 *
 * @param {string} code The code to execute.
 * @returns {any} The result of the evaluation.
 *
 * @example
 * // Create a Bell state and measure it
 * const code = `
 *   let bell_maker = \q. H q in
 *   let qubit = bell_maker q0 in
 *   measure qubit
 * `;
 * const result = evaluateQuantumLambda(code); // result will be 0 or 1
 *
 * @example
 * // Identity function
 * const code = `(\x. x) 42`;
 * const result = evaluateQuantumLambda(code); // result will be 42
 */
export function evaluateQuantumLambda(code) {
    try {
        const ast = parse(code);
        const result = evaluate(ast, {});
        return result;
    } catch (e) {
        // For better user feedback, we can return the error object
        // or a formatted string.
        return { error: true, message: e.message };
    }
}

/**
 * A helper to format the result for display.
 * @param {*} result The result from evaluateQuantumLambda.
 * @returns {string} A string representation of the result.
 */
export function formatResult(result) {
    if (result && result.error) {
        return `Error: ${result.message}`;
    }
    if (result instanceof Qubit || result instanceof Closure || result instanceof Complex) {
        return result.toString();
    }
    if (typeof result === 'number') {
        return result.toString();
    }
    if (result === undefined) {
        return 'undefined';
    }
    return JSON.stringify(result);
}