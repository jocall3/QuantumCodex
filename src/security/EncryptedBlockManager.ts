import * as crypto from 'crypto';

/**
 * Interface representing the runtime environment for the .u language.
 * This allows the manager to delegate the actual code execution after decryption.
 */
export interface URuntimeContext {
    /**
     * Executes the raw .u source code.
     * @param code The decrypted source code string.
     */
    execute(code: string): Promise<any>;

    /**
     * Returns the current system entropy or quantum randomness factor.
     * Used to determine if the block collapses into an executable state.
     * Returns a value between 0.0 and 1.0.
     */
    getEntropy(): number;
}

/**
 * Metadata defining the quantum properties of the code block.
 * Used for state synchronization and probabilistic execution.
 */
export interface QuantumState {
    superpositionId: string;
    entanglementHash: string;
    collapseProbability: number; // Threshold required for execution
    wavefunctionSignature?: string;
}

/**
 * Header information for an Encrypted Quantum Code Block.
 * Contains non-encrypted metadata required for routing and validation.
 */
export interface EQCBHeader {
    version: string;
    timestamp: number;
    blockId: string;
    quantumState: QuantumState;
    encryptionAlgo: 'AES-256-GCM';
    iv: string; // Base64 encoded initialization vector
    authTag: string; // Base64 encoded authentication tag
}

/**
 * The structure of an Encrypted Quantum Code Block (EQCB).
 * This is the artifact that is stored or transmitted.
 */
export interface EQCB {
    header: EQCBHeader;
    payload: string; // Base64 encoded encrypted source code
    signature: string; // HMAC signature of header + payload
}

/**
 * Manager class responsible for the lifecycle of Encrypted Quantum Code Blocks.
 * Handles encryption (creation), verification, decryption, and execution orchestration.
 */
export class EncryptedBlockManager {
    private readonly algorithm = 'aes-256-gcm';
    private readonly hashAlgorithm = 'sha256';
    private readonly version = '1.0.u-secure';

    /**
     * Creates a new Encrypted Quantum Code Block from raw .u source code.
     * 
     * @param sourceCode The raw .u language source code.
     * @param secretKey The 32-byte master key used for encryption and signing.
     * @param quantumParams Optional parameters to define the block's quantum state.
     * @returns A fully formed EQCB object.
     */
    public createBlock(
        sourceCode: string, 
        secretKey: Buffer, 
        quantumParams: Partial<QuantumState> = {}
    ): EQCB {
        if (secretKey.length !== 32) {
            throw new Error('Security Error: Secret key must be exactly 32 bytes for AES-256-GCM.');
        }

        // Generate Initialization Vector
        const iv = crypto.randomBytes(16);
        
        // Encrypt the payload
        const cipher = crypto.createCipheriv(this.algorithm, secretKey, iv);
        let encrypted = cipher.update(sourceCode, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        const authTag = cipher.getAuthTag();

        // Construct Header
        const header: EQCBHeader = {
            version: this.version,
            timestamp: Date.now(),
            blockId: crypto.randomUUID(),
            quantumState: {
                superpositionId: quantumParams.superpositionId || crypto.randomUUID(),
                entanglementHash: quantumParams.entanglementHash || this.generateEntanglementHash(),
                collapseProbability: quantumParams.collapseProbability ?? 0.5, // Default to 50% probability if not specified
                wavefunctionSignature: quantumParams.wavefunctionSignature
            },
            encryptionAlgo: 'AES-256-GCM',
            iv: iv.toString('base64'),
            authTag: authTag.toString('base64')
        };

        // Sign the block
        const signature = this.signBlock(header, encrypted, secretKey);

        return {
            header,
            payload: encrypted,
            signature
        };
    }

    /**
     * Validates the integrity and authenticity of an EQCB without decrypting it.
     * 
     * @param block The EQCB to validate.
     * @param secretKey The secret key used for verification.
     * @returns True if the signature is valid, false otherwise.
     */
    public validateBlock(block: EQCB, secretKey: Buffer): boolean {
        try {
            const calculatedSignature = this.signBlock(block.header, block.payload, secretKey);
            const providedSigBuffer = Buffer.from(block.signature, 'hex');
            const calculatedSigBuffer = Buffer.from(calculatedSignature, 'hex');

            return crypto.timingSafeEqual(providedSigBuffer, calculatedSigBuffer);
        } catch (error) {
            return false;
        }
    }

    /**
     * Decrypts an EQCB to retrieve the original .u source code.
     * This constitutes the "Observation" phase, collapsing the encrypted state into plaintext.
     * 
     * @param block The EQCB to decrypt.
     * @param secretKey The secret key.
     * @returns The raw source code string.
     */
    public decryptBlock(block: EQCB, secretKey: Buffer): string {
        if (!this.validateBlock(block, secretKey)) {
            throw new Error('Security Violation: Block signature mismatch. The block may have been tampered with or the key is incorrect.');
        }

        const iv = Buffer.from(block.header.iv, 'base64');
        const authTag = Buffer.from(block.header.authTag, 'base64');
        
        const decipher = crypto.createDecipheriv(this.algorithm, secretKey, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(block.payload, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }

    /**
     * Orchestrates the execution of an EQCB.
     * Checks quantum probability thresholds before allowing decryption and execution.
     * 
     * @param block The EQCB to execute.
     * @param secretKey The secret key.
     * @param runtime The .u runtime environment.
     * @returns The result of the execution.
     */
    public async executeBlock(
        block: EQCB, 
        secretKey: Buffer, 
        runtime: URuntimeContext
    ): Promise<any> {
        // 1. Quantum Collapse Check
        // The code only executes if the system entropy satisfies the collapse probability.
        const systemEntropy = runtime.getEntropy();
        
        // If probability is 1.0, it always executes (deterministic).
        // If probability is < 1.0, it requires specific entropy conditions.
        if (block.header.quantumState.collapseProbability < 1.0 && systemEntropy < block.header.quantumState.collapseProbability) {
            throw new Error(`Quantum Decoherence: Block ${block.header.blockId} failed to collapse. Entropy ${systemEntropy} < Threshold ${block.header.quantumState.collapseProbability}`);
        }

        // 2. Decrypt (Observe)
        let sourceCode: string;
        try {
            sourceCode = this.decryptBlock(block, secretKey);
        } catch (e) {
            throw new Error(`Decryption failed for block ${block.header.blockId}: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }

        // 3. Execute in Runtime
        try {
            return await runtime.execute(sourceCode);
        } catch (error) {
            throw new Error(`Runtime Execution Failure in Block ${block.header.blockId}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Prepares a block for transmission over a network.
     * Serializes the block and could apply additional transport layer security if needed.
     * 
     * @param block The EQCB to transmit.
     * @returns A JSON string representation suitable for transport.
     */
    public prepareForTransmission(block: EQCB): string {
        return JSON.stringify(block);
    }

    /**
     * Parses a received transmission string back into an EQCB object.
     * 
     * @param rawData The JSON string received from the network.
     * @returns The reconstructed EQCB object.
     */
    public receiveTransmission(rawData: string): EQCB {
        try {
            const block = JSON.parse(rawData) as EQCB;
            if (!block.header || !block.payload || !block.signature) {
                throw new Error('Invalid EQCB structure');
            }
            return block;
        } catch (e) {
            throw new Error('Transmission Error: Failed to parse EQCB data.');
        }
    }

    /**
     * Generates a cryptographic signature for the block content.
     */
    private signBlock(header: EQCBHeader, payload: string, secretKey: Buffer): string {
        // We sign the canonical string representation of the header + the encrypted payload
        // Note: In a distributed system, JSON.stringify order matters. 
        // Ideally, we would serialize fields in a deterministic order.
        const headerString = JSON.stringify(header); 
        const dataToSign = `${headerString}.${payload}`;
        
        const hmac = crypto.createHmac(this.hashAlgorithm, secretKey);
        hmac.update(dataToSign);
        return hmac.digest('hex');
    }

    /**
     * Generates a random hash representing the entanglement state.
     */
    private generateEntanglementHash(): string {
        return crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex');
    }
}