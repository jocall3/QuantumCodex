#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { parseArgs } from 'util';

// Import compiler stages. These will be implemented in their respective files.
// For now, they can be stubbed to allow this entry point to be functional.
import { lex } from './lexer.js';
import { parse } from './parser.js';
import { generate } from './generator.js';

// Import package.json for version information using JSON import assertions.
import { version } from '../../package.json' assert { type: 'json' };

const USAGE_MESSAGE = `
Q-Script Compiler v${version}

The compiler for Q-Script, a language for defining interactive terminal sessions.

Usage: qsc <input-file> [options]

Arguments:
  <input-file>          The Q-Script source file to compile (e.g., session.qs).

Options:
  -o, --output <file>   Specify the output file path. If omitted, the output
                        path is derived from the input file name (e.g.,
                        session.qs -> session.json).
  -f, --format <type>   Specify the output format.
                        Supported formats: 'json', 'html'.
                        (default: "json")
  -v, --version         Display the compiler version and exit.
  -h, --help            Display this help message and exit.
`;

/**
 * The main function for the Q-Script Compiler CLI.
 * It parses arguments, reads the source file, runs the compilation pipeline,
 * and writes the output.
 */
async function main() {
    const options = {
        output: { type: 'string', short: 'o' },
        format: { type: 'string', short: 'f', default: 'json' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
    };

    let args;
    try {
        // `allowPositionals: true` allows us to capture the input file without a flag.
        args = parseArgs({ options, allowPositionals: true });
    } catch (error) {
        console.error(`Error: Invalid argument. ${error.message}`);
        console.log(USAGE_MESSAGE);
        process.exit(1);
    }

    const { values, positionals } = args;

    if (values.version) {
        console.log(`qsc v${version}`);
        process.exit(0);
    }

    if (values.help) {
        console.log(USAGE_MESSAGE);
        process.exit(0);
    }

    const inputFile = positionals[0];

    if (!inputFile) {
        console.error('Error: No input file specified.');
        console.log(USAGE_MESSAGE);
        process.exit(1);
    }

    const inputPath = path.resolve(process.cwd(), inputFile);
    const outputPath = determineOutputPath(values.output, inputPath, values.format);

    try {
        console.log(`[QSC] Compiling: ${path.relative(process.cwd(), inputPath)}`);

        // 1. Read Source File
        const sourceCode = await fs.readFile(inputPath, 'utf-8');

        // 2. Lexical Analysis (Tokenization)
        const tokens = lex(sourceCode, inputPath);

        // 3. Parsing (Abstract Syntax Tree generation)
        const ast = parse(tokens, sourceCode);

        // 4. Code Generation (or Transformation)
        const compiledOutput = generate(ast, values.format);

        // 5. Write Output File
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, compiledOutput);

        console.log(`✅ Success! Output written to: ${path.relative(process.cwd(), outputPath)}`);
        process.exit(0);

    } catch (error) {
        handleCompilationError(error, inputPath);
        process.exit(1);
    }
}

/**
 * Determines the final output path for the compiled artifact.
 * @param {string | undefined} outputArg - The output path from command-line arguments.
 * @param {string} inputPath - The absolute path to the input file.
 * @param {string} format - The desired output format.
 * @returns {string} The resolved absolute output path.
 */
function determineOutputPath(outputArg, inputPath, format) {
    if (outputArg) {
        return path.resolve(process.cwd(), outputArg);
    }
    // If no output path is specified, derive it from the input path.
    const { dir, name } = path.parse(inputPath);
    return path.join(dir, `${name}.${format}`);
}

/**
 * Provides user-friendly error messages for common compilation failures.
 * @param {Error} error - The error object caught during compilation.
 * @param {string} inputPath - The path to the source file being compiled.
 */
function handleCompilationError(error, inputPath) {
    console.error(`\n❌ Compilation failed.`);
    if (error.code === 'ENOENT') {
        console.error(`   Error: Input file not found at '${inputPath}'`);
    } else if (error.isCompilerError) {
        // Custom compiler errors (e.g., syntax errors) should have location info.
        console.error(`   File:  ${error.filePath || inputPath}`);
        if (error.line && error.column) {
            console.error(`   Error: ${error.message} (at Line ${error.line}, Column ${error.column})`);
        } else {
            console.error(`   Error: ${error.message}`);
        }
    } else {
        // Generic or unexpected errors.
        console.error('   An unexpected error occurred:');
        console.error(error.stack || error.message);
    }
}


// Execute the main function and catch any top-level unhandled exceptions.
main().catch(err => {
    console.error("A critical and unexpected error occurred. Please report this as a bug.");
    console.error(err);
    process.exit(1);
});