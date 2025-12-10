/**
 * @file src/security/QuantumSignatureVerifier.ts
 * @description Verifies Quantum Code Signatures, supporting both classical and Post-Quantum Cryptography algorithms.
 * This module provides a unified interface for verifying digital signatures from various cryptographic schemes,
 * ensuring code integrity and authenticity in the .u language ecosystem.
 */

import { createVerify, KeyObject } from 'crypto';
// NOTE: The '@u-lang/pqc-crypto' package is a hypothetical dependency representing a library
// that provides stable, production-ready implementations of NIST PQC standard algorithms.
// In a real-world scenario, this would be replaced with a concrete implementation like
// OQS-JS (liboqs compiled to WebAssembly) or another suitable PQC library.
import { Dilithium, Falcon, Sphincs } from '@u-lang/pqc-crypto';

/**
 * Defines the set of supported classical signature algorithms.
 */
export type ClassicalAlgorithm = 'ecdsa-p256-sha256' | 'rsa-pss-sha256';

/**
 * Defines the set of supported Post-Quantum Cryptography (PQC) signature algorithms.
 * These correspond to algorithms selected or being standardized by NIST.
 * - 'dilithium2': CRYSTALS-Dilithium Round 3, Security Level 2.
 * - 'falcon-512': Falcon Round 3, Security Level 1.
 * - 'sphincs-sha256-128f-robust': SPHINCS+ Round 3, stateless hash-based signatures.
 */
export type PostQuantumAlgorithm = 'dilithium2' | 'falcon-512' | 'sphincs-sha256-128f-robust';

/**
 * A union type representing all supported signature verification algorithms.
 */
export type SupportedAlgorithm = ClassicalAlgorithm | PostQuantumAlgorithm;

// --- Custom Error Types ---

/**
 * Base class for all signature verification errors.
 */
export class QuantumSignatureError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'QuantumSignatureError';
    }
}

/**
 * Thrown when an unsupported signature algorithm is requested.
 */
export class UnsupportedAlgorithmError extends QuantumSignatureError {
    constructor(public readonly algorithm: string) {
        super(`Unsupported signature algorithm: ${algorithm}`);
        this.name = 'UnsupportedAlgorithmError';
    }
}

/**
 * Thrown when signature verification fails due to an invalid signature.
 */
export class InvalidSignatureError extends QuantumSignatureError {
    constructor(public readonly algorithm: SupportedAlgorithm) {
        super(`Verification failed for algorithm ${algorithm}. The signature is invalid.`);
        this.name = 'InvalidSignatureError';
    }
}

/**
 * Thrown when a public key is malformed or incompatible with the specified algorithm.
 */
export class MalformedKeyError extends QuantumSignatureError {
    constructor(public readonly algorithm: SupportedAlgorithm, reason: string) {
        super(`Malformed public key for algorithm ${algorithm}: ${reason}`);
        this.name = 'MalformedKeyError';
    }
}


type VerificationFunction = (data: Buffer, signature: Buffer, publicKey: Buffer) => Promise<boolean>;

/**
 * A static utility class for verifying digital signatures.
 * It supports a hybrid of classical (ECDSA, RSA) and post-quantum (Dilithium, Falcon, SPHINCS+) algorithms.
 */
export class QuantumSignatureVerifier {
    private static readonly verifiers: Map<SupportedAlgorithm, VerificationFunction> = new Map();

    // Statically initialize the verifier map. This block runs once when the class is loaded.
    static {
        this.initializeVerifiers();
    }

    /**
     * Populates the map of algorithm names to their verification functions.
     * This approach allows for easy extension with new algorithms.
     */
    private static initializeVerifiers(): void {
        // Classical Algorithms
        this.verifiers.set('ecdsa-p256-sha256', this.verifyEcdsa);
        this.verifiers.set('rsa-pss-sha256', this.verifyRsa);

        // Post-Quantum Algorithms
        this.verifiers.set('dilithium2', this.verifyDilithium);
        this.verifiers.set('falcon-512', this.verifyFalcon);
        this.verifiers.set('sphincs-sha256-128f-robust', this.verifySphincs);
    }

    /**
     * Verifies a digital signature against the provided data and public key.
     *
     * @param data The original data (message) that was signed.
     * @param signature The signature to verify.
     * @param publicKey The public key corresponding to the private key used for signing.
     * @param algorithm The signature algorithm to use for verification.
     * @returns A promise that resolves to `true` if the signature is valid, and `false` otherwise.
     * @throws {UnsupportedAlgorithmError} If the specified algorithm is not supported.
     * @throws {MalformedKeyError} If the public key is invalid for the given algorithm.
     * @throws {QuantumSignatureError} For other verification-related failures.
     */
    public static async verify(
        data: Buffer,
        signature: Buffer,
        publicKey: Buffer,
        algorithm: SupportedAlgorithm
    ): Promise<boolean> {
        const verifier = this.verifiers.get(algorithm);

        if (!verifier) {
            throw new UnsupportedAlgorithmError(algorithm);
        }

        try {
            return await verifier(data, signature, publicKey);
        } catch (error) {
            if (error instanceof QuantumSignatureError) {
                throw error; // Re-throw our custom errors
            }
            // Wrap unexpected errors from underlying crypto libraries
            const cause = error instanceof Error ? error.message : String(error);
            throw new QuantumSignatureError(`An unexpected error occurred during ${algorithm} verification: ${cause}`);
        }
    }

    // --- Classical Verification Implementations ---

    private static async verifyEcdsa(data: Buffer, signature: Buffer, publicKey: Buffer): Promise<boolean> {
        try {
            const verify = createVerify('sha256');
            verify.update(data);
            return verify.verify({ key: publicKey, format: 'pem', type: 'pkcs8' }, signature);
        } catch (e) {
            throw new MalformedKeyError('ecdsa-p256-sha256', (e as Error).message);
        }
    }

    private static async verifyRsa(data: Buffer, signature: Buffer, publicKey: Buffer): Promise<boolean> {
        try {
            const verify = createVerify('sha256');
            verify.update(data);
            const keyObject: KeyObject = {
                key: publicKey,
                format: 'pem',
                type: 'spki',
                padding: 'pss',
                saltLength: 'auto',
            };
            return verify.verify(keyObject, signature);
        } catch (e) {
            throw new MalformedKeyError('rsa-pss-sha256', (e as Error).message);
        }
    }

    // --- Post-Quantum Verification Implementations ---

    private static async verifyDilithium(data: Buffer, signature: Buffer, publicKey: Buffer): Promise<boolean> {
        try {
            // The hypothetical PQC library is expected to return a boolean.
            // It should throw an error for malformed keys or signatures.
            return await Dilithium.verify(signature, data, publicKey);
        } catch (e) {
            // Differentiate between a failed verification (returns false) and an error (e.g., bad key)
            throw new MalformedKeyError('dilithium2', (e as Error).message);
        }
    }

    private static async verifyFalcon(data: Buffer, signature: Buffer, publicKey: Buffer): Promise<boolean> {
        try {
            return await Falcon.verify(signature, data, publicKey);
        } catch (e) {
            throw new MalformedKeyError('falcon-512', (e as Error).message);
        }
    }

    private static async verifySphincs(data: Buffer, signature: Buffer, publicKey: Buffer): Promise<boolean> {
        try {
            return await Sphincs.verify(signature, data, publicKey);
        } catch (e) {
            throw new MalformedKeyError('sphincs-sha256-128f-robust', (e as Error).message);
        }
    }
}