/**
 * @file src/compiler/macros/ContextAwareMacroEngine.ts
 * @purpose Engine for expanding Context-Aware Quantum Macros, using classical context to dynamically generate circuits.
 */

// Note: In a full compiler architecture, these types would likely be imported
// from shared locations, e.g., `../ir/types.ts` or `../ast/nodes.ts`.
// They are defined here for clarity and to make this file self-contained.

/**
 * Represents a single operation or instruction in a quantum circuit.
 * This serves as the Intermediate Representation (IR) for a gate application.
 */
export interface QuantumOperation {
  /** The name of the quantum gate (e.g., 'H', 'CNOT', 'RZ'). */
  gate: string;
  /** An array of target qubit indices. */
  targets: number[];
  /** An optional array of control qubit indices. */
  controls?: number[];
  /** An optional array of classical parameters for the gate (e.g., rotation angles). */
  params?: number[];
}

/**
 * Represents the classical context available during macro expansion.
 * This is a key-value store for classical variables that can influence
 * the generation of quantum circuits.
 */
export type ClassicalContext = Map<string, number | boolean | string>;

/**
 * The functional body of a macro. It takes evaluated arguments and the
 * current classical context, and returns a sequence of quantum operations.
 */
export type MacroBodyFunction = (
  args: any[],
  context: ClassicalContext,
) => QuantumOperation[];

/**
 * Defines the structure of a context-aware macro.
 */
export interface MacroDefinition {
  /** The unique name of the macro used for invocation. */
  name: string;
  /** An ordered list of parameter names for the macro. */
  parameters: string[];
  /** The function that implements the macro's expansion logic. */
  body: MacroBodyFunction;
}

/**
 * A simplified representation of a macro call node from an Abstract Syntax Tree (AST).
 */
export interface MacroCallNode {
  type: 'MacroCall';
  /** The name of the macro being called. */
  name: 'string';
  /**
   * The arguments passed to the macro. In a real compiler, these would be
   * expression nodes that need to be evaluated.
   */
  arguments: any[];
}

/**
 * The ContextAwareMacroEngine is responsible for managing and expanding
 * macros that can generate quantum circuit instructions based on classical context.
 * This allows for dynamic circuit construction at compile-time, enabling
 * powerful abstractions like classically-controlled operations and dynamic loops.
 */
export class ContextAwareMacroEngine {
  private readonly macros: Map<string, MacroDefinition> = new Map();

  /**
   * Initializes the macro engine and registers a set of default, built-in macros.
   */
  constructor() {
    this.registerDefaultMacros();
  }

  /**
   * Registers a new macro with the engine.
   * @param definition The macro definition object.
   * @throws If a macro with the same name is already registered.
   */
  public registerMacro(definition: MacroDefinition): void {
    if (this.macros.has(definition.name)) {
      // In a more advanced implementation, this might be a configurable warning
      // to allow for macro redefinition or overloading.
      throw new Error(`Macro "${definition.name}" is already defined.`);
    }
    this.macros.set(definition.name, definition);
  }

  /**
   * Expands a macro call into a sequence of quantum operations.
   * @param macroCall An AST node representing the macro invocation.
   * @param context The classical context to use during expansion.
   * @returns An array of QuantumOperation objects representing the expanded circuit.
   * @throws If the macro is not defined, if argument counts mismatch, or if an error occurs during expansion.
   */
  public expand(
    macroCall: MacroCallNode,
    context: ClassicalContext,
  ): QuantumOperation[] {
    const macro = this.macros.get(macroCall.name);

    if (!macro) {
      throw new Error(`Undefined macro: "${macroCall.name}"`);
    }

    if (macroCall.arguments.length !== macro.parameters.length) {
      throw new Error(
        `Macro "${macro.name}" expects ${macro.parameters.length} arguments, but received ${macroCall.arguments.length}.`,
      );
    }

    // In a real compiler, this step would involve a dedicated expression evaluator
    // that traverses the argument AST nodes and resolves them using the context.
    const evaluatedArgs = this.evaluateArguments(macroCall.arguments, context);

    try {
      // Execute the macro's body function with the evaluated arguments and context.
      return macro.body(evaluatedArgs, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Error during expansion of macro "${macro.name}": ${message}`,
      );
    }
  }

  /**
   * A simplified argument evaluator.
   * It resolves string arguments as variables from the context if they exist,
   * otherwise treats them as literals.
   * @param args The list of arguments from the MacroCallNode.
   * @param context The current classical context.
   * @returns An array of evaluated arguments.
   */
  private evaluateArguments(args: any[], context: ClassicalContext): any[] {
    return args.map((arg) => {
      if (typeof arg === 'string' && context.has(arg)) {
        return context.get(arg);
      }
      // If it's not a variable name in the context, assume it's a literal value.
      return arg;
    });
  }

  /**
   * Registers a set of useful default macros to demonstrate the engine's capabilities.
   */
  private registerDefaultMacros(): void {
    /**
     * `c_gate_if(gateName, targetQubit, contextFlag)`
     * Applies a specified gate to a target qubit only if the classical context flag is true.
     * Example: c_gate_if('X', 0, 'should_flip')
     */
    this.registerMacro({
      name: 'c_gate_if',
      parameters: ['gateName', 'targetQubit', 'contextFlag'],
      body: (args, context) => {
        const [gateName, targetQubit, contextFlag] = args;

        if (
          typeof gateName !== 'string' ||
          typeof targetQubit !== 'number' ||
          typeof contextFlag !== 'string'
        ) {
          throw new Error(
            "Invalid argument types for c_gate_if. Expected (string, number, string).",
          );
        }

        if (context.get(contextFlag)) {
          return [{ gate: gateName.toUpperCase(), targets: [targetQubit] }];
        } else {
          return []; // Return no operations if the condition is false.
        }
      },
    });

    /**
     * `unrolled_loop(iterations, bodyMacroName, ...bodyArgs)`
     * A powerful macro that unrolls a loop at compile time.
     * It calls another macro `iterations` times, passing a loop index 'i' in the context.
     * Example: unrolled_loop(3, 'apply_h', 0) -> would call apply_h(0) three times with i=0,1,2 in context.
     */
    this.registerMacro({
        name: 'unrolled_loop',
        parameters: ['iterations', 'bodyMacroName'], // Uses rest parameters implicitly
        body: (args, context) => {
            const [iterations, bodyMacroName, ...bodyArgs] = args;

            if (typeof iterations !== 'number' || !Number.isInteger(iterations) || iterations < 0) {
                throw new Error("unrolled_loop expects a non-negative integer for iterations.");
            }
            if (typeof bodyMacroName !== 'string') {
                throw new Error("unrolled_loop expects a string for the body macro name.");
            }

            const operations: QuantumOperation[] = [];
            for (let i = 0; i < iterations; i++) {
                const loopContext = new Map(context);
                loopContext.set('i', i); // Add loop index to context

                const bodyMacroCall: MacroCallNode = {
                    type: 'MacroCall',
                    name: bodyMacroName as 'string',
                    arguments: bodyArgs,
                };
                
                // Recursively call expand for the inner macro
                const expandedOps = this.expand(bodyMacroCall, loopContext);
                operations.push(...expandedOps);
            }
            return operations;
        }
    });

    /**
     * `rotate_by_context(contextVar, targetQubit)`
     * Applies an RZ rotation gate where the angle is fetched from a classical context variable.
     * Example: rotate_by_context('rotation_angle', 1)
     */
    this.registerMacro({
      name: 'rotate_by_context',
      parameters: ['contextVar', 'targetQubit'],
      body: (args, context) => {
        const [contextVar, targetQubit] = args;
        if (
          typeof contextVar !== 'string' ||
          typeof targetQubit !== 'number'
        ) {
          throw new Error(
            "Invalid argument types for rotate_by_context. Expected (string, number).",
          );
        }

        const angle = context.get(contextVar);
        if (typeof angle !== 'number') {
          throw new Error(
            `Context variable "${contextVar}" used in rotate_by_context is not a number. Found: ${typeof angle}`,
          );
        }

        return [{ gate: 'RZ', params: [angle], targets: [targetQubit] }];
      },
    });
  }
}