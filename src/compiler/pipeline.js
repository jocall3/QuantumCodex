/**
 * @file Defines the main compilation pipeline, sequencing the various stages:
 * lexing, parsing, semantic analysis, Q-AST construction, CQIR generation,
 * optimization passes, and final code generation for the target backend.
 *
 * This pipeline orchestrates the transformation of high-level terminal description
 * language source code into executable code for a specific rendering backend.
 */

import { lex } from './lexer.js';
import { parse } from './parser.js';
import { analyze } from './semanticAnalyzer.js';
import { buildQAST } from './qastBuilder.js';
import { generateCQIR } from './cqirGenerator.js';
import { optimize } from './optimizer.js';
import { generateCode } from './codeGenerator.js';
import { CompilationError } from '../errors/CompilationError.js';

/**
 * Represents the result of a successful compilation process.
 * @typedef {object} CompilationResult
 * @property {string} code - The generated executable code for the target backend.
 * @property {object} [diagnostics] - Information about warnings or other non-fatal issues.
 * @property {object} [intermediateRepresentations] - A collection of IRs from each stage, for debugging purposes.
 */

/**
 * Configuration options for the compilation pipeline.
 * @typedef {object} CompilerOptions
 * @property {'js' | 'wasm' | 'glsl'} [target='js'] - The target backend for code generation.
 * @property {0 | 1 | 2 | 3} [optimizationLevel=2] - The level of optimization to apply.
 * @property {boolean} [debug=false] - If true, includes intermediate representations in the output.
 * @property {string} [sourceFileName='<anonymous>'] - The name of the source file for error reporting.
 */

/**
 * The default compiler options.
 * @type {Readonly<CompilerOptions>}
 */
const DEFAULT_OPTIONS = Object.freeze({
    target: 'js',
    optimizationLevel: 2,
    debug: false,
    sourceFileName: '<anonymous>',
});

/**
 * Executes a single stage of the compilation pipeline, wrapping it in robust error handling.
 * @param {string} stageName - The name of the stage for error reporting.
 * @param {Function} stageFn - The function to execute for this stage.
 * @param {any} input - The input to the stage function.
 * @param {CompilerOptions} options - The compiler options.
 * @returns {any} The output of the stage function.
 * @throws {CompilationError} If the stage function throws an error.
 */
function runStage(stageName, stageFn, input, options) {
    try {
        return stageFn(input, options);
    } catch (error) {
        if (error instanceof CompilationError) {
            // Re-throw if it's already our custom error type, ensuring the stage is noted if missing.
            if (!error.stage) {
                error.stage = stageName;
            }
            throw error;
        }
        // Wrap generic errors in a CompilationError for consistent handling and reporting.
        const compilationError = new CompilationError(
            `An unexpected error occurred during the '${stageName}' stage.`,
            options.sourceFileName,
            null, // line
            null, // column
            error // original cause
        );
        compilationError.stage = stageName;
        throw compilationError;
    }
}

/**
 * The main compilation pipeline. It takes source code and a set of options,
 * then runs it through all the compilation stages from lexing to code generation.
 *
 * @param {string} sourceCode - The source code to compile.
 * @param {Partial<CompilerOptions>} [userOptions={}] - User-provided compiler options that override defaults.
 * @returns {Promise<CompilationResult>} A promise that resolves with the compilation result.
 */
export async function compile(sourceCode, userOptions = {}) {
    const options = { ...DEFAULT_OPTIONS, ...userOptions };
    const irs = {};

    // Stage 1: Lexing (Tokenization)
    // Converts the raw source code string into a stream of tokens.
    const tokens = runStage('Lexing', lex, sourceCode, options);
    if (options.debug) irs.tokens = tokens;

    // Stage 2: Parsing (AST Construction)
    // Organizes the token stream into a hierarchical Abstract Syntax Tree (AST).
    const ast = runStage('Parsing', parse, tokens, options);
    if (options.debug) irs.ast = ast;

    // Stage 3: Semantic Analysis
    // Validates the AST for correctness (e.g., type checking, scope resolution)
    // and annotates it with semantic information.
    const { validatedAst, symbolTable } = runStage('Semantic Analysis', analyze, ast, options);
    if (options.debug) {
        irs.validatedAst = validatedAst;
        irs.symbolTable = symbolTable;
    }

    // Stage 4: Q-AST Construction (Quantum Abstract Syntax Tree)
    // Transforms the general AST into a specialized representation tailored for
    // terminal rendering concepts.
    const qast = runStage('Q-AST Construction', buildQAST, validatedAst, options);
    if (options.debug) irs.qast = qast;

    // Stage 5: CQIR Generation (Canonical Quantum Intermediate Representation)
    // Generates the primary, backend-agnostic Intermediate Representation used for optimization.
    const cqir = runStage('CQIR Generation', generateCQIR, qast, options);
    if (options.debug) irs.cqir = cqir;

    // Stage 6: Optimization
    // Runs a series of optimization passes on the CQIR to improve performance or size.
    const optimizedCqir = runStage('Optimization', optimize, cqir, options);
    if (options.debug) irs.optimizedCqir = optimizedCqir;

    // Stage 7: Code Generation
    // The final stage, converting the optimized IR into target-specific executable code.
    // This stage is async to support backends that might require async operations (e.g., WASM compilation).
    const code = await runStage('Code Generation', generateCode, optimizedCqir, options);

    /** @type {CompilationResult} */
    const result = {
        code,
        diagnostics: {}, // Placeholder for future warnings/info reporting
    };

    if (options.debug) {
        result.intermediateRepresentations = irs;
    }

    return result;
}