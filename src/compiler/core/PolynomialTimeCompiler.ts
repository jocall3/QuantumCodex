import { Lexer } from '../lexer/Lexer';
import { Parser } from '../parser/Parser';
import { SemanticAnalyzer } from '../analysis/SemanticAnalyzer';
import { Optimizer } from '../optimization/Optimizer';
import { CodeGenerator } from '../codegen/CodeGenerator';
import { ProgramNode } from '../ast/Nodes';
import { Token } from '../lexer/Token';
import { Diagnostic, DiagnosticLevel } from '../diagnostics/Diagnostic';
import { SourceFile } from '../types/SourceFile';

export interface CompilerOptions {
    /**
     * The optimization level (0-3).
     * Level 3 implies aggressive polynomial-time reduction optimizations.
     */
    optimizationLevel: 0 | 1 | 2 | 3;
    
    /**
     * The target architecture or runtime environment.
     */
    target: 'u-vm' | 'native' | 'wasm' | 'transpile-js';
    
    /**
     * Whether to emit debug symbols and verbose logging.
     */
    debug: boolean;
    
    /**
     * Strict mode enforces tighter semantic checks.
     */
    strict: boolean;

    /**
     * Maximum time allowed for compilation in milliseconds before timeout.
     */
    timeoutMs?: number;
}

export interface CompilationMetrics {
    totalTime: number;
    lexingTime: number;
    parsingTime: number;
    analysisTime: number;
    optimizationTime: number;
    codegenTime: number;
    passCounts: Record<string, number>;
}

export interface CompilationResult {
    success: boolean;
    output: string | Uint8Array | null;
    ast?: ProgramNode;
    diagnostics: Diagnostic[];
    metrics: CompilationMetrics;
}

/**
 * The PolynomialTimeCompiler is the main orchestration engine for the .u language.
 * It manages the lifecycle of source code transformation from raw text to executable artifacts,
 * ensuring that compilation passes adhere to polynomial time complexity constraints relative
 * to the input size.
 */
export class PolynomialTimeCompiler {
    private lexer: Lexer;
    private parser: Parser;
    private analyzer: SemanticAnalyzer;
    private optimizer: Optimizer;
    private generator: CodeGenerator;

    constructor() {
        this.lexer = new Lexer();
        this.parser = new Parser();
        this.analyzer = new SemanticAnalyzer();
        this.optimizer = new Optimizer();
        this.generator = new CodeGenerator();
    }

    /**
     * Compiles a .u source file based on the provided options.
     * 
     * @param source The source file object containing path and content.
     * @param options Configuration options for the compilation pipeline.
     * @returns A promise resolving to the compilation result.
     */
    public async compile(source: SourceFile, options: CompilerOptions): Promise<CompilationResult> {
        const startTime = performance.now();
        const diagnostics: Diagnostic[] = [];
        const metrics: CompilationMetrics = {
            totalTime: 0,
            lexingTime: 0,
            parsingTime: 0,
            analysisTime: 0,
            optimizationTime: 0,
            codegenTime: 0,
            passCounts: {}
        };

        try {
            // 1. Lexical Analysis
            const lexStart = performance.now();
            const tokens: Token[] = this.lexer.tokenize(source.content);
            metrics.lexingTime = performance.now() - lexStart;
            
            if (this.lexer.hasErrors()) {
                diagnostics.push(...this.lexer.getDiagnostics());
                return this.createFailureResult(diagnostics, metrics);
            }

            // 2. Parsing (Syntactic Analysis)
            const parseStart = performance.now();
            const ast: ProgramNode = this.parser.parse(tokens);
            metrics.parsingTime = performance.now() - parseStart;

            if (this.parser.hasErrors()) {
                diagnostics.push(...this.parser.getDiagnostics());
                return this.createFailureResult(diagnostics, metrics);
            }

            // 3. Semantic Analysis
            const analyzeStart = performance.now();
            const analysisContext = this.analyzer.analyze(ast, { strict: options.strict });
            metrics.analysisTime = performance.now() - analyzeStart;
            diagnostics.push(...analysisContext.diagnostics);

            if (analysisContext.hasFatalErrors) {
                return this.createFailureResult(diagnostics, metrics);
            }

            // 4. Optimization (Polynomial-Time Passes)
            const optStart = performance.now();
            let optimizedAst = ast;
            if (options.optimizationLevel > 0) {
                optimizedAst = await this.optimizer.optimize(ast, analysisContext.symbolTable, {
                    level: options.optimizationLevel,
                    preserveDebugInfo: options.debug
                });
            }
            metrics.optimizationTime = performance.now() - optStart;
            metrics.passCounts = this.optimizer.getPassStats();

            // 5. Code Generation
            const genStart = performance.now();
            const output = this.generator.generate(optimizedAst, {
                target: options.target,
                debug: options.debug,
                symbolTable: analysisContext.symbolTable
            });
            metrics.codegenTime = performance.now() - genStart;

            metrics.totalTime = performance.now() - startTime;

            return {
                success: true,
                output: output,
                ast: options.debug ? optimizedAst : undefined,
                diagnostics: diagnostics,
                metrics: metrics
            };

        } catch (error) {
            const fatalDiagnostic: Diagnostic = {
                level: DiagnosticLevel.Error,
                message: `Internal Compiler Error: ${error instanceof Error ? error.message : String(error)}`,
                file: source.path,
                line: 0,
                column: 0,
                code: 'U-ERR-INTERNAL'
            };
            diagnostics.push(fatalDiagnostic);
            
            return {
                success: false,
                output: null,
                diagnostics: diagnostics,
                metrics: metrics
            };
        }
    }

    /**
     * Compiles a batch of files, handling dependencies and linking.
     * 
     * @param sources Array of source files.
     * @param options Compiler options.
     */
    public async compileBatch(sources: SourceFile[], options: CompilerOptions): Promise<CompilationResult[]> {
        // In a real polynomial-time compiler, this would build a dependency graph
        // and topologically sort the compilation order.
        const results: CompilationResult[] = [];
        
        for (const source of sources) {
            const result = await this.compile(source, options);
            results.push(result);
            
            // If one fails and we are in strict mode, we might want to abort.
            if (!result.success && options.strict) {
                break;
            }
        }

        return results;
    }

    private createFailureResult(diagnostics: Diagnostic[], metrics: CompilationMetrics): CompilationResult {
        return {
            success: false,
            output: null,
            diagnostics: diagnostics,
            metrics: metrics
        };
    }

    /**
     * Resets the internal state of the compiler components.
     * Useful when running in watch mode or a language server context.
     */
    public reset(): void {
        this.lexer.reset();
        this.parser.reset();
        this.analyzer.reset();
        this.optimizer.reset();
        this.generator.reset();
    }
}