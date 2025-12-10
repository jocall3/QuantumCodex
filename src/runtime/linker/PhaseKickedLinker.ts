import { ILinker } from './ILinker';
import { SymbolTable, SymbolEntry, SymbolType } from '../symbols/SymbolTable';
import { ExecutionContext } from '../ExecutionContext';
import { QuantumState } from '../quantum/QuantumState';
import { MemoryManager } from '../memory/MemoryManager';
import { RuntimeException } from '../../errors/RuntimeException';

/**
 * Represents the phase configuration for a specific linkage operation.
 */
export interface PhaseConfig {
    enableKickback: boolean;
    coherenceThreshold: number;
    entanglementFactor: number;
}

/**
 * Represents a resolved memory address with associated phase metadata.
 */
export interface PhaseResolvedAddress {
    physicalAddress: number;
    phaseShift: number;
    coherence: number;
}

/**
 * PhaseKickedLinker
 * 
 * Implements a dynamic linking mechanism based on the quantum phase kickback phenomenon.
 * In the .u runtime, code modules and symbols can possess a 'phase' property (0 to 2π).
 * When a classical control flow (the 'control') links to a quantum-aware symbol (the 'target'),
 * the phase of the target interacts with the control, potentially altering the resolution
 * path or the execution context's global phase.
 * 
 * This allows for probabilistic linking and interference patterns in code execution.
 */
export class PhaseKickedLinker implements ILinker {
    private static readonly TWO_PI = 2 * Math.PI;
    private memoryManager: MemoryManager;
    private globalPhase: number = 0;

    constructor(memoryManager: MemoryManager) {
        this.memoryManager = memoryManager;
    }

    /**
     * Links a set of symbols within the given execution context, applying phase kickback logic.
     * 
     * @param symbols The symbol table containing pending resolutions.
     * @param context The current execution context (holding quantum state).
     * @param config Configuration for phase interactions.
     */
    public link(
        symbols: SymbolTable, 
        context: ExecutionContext, 
        config: PhaseConfig = { enableKickback: true, coherenceThreshold: 0.85, entanglementFactor: 1.0 }
    ): void {
        const pendingSymbols = symbols.getPendingSymbols();

        for (const symbol of pendingSymbols) {
            try {
                this.resolveSymbolWithKickback(symbol, symbols, context, config);
            } catch (error) {
                throw new RuntimeException(`PhaseKickedLinker failed to resolve symbol '${symbol.name}': ${error}`);
            }
        }
    }

    /**
     * Resolves a single symbol, calculating the phase kickback from the target to the source.
     */
    private resolveSymbolWithKickback(
        source: SymbolEntry,
        table: SymbolTable,
        context: ExecutionContext,
        config: PhaseConfig
    ): void {
        // 1. Identify Target
        const targetName = source.reference;
        if (!targetName) {
            throw new RuntimeException(`Symbol '${source.name}' has no reference target.`);
        }

        const target = table.getSymbol(targetName);
        if (!target) {
            throw new RuntimeException(`Undefined reference: ${targetName}`);
        }

        // 2. Retrieve Quantum States
        // In .u, the 'source' is the call site (Control), and 'target' is the callee (Target).
        const controlState = context.getQuantumState(source.id);
        const targetState = context.getQuantumState(target.id);

        // 3. Calculate Phase Kickback
        // If the target is in an eigenstate (or sufficiently coherent), its phase kicks back to the control.
        let phaseShift = 0;
        let coherence = 1.0;

        if (config.enableKickback && targetState) {
            const targetPhase = targetState.getPhase();
            const targetMagnitude = targetState.getMagnitude();

            // Kickback logic: The phase added to the control is determined by the target's phase
            // scaled by the entanglement factor.
            if (targetMagnitude >= config.coherenceThreshold) {
                phaseShift = this.normalizePhase(targetPhase * config.entanglementFactor);
                
                // Apply the kickback to the global runtime phase or the specific control qubit
                this.applyPhaseToControl(controlState, phaseShift);
                
                // Update coherence metric for the link
                coherence = targetMagnitude;
            }
        }

        // 4. Resolve Address based on Phase
        // The physical address might shift based on constructive/destructive interference
        // modeled by the phase difference.
        const baseAddress = target.address;
        const resolved = this.computeInterferenceAddress(baseAddress, phaseShift, coherence);

        // 5. Update Symbol Table
        table.updateResolvedAddress(source.name, resolved.physicalAddress);
        
        // 6. Store Linkage Metadata (for debugging or runtime introspection)
        table.setLinkageMetadata(source.name, {
            phaseKickback: phaseShift,
            coherenceLevel: coherence,
            resolutionType: 'PHASE_KICKED'
        });
    }

    /**
     * Applies the calculated phase shift to the control quantum state.
     * This simulates the back-action of the controlled operation.
     */
    private applyPhaseToControl(controlState: QuantumState | undefined, phaseShift: number): void {
        if (controlState) {
            controlState.rotateZ(phaseShift);
        } else {
            // If no specific control state exists, accumulate into global linker phase
            this.globalPhase = this.normalizePhase(this.globalPhase + phaseShift);
        }
    }

    /**
     * Computes the final physical address by simulating interference.
     * A phase shift of PI (180 deg) might result in a different offset 
     * (destructive interference blocking standard entry).
     */
    private computeInterferenceAddress(baseAddress: number, phase: number, coherence: number): PhaseResolvedAddress {
        // Map phase [-PI, PI] to an address offset.
        // In this runtime, specific phase windows map to specific function variants (polymorphism via phase).
        
        let offset = 0;
        
        // Example: Phase ~ PI causes a jump to an error handler or alternative implementation
        if (Math.abs(phase - Math.PI) < 0.1) {
            offset = 0x1000; // Offset to alternative block
        } 
        // Example: Phase ~ PI/2
        else if (Math.abs(phase - Math.PI / 2) < 0.1) {
            offset = 0x0500;
        }

        // Apply coherence jitter (simulating noise if coherence is low)
        if (coherence < 0.5) {
            // Random jitter in lower bits
            offset += Math.floor(Math.random() * 4); 
        }

        return {
            physicalAddress: baseAddress + offset,
            phaseShift: phase,
            coherence: coherence
        };
    }

    /**
     * Normalizes an angle to the range [0, 2π).
     */
    private normalizePhase(angle: number): number {
        let normalized = angle % PhaseKickedLinker.TWO_PI;
        if (normalized < 0) {
            normalized += PhaseKickedLinker.TWO_PI;
        }
        return normalized;
    }

    /**
     * Returns the current accumulated global phase of the linker.
     * This can be used by the runtime to determine global system state.
     */
    public getGlobalPhase(): number {
        return this.globalPhase;
    }

    /**
     * Resets the linker state for a new execution cycle.
     */
    public reset(): void {
        this.globalPhase = 0;
    }
}