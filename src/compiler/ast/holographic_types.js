/**
 * @file Defines the data structures and classes that represent the Holographic Type System within the AST.
 * This will include types like `Qubit`, `QResult`, and `QPrep` with their classical and quantum projections.
 */

// Assuming a base ASTNode class exists for location tracking and other common AST properties.
// import { ASTNode } from './node.js';

/**
 * A placeholder for the base ASTNode. In a real implementation, this would
 * likely be imported and contain properties like source location.
 */
class ASTNode {
    constructor() {
        // In a real compiler, this would store token/source location information.
        this.location = null;
    }
}


/**
 * Base class for all types in the Holographic Type System.
 * @extends {ASTNode}
 */
export class HolographicType extends ASTNode {
    /**
     * @param {string} name The name of the type.
     */
    constructor(name) {
        super();
        this.name = name;
    }

    /**
     * Checks if this type is equal to another type.
     * @param {HolographicType} otherType The type to compare against.
     * @returns {boolean} True if the types are equal, false otherwise.
     */
    equals(otherType) {
        return otherType instanceof HolographicType && this.name === otherType.name;
    }

    /**
     * Returns the classical projection of this type.
     * For most classical types, this is the type itself.
     * For quantum types, it's their classical measurement equivalent.
     * @returns {HolographicType | null} The classical projection, or null if none exists.
     */
    getClassicalProjection() {
        // Default implementation for classical types
        return this;
    }

    /**
     * Returns the quantum projection of this type.
     * For most quantum types, this is the type itself.
     * For classical types, it's null as they don't have a direct quantum representation.
     * @returns {HolographicType | null} The quantum projection, or null if none exists.
     */
    getQuantumProjection() {
        // Default implementation for classical types
        return null;
    }

    /**
     * Provides a string representation of the type.
     * @returns {string}
     */
    toString() {
        return this.name;
    }
}

// --- Primitive Classical Types ---

export class IntType extends HolographicType {
    constructor() { super('Int'); }
}

export class FloatType extends HolographicType {
    constructor() { super('Float'); }
}

export class BoolType extends HolographicType {
    constructor() { super('Bool'); }
}

export class StringType extends HolographicType {
    constructor() { super('String'); }
}

export class VoidType extends HolographicType {
    constructor() { super('Void'); }
}

// --- Quantum Types ---

/**
 * Represents a Qubit, the fundamental unit of quantum information.
 */
export class QubitType extends HolographicType {
    constructor() {
        super('Qubit');
    }

    /**
     * A Qubit has no direct classical projection until measured.
     * @override
     * @returns {null}
     */
    getClassicalProjection() {
        return null;
    }

    /**
     * The quantum projection of a Qubit is itself.
     * @override
     * @returns {QubitType}
     */
    getQuantumProjection() {
        return this;
    }
}

/**
 * Represents the result of a quantum measurement.
 * This type bridges the quantum and classical realms.
 */
export class QResultType extends HolographicType {
    constructor() {
        super('QResult');
    }

    /**
     * The classical projection of a measurement result is a boolean (or bit).
     * @override
     * @returns {BoolType}
     */
    getClassicalProjection() {
        return TYPE_BOOL;
    }

    /**
     * A QResult is fundamentally a classical piece of information derived
     * from a quantum state, so it has no further quantum projection.
     * @override
     * @returns {null}
     */
    getQuantumProjection() {
        return null;
    }
}

/**
 * Represents a prepared quantum state, potentially a multi-qubit state.
 * This could be more abstract than a simple Qubit.
 */
export class QPrepType extends HolographicType {
    /**
     * @param {HolographicType} underlyingType The type of the state being prepared (e.g., Qubit, ArrayType<Qubit>).
     */
    constructor(underlyingType) {
        super(`QPrep<${underlyingType.toString()}>`);
        this.underlyingType = underlyingType;
    }

    /**
     * A prepared state has no direct classical projection.
     * @override
     * @returns {null}
     */
    getClassicalProjection() {
        return null;
    }

    /**
     * The quantum projection of a prepared state is its underlying quantum type.
     * @override
     * @returns {HolographicType}
     */
    getQuantumProjection() {
        return this.underlyingType;
    }

    /**
     * @override
     */
    equals(otherType) {
        return otherType instanceof QPrepType && this.underlyingType.equals(otherType.underlyingType);
    }
}


// --- Composite Types ---

/**
 * Represents an array of a specific type.
 */
export class ArrayType extends HolographicType {
    /**
     * @param {HolographicType} elementType The type of elements in the array.
     */
    constructor(elementType) {
        super(`Array<${elementType.toString()}>`);
        this.elementType = elementType;
    }

    /**
     * @override
     */
    equals(otherType) {
        return otherType instanceof ArrayType && this.elementType.equals(otherType.elementType);
    }

    /**
     * The classical projection of an array is an array of the classical projections of its elements.
     * Returns null if the element type has no classical projection.
     * @override
     */
    getClassicalProjection() {
        const elementProjection = this.elementType.getClassicalProjection();
        return elementProjection ? new ArrayType(elementProjection) : null;
    }

    /**
     * The quantum projection of an array is an array of the quantum projections of its elements.
     * Returns null if the element type has no quantum projection.
     * @override
     */
    getQuantumProjection() {
        const elementProjection = this.elementType.getQuantumProjection();
        return elementProjection ? new ArrayType(elementProjection) : null;
    }
}

/**
 * Represents a function type, including parameter types and return type.
 */
export class FunctionType extends HolographicType {
    /**
     * @param {HolographicType[]} paramTypes An array of types for the function parameters.
     * @param {HolographicType} returnType The return type of the function.
     */
    constructor(paramTypes, returnType) {
        const paramStr = paramTypes.map(p => p.toString()).join(', ');
        super(`(${paramStr}) -> ${returnType.toString()}`);
        this.paramTypes = paramTypes;
        this.returnType = returnType;
    }

    /**
     * @override
     */
    equals(otherType) {
        if (!(otherType instanceof FunctionType)) return false;
        if (this.paramTypes.length !== otherType.paramTypes.length) return false;
        
        for (let i = 0; i < this.paramTypes.length; i++) {
            if (!this.paramTypes[i].equals(otherType.paramTypes[i])) {
                return false;
            }
        }
        return this.returnType.equals(otherType.returnType);
    }

    /**
     * Projects the function signature to its classical equivalent.
     * Returns null if any part of the signature has no classical projection.
     * @override
     */
    getClassicalProjection() {
        const projectedParams = this.paramTypes.map(p => p.getClassicalProjection());
        const projectedReturn = this.returnType.getClassicalProjection();

        if (projectedParams.some(p => p === null) || projectedReturn === null) {
            return null;
        }
        return new FunctionType(projectedParams, projectedReturn);
    }

    /**
     * Projects the function signature to its quantum equivalent.
     * Returns null if any part of the signature has no quantum projection.
     * @override
     */
    getQuantumProjection() {
        const projectedParams = this.paramTypes.map(p => p.getQuantumProjection());
        const projectedReturn = this.returnType.getQuantumProjection();

        if (projectedParams.some(p => p === null) || projectedReturn === null) {
            return null;
        }
        return new FunctionType(projectedParams, projectedReturn);
    }
}

// --- Singleton instances for common primitive types ---
// This is a common optimization in compilers to avoid creating new type objects constantly.

export const TYPE_INT = new IntType();
export const TYPE_FLOAT = new FloatType();
export const TYPE_BOOL = new BoolType();
export const TYPE_STRING = new StringType();
export const TYPE_VOID = new VoidType();
export const TYPE_QUBIT = new QubitType();
export const TYPE_QRESULT = new QResultType();