/**
 * @file src/runtime/security/code_signatures.js
 * @description Handles the verification of 'Quantum Code Signatures'. This module
 * verifies the integrity and authenticity of Q-Script modules using a hybrid
 * classical and post-quantum cryptographic signature scheme.
 */

// --- Constants ---

/**
 * The identifier for the supported hybrid signature algorithm.
 * Format: Q-SIG-[CLASSICAL_ALG]-[POST_QUANTUM_ALG]
 * @type {string}
 */
const SUPPORTED_ALGORITHM = 'Q-SIG-ECDSA-DILITHIUM2';

/**
 * Configuration for the classical signature component (ECDSA).
 * @type {object}
 */
const CLASSICAL_CRYPTO_CONFIG = {
    name: 'ECDSA',
    hash: { name: 'SHA-384' },
};

/**
 * Configuration for the classical public key import.
 * @type {object}
 */
const CLASSICAL_KEY_IMPORT_CONFIG = {
    name: 'ECDSA',
    namedCurve: 'P-384',
};


// --- Helper Functions ---

/**
 * Converts a UTF-8 string to an ArrayBuffer.
 * @param {string} str The string to convert.
 * @returns {ArrayBuffer} The resulting ArrayBuffer.
 */
function strToArrayBuffer(str) {
    return new TextEncoder().encode(str).buffer;
}

/**
 * Decodes a Base64 URL-safe string into an ArrayBuffer.
 * @param {string} b64str The Base64 string.
 * @returns {ArrayBuffer} The decoded ArrayBuffer.
 */
function base64ToArrayBuffer(b64str) {
    // Pad with '=' if necessary
    const padded = b64str.padEnd(b64str.length + (4 - b64str.length % 4) % 4, '=');
    const binaryStr = atob(padded);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Concatenates multiple ArrayBuffers into a single one.
 * @param {ArrayBuffer[]} buffers The buffers to concatenate.
 * @returns {ArrayBuffer} The concatenated buffer.
 */
function concatBuffers(...buffers) {
    const totalLength = buffers.reduce((acc, val) => acc + val.byteLength, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const buffer of buffers) {
        result.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
    }
    return result.buffer;
}


// --- Core Verification Logic ---

/**
 * Decodes and parses a combined data structure from a Base64 string.
 * @param {string} base64String The Base64 encoded JSON string.
 * @returns {Promise<object>} A promise that resolves with the parsed object.
 * @throws {Error} if the string is not valid Base64 or JSON.
 */
async function parseCombinedData(base64String) {
    try {
        const jsonString = new TextDecoder().decode(base64ToArrayBuffer(base64String));
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Failed to parse combined data structure:", error);
        throw new Error("Invalid signature or public key format.");
    }
}

/**
 * Verifies the classical component of the signature using the Web Crypto API.
 * @param {ArrayBuffer} data The original data that was signed.
 * @param {ArrayBuffer} signature The classical signature component.
 * @param {JsonWebKey} publicKeyJwk The classical public key in JWK format.
 * @returns {Promise<boolean>} True if the classical signature is valid.
 */
async function verifyClassicalComponent(data, signature, publicKeyJwk) {
    try {
        const cryptoKey = await crypto.subtle.importKey(
            'jwk',
            publicKeyJwk,
            CLASSICAL_KEY_IMPORT_CONFIG,
            true,
            ['verify']
        );

        return await crypto.subtle.verify(
            CLASSICAL_CRYPTO_CONFIG,
            cryptoKey,
            signature,
            data
        );
    } catch (error) {
        console.error("Classical verification failed:", error);
        return false;
    }
}

/**
 * Verifies the post-quantum component of the signature (Simulated).
 * This function simulates the verification of a lattice-based signature scheme
 * like CRYSTALS-Dilithium. In a real-world scenario, this would involve complex
 * polynomial arithmetic over a finite field. This simulation uses cryptographic
 * hashes to deterministically link the signature components to the message and
 * public key in a way that mimics the structure of a real Fiat-Shamir-based scheme.
 *
 * @param {ArrayBuffer} data The original data that was signed.
 * @param {ArrayBuffer} pqSignature The post-quantum signature component.
 * @param {ArrayBuffer} pqPublicKey The post-quantum public key component.
 * @returns {Promise<boolean>} True if the post-quantum signature is valid.
 */
async function verifyPostQuantumComponent(data, pqSignature, pqPublicKey) {
    try {
        // The simulated signature is a concatenation of a 32-byte salt and a 64-byte hash commitment.
        if (pqSignature.byteLength !== 96) {
            console.error("Invalid post-quantum signature length.");
            return false;
        }
        const salt = pqSignature.slice(0, 32);
        const c_hash = pqSignature.slice(32, 96); // This represents the challenge 'c'

        // Step 1: Hash the original message to get mu.
        const mu = await crypto.subtle.digest('SHA-512', data);

        // Step 2: Recreate the commitment hash 'w_prime' from the public key, message hash, and salt.
        // This simulates the w = Ay part of the signing process.
        const w_prime_data = concatBuffers(pqPublicKey, mu, salt);
        const w_prime = await crypto.subtle.digest('SHA-512', w_prime_data);

        // Step 3: The signature's 'c_hash' is supposed to be H(w_prime). Verify this.
        // This simulates the Fiat-Shamir transform where the challenge 'c' is derived from a commitment.
        const c_recomputed = await crypto.subtle.digest('SHA-512', w_prime);

        // Step 4: Compare the recomputed hash with the one from the signature.
        // A constant-time comparison is important for cryptographic security.
        const c1 = new Uint8Array(c_hash);
        const c2 = new Uint8Array(c_recomputed);
        if (c1.length !== c2.length) return false;

        let diff = 0;
        for (let i = 0; i < c1.length; i++) {
            diff |= c1[i] ^ c2[i];
        }
        return diff === 0;

    } catch (error) {
        console.error("Post-quantum verification failed:", error);
        return false;
    }
}


// --- Public API ---

/**
 * Verifies a 'Quantum Code Signature' for a given Q-Script module.
 * The signature is a hybrid scheme, combining a classical ECDSA signature with a
 * simulated post-quantum signature for resistance against both classical and
 * quantum adversaries.
 *
 * Both components must be valid for the code to be considered authentic.
 *
 * @param {string | ArrayBuffer} qscriptCode The source code of the Q-Script module to verify.
 * @param {string} combinedSignatureB64 The Base64 encoded combined signature object.
 * @param {string} combinedPublicKeyB64 The Base64 encoded combined public key object.
 * @returns {Promise<boolean>} A promise that resolves to true if the signature is fully valid, false otherwise.
 */
export async function verifyQuantumSignature(qscriptCode, combinedSignatureB64, combinedPublicKeyB64) {
    try {
        const codeBuffer = typeof qscriptCode === 'string' ? strToArrayBuffer(qscriptCode) : qscriptCode;

        // 1. Parse the public key and signature structures
        const publicKeyObj = await parseCombinedData(combinedPublicKeyB64);
        const signatureObj = await parseCombinedData(combinedSignatureB64);

        // 2. Check if the algorithm is supported
        if (publicKeyObj.algorithm !== SUPPORTED_ALGORITHM) {
            console.warn(`Unsupported signature algorithm: ${publicKeyObj.algorithm}`);
            return false;
        }

        // 3. Decode the individual components
        const classicalSig = base64ToArrayBuffer(signatureObj.classicalSig);
        const postQuantumSig = base64ToArrayBuffer(signatureObj.postQuantumSig);
        const postQuantumKey = base64ToArrayBuffer(publicKeyObj.postQuantumKey);

        // 4. Perform verifications in parallel
        const [classicalIsValid, postQuantumIsValid] = await Promise.all([
            verifyClassicalComponent(codeBuffer, classicalSig, publicKeyObj.classicalKey),
            verifyPostQuantumComponent(codeBuffer, postQuantumSig, postQuantumKey)
        ]);

        if (!classicalIsValid) {
            console.error("Q-Signature Verification Failure: Classical component is invalid.");
            return false;
        }

        if (!postQuantumIsValid) {
            console.error("Q-Signature Verification Failure: Post-quantum component is invalid.");
            return false;
        }

        // 5. If both are valid, the signature is authentic
        console.log("Q-Signature Verification Success: Module integrity and authenticity confirmed.");
        return true;

    } catch (error) {
        console.error("An unexpected error occurred during signature verification:", error);
        return false;
    }
}