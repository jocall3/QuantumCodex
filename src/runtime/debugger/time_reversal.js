/**
 * @file src/runtime/debugger/time_reversal.js
 * @description Implements the 'Time-Reversal Symmetry' feature of the debugger.
 * It tracks unitary operations and checkpoints states to allow for 'rewinding'
 * the quantum computation during a debug session.
 */

/**
 * Manages the history of a quantum computation, allowing for stepping backward
 * and forward in time. This is achieved by storing a history of unitary
 * operations and periodically checkpointing the quantum state.
 *
 * This class requires a quantum simulator object that conforms to a specific
 * interface, including methods like `getState()`, `setState(state)`,
 * `applyOperation(op)`, and `applyInverseOperation(op)`.
 */
export class TimeReversalDebugger {
    /**
     * The interval at which to create a checkpoint of the quantum state.
     * A smaller number means faster rewinding but higher memory usage.
     * @type {number}
     * @private
     */
    _CHECKPOINT_INTERVAL = 50;

    /**
     * A reference to the quantum simulator instance.
     * The debugger interacts with the simulator to get/set state and apply gates.
     * @type {object}
     * @private
     */
    _simulator;

    /**
     * A history of all operations performed. Each entry is an object
     * representing the operation (e.g., gate, qubits, params).
     * @type {Array<object>}
     */
    operationHistory = [];

    /**
     * Stores snapshots of the quantum state at specific steps.
     * The key is the step number (index in operationHistory), and the value
     * is the quantum state at that point.
     * @type {Map<number, any>}
     */
    checkpoints = new Map();

    /**
     * The current step in the execution history. This points to the *next*
     * operation to be executed. A value of 0 means we are at the initial state.
     * A value equal to `operationHistory.length` means we are at the most recent state.
     * @type {number}
     */
    currentStep = 0;

    /**
     * @param {object} quantumSimulator - An instance of the quantum simulator.
     * It must provide `getState()`, `setState(state)`, `applyOperation(op)`, and `applyInverseOperation(op)` methods.
     * @param {object} [options={}] - Configuration options.
     * @param {number} [options.checkpointInterval=50] - The number of operations between state checkpoints.
     */
    constructor(quantumSimulator, options = {}) {
        if (!quantumSimulator ||
            typeof quantumSimulator.getState !== 'function' ||
            typeof quantumSimulator.setState !== 'function' ||
            typeof quantumSimulator.applyOperation !== 'function' ||
            typeof quantumSimulator.applyInverseOperation !== 'function') {
            throw new Error('TimeReversalDebugger requires a valid quantum simulator instance with getState, setState, applyOperation, and applyInverseOperation methods.');
        }
        this._simulator = quantumSimulator;
        this._CHECKPOINT_INTERVAL = options.checkpointInterval || 50;

        // Create the initial checkpoint at step 0
        this.createCheckpoint(0);
    }

    /**
     * Records a new quantum operation. This should be called by the runtime
     * *before* the operation is applied. If the debugger has been rewound,
     * this will truncate any future history.
     * @param {object} operation - The operation object to record.
     */
    recordOperation(operation) {
        // If we've rewound and are now performing a new operation,
        // the old "future" is discarded.
        if (this.currentStep < this.operationHistory.length) {
            this.operationHistory.splice(this.currentStep);
            // Also remove any checkpoints that are now in the truncated future.
            const stepsToClear = Array.from(this.checkpoints.keys()).filter(step => step > this.currentStep);
            stepsToClear.forEach(step => this.checkpoints.delete(step));
        }

        this.operationHistory.push(operation);
        this.currentStep = this.operationHistory.length;

        // Automatically create a checkpoint at the specified interval.
        if (this.currentStep > 0 && this.currentStep % this._CHECKPOINT_INTERVAL === 0) {
            this.createCheckpoint(this.currentStep);
        }
    }

    /**
     * Manually creates a checkpoint of the current simulator state at a given step.
     * @param {number} step - The step number to associate with this checkpoint.
     */
    createCheckpoint(step) {
        try {
            const state = this._simulator.getState();
            // The simulator's getState() method should return an immutable or
            // deep-cloned value to prevent accidental mutation of checkpointed states.
            this.checkpoints.set(step, state);
            console.log(`[TimeReversalDebugger] Checkpoint created at step ${step}.`);
        } catch (error) {
            console.error(`[TimeReversalDebugger] Failed to create checkpoint at step ${step}:`, error);
        }
    }

    /**
     * Checks if it's possible to step backward.
     * @returns {boolean} True if rewinding is possible.
     */
    canRewind() {
        return this.currentStep > 0;
    }

    /**
     * Checks if it's possible to step forward.
     * @returns {boolean} True if fast-forwarding is possible.
     */
    canFastForward() {
        return this.currentStep < this.operationHistory.length;
    }

    /**
     * Rewinds the computation by one step.
     * It applies the inverse of the last executed operation.
     * @returns {Promise<boolean>} A promise that resolves to true if the rewind was successful, false otherwise.
     */
    async rewind() {
        if (!this.canRewind()) {
            console.warn('[TimeReversalDebugger] Cannot rewind. Already at the beginning of history.');
            return false;
        }

        this.currentStep--;
        const operationToUndo = this.operationHistory[this.currentStep];

        try {
            // Ask the simulator to apply the inverse of the operation.
            await this._simulator.applyInverseOperation(operationToUndo);
            return true;
        } catch (error) {
            console.error(`[TimeReversalDebugger] Error applying inverse of operation at step ${this.currentStep}:`, operationToUndo, error);
            // If applying the inverse fails, the state is now inconsistent.
            // The safest recovery is to seek to the new currentStep to restore a valid state.
            await this.seek(this.currentStep);
            return false;
        }
    }

    /**
     * Moves the computation forward by one step from the history.
     * This is only possible after rewinding.
     * @returns {Promise<boolean>} A promise that resolves to true if the step forward was successful, false otherwise.
     */
    async fastForward() {
        if (!this.canFastForward()) {
            console.warn('[TimeReversalDebugger] Cannot fast-forward. Already at the end of history.');
            return false;
        }

        const operationToRedo = this.operationHistory[this.currentStep];

        try {
            await this._simulator.applyOperation(operationToRedo);
            this.currentStep++;
            return true;
        } catch (error) {
            console.error(`[TimeReversalDebugger] Error re-applying operation at step ${this.currentStep}:`, operationToRedo, error);
            return false;
        }
    }

    /**
     * Jumps to a specific step in the computation's history.
     * This finds the nearest preceding checkpoint and re-simulates from there
     * to reach the target step, ensuring state consistency.
     * @param {number} targetStep - The step number to jump to.
     * @returns {Promise<boolean>} A promise that resolves to true if the seek was successful.
     */
    async seek(targetStep) {
        if (targetStep < 0 || targetStep > this.operationHistory.length) {
            console.error(`[TimeReversalDebugger] Invalid seek target: ${targetStep}. Must be between 0 and ${this.operationHistory.length}.`);
            return false;
        }

        if (targetStep === this.currentStep) {
            return true; // Nothing to do.
        }

        // Find the most recent checkpoint at or before the target step.
        let closestCheckpointStep = 0;
        for (const step of this.checkpoints.keys()) {
            if (step <= targetStep && step > closestCheckpointStep) {
                closestCheckpointStep = step;
            }
        }

        console.log(`[TimeReversalDebugger] Seeking to step ${targetStep}. Using checkpoint at step ${closestCheckpointStep}.`);

        try {
            // 1. Restore the state from the checkpoint.
            const checkpointState = this.checkpoints.get(closestCheckpointStep);
            if (!checkpointState) {
                throw new Error(`Checkpoint state for step ${closestCheckpointStep} not found.`);
            }
            await this._simulator.setState(checkpointState);

            // 2. Replay operations from the checkpoint to the target step.
            for (let i = closestCheckpointStep; i < targetStep; i++) {
                const operation = this.operationHistory[i];
                await this._simulator.applyOperation(operation);
            }

            // 3. Update the current step pointer.
            this.currentStep = targetStep;
            console.log(`[TimeReversalDebugger] Successfully seeked to step ${targetStep}.`);
            return true;
        } catch (error) {
            console.error(`[TimeReversalDebugger] Failed to seek to step ${targetStep}:`, error);
            // Attempt to restore to a known good state (e.g., the initial state)
            // to prevent the simulator from being in a corrupted state.
            await this.seek(0);
            return false;
        }
    }

    /**
     * Resets the debugger to its initial state, clearing all history and checkpoints.
     * Note: This does not reset the simulator itself, which should be handled externally.
     * After the simulator is reset, this method should be called to sync the debugger.
     */
    reset() {
        this.operationHistory = [];
        this.checkpoints.clear();
        this.currentStep = 0;
        // Create the initial checkpoint for the new state.
        this.createCheckpoint(0);
        console.log('[TimeReversalDebugger] History and checkpoints have been reset.');
    }

    /**
     * Gets the total number of recorded operations.
     * @returns {number}
     */
    get totalSteps() {
        return this.operationHistory.length;
    }
}