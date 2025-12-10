import * as fs from 'fs';
import * as path from 'path';

/**
 * Represents the execution mode for the .u runtime.
 */
export type ExecutionMode = 'classical' | 'quantum' | 'hybrid' | 'simulation';

/**
 * Configuration options specific to the Quantum Processing Unit (QPU) or Simulator.
 */
export interface QuantumDirectives {
    /** Target backend identifier (e.g., 'ibmq_jakarta', 'ionq_qpu', 'local_simulator') */
    backend: string;
    /** Number of shots for sampling */
    shots: number;
    /** Number of logical qubits required */
    qubits: number;
    /** Whether to apply error correction codes */
    errorCorrection: boolean;
    /** Noise model identifier for simulation */
    noiseModel?: string;
    /** Topology constraints (e.g., 'linear', 'heavy-hex') */
    topology?: string;
}

/**
 * Configuration options specific to the Classical CPU runtime.
 */
export interface ClassicalDirectives {
    /** Optimization level (0-3) */
    optimizationLevel: number;
    /** Max memory allocation in MB */
    memoryLimit: number;
    /** Execution timeout in milliseconds */
    timeout: number;
    /** Enable parallel execution threads */
    parallelism: boolean;
    /** Debugging verbosity */
    debug: boolean;
}

/**
 * The root structure of a Quantum Configuration File (QCF).
 */
export interface QCFConfig {
    /** The name of the project or module */
    projectName: string;
    /** The entry point file (usually a .u file) */
    entryPoint: string;
    /** The primary execution mode */
    mode: ExecutionMode;
    /** Directives for quantum execution */
    quantum: QuantumDirectives;
    /** Directives for classical execution */
    classical: ClassicalDirectives;
    /** Environment variables to inject into the runtime */
    env?: Record<string, string>;
}

/**
 * Custom error class for QCF parsing issues.
 */
export class QCFParseError extends Error {
    constructor(message: string, public readonly filePath?: string) {
        super(filePath ? `Error parsing QCF at ${filePath}: ${message}` : `QCF Parse Error: ${message}`);
        this.name = 'QCFParseError';
    }
}

/**
 * Parser for Quantum Configuration Files (QCF).
 * Handles reading, validation, and normalization of configuration directives
 * for the .u language runtime.
 */
export class QCFParser {
    private static readonly DEFAULT_QUANTUM: QuantumDirectives = {
        backend: 'local_simulator',
        shots: 1024,
        qubits: 5,
        errorCorrection: false
    };

    private static readonly DEFAULT_CLASSICAL: ClassicalDirectives = {
        optimizationLevel: 1,
        memoryLimit: 512,
        timeout: 30000,
        parallelism: false,
        debug: false
    };

    /**
     * Parses a QCF file from the given file path.
     * @param filePath Path to the .qcf or .json configuration file.
     * @returns A validated and normalized QCFConfig object.
     */
    public parse(filePath: string): QCFConfig {
        const absolutePath = path.resolve(filePath);

        if (!fs.existsSync(absolutePath)) {
            throw new QCFParseError(`Configuration file not found.`, absolutePath);
        }

        let fileContent: string;
        try {
            fileContent = fs.readFileSync(absolutePath, 'utf-8');
        } catch (error) {
            throw new QCFParseError(`Failed to read file content: ${(error as Error).message}`, absolutePath);
        }

        return this.parseString(fileContent, absolutePath);
    }

    /**
     * Parses a raw configuration string.
     * @param content The JSON string content of the configuration.
     * @param source Optional source identifier for error reporting.
     * @returns A validated and normalized QCFConfig object.
     */
    public parseString(content: string, source?: string): QCFConfig {
        let rawConfig: any;

        try {
            rawConfig = JSON.parse(content);
        } catch (error) {
            throw new QCFParseError(`Invalid JSON syntax: ${(error as Error).message}`, source);
        }

        return this.validateAndNormalize(rawConfig, source);
    }

    /**
     * Validates the raw configuration object and merges it with defaults.
     */
    private validateAndNormalize(raw: any, source?: string): QCFConfig {
        if (typeof raw !== 'object' || raw === null) {
            throw new QCFParseError('Root configuration must be an object.', source);
        }

        // Validate required fields
        if (!raw.projectName || typeof raw.projectName !== 'string') {
            throw new QCFParseError('Missing or invalid "projectName".', source);
        }

        if (!raw.entryPoint || typeof raw.entryPoint !== 'string') {
            throw new QCFParseError('Missing or invalid "entryPoint".', source);
        }

        // Validate Mode
        const validModes: ExecutionMode[] = ['classical', 'quantum', 'hybrid', 'simulation'];
        const mode: ExecutionMode = validModes.includes(raw.mode) ? raw.mode : 'hybrid';

        // Merge Quantum Directives
        const quantum: QuantumDirectives = {
            ...QCFParser.DEFAULT_QUANTUM,
            ...(raw.quantum || {})
        };
        this.validateQuantumDirectives(quantum, source);

        // Merge Classical Directives
        const classical: ClassicalDirectives = {
            ...QCFParser.DEFAULT_CLASSICAL,
            ...(raw.classical || {})
        };
        this.validateClassicalDirectives(classical, source);

        const config: QCFConfig = {
            projectName: raw.projectName,
            entryPoint: raw.entryPoint,
            mode: mode,
            quantum: quantum,
            classical: classical,
            env: raw.env || {}
        };

        return config;
    }

    private validateQuantumDirectives(q: QuantumDirectives, source?: string): void {
        if (typeof q.shots !== 'number' || q.shots <= 0) {
            throw new QCFParseError('Quantum directive "shots" must be a positive integer.', source);
        }
        if (typeof q.qubits !== 'number' || q.qubits < 0) {
            throw new QCFParseError('Quantum directive "qubits" must be a non-negative integer.', source);
        }
        if (typeof q.backend !== 'string' || q.backend.trim() === '') {
            throw new QCFParseError('Quantum directive "backend" must be a valid string.', source);
        }
    }

    private validateClassicalDirectives(c: ClassicalDirectives, source?: string): void {
        if (typeof c.optimizationLevel !== 'number' || c.optimizationLevel < 0 || c.optimizationLevel > 3) {
            throw new QCFParseError('Classical directive "optimizationLevel" must be between 0 and 3.', source);
        }
        if (typeof c.memoryLimit !== 'number' || c.memoryLimit <= 0) {
            throw new QCFParseError('Classical directive "memoryLimit" must be a positive number.', source);
        }
        if (typeof c.timeout !== 'number' || c.timeout <= 0) {
            throw new QCFParseError('Classical directive "timeout" must be a positive number.', source);
        }
    }

    /**
     * Creates a default configuration file at the specified path.
     * Useful for initializing new .u projects.
     */
    public createDefaultConfig(destinationPath: string, projectName: string): void {
        const config: QCFConfig = {
            projectName: projectName,
            entryPoint: 'src/main.u',
            mode: 'hybrid',
            quantum: QCFParser.DEFAULT_QUANTUM,
            classical: QCFParser.DEFAULT_CLASSICAL,
            env: {
                "U_ENV": "development"
            }
        };

        const content = JSON.stringify(config, null, 2);
        try {
            fs.writeFileSync(destinationPath, content, 'utf-8');
        } catch (error) {
            throw new Error(`Failed to write default QCF config: ${(error as Error).message}`);
        }
    }
}