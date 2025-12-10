import { v4 as uuidv4 } from 'uuid';

/**
 * Represents the fundamental kinds of types available in the .u Holographic Type System.
 */
export enum HolographicTypeKind {
    QUBIT = 'Qubit',
    QRESULT = 'QResult',
    QPREP = 'QPrep',
    CLASSICAL_REF = 'ClassicalRef',
    ENTANGLED_CLUSTER = 'EntangledCluster'
}

/**
 * Represents a complex number for quantum amplitude calculations within the type system.
 */
export interface Complex {
    real: number;
    imag: number;
}

/**
 * Defines the duality of a Holographic type.
 * Every type in .u has a projection in the Classical domain and the Quantum domain.
 */
export interface DualProjection<C, Q> {
    classical: C;
    quantum: Q;
}

/**
 * Base class for all Holographic Types in the .u language.
 */
export abstract class HolographicType {
    public abstract readonly kind: HolographicTypeKind;
    public readonly id: string;
    protected mutable: boolean;

    constructor(mutable: boolean = false) {
        this.id = uuidv4();
        this.mutable = mutable;
    }

    /**
     * Returns the string representation of the type for the compiler's symbol table.
     */
    public abstract toString(): string;

    /**
     * Determines if this type can be safely cast or projected to another type.
     */
    public abstract isCompatibleWith(other: HolographicType): boolean;

    /**
     * Returns the memory footprint estimation for this type.
     * Classical bits vs Qubits have different allocation strategies.
     */
    public abstract getAllocationSize(): number;
}

/**
 * Represents a `Qubit` type.
 * In the Holographic system, a Qubit type carries information about its
 * potential superposition state during static analysis if known, 
 * or marks it as a dynamic quantum resource.
 */
export class QubitType extends HolographicType {
    public readonly kind = HolographicTypeKind.QUBIT;
    
    // Metadata for static analysis (e.g., is this qubit currently tracked in a specific register?)
    private registerIndex: number | null = null;

    constructor(registerIndex: number | null = null) {
        super(true); // Qubits are inherently mutable via gates
        this.registerIndex = registerIndex;
    }

    public toString(): string {
        return `Qubit<${this.registerIndex !== null ? this.registerIndex : 'dynamic'}>`;
    }

    public isCompatibleWith(other: HolographicType): boolean {
        // A Qubit can be compatible with another Qubit (swap/move)
        // Or compatible with QResult via measurement
        return other.kind === HolographicTypeKind.QUBIT || other.kind === HolographicTypeKind.QRESULT;
    }

    public getAllocationSize(): number {
        // Represents 1 logical qubit unit
        return 1; 
    }

    /**
     * Returns the dual projection. 
     * Classical: A reference/pointer ID.
     * Quantum: A vector in Hilbert space (symbolic).
     */
    public getProjection(): DualProjection<string, string> {
        return {
            classical: `ref::${this.id}`,
            quantum: `|ψ⟩_${this.id}`
        };
    }
}

/**
 * Represents a `QResult` type.
 * This is the type returned after measuring a Qubit.
 * It exists in a superposition of being a classical boolean and a quantum history trace.
 */
export class QResultType extends HolographicType {
    public readonly kind = HolographicTypeKind.QRESULT;

    constructor() {
        super(false); // Results are immutable once measured
    }

    public toString(): string {
        return `QResult`;
    }

    public isCompatibleWith(other: HolographicType): boolean {
        // Can be used where Classical Refs are expected (like booleans)
        return other.kind === HolographicTypeKind.CLASSICAL_REF || other.kind === HolographicTypeKind.QRESULT;
    }

    public getAllocationSize(): number {
        // 1 bit for the result, plus overhead for probability metadata
        return 2; 
    }

    public getProjection(): DualProjection<boolean | null, number> {
        return {
            classical: null, // Unknown until runtime
            quantum: 1.0 // Probability sum check
        };
    }
}

/**
 * Represents a `QPrep` type.
 * This defines a preparation routine or a state initialization configuration.
 * It bridges the gap between classical configuration and quantum state injection.
 */
export class QPrepType extends HolographicType {
    public readonly kind = HolographicTypeKind.QPREP;
    
    // The basis state to prepare (e.g., '0', '1', '+', '-')
    public readonly basis: string;
    public readonly amplitude: Complex;

    constructor(basis: string = '0', real: number = 1, imag: number = 0) {
        super(false);
        this.basis = basis;
        this.amplitude = { real, imag };
    }

    public toString(): string {
        return `QPrep(|${this.basis}⟩)`;
    }

    public isCompatibleWith(other: HolographicType): boolean {
        // Can be applied to a Qubit
        return other.kind === HolographicTypeKind.QUBIT;
    }

    public getAllocationSize(): number {
        return 0; // Purely a configuration type, no runtime storage until applied
    }

    /**
     * Validates if the preparation parameters preserve unitarity (norm = 1).
     */
    public isValidState(): boolean {
        const norm = (this.amplitude.real ** 2) + (this.amplitude.imag ** 2);
        return Math.abs(norm - 1.0) < 0.0001;
    }
}

/**
 * Represents a classical type that interacts with the holographic system.
 * E.g., an integer controlling a rotation gate.
 */
export class ClassicalRefType extends HolographicType {
    public readonly kind = HolographicTypeKind.CLASSICAL_REF;
    public readonly primitiveType: 'int' | 'float' | 'bool';

    constructor(primitiveType: 'int' | 'float' | 'bool') {
        super(true);
        this.primitiveType = primitiveType;
    }

    public toString(): string {
        return `Classical<${this.primitiveType}>`;
    }

    public isCompatibleWith(other: HolographicType): boolean {
        return other.kind === HolographicTypeKind.CLASSICAL_REF;
    }

    public getAllocationSize(): number {
        switch (this.primitiveType) {
            case 'bool': return 1;
            case 'int': return 32;
            case 'float': return 64;
        }
    }
}

/**
 * The central registry for the Holographic Type System.
 * Manages type checking, inference, and projection logic for the compiler.
 */
export class HolographicTypeSystem {
    private static instance: HolographicTypeSystem;
    private typeCache: Map<string, HolographicType>;

    private constructor() {
        this.typeCache = new Map();
    }

    public static getInstance(): HolographicTypeSystem {
        if (!HolographicTypeSystem.instance) {
            HolographicTypeSystem.instance = new HolographicTypeSystem();
        }
        return HolographicTypeSystem.instance;
    }

    /**
     * Creates or retrieves a Qubit type definition.
     */
    public createQubit(registerIndex?: number): QubitType {
        const type = new QubitType(registerIndex);
        this.typeCache.set(type.id, type);
        return type;
    }

    /**
     * Creates a preparation state type.
     */
    public createQPrep(basis: string, real: number, imag: number): QPrepType {
        const type = new QPrepType(basis, real, imag);
        // Validate normalization immediately upon type creation
        if (!type.isValidState()) {
            console.warn(`Warning: QPrep created with non-normalized amplitude for basis |${basis}⟩`);
        }
        this.typeCache.set(type.id, type);
        return type;
    }

    /**
     * Resolves the result of an operation between two holographic types.
     * Used during semantic analysis to determine the resulting type of an expression.
     */
    public resolveOperation(op: string, left: HolographicType, right: HolographicType): HolographicType | null {
        // Example: Measuring a Qubit produces a QResult
        if (op === 'measure' && left.kind === HolographicTypeKind.QUBIT) {
            return new QResultType();
        }

        // Example: Applying QPrep to Qubit returns the modified Qubit
        if (op === 'apply' && left.kind === HolographicTypeKind.QPREP && right.kind === HolographicTypeKind.QUBIT) {
            return right;
        }

        // Example: CNOT (Qubit, Qubit) -> Entangled State (represented here as a Cluster or just valid op)
        if (op === 'cnot' && left.kind === HolographicTypeKind.QUBIT && right.kind === HolographicTypeKind.QUBIT) {
            return left; // Simplified: returns the control qubit, but state is mutated
        }

        return null;
    }

    /**
     * Checks if a classical value can be projected into a quantum context.
     * (e.g., using a boolean result to control a gate).
     */
    public canProjectClassicalToQuantum(type: HolographicType): boolean {
        if (type.kind === HolographicTypeKind.QRESULT) return true;
        if (type.kind === HolographicTypeKind.CLASSICAL_REF) {
            return (type as ClassicalRefType).primitiveType === 'bool';
        }
        return false;
    }
}