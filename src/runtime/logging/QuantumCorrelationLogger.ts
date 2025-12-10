import { createHash, randomUUID } from 'crypto';

/**
 * Defines the severity levels for log entries.
 */
export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR',
    FATAL = 'FATAL',
}

/**
 * Represents a single, immutable log entry.
 * Each entry is cryptographically "entangled" with others in the same correlation
 * through a chained hash, ensuring the integrity of the entire log sequence.
 */
export interface QuantumLogEntry {
    /** The timestamp of the log event, in UTC milliseconds. */
    timestamp: number;
    /** The severity level of the log. */
    level: LogLevel;
    /** The primary log message. */
    message: string;
    /** Optional structured data providing additional context. */
    context?: Record<string, any>;
    /**
     * The identifier for the "entangled" set of logs. All logs sharing this ID
     * belong to the same operational context or transaction.
     */
    correlationId: string;
    /** The sequence number of this log within its correlation chain. */
    sequence: number;
    /** The hash of the preceding log entry, forming the cryptographic chain. */
    previousHash: string;
    /**
     * The SHA-256 hash of this entire log entry (excluding the hash itself).
     * This "collapses the waveform" and makes the entry immutable.
     */
    hash: string;
}

/**
 * Defines the interface for a log transport, which is responsible for
 * outputting the finalized log entry to a destination (e.g., console, file, network).
 */
export interface LogTransport {
    /**
     * Writes a quantum log entry to the transport's destination.
     * @param entry The finalized, hashed log entry.
     */
    write(entry: QuantumLogEntry): void;
}

/**
 * A simple LogTransport that writes formatted JSON to the console.
 */
export class ConsoleTransport implements LogTransport {
    /**
     * Writes the log entry to the console as a structured, indented JSON string.
     * @param entry The log entry to write.
     */
    public write(entry: QuantumLogEntry): void {
        const output = {
            ...entry,
            timestamp: new Date(entry.timestamp).toISOString(),
        };
        // Use console.error for error levels to write to stderr
        if (entry.level === LogLevel.ERROR || entry.level === LogLevel.FATAL) {
            console.error(JSON.stringify(output, null, 2));
        } else {
            console.log(JSON.stringify(output, null, 2));
        }
    }
}

/**
 * A logger that creates cryptographically-linked chains of log entries.
 *
 * This logger uses the metaphor of "Quantum Correlation" or "Entanglement" to
 * represent a set of related log messages. When a correlation is started, all
* subsequent logs are chained together with hashes. Any modification to a log
 * entry in the chain will invalidate the hashes of all subsequent entries,
 * making tampering immediately obvious. This provides exceptional log integrity
 * and ensures that the context of an operation is preserved as a single, verifiable unit.
 */
export class QuantumCorrelationLogger {
    private transports: LogTransport[];
    private currentCorrelationId: string | null = null;
    private currentSequence: number = 0;
    private lastHash: string = '0'; // Represents the pre-genesis state.

    /**
     * Creates an instance of the QuantumCorrelationLogger.
     * @param transports An array of transports to send log entries to.
     *                   Defaults to a single ConsoleTransport.
     */
    constructor(transports: LogTransport[] = [new ConsoleTransport()]) {
        this.transports = transports;
    }

    /**
     * Starts a new "entangled" logging session. All subsequent logs will be
     * part of this correlation until `endCorrelation` is called.
     * @param correlationId An optional, user-defined ID for the correlation.
     *                      If not provided, a random UUID will be generated.
     * @returns The ID of the newly started correlation.
     */
    public startCorrelation(correlationId?: string): string {
        this.currentCorrelationId = correlationId || randomUUID();
        this.currentSequence = 0;
        // The genesis hash is derived from the correlation ID itself,
        // establishing the root of the integrity chain for this specific context.
        this.lastHash = QuantumCorrelationLogger.hashData(this.currentCorrelationId);
        
        this.info(`Quantum Correlation Started: ${this.currentCorrelationId}`);
        
        return this.currentCorrelationId;
    }

    /**
     * Ends the current "entangled" logging session.
     * Subsequent logs will be treated as individual, ephemeral correlations
     * until a new correlation is started.
     */
    public endCorrelation(): void {
        if (this.currentCorrelationId) {
            this.info(`Quantum Correlation Ended: ${this.currentCorrelationId}`);
            this.currentCorrelationId = null;
            this.currentSequence = 0;
            this.lastHash = '0';
        }
    }

    /**
     * Logs a message with a 'DEBUG' level.
     * @param message The log message.
     * @param context Optional structured data.
     */
    public debug(message: string, context?: Record<string, any>): void {
        this.log(LogLevel.DEBUG, message, context);
    }

    /**
     * Logs a message with an 'INFO' level.
     * @param message The log message.
     * @param context Optional structured data.
     */
    public info(message: string, context?: Record<string, any>): void {
        this.log(LogLevel.INFO, message, context);
    }

    /**
     * Logs a message with a 'WARN' level.
     * @param message The log message.
     * @param context Optional structured data.
     */
    public warn(message: string, context?: Record<string, any>): void {
        this.log(LogLevel.WARN, message, context);
    }

    /**
     * Logs a message with an 'ERROR' level.
     * @param message The log message.
     * @param context Optional structured data, often an error object.
     */
    public error(message: string, context?: Record<string, any>): void {
        this.log(LogLevel.ERROR, message, context);
    }

    /**
     * Logs a message with a 'FATAL' level, indicating a critical failure.
     * @param message The log message.
     * @param context Optional structured data.
     */
    public fatal(message: string, context?: Record<string, any>): void {
        this.log(LogLevel.FATAL, message, context);
    }

    /**
     * The core logging method. It creates, hashes, and dispatches a log entry.
     * If no correlation is active, it creates a single-entry "ephemeral" correlation
     * for this log, ensuring every log still has integrity.
     * @param level The severity level of the log.
     * @param message The log message.
     * @param context Optional structured data.
     */
    public log(level: LogLevel, message: string, context?: Record<string, any>): void {
        const isWithinActiveCorrelation = !!this.currentCorrelationId;
        
        const correlationId = this.currentCorrelationId || randomUUID();
        const sequence = isWithinActiveCorrelation ? this.currentSequence + 1 : 1;
        const previousHash = isWithinActiveCorrelation 
            ? this.lastHash 
            : QuantumCorrelationLogger.hashData(correlationId); // Genesis hash for ephemeral log

        const entryData: Omit<QuantumLogEntry, 'hash'> = {
            timestamp: Date.now(),
            level,
            message,
            context,
            correlationId,
            sequence,
            previousHash,
        };

        const newHash = QuantumCorrelationLogger.calculateEntryHash(entryData);

        const finalEntry: QuantumLogEntry = {
            ...entryData,
            hash: newHash,
        };

        this.dispatch(finalEntry);

        if (isWithinActiveCorrelation) {
            this.currentSequence = sequence;
            this.lastHash = newHash;
        }
    }

    /**
     * Sends the finalized log entry to all registered transports.
     * @param entry The log entry to dispatch.
     */
    private dispatch(entry: QuantumLogEntry): void {
        for (const transport of this.transports) {
            try {
                transport.write(entry);
            } catch (error) {
                console.error("Error in log transport:", error);
            }
        }
    }

    /**
     * Calculates the SHA-256 hash for a log entry's data.
     * The object is stringified in a deterministic way to ensure consistent hashes.
     * @param entryData The log entry data (without the hash itself).
     * @returns The calculated hex-encoded SHA-256 hash.
     */
    public static calculateEntryHash(entryData: Omit<QuantumLogEntry, 'hash'>): string {
        // Sorting keys ensures a deterministic JSON string for consistent hashing.
        const orderedData = Object.keys(entryData).sort().reduce(
            (obj, key) => { 
                obj[key as keyof typeof entryData] = entryData[key as keyof typeof entryData]; 
                return obj;
            },
            {} as Omit<QuantumLogEntry, 'hash'>
        );
        const dataString = JSON.stringify(orderedData);
        return QuantumCorrelationLogger.hashData(dataString);
    }

    /**
     * A generic hashing utility.
     * @param data The string data to hash.
     * @returns The calculated hex-encoded SHA-256 hash.
     */
    private static hashData(data: string): string {
        return createHash('sha256').update(data).digest('hex');
    }

    /**
     * Verifies the integrity of a chain of log entries.
     * It checks that each entry's hash is correct and that the `previousHash`
     * correctly links to the preceding entry.
     * @param entries An array of log entries from the same correlation.
     * @returns `true` if the chain is valid, `false` otherwise.
     */
    public static verifyChain(entries: QuantumLogEntry[]): boolean {
        if (entries.length === 0) {
            return true;
        }

        const sorted = [...entries].sort((a, b) => a.sequence - b.sequence);
        const correlationId = sorted[0].correlationId;

        // Verify the first entry's link to the genesis hash.
        const genesisHash = QuantumCorrelationLogger.hashData(correlationId);
        if (sorted[0].previousHash !== genesisHash) {
            console.error(`Chain verification failed: Genesis hash mismatch for correlation ID ${correlationId}.`);
            return false;
        }

        for (let i = 0; i < sorted.length; i++) {
            const entry = sorted[i];
            const { hash, ...dataToVerify } = entry;

            // 1. Verify the entry's own hash is correct.
            const expectedHash = QuantumCorrelationLogger.calculateEntryHash(dataToVerify);
            if (hash !== expectedHash) {
                console.error(`Chain verification failed: Hash mismatch for entry at sequence ${entry.sequence}.`);
                return false;
            }

            // 2. Verify it links to the previous entry's hash.
            if (i > 0) {
                const prevEntry = sorted[i - 1];
                if (entry.previousHash !== prevEntry.hash) {
                    console.error(`Chain verification failed: Link broken between sequence ${prevEntry.sequence} and ${entry.sequence}.`);
                    return false;
                }
            }
        }

        return true;
    }
}