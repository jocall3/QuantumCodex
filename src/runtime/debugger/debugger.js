/**
 * @file The core logic for the 'Quantum Debugger'. It will manage breakpoints,
 * step-through execution, and inspection of both classical and quantum states.
 *
 * This debugger is designed to work with a separate "quantum runtime" engine,
 * which is responsible for the actual execution of quantum operations.
 */

// A simple event emitter is a common pattern. If not available in the project,
// a minimal implementation is provided at the end of this file.
// For a real project, you might use a library or a shared utility.
import { EventEmitter } from '../events.js';

/**
 * Represents the state of a single Qubit.
 * In a real quantum simulator, this would be more complex, likely involving
 * a state vector of complex numbers. This is a simplified model for the debugger's purpose.
 */
class Qubit {
    /**
     * @param {number} id The identifier for the qubit.
     */
    constructor(id) {
        this.id = id;
        // Initial state |0>
        // [alpha, beta] where state is alpha|0> + beta|1>
        // Using real numbers for simplicity, though they should be complex.
        this.stateVector = [1.0, 0.0];
    }

    /**
     * Measures the qubit, collapsing its state to either |0> or |1>.
     * @returns {0 | 1} The classical measurement result.
     */
    measure() {
        const probability0 = Math.pow(Math.abs(this.stateVector[0]), 2);
        const isZero = Math.random() < probability0;
        this.stateVector = isZero ? [1.0, 0.0] : [0.0, 1.0];
        return isZero ? 0 : 1;
    }

    /**
     * Returns a string representation of the qubit's state vector.
     * @returns {string}
     */
    toString() {
        const [alpha, beta] = this.stateVector;
        const plus = beta >= 0 ? '+' : '-';
        return `${alpha.toFixed(3)}|0> ${plus} ${Math.abs(beta).toFixed(3)}|1>`;
    }
}


/**
 * Manages the execution and debugging of a quantum program.
 * This class orchestrates the debugging flow but delegates the actual
 * instruction execution to a provided runtime.
 *
 * Emits events:
 * - 'paused': When execution pauses (due to breakpoint, step, etc.).
 * - 'resumed': When execution continues.
 * - 'state-changed': When the classical or quantum state is updated.
 * - 'end': When the program finishes execution.
 * - 'reset': When the debugger is reset.
 */
export class QuantumDebugger extends EventEmitter {
    /**
     * @param {object} quantumRuntime - An interface to the quantum execution engine.
     * This runtime must have a method: `executeInstruction(instruction, state)`.
     */
    constructor(quantumRuntime) {
        super();
        if (!quantumRuntime || typeof quantumRuntime.executeInstruction !== 'function') {
            throw new Error('A valid quantumRuntime with an executeInstruction method is required.');
        }
        this.runtime = quantumRuntime;
        this.reset();
    }

    /**
     * Resets the debugger to its initial, empty state.
     */
    reset() {
        /** @type {Array<object> | null} The program being debugged (an array of instructions). */
        this.program = null;

        /** @type {Set<number>} A set of 1-based line numbers for breakpoints. */
        this.breakpoints = new Set();

        /** The current execution state. */
        this.executionState = null;

        /** @type {boolean} Flag indicating if execution is currently paused. */
        this.isPaused = true;

        /** @type {'initial' | 'breakpoint' | 'step' | 'pause' | 'end'} The reason for the current pause. */
        this.pauseReason = 'initial';

        this._emit('reset');
    }

    /**
     * Loads a program into the debugger for execution.
     * @param {Array<object>} program - An array of instruction objects.
     * @param {number} [numQubits=1] - The number of qubits to initialize for the program.
     */
    loadProgram(program, numQubits = 1) {
        this.reset();
        this.program = program;
        this.executionState = {
            programCounter: 0,
            callStack: [],
            classicalRegisters: new Map(),
            quantumRegister: Array.from({ length: numQubits }, (_, i) => new Qubit(i)),
            isFinished: false,
        };
        this.isPaused = true;
        this.pauseReason = 'initial';
        this._emit('state-changed', this.getStateSnapshot());
        this._emit('paused', { reason: this.pauseReason, line: 0 });
    }

    /**
     * Adds a breakpoint at a specific line number.
     * @param {number} lineNumber - The 1-based line number to add a breakpoint.
     * @returns {boolean} True if the breakpoint was added, false if it already existed.
     */
    setBreakpoint(lineNumber) {
        if (this.breakpoints.has(lineNumber)) return false;
        this.breakpoints.add(lineNumber);
        return true;
    }

    /**
     * Removes a breakpoint from a specific line number.
     * @param {number} lineNumber - The 1-based line number to remove.
     * @returns {boolean} True if the breakpoint was removed, false if it didn't exist.
     */
    removeBreakpoint(lineNumber) {
        return this.breakpoints.delete(lineNumber);
    }

    /** Clears all registered breakpoints. */
    clearBreakpoints() {
        this.breakpoints.clear();
    }

    /**
     * Continues execution until the next breakpoint or the end of the program.
     */
    continue() {
        if (!this.program || this.executionState.isFinished || !this.isPaused) return;

        this.isPaused = false;
        this._emit('resumed');

        // Use a loop to prevent deep call stacks for long-running programs
        while (!this.isPaused && !this.executionState.isFinished) {
            const currentLine = this.executionState.programCounter + 1;
            // Check for breakpoint *before* executing the line.
            // The `pauseReason` check prevents an immediate stop after a step command.
            if (this.breakpoints.has(currentLine) && this.pauseReason !== 'step') {
                this._pause('breakpoint', currentLine);
                break;
            }
            this._executeStep();
        }
        // Reset pause reason after a step-like action has completed its run
        if (this.pauseReason === 'step') {
            this.pauseReason = null;
        }
    }

    /**
     * Executes the next single instruction, stepping into function calls.
     */
    stepInto() {
        if (!this.program || this.executionState.isFinished) return;
        this._emit('resumed');
        this._executeStep();
        this._pause('step', this.executionState.programCounter + 1);
    }

    /**
     * Executes instructions until the next line in the current stack frame is reached.
     * It "steps over" function calls.
     */
    stepOver() {
        if (!this.program || this.executionState.isFinished) return;

        const initialStackDepth = this.executionState.callStack.length;
        this._emit('resumed');

        // Execute at least one step
        this._executeStep();

        // If we stepped into a deeper function, run until we pop back out
        while (
            !this.executionState.isFinished &&
            this.executionState.callStack.length > initialStackDepth
        ) {
            this._executeStep();
        }

        this._pause('step', this.executionState.programCounter + 1);
    }

    /**
     * Continues execution until the current function returns and execution
     * is in the parent stack frame.
     */
    stepOut() {
        if (!this.program || this.executionState.isFinished || this.executionState.callStack.length === 0) {
            // If not in a function, 'step out' is equivalent to 'continue'
            this.continue();
            return;
        }

        const initialStackDepth = this.executionState.callStack.length;
        this._emit('resumed');

        while (
            !this.executionState.isFinished &&
            this.executionState.callStack.length >= initialStackDepth
        ) {
            this._executeStep();
        }

        this._pause('step', this.executionState.programCounter + 1);
    }

    /**
     * Manually pauses the execution if it is running.
     */
    forcePause() {
        if (!this.isPaused) {
            this._pause('pause', this.executionState.programCounter + 1);
        }
    }

    /**
     * Internal helper to pause execution and emit events.
     * @private
     * @param {'breakpoint' | 'step' | 'pause' | 'end' | 'initial'} reason - The reason for pausing.
     * @param {number} line - The 1-based line number where the pause occurred.
     */
    _pause(reason, line) {
        this.isPaused = true;
        this.pauseReason = reason;
        this._emit('paused', { reason, line });
    }

    /**
     * Executes a single instruction from the program using the runtime.
     * @private
     */
    _executeStep() {
        if (!this.program || this.executionState.isFinished) return;

        const pc = this.executionState.programCounter;
        if (pc >= this.program.length) {
            this.executionState.isFinished = true;
            this._pause('end', pc);
            this._emit('end');
            return;
        }

        const instruction = this.program[pc];

        // Delegate execution to the runtime, which may modify the state
        const result = this.runtime.executeInstruction(instruction, this.executionState);

        // Update program counter based on runtime result (for jumps, calls, etc.)
        if (typeof result?.nextProgramCounter === 'number') {
            this.executionState.programCounter = result.nextProgramCounter;
        } else {
            this.executionState.programCounter++;
        }

        this._emit('state-changed', this.getStateSnapshot());
    }

    /**
     * Gets a serializable snapshot of the current debugger state for UI rendering.
     * @returns {object} A snapshot of the current state.
     */
    getStateSnapshot() {
        if (!this.executionState) {
            return {
                isPaused: this.isPaused,
                isFinished: true,
                pauseReason: this.pauseReason,
                programCounter: 0,
                classicalState: {},
                quantumState: [],
                breakpoints: Array.from(this.breakpoints),
            };
        }

        const classicalState = Object.fromEntries(this.executionState.classicalRegisters);
        const quantumState = this.executionState.quantumRegister.map(q => ({
            id: q.id,
            stateVector: [...q.stateVector],
            probabilities: {
                p0: Math.pow(Math.abs(q.stateVector[0]), 2),
                p1: Math.pow(Math.abs(q.stateVector[1]), 2),
            },
            string: q.toString(),
        }));

        return {
            isPaused: this.isPaused,
            isFinished: this.executionState.isFinished,
            pauseReason: this.pauseReason,
            programCounter: this.executionState.programCounter,
            classicalState,
            quantumState,
            breakpoints: Array.from(this.breakpoints),
        };
    }
}