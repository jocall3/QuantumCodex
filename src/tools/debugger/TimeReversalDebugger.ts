import { VirtualMachine } from '../../runtime/VirtualMachine';
import { QuantumState } from '../../runtime/QuantumState';
import { Instruction, OpCode, GateType } from '../../bytecode/Instruction';
import { Logger } from '../../utils/Logger';

/**
 * Represents a snapshot of the Virtual Machine state at a specific point in time.
 */
interface VMSnapshot {
    pc: number;
    quantumState: QuantumState;
    classicalMemory: Map<string, any>;
    cycleCount: number;
}

/**
 * TimeReversalDebugger (qdb)
 * 
 * Implements a debugger for the .u language capable of bidirectional execution.
 * It utilizes a hybrid strategy for time travel:
 * 1. Inverse Unitary Application: For reversible quantum gates, it applies the Hermitian conjugate.
 * 2. State Checkpointing: For non-reversible operations (measurements, I/O), it restores from snapshots.
 */
export class TimeReversalDebugger {
    private vm: VirtualMachine;
    private breakpoints: Set<number>;
    private snapshots: Map<number, VMSnapshot>;
    private executionHistory: Instruction[];
    private maxHistoryDepth: number;
    private logger: Logger;

    constructor(vm: VirtualMachine, maxHistoryDepth: number = 10000) {
        this.vm = vm;
        this.breakpoints = new Set();
        this.snapshots = new Map();
        this.executionHistory = [];
        this.maxHistoryDepth = maxHistoryDepth;
        this.logger = new Logger('TimeReversalDebugger');
    }

    /**
     * Toggles a breakpoint at a specific line number or instruction index.
     */
    public toggleBreakpoint(instructionIndex: number): void {
        if (this.breakpoints.has(instructionIndex)) {
            this.breakpoints.delete(instructionIndex);
            this.logger.info(`Breakpoint removed at index ${instructionIndex}`);
        } else {
            this.breakpoints.add(instructionIndex);
            this.logger.info(`Breakpoint set at index ${instructionIndex}`);
        }
    }

    /**
     * Advances execution by one step.
     * Automatically handles checkpointing if the next operation is non-reversible.
     */
    public async step(): Promise<boolean> {
        if (this.vm.isHalted()) {
            this.logger.warn("VM is halted. Cannot step forward.");
            return false;
        }

        const currentPC = this.vm.pc;
        const instruction = this.vm.fetch(currentPC);

        if (!instruction) {
            this.logger.error(`No instruction found at PC ${currentPC}`);
            return false;
        }

        // If the operation is non-reversible (Measurement, Reset, I/O), we must snapshot before executing.
        if (!this.isReversible(instruction)) {
            this.createSnapshot(currentPC);
        }

        // Execute the instruction via the VM
        try {
            await this.vm.step();
            this.executionHistory.push(instruction);
            
            // Prune history if needed
            if (this.executionHistory.length > this.maxHistoryDepth) {
                this.executionHistory.shift();
                // Note: Pruning history might compromise rewinding capability for very old steps 
                // if they relied purely on unitary inversion without intermediate snapshots.
            }

            return true;
        } catch (error) {
            this.logger.error(`Runtime error at PC ${currentPC}:`, error);
            return false;
        }
    }

    /**
     * Reverses execution by one step.
     * Uses inverse unitaries for gates, or restores snapshots for measurements.
     */
    public async stepBack(): Promise<boolean> {
        if (this.executionHistory.length === 0) {
            this.logger.warn("No history to rewind.");
            return false;
        }

        const lastInstruction = this.executionHistory.pop();
        const previousPC = this.vm.pc - 1; // Simplified assumption; actual PC logic depends on jump instructions

        if (!lastInstruction) return false;

        this.logger.debug(`Rewinding instruction: ${lastInstruction.opcode} at PC ${previousPC}`);

        if (this.isReversible(lastInstruction)) {
            // Apply U† (Inverse Unitary)
            try {
                const inverseInstruction = this.generateInverseInstruction(lastInstruction);
                // We apply the inverse directly to the quantum state without advancing PC normally
                await this.vm.executeImmediate(inverseInstruction);
                
                // Manually revert PC and other metadata
                this.vm.pc = previousPC; 
                // Note: In a real implementation, we might need to revert cycle counts or classical registers
                // if the unitary instruction affected them (e.g., classical control).
                
                return true;
            } catch (e) {
                this.logger.error("Failed to apply inverse unitary.", e);
                // Fallback to snapshot if inversion fails
                return this.restoreClosestSnapshot(previousPC);
            }
        } else {
            // Non-reversible operation: Must restore from snapshot
            return this.restoreClosestSnapshot(previousPC);
        }
    }

    /**
     * Runs execution forward until a breakpoint is hit or the program halts.
     */
    public async run(): Promise<void> {
        while (!this.vm.isHalted()) {
            if (this.breakpoints.has(this.vm.pc)) {
                this.logger.info(`Breakpoint hit at PC ${this.vm.pc}`);
                break;
            }
            const success = await this.step();
            if (!success) break;
        }
    }

    /**
     * Runs execution backward until a breakpoint is hit or history is exhausted.
     */
    public async reverseRun(): Promise<void> {
        while (this.executionHistory.length > 0) {
            // Check breakpoint at the state we are about to enter (current PC - 1)
            // We check before stepping back to simulate hitting the breakpoint "on the way back"
            const targetPC = this.vm.pc - 1; 
            
            if (this.breakpoints.has(targetPC)) {
                this.logger.info(`Reverse breakpoint hit at PC ${targetPC}`);
                await this.stepBack(); // Step onto the breakpoint
                break;
            }

            const success = await this.stepBack();
            if (!success) break;
        }
    }

    /**
     * Creates a deep copy of the current VM state.
     */
    private createSnapshot(pc: number): void {
        const snapshot: VMSnapshot = {
            pc: pc,
            quantumState: this.vm.quantumState.clone(),
            classicalMemory: new Map(this.vm.classicalMemory), // Shallow copy of map structure, deep copy of values assumed
            cycleCount: this.vm.cycleCount
        };
        this.snapshots.set(pc, snapshot);
        
        // Memory management: remove snapshots that are too old or unreachable?
        // For now, we keep them based on the debugger lifecycle.
    }

    /**
     * Restores the VM state from a snapshot.
     */
    private restoreClosestSnapshot(targetPC: number): boolean {
        if (this.snapshots.has(targetPC)) {
            const snapshot = this.snapshots.get(targetPC)!;
            this.vm.loadState(snapshot.quantumState, snapshot.classicalMemory, snapshot.pc);
            this.vm.cycleCount = snapshot.cycleCount;
            return true;
        }
        
        this.logger.error(`Critical: No snapshot found for non-reversible state at PC ${targetPC}. Cannot rewind.`);
        return false;
    }

    /**
     * Determines if an instruction represents a unitary quantum operation.
     */
    private isReversible(instr: Instruction): boolean {
        switch (instr.opcode) {
            case OpCode.MEASURE:
            case OpCode.RESET:
            case OpCode.PRINT:
            case OpCode.HALT:
                return false;
            case OpCode.GATE:
            case OpCode.CNOT:
            case OpCode.SWAP:
            case OpCode.TOFFOLI:
                return true;
            default:
                // Classical arithmetic is theoretically reversible if we track history, 
                // but for this implementation, we treat classical ops as requiring snapshots 
                // unless we implement a reversible classical ALU.
                return false; 
        }
    }

    /**
     * Generates the inverse (Hermitian conjugate) of a quantum instruction.
     */
    private generateInverseInstruction(instr: Instruction): Instruction {
        const inverse = { ...instr };

        if (instr.opcode === OpCode.GATE) {
            switch (instr.gateType) {
                case GateType.H:
                case GateType.X:
                case GateType.Y:
                case GateType.Z:
                case GateType.CNOT:
                case GateType.SWAP:
                    // These gates are their own inverse
                    return inverse;
                
                case GateType.S:
                    inverse.gateType = GateType.S_DAG;
                    return inverse;
                case GateType.S_DAG:
                    inverse.gateType = GateType.S;
                    return inverse;
                
                case GateType.T:
                    inverse.gateType = GateType.T_DAG;
                    return inverse;
                case GateType.T_DAG:
                    inverse.gateType = GateType.T;
                    return inverse;

                case GateType.RX:
                case GateType.RY:
                case GateType.RZ:
                case GateType.PHASE:
                    // Invert the rotation angle
                    if (inverse.params && inverse.params.length > 0) {
                        inverse.params = [-inverse.params[0]];
                    }
                    return inverse;

                default:
                    throw new Error(`Unknown gate type for inversion: ${instr.gateType}`);
            }
        }

        return inverse;
    }

    /**
     * Returns the current state of the debugger for UI rendering.
     */
    public getDebugState() {
        return {
            pc: this.vm.pc,
            registers: this.vm.classicalMemory,
            quantumStateVector: this.vm.quantumState.getVector(),
            historyLength: this.executionHistory.length,
            breakpoints: Array.from(this.breakpoints)
        };
    }
}