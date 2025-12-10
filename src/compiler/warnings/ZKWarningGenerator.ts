/**
 * @file src/compiler/warnings/ZKWarningGenerator.ts
 * @description Generates Zero-Knowledge Compiler Warnings, attaching ZK proofs to compiler alerts about QPU properties.
 *
 * This module is responsible for analyzing the abstract syntax tree (AST) of a .u program
 * against the properties of a target Quantum Processing Unit (QPU). It generates warnings
 * for potential issues, such as low gate fidelity or stale calibration data.
 *
 * A key feature is the attachment of a Zero-Knowledge (ZK) proof to each warning.
 * This allows the compiler to make a verifiable claim about the QPU's state (e.g., "the
 * fidelity for this gate is below a certain threshold") without revealing the exact,
 * potentially sensitive, private data (e.g., the precise fidelity value). This is crucial
 * in distributed or untrusted compilation environments.
 */

// =============================================================================
// Type Definitions & Interfaces
// In a real project, these would be imported from shared type definition files.
// =============================================================================

/**
 * Represents a node in the Abstract Syntax Tree (AST) of a .u program.
 */
export interface ASTNode {
    type: string;
    location: {
        start: { line: number; column: number };
        end: { line: number; column: number };
    };
    // Other properties specific to the node type would exist here.
    // For example, a 'GateApplication' node might have 'gateName' and 'qubits'.
    [key: string]: any;
}

/**
 * Describes the properties and capabilities of a target Quantum Processing Unit (QPU).
 */
export interface QPUProfile {
    id: string;
    vendor: string;
    model: string;
    qubitCount: number;
    supportedGates: string[];
    gateFidelity: Record<string, number>; // e.g., { "cx": 0.995, "h": 0.999 }
    coherenceTime: { t1: number; t2: number }; // in microseconds
    lastCalibrationTimestamp: number; // Unix timestamp in seconds
}

/**
 * Represents a Zero-Knowledge proof object.
 */
export interface ZKProof {
    /** A human-readable statement of what is being proven. */
    statement: string;
    /** The cryptographic proof data, often as a hex string. */
    proof: string;
    /** The public inputs used for verification. */
    publicInputs: any[];
}

/**
 * An abstract interface for a service that generates and verifies ZK proofs.
 * This would be implemented by a concrete class that interacts with a ZK-SNARK/STARK library
 * like snarkjs, circom, or a custom proving system.
 */
export interface ZKProofService {
    /**
     * Generates a ZK proof for a given statement.
     * @param statementId - An identifier for the pre-compiled ZK circuit (e.g., 'gateFidelityBelowThreshold').
     * @param privateInputs - The secret data the proof is about.
     * @param publicInputs - The public data the proof is verified against.
     * @returns A promise that resolves to the ZKProof object.
     */
    generateProof(statementId: string, privateInputs: object, publicInputs: object): Promise<ZKProof>;
}

/**
 * Represents a compiler warning enhanced with a ZK proof.
 */
export interface ZKCompilerWarning {
    /** A unique code for the warning type (e.g., 'ZK-QPU-001'). */
    code: string;
    /** The human-readable warning message. */
    message: string;
    /** The AST node that triggered the warning. */
    node: ASTNode;
    /** The severity level of the warning. */
    severity: 'low' | 'medium' | 'high';
    /** The optional ZK proof attached to this warning. */
    zkProof: ZKProof;
}


// =============================================================================
// ZKWarningGenerator Class
// =============================================================================

/**
 * Analyzes a program's AST against a QPU profile to generate warnings
 * with attached Zero-Knowledge proofs.
 */
export class ZKWarningGenerator {
    private readonly zkProofService: ZKProofService;
    private readonly targetQPU: QPUProfile;

    // Configuration for warning thresholds.
    private static readonly FIDELITY_THRESHOLD = 0.99; // Warn if gate fidelity is below 99%
    private static readonly MAX_CALIBRATION_AGE_SECONDS = 7 * 24 * 60 * 60; // 1 week

    /**
     * Constructs a new ZKWarningGenerator.
     * @param zkProofService - An instance of a service to generate ZK proofs.
     * @param targetQPU - The profile of the target QPU for compilation.
     */
    constructor(zkProofService: ZKProofService, targetQPU: QPUProfile) {
        this.zkProofService = zkProofService;
        this.targetQPU = targetQPU;
    }

    /**
     * Analyzes the entire AST and generates a list of ZK-enhanced warnings.
     * @param astRoot - The root node of the program's AST.
     * @returns A promise that resolves to an array of ZKCompilerWarning objects.
     */
    public async analyze(astRoot: ASTNode): Promise<ZKCompilerWarning[]> {
        const warnings: ZKCompilerWarning[] = [];
        const nodes = this.flattenAst(astRoot);

        // --- Global Checks (run once) ---
        const calibrationWarning = await this.checkCalibrationStatus(astRoot);
        if (calibrationWarning) {
            warnings.push(calibrationWarning);
        }

        // --- Node-specific Checks ---
        for (const node of nodes) {
            if (node.type === 'GateApplication') {
                const fidelityWarning = await this.checkGateFidelity(node);
                if (fidelityWarning) {
                    warnings.push(fidelityWarning);
                }
            }
            // Add other node-specific checks here...
        }

        return warnings;
    }

    /**
     * Performs a depth-first traversal to flatten the AST into a list of nodes.
     * @param node - The starting AST node.
     * @returns An array of all nodes in the subtree.
     */
    private flattenAst(node: ASTNode): ASTNode[] {
        const nodes: ASTNode[] = [node];
        for (const key in node) {
            if (node.hasOwnProperty(key)) {
                const value = node[key];
                if (typeof value === 'object' && value !== null && value.type) {
                    nodes.push(...this.flattenAst(value as ASTNode));
                } else if (Array.isArray(value)) {
                    for (const item of value) {
                        if (typeof item === 'object' && item !== null && item.type) {
                            nodes.push(...this.flattenAst(item as ASTNode));
                        }
                    }
                }
            }
        }
        return nodes;
    }

    /**
     * Checks if the QPU's calibration data is stale and generates a warning if so.
     * @param node - The AST node to attach the warning to (e.g., the root).
     * @returns A ZKCompilerWarning or null.
     */
    private async checkCalibrationStatus(node: ASTNode): Promise<ZKCompilerWarning | null> {
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const calibrationAge = currentTimestamp - this.targetQPU.lastCalibrationTimestamp;

        if (calibrationAge > ZKWarningGenerator.MAX_CALIBRATION_AGE_SECONDS) {
            const daysOld = Math.floor(calibrationAge / (24 * 60 * 60));
            const message = `The target QPU '${this.targetQPU.id}' was last calibrated over ${daysOld} days ago. Gate performance may not match reported fidelities.`;

            const publicInputs = {
                maxAgeSeconds: ZKWarningGenerator.MAX_CALIBRATION_AGE_SECONDS,
                evaluationTimestamp: currentTimestamp,
            };
            const privateInputs = {
                lastCalibrationTimestamp: this.targetQPU.lastCalibrationTimestamp,
            };

            const zkProof = await this.zkProofService.generateProof(
                'calibrationIsStale',
                privateInputs,
                publicInputs
            );

            return {
                code: 'ZK-QPU-001',
                message,
                node,
                severity: 'low',
                zkProof,
            };
        }
        return null;
    }

    /**
     * Checks the fidelity of an applied gate against a threshold.
     * @param node - The 'GateApplication' AST node.
     * @returns A ZKCompilerWarning or null.
     */
    private async checkGateFidelity(node: ASTNode): Promise<ZKCompilerWarning | null> {
        const gateName = node.gateName as string;
        if (!gateName || !this.targetQPU.gateFidelity.hasOwnProperty(gateName)) {
            return null; // Gate not in profile, another part of compiler should handle this error.
        }

        const actualFidelity = this.targetQPU.gateFidelity[gateName];
        const threshold = ZKWarningGenerator.FIDELITY_THRESHOLD;

        if (actualFidelity < threshold) {
            const message = `The fidelity for gate '${gateName}' (${actualFidelity.toFixed(4)}) on QPU '${this.targetQPU.id}' is below the recommended threshold of ${threshold}.`;

            const publicInputs = { gateName, threshold };
            const privateInputs = { actualFidelity };

            const zkProof = await this.zkProofService.generateProof(
                'gateFidelityBelowThreshold',
                privateInputs,
                publicInputs
            );

            return {
                code: 'ZK-QPU-002',
                message,
                node,
                severity: 'medium',
                zkProof,
            };
        }
        return null;
    }
}