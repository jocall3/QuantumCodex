/**
 * @file src/compiler/grammar/ContextSwitcher.ts
 * @description Helper logic for the parser to manage semantic interpretation phases
 * and maintain state consistency across classical-quantum boundaries.
 */

import { ParserRuleContext } from 'antlr4ts';
import { IErrorReporter } from '../reporting/IErrorReporter';

/**
 * Defines the distinct semantic contexts within the .u language.
 * The parser uses this to validate the placement of language constructs.
 */
export enum ParsingContext {
    /**
     * The context for classical computation, variables, and control flow.
     */
    CLASSICAL = 'classical',

    /**
     * The context for quantum operations, qubit manipulation, and entanglement.
     */
    QUANTUM = 'quantum',
}

/**
 * Manages the semantic parsing context, switching between classical and quantum modes.
 * This class ensures that language constructs are used in their appropriate context
 * (e.g., quantum gates can only be used within a quantum block). It is designed to
 * be used by the ANTLR parser/visitor to maintain state during the parsing process.
 */
export class ContextSwitcher {
    private contextStack: ParsingContext[] = [];
    private errorReporter: IErrorReporter;

    /**
     * Initializes the ContextSwitcher.
     * @param errorReporter The central error reporting mechanism for the compiler.
     * @param initialContext The starting context for parsing, typically CLASSICAL.
     */
    constructor(errorReporter: IErrorReporter, initialContext: ParsingContext = ParsingContext.CLASSICAL) {
        this.errorReporter = errorReporter;
        this.contextStack.push(initialContext);
    }

    /**
     * Gets the currently active parsing context from the top of the stack.
     * @returns The current `ParsingContext`.
     */
    public getCurrentContext(): ParsingContext {
        if (this.contextStack.length === 0) {
            // This state should be unreachable in a correctly implemented parser.
            // It indicates a mismatch in enter/exit calls.
            throw new Error("Critical parser error: Context stack is empty.");
        }
        return this.contextStack[this.contextStack.length - 1];
    }

    /**
     * Checks if the current context is quantum.
     * @returns `true` if the current context is `QUANTUM`, `false` otherwise.
     */
    public isQuantum(): boolean {
        return this.getCurrentContext() === ParsingContext.QUANTUM;
    }

    /**
     * Checks if the current context is classical.
     * @returns `true` if the current context is `CLASSICAL`, `false` otherwise.
     */
    public isClassical(): boolean {
        return this.getCurrentContext() === ParsingContext.CLASSICAL;
    }

    /**
     * Enters a new parsing context, pushing it onto the stack.
     * This is typically called when the parser encounters a block that changes context,
     * such as a `quantum { ... }` block.
     * @param newContext The new context to enter.
     * @param ctx The ANTLR parser rule context where the transition occurs, used for error reporting.
     */
    public enterContext(newContext: ParsingContext, ctx: ParserRuleContext): void {
        this.validateTransition(this.getCurrentContext(), newContext, ctx);
        this.contextStack.push(newContext);
    }

    /**
     * Exits the current parsing context, popping it from the stack to restore the previous one.
     * This is called at the end of a context-changing block.
     * @param ctx The ANTLR parser rule context where the transition occurs, used for error reporting.
     * @returns The context that was just exited.
     */
    public exitContext(ctx: ParserRuleContext): ParsingContext | undefined {
        if (this.contextStack.length <= 1) {
            this.errorReporter.reportError(
                "Syntax error: Unexpected end of context block. Cannot exit the global context.",
                { line: ctx.start.line, column: ctx.start.charPositionInLine },
                ctx.text
            );
            // Prevent the stack from becoming empty to avoid crashes on subsequent calls.
            return undefined;
        }
        return this.contextStack.pop();
    }

    /**
     * Asserts that the current context is the expected one. If not, it reports a syntax error.
     * This is a key validation method for parser rules to ensure language constructs are used correctly.
     * @param expectedContext The context required for a given language construct.
     * @param constructName A user-friendly name of the construct being validated (e.g., "Hadamard gate" or "'if' statement").
     * @param ctx The ANTLR parser rule context of the construct being validated.
     */
    public assertContext(expectedContext: ParsingContext, constructName: string, ctx: ParserRuleContext): void {
        const currentContext = this.getCurrentContext();
        if (currentContext !== expectedContext) {
            this.errorReporter.reportError(
                `The '${constructName}' construct can only be used within a '${expectedContext}' context. It is currently being used in a '${currentContext}' context.`,
                { line: ctx.start.line, column: ctx.start.charPositionInLine },
                ctx.text
            );
        }
    }

    /**
     * Validates a transition between contexts. This can be extended with more complex rules
     * as the language specification evolves.
     * @param from The context being transitioned from.
     * @param to The context being transitioned to.
     * @param ctx The ANTLR parser rule context for error reporting.
     */
    private validateTransition(from: ParsingContext, to: ParsingContext, ctx: ParserRuleContext): void {
        // This method is a placeholder for future, more complex transition rules.
        // For example, a language design might forbid nested quantum blocks.
        if (from === ParsingContext.QUANTUM && to === ParsingContext.QUANTUM) {
            // This could be an error, a warning, or allowed, depending on language semantics.
            // For now, we allow it but could add a warning:
            // this.errorReporter.reportWarning(
            //     "Nested quantum blocks are permitted but may be confusing.",
            //     { line: ctx.start.line, column: ctx.start.charPositionInLine },
            //     ctx.text
            // );
        }
    }
}