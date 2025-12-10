import { Type, TypeKind, isTypeEqual, isSubtype } from './TypeDefinitions';
import { Diagnostic, DiagnosticCode } from '../diagnostics/Diagnostic';
import { Token, TokenKind } from '../syntax/Token';

/**
 * Defines the nature of the projection from one type to another within the
 * Holographic Type System.
 */
export enum ProjectionKind {
    /**
     * A safe, lossless conversion (e.g., Int -> Float, or T -> Hologram<T>).
     * Can be applied implicitly.
     */
    Identity = 'Identity',

    /**
     * A dimensional expansion. The data is preserved but lifted into a higher
     * holographic state (e.g., Bool -> QResult).
     */
    Expansion = 'Expansion',

    /**
     * A dimensional collapse. Information might be lost or a probabilistic
     * collapse might occur (e.g., QResult -> Bool).
     * Usually requires explicit casting unless in specific control flow contexts.
     */
    Collapse = 'Collapse',

    /**
     * A reinterpretation of the underlying bit pattern or structure.
     * Always requires explicit casting.
     */
    Reinterpretation = 'Reinterpretation',

    /**
     * No valid projection exists.
     */
    None = 'None'
}

export interface ProjectionResult {
    kind: ProjectionKind;
    cost: number; // Used for overload resolution preference
    diagnostics?: Diagnostic[];
}

/**
 * Manages the logic for projecting types onto other types.
 * In the .u language, this handles standard coercions as well as
 * holographic collapses (Quantum -> Classical).
 */
export class ProjectionResolver {
    
    /**
     * Determines if a source type can be implicitly projected to a target type.
     * Implicit projections are allowed for Identity and Expansion, and sometimes
     * Collapse in specific contexts (like boolean checks).
     */
    public static resolveImplicit(source: Type, target: Type): ProjectionResult {
        if (isTypeEqual(source, target)) {
            return { kind: ProjectionKind.Identity, cost: 0 };
        }

        // Handle Subtyping (Polymorphism)
        if (isSubtype(source, target)) {
            return { kind: ProjectionKind.Identity, cost: 1 };
        }

        // Holographic Expansions (Classical -> Quantum/Holographic)
        if (this.isClassicalToHolographic(source, target)) {
            return { kind: ProjectionKind.Expansion, cost: 2 };
        }

        // Specific Implicit Collapses (e.g., QResult in a conditional)
        // While generally unsafe, .u allows QResult -> Bool in 'if' statements implicitly
        // treating it as a measurement.
        if (this.isMeasurementContext(source, target)) {
            return { kind: ProjectionKind.Collapse, cost: 10 };
        }

        return { kind: ProjectionKind.None, cost: Infinity };
    }

    /**
     * Determines if a source type can be explicitly projected (cast) to a target type.
     * This allows for lossy collapses and reinterpretations.
     */
    public static resolveExplicit(source: Type, target: Type): ProjectionResult {
        // Check implicit first, as all implicit projections are valid explicit ones
        const implicit = this.resolveImplicit(source, target);
        if (implicit.kind !== ProjectionKind.None) {
            return implicit;
        }

        // Holographic Collapses (Quantum -> Classical)
        // e.g., cast QResult -> Bool (forces measurement)
        if (this.isHolographicToClassical(source, target)) {
            return { kind: ProjectionKind.Collapse, cost: 5 };
        }

        // Numeric Projections (Float -> Int)
        if (this.isNumericTruncation(source, target)) {
            return { kind: ProjectionKind.Collapse, cost: 4 };
        }

        // Structural Projections (e.g., extracting primary dimension from a Manifold)
        if (this.isManifoldProjection(source, target)) {
            return { kind: ProjectionKind.Collapse, cost: 6 };
        }

        return { kind: ProjectionKind.None, cost: Infinity };
    }

    // -------------------------------------------------------------------------
    // Specific Projection Logic
    // -------------------------------------------------------------------------

    private static isClassicalToHolographic(source: Type, target: Type): boolean {
        // Bool -> QResult
        if (source.kind === TypeKind.Bool && target.kind === TypeKind.QResult) return true;
        // Int -> Superposition<Int>
        if (source.kind === TypeKind.Int && this.isSuperpositionOf(target, TypeKind.Int)) return true;
        
        return false;
    }

    private static isHolographicToClassical(source: Type, target: Type): boolean {
        // QResult -> Bool (Measurement)
        if (source.kind === TypeKind.QResult && target.kind === TypeKind.Bool) return true;
        // Superposition<T> -> T (Collapse to single state)
        if (this.isSuperposition(source) && isTypeEqual(this.unwrapSuperposition(source), target)) return true;

        return false;
    }

    private static isMeasurementContext(source: Type, target: Type): boolean {
        // In .u, a QResult can be used where a Bool is expected, implying an immediate measurement.
        return source.kind === TypeKind.QResult && target.kind === TypeKind.Bool;
    }

    private static isNumericTruncation(source: Type, target: Type): boolean {
        return (source.kind === TypeKind.Float && target.kind === TypeKind.Int) ||
               (source.kind === TypeKind.Float64 && target.kind === TypeKind.Float32);
    }

    private static isManifoldProjection(source: Type, target: Type): boolean {
        // A Manifold<T, N> can be explicitly projected to T (taking the 0th coordinate)
        if (source.kind === TypeKind.Manifold) {
            const baseType = (source as any).baseType; // Assuming Manifold structure
            return isTypeEqual(baseType, target);
        }
        return false;
    }

    // -------------------------------------------------------------------------
    // Type Helpers
    // -------------------------------------------------------------------------

    private static isSuperposition(type: Type): boolean {
        return type.kind === TypeKind.Superposition;
    }

    private static isSuperpositionOf(type: Type, kind: TypeKind): boolean {
        if (type.kind !== TypeKind.Superposition) return false;
        const inner = (type as any).innerType;
        return inner && inner.kind === kind;
    }

    private static unwrapSuperposition(type: Type): Type {
        if (type.kind !== TypeKind.Superposition) throw new Error("Not a superposition");
        return (type as any).innerType;
    }
}

/**
 * Represents a registered projection rule in the compiler.
 */
export class ProjectionRule {
    constructor(
        public readonly sourceKind: TypeKind,
        public readonly targetKind: TypeKind,
        public readonly handler: (source: Type, target: Type) => ProjectionResult
    ) {}
}

/**
 * Registry for custom user-defined projections or plugin-based types.
 */
export class ProjectionRegistry {
    private static rules: ProjectionRule[] = [];

    public static register(rule: ProjectionRule) {
        this.rules.push(rule);
    }

    public static findCustomProjection(source: Type, target: Type): ProjectionResult | null {
        for (const rule of this.rules) {
            if (rule.sourceKind === source.kind && rule.targetKind === target.kind) {
                return rule.handler(source, target);
            }
        }
        return null;
    }
}