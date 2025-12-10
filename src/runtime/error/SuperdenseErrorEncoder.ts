import { TextEncoder, TextDecoder } from 'util';

/**
 * Severity levels for U Runtime Errors.
 * Maps to specific bit patterns in the superdense header.
 */
export enum UErrorSeverity {
    FATAL = 0b00,
    ERROR = 0b01,
    WARNING = 0b10,
    INFO = 0b11,
}

/**
 * Structure representing a decoded runtime error.
 */
export interface URuntimeErrorPayload {
    code: number;
    severity: UErrorSeverity;
    line: number;
    column: number;
    timestamp: number;
    message: string;
    contextHash?: string;
}

/**
 * Configuration for the Superdense Encoder.
 */
const PROTOCOL_VERSION = 1;
const MAGIC_BYTE = 0x55; // 'U'
const DENSE_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~";
const BASE = DENSE_CHARSET.length;

/**
 * Runtime utility for encoding and decoding error messages using 
 * Superdense Coding protocols. This packs error metadata into a 
 * highly compressed binary format and serializes it to a custom 
 * high-radix string representation.
 */
export class SuperdenseErrorEncoder {
    private static encoder = new TextEncoder();
    private static decoder = new TextDecoder();

    /**
     * Encodes a runtime error object into a Superdense string.
     * 
     * Bit Layout (Big Endian):
     * [0-7]   Magic Byte (0x55)
     * [8-11]  Version (4 bits)
     * [12-13] Severity (2 bits)
     * [14-15] Reserved (2 bits)
     * [16-31] Error Code (16 bits)
     * [32-63] Line Number (32 bits)
     * [64-79] Column Number (16 bits)
     * [80-143] Timestamp (64 bits)
     * [144-...] UTF-8 Message Bytes
     * 
     * @param payload The error details to encode.
     * @returns The encoded Superdense string.
     */
    public static encode(payload: URuntimeErrorPayload): string {
        const messageBytes = this.encoder.encode(payload.message);
        const headerSize = 18; // Bytes required for fixed metadata
        const totalSize = headerSize + messageBytes.length;
        
        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);

        // 1. Magic Byte
        view.setUint8(0, MAGIC_BYTE);

        // 2. Version (4 bits) | Severity (2 bits) | Reserved (2 bits)
        // Structure: VVVVSSRR
        const versionBits = (PROTOCOL_VERSION & 0x0F) << 4;
        const severityBits = (payload.severity & 0x03) << 2;
        const metaByte = versionBits | severityBits;
        view.setUint8(1, metaByte);

        // 3. Error Code (16 bits)
        view.setUint16(2, payload.code);

        // 4. Line Number (32 bits)
        view.setUint32(4, payload.line);

        // 5. Column Number (16 bits)
        view.setUint16(8, payload.column);

        // 6. Timestamp (64 bits)
        view.setBigUint64(10, BigInt(payload.timestamp));

        // 7. Payload (Message)
        const uint8Array = new Uint8Array(buffer);
        uint8Array.set(messageBytes, headerSize);

        // 8. Encode to Dense String
        return this.toDenseString(uint8Array);
    }

    /**
     * Decodes a Superdense string back into a runtime error object.
     * 
     * @param encoded The Superdense string.
     * @returns The decoded error payload.
     * @throws Error if the format is invalid or version mismatch.
     */
    public static decode(encoded: string): URuntimeErrorPayload {
        const buffer = this.fromDenseString(encoded);
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

        if (buffer.byteLength < 18) {
            throw new Error("SuperdenseError: Stream too short to contain valid header.");
        }

        // 1. Validate Magic Byte
        if (view.getUint8(0) !== MAGIC_BYTE) {
            throw new Error("SuperdenseError: Invalid magic byte. Not a .u error format.");
        }

        // 2. Parse Meta Byte
        const metaByte = view.getUint8(1);
        const version = (metaByte >> 4) & 0x0F;
        const severity = (metaByte >> 2) & 0x03;

        if (version !== PROTOCOL_VERSION) {
            throw new Error(`SuperdenseError: Unsupported protocol version ${version}.`);
        }

        // 3. Extract Metadata
        const code = view.getUint16(2);
        const line = view.getUint32(4);
        const column = view.getUint16(8);
        const timestamp = Number(view.getBigUint64(10));

        // 4. Extract Message
        const messageBytes = buffer.subarray(18);
        const message = this.decoder.decode(messageBytes);

        return {
            code,
            severity: severity as UErrorSeverity,
            line,
            column,
            timestamp,
            message
        };
    }

    /**
     * Converts a raw byte buffer into a custom high-radix string (Base87-ish).
     * This is denser than Base64.
     */
    private static toDenseString(data: Uint8Array): string {
        let output = "";
        let value = 0n;
        
        // Treat the byte array as one massive number (BigInt)
        // Note: For extremely large payloads, chunking would be required for performance,
        // but for error messages, this provides maximum density.
        for (const byte of data) {
            value = (value << 8n) | BigInt(byte);
        }

        if (value === 0n) return DENSE_CHARSET[0];

        while (value > 0n) {
            const remainder = value % BigInt(BASE);
            output = DENSE_CHARSET[Number(remainder)] + output;
            value = value / BigInt(BASE);
        }

        return output;
    }

    /**
     * Converts the custom high-radix string back into a raw byte buffer.
     */
    private static fromDenseString(str: string): Uint8Array {
        let value = 0n;

        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            const index = DENSE_CHARSET.indexOf(char);
            if (index === -1) {
                throw new Error(`SuperdenseError: Invalid character '${char}' in encoded string.`);
            }
            value = value * BigInt(BASE) + BigInt(index);
        }

        // Convert BigInt back to byte array
        const bytes: number[] = [];
        if (value === 0n) {
            bytes.push(0);
        } else {
            while (value > 0n) {
                bytes.unshift(Number(value & 0xFFn));
                value = value >> 8n;
            }
        }

        // Pad leading zeros if necessary? 
        // The BigInt conversion strips leading zero bytes. 
        // However, our protocol has a fixed header starting with 0x55 (non-zero).
        // So we don't need to worry about lost leading null bytes for valid packets.
        
        return new Uint8Array(bytes);
    }

    /**
     * Generates a quick diagnostic hash for error deduplication.
     */
    public static generateHash(payload: URuntimeErrorPayload): string {
        const key = `${payload.code}:${payload.line}:${payload.column}:${payload.severity}`;
        let hash = 0;
        for (let i = 0; i < key.length; i++) {
            const char = key.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0; // Convert to 32bit integer
        }
        return hash.toString(16);
    }
}