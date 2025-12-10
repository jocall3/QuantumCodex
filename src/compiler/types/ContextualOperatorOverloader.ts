// src/compiler/types/ContextualOperatorOverloader.ts

// These would be actual imports from other modules in the compiler project.
// For this file, we use module augmentation to declare the shape of these types.
import { U_Type } from './U_Type';
import { ExecutionContext } from '../runtime/ExecutionContext';
import { ASTNode } from '../parser/ast';

/**
 * Defines the set of overloadable operators in the .u language.
 * This includes standard operators and allows for custom string-based operators.
 */
export type U_Operator =
  // Arithmetic
  | '+' | '-' | '*' | '/' | '%' | '**'
  // Bitwise
  | '&' | '|' | '^' | '~' | '<<' | '>>' | '>>>'
  // Comparison
  | '==' | '!=' | '===' | '!==' | '<' | '>' | '<=' | '>='
  // Logical
  | '&&' | '||'
  // Unary
  | '!' | '++' | '--'
  // Custom operators are represented as strings
  | string;

/**
 * Specifies the condition under which an operator overload is active.
 * A context specifier can be a simple string tag (e.g., a module name, a pragma)
 * or a complex predicate function that evaluates the current ExecutionContext.
 */
export type ContextSpecifier = string | ((context: ExecutionContext) => boolean);

/**
 * Represents a single, potentially "quantum" operator overload definition.
 * This structure holds the information parsed from a .u source file that defines
 * an operator's specific behavior under certain conditions.
 */
export interface OperatorOverload {
  /** The operator being overloaded (e.g., '+', '==', '<=>'). */
  readonly operator: U_Operator;

  /** The type of the left-hand operand. Null for unary prefix operators. */
  readonly leftOperandType: U_Type | null;

  /** The type of the right-hand operand. Null for unary operators. */
  readonly rightOperandType: U_Type | null;

  /** The resulting type of the operation. */
  readonly returnType: U_Type;

  /**
   * A reference to the implementation of the operator. This could be an AST
   * node for a user-defined function or a well-known intrinsic identifier
   * for highly optimized, built-in behavior.
   */
  readonly implementation: ASTNode | { readonly intrinsic: string };

  /**
   * The context in which this overload is valid. This is the core of
   * "Contextual Overloading," allowing operator behavior to be scoped.
   */
  readonly contextSpecifier: ContextSpecifier;

  /**
   * A priority value to resolve ambiguities when multiple overloads match.
   * Higher values have higher priority. This models the "quantum weight"
   * of an overload, allowing developers to explicitly favor one over another.
   * Defaults to 0.
   */
  readonly priority?: number;
}

/**
 * Represents a successfully resolved operator overload, ready for type-checking
 * and code generation. This is the result of "collapsing the superposition"
 * of all possible overloads into a single, definitive choice.
 */
export interface ResolvedOverload {
  /** The definitive overload that was chosen. */
  readonly overload: OperatorOverload;

  /**
   * The calculated specificity of the match. Used internally for resolution
   * but can be exposed for diagnostics and language tooling. Higher is more specific.
   */
  readonly matchScore: number;
}

/**
 * Error thrown when operator resolution fails due to multiple, equally-valid
 * overloads being available in the current context.
 */
export class OperatorAmbiguityError extends Error {
  constructor(
    public readonly operator: U_Operator,
    public readonly conflictingOverloads: readonly OperatorOverload[],
    public readonly context: ExecutionContext
  ) {
    const details = conflictingOverloads
      .map(ov => `  - For types (${ov.leftOperandType?.name ?? 'unary'}, ${ov.rightOperandType?.name ?? 'unary'}) in context: ${ov.contextSpecifier.toString()}`)
      .join('\n');
    super(`Ambiguous operator "${operator}". Multiple overloads match the current context with the same highest score:\n${details}`);
    this.name = 'OperatorAmbiguityError';
  }
}

/**
 * Error thrown when no suitable operator overload can be found for the given
 * operands and context.
 */
export class NoMatchingOperatorError extends Error {
    constructor(
        public readonly operator: U_Operator,
        public readonly leftType: U_Type | null,
        public readonly rightType: U_Type | null,
        public readonly context: ExecutionContext
    ) {
        const leftTypeName = leftType ? leftType.name : '(unary)';
        const rightTypeName = rightType ? rightType.name : '(unary)';
        super(`No matching overload found for operator "${operator}" with operand types (${leftTypeName}, ${rightTypeName}) in the current context.`);
        this.name = 'NoMatchingOperatorError';
    }
}

/**
 * Manages the registration and resolution of context-sensitive operator overloads.
 * This system allows the behavior of operators to change dynamically based on the
 * execution context, embodying the language's principle of "Contextual Quantum Overloading".
 */
export class ContextualOperatorOverloader {
  private readonly overloads: Map<U_Operator, OperatorOverload[]> = new Map();

  /**
   * Registers a new operator overload definition.
   * This is typically called by the parser or semantic analyzer when it encounters
   * an `operator` definition block in the source code.
   * @param overload The overload definition to register.
   */
  public register(overload: OperatorOverload): void {
    if (!this.overloads.has(overload.operator)) {
      this.overloads.set(overload.operator, []);
    }
    this.overloads.get(overload.operator)!.push(overload);
  }

  /**
   * Resolves the appropriate operator overload for a given operation and context.
   * This is the core logic that simulates "quantum collapse" by finding all
   * potential overloads (the superposition) and selecting the single best one
   * based on a scoring of context, type matching, and explicit priority.
   *
   * @param operator The operator token (e.g., '+').
   * @param leftOperandType The type of the left operand, or null for unary prefix.
   * @param rightOperandType The type of the right operand, or null for unary.
   * @param context The current execution context for the operation.
   * @returns The uniquely resolved operator overload.
   * @throws {NoMatchingOperatorError} If no suitable overload is found.
   * @throws {OperatorAmbiguityError} If multiple overloads match with the same highest score.
   */
  public resolve(
    operator: U_Operator,
    leftOperandType: U_Type | null,
    rightOperandType: U_Type | null,
    context: ExecutionContext
  ): ResolvedOverload {
    const candidateOverloads = this.overloads.get(operator) || [];
    if (candidateOverloads.length === 0) {
      throw new NoMatchingOperatorError(operator, leftOperandType, rightOperandType, context);
    }

    const scoredMatches: ResolvedOverload[] = [];

    for (const overload of candidateOverloads) {
      const score = this.calculateMatchScore(overload, leftOperandType, rightOperandType, context);
      if (score > 0) {
        scoredMatches.push({ overload, matchScore: score });
      }
    }

    if (scoredMatches.length === 0) {
      throw new NoMatchingOperatorError(operator, leftOperandType, rightOperandType, context);
    }

    // Sort by score in descending order to find the best match(es).
    scoredMatches.sort((a, b) => b.matchScore - a.matchScore);

    const bestMatch = scoredMatches[0];
    const bestScore = bestMatch.matchScore;

    // Check for ambiguity: if there's more than one match with the same top score.
    if (scoredMatches.length > 1 && scoredMatches[1].matchScore === bestScore) {
      const conflicting = scoredMatches.filter(m => m.matchScore === bestScore).map(m => m.overload);
      throw new OperatorAmbiguityError(operator, conflicting, context);
    }

    return bestMatch;
  }

  /**
   * Calculates a score indicating how well an overload matches the given criteria.
   * A higher score means a better match. A score of 0 means no match.
   * The score is a composite of context match, type specificity, and explicit priority,
   * ensuring a deterministic resolution process.
   *
   * @param overload The overload to score.
   * @param leftType The actual left operand type.
   * @param rightType The actual right operand type.
   * @param context The current execution context.
   * @returns A numeric score representing the match quality.
   */
  private calculateMatchScore(
    overload: OperatorOverload,
    leftType: U_Type | null,
    rightType: U_Type | null,
    context: ExecutionContext
  ): number {
    const contextScore = this.getContextMatchScore(overload.contextSpecifier, context);
    if (contextScore === 0) return 0; // Not applicable in this context.

    const typeScore = this.getTypeMatchScore(
        overload.leftOperandType,
        overload.rightOperandType,
        leftType,
        rightType
    );
    if (typeScore === 0) return 0; // Types do not match.

    // Combine scores with weighting to establish a clear hierarchy of importance.
    // A higher-level category (like context) should outweigh any combination
    // of lower-level scores.
    // Context Score: 1000s place
    // Type Score:    100s place
    // Priority:      1s place
    const explicitPriority = overload.priority ?? 0;
    return (contextScore * 1000) + (typeScore * 100) + explicitPriority;
  }

  /**
   * Scores how well an overload's context specifier matches the current context.
   * @returns A score (e.g., 1 for a match, 0 for no match). Could be more granular.
   */
  private getContextMatchScore(specifier: ContextSpecifier, context: ExecutionContext): number {
    if (typeof specifier === 'string') {
      // Simple string match: checks if the context has a tag/name that matches.
      // This could be a module name, a `#context` block identifier, etc.
      return context.hasTag(specifier) ? 1 : 0;
    }
    if (typeof specifier === 'function') {
      // Predicate function provides maximum flexibility for complex contextual rules.
      return specifier(context) ? 1 : 0;
    }
    return 0;
  }

  /**
   * Scores how well the overload's parameter types match the actual operand types.
   * This logic would integrate with the compiler's main type system.
   *
   * Score breakdown:
   * - 10: Exact match
   * - 5:  Assignable match (e.g., actual type is a subtype of overload's parameter)
   * - 1:  Conversion possible (not implemented in this placeholder)
   * - 0:  No match
   *
   * @returns A combined score for both operands.
   */
  private getTypeMatchScore(
    overloadLeft: U_Type | null,
    overloadRight: U_Type | null,
    actualLeft: U_Type | null,
    actualRight: U_Type | null
  ): number {
    const leftScore = this.getSingleTypeMatchScore(overloadLeft, actualLeft);
    if (leftScore === 0) return 0;

    const rightScore = this.getSingleTypeMatchScore(overloadRight, actualRight);
    if (rightScore === 0) return 0;

    return leftScore + rightScore;
  }

  private getSingleTypeMatchScore(overloadType: U_Type | null, actualType: U_Type | null): number {
    // Handle unary cases where one type is null for both definition and usage.
    if (overloadType === null && actualType === null) {
        return 10; // Perfect match for a non-existent operand.
    }
    // Mismatch in arity (e.g., unary overload for binary usage).
    if (overloadType === null || actualType === null) {
        return 0;
    }

    if (actualType.isExactly(overloadType)) {
      return 10;
    }

    if (actualType.isSubtypeOf(overloadType)) {
      return 5;
    }
    
    // A full implementation would also check for implicit conversions.
    // if (this.typeSystem.canImplicitlyConvertTo(actualType, overloadType)) {
    //   return 1;
    // }

    return 0;
  }

  /**
   * Clears all registered overloads. Useful for testing or for language servers
   * that need to re-evaluate source code without restarting.
   */
  public clear(): void {
    this.overloads.clear();
  }
}

// =============================================================================
// PLACEHOLDER TYPE DEFINITIONS
// In a real project, these would be imported from their respective files.
// We use `declare module` to simulate their existence for type-checking.
// =============================================================================

declare module './U_Type' {
  /** Represents a type in the .u language's type system. */
  export interface U_Type {
    readonly name: string;
    isExactly(other: U_Type): boolean;
    isSubtypeOf(other: U_Type): boolean;
  }
}

declare module '../runtime/ExecutionContext' {
  /** Represents the state and scope at a specific point in the code. */
  export interface ExecutionContext {
    /** Checks if a named context tag is active in the current scope. */
    hasTag(tag: string): boolean;
    // ... other properties like current module, scope stack, etc.
  }
}

declare module '../parser/ast' {
  /** A node in the Abstract Syntax Tree. */
  export interface ASTNode {
    readonly type: string;
    readonly location: any; // Source location info
    // ... other properties of an AST node
  }
}