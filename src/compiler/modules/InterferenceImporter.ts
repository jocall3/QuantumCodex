import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Represents the unique quantum signature of a code module.
 * In the .u language, modules are identified by their content's wavefunction (hash),
 * not necessarily their filename.
 */
export type QuantumSignature = string;

/**
 * Configuration for the Interference Importer.
 */
export interface InterferenceConfig {
    rootUniverse: string; // Root directory to scan
    entropyThreshold: number; // Tolerance for fuzzy matching (0.0 to 1.0)
    excludedDimensions: string[]; // Directories to ignore (e.g., node_modules)
}

/**
 * Result of a successful module resolution.
 */
export interface ResolutionResult {
    filepath: string;
    signature: QuantumSignature;
    coherence: number; // 1.0 = perfect match
}

class DecoherenceError extends Error {
    constructor(message: string) {
        super(`[Decoherence] ${message}`);
        this.name = 'DecoherenceError';
    }
}

/**
 * The InterferenceImporter resolves modules based on Quantum Signature Matching.
 * 
 * Instead of explicit file paths, the .u language allows importing via:
 * 1. Exact Signature (Content Hash)
 * 2. Resonance (Semantic Tags or Interface Matching)
 * 
 * This class scans the "universe" (file system) to find the code that 
 * interferes constructively with the import request.
 */
export class InterferenceImporter {
    private config: InterferenceConfig;
    private signatureCache: Map<string, QuantumSignature>;
    private universeMap: Map<QuantumSignature, string>; // Signature -> Filepath

    constructor(config: Partial<InterferenceConfig> = {}) {
        this.config = {
            rootUniverse: config.rootUniverse || process.cwd(),
            entropyThreshold: config.entropyThreshold || 0.0,
            excludedDimensions: config.excludedDimensions || ['node_modules', '.git', 'dist', 'build']
        };
        this.signatureCache = new Map();
        this.universeMap = new Map();
    }

    /**
     * Initializes the importer by scanning the universe to establish
     * the superposition of all available modules.
     */
    public async observeUniverse(): Promise<void> {
        await this.scanDirectory(this.config.rootUniverse);
    }

    /**
     * Attempts to resolve a module based on an interference pattern.
     * 
     * @param pattern The import string (can be a hash, a partial hash, or a resonance tag).
     * @returns The resolution result containing the file path and signature.
     */
    public resolve(pattern: string): ResolutionResult {
        // 1. Try Exact Match (Direct Signature)
        if (this.universeMap.has(pattern)) {
            return {
                filepath: this.universeMap.get(pattern)!,
                signature: pattern,
                coherence: 1.0
            };
        }

        // 2. Try Partial Interference (Prefix Match)
        const partialMatch = this.findPartialMatch(pattern);
        if (partialMatch) {
            return partialMatch;
        }

        // 3. Try Resonance Matching (Heuristic/Tag based - simplified here as filename matching for fallback)
        // In a full implementation, this would parse ASTs for @resonance tags.
        const resonanceMatch = this.findResonanceMatch(pattern);
        if (resonanceMatch) {
            return resonanceMatch;
        }

        throw new DecoherenceError(`No module found matching interference pattern: '${pattern}'`);
    }

    /**
     * Calculates the Quantum Signature (SHA-256 hash) of a file's content.
     * Ignores whitespace to ensure structural coherence.
     */
    public calculateSignature(content: string): QuantumSignature {
        const normalized = content.replace(/\s+/g, '');
        return crypto.createHash('sha256').update(normalized).digest('hex');
    }

    /**
     * Recursively scans directories to map the universe.
     */
    private async scanDirectory(dir: string): Promise<void> {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                if (!this.config.excludedDimensions.includes(entry.name)) {
                    await this.scanDirectory(fullPath);
                }
            } else if (entry.isFile() && entry.name.endsWith('.u')) {
                await this.entangleFile(fullPath);
            }
        }
    }

    /**
     * Reads a file, calculates its signature, and adds it to the universe map.
     */
    private async entangleFile(filepath: string): Promise<void> {
        try {
            const content = await fs.promises.readFile(filepath, 'utf-8');
            const signature = this.calculateSignature(content);
            
            // Check for hash collisions (Quantum Superposition)
            if (this.universeMap.has(signature)) {
                const existing = this.universeMap.get(signature);
                if (existing !== filepath) {
                    console.warn(`[QuantumWarning] Superposition detected: ${signature} exists at both ${existing} and ${filepath}. First observation persists.`);
                }
            } else {
                this.universeMap.set(signature, filepath);
                this.signatureCache.set(filepath, signature);
            }
        } catch (err) {
            console.warn(`[QuantumFlux] Failed to entangle file ${filepath}:`, err);
        }
    }

    private findPartialMatch(partialSignature: string): ResolutionResult | null {
        // Iterate over all known signatures to find a prefix match
        for (const [signature, filepath] of this.universeMap.entries()) {
            if (signature.startsWith(partialSignature)) {
                return {
                    filepath,
                    signature,
                    coherence: partialSignature.length / signature.length // Confidence based on length
                };
            }
        }
        return null;
    }

    private findResonanceMatch(tag: string): ResolutionResult | null {
        // Fallback: Check if the tag matches a filename (minus extension)
        // This simulates "naming" a particle in the quantum field
        for (const [signature, filepath] of this.universeMap.entries()) {
            const basename = path.basename(filepath, '.u');
            if (basename === tag) {
                return {
                    filepath,
                    signature,
                    coherence: 0.8 // Lower coherence for nominal matching vs structural matching
                };
            }
        }
        return null;
    }

    /**
     * Synchronous version of signature calculation for on-the-fly compilation.
     */
    public getSignatureSync(filepath: string): QuantumSignature {
        if (this.signatureCache.has(filepath)) {
            return this.signatureCache.get(filepath)!;
        }
        const content = fs.readFileSync(filepath, 'utf-8');
        const signature = this.calculateSignature(content);
        this.signatureCache.set(filepath, signature);
        return signature;
    }
}