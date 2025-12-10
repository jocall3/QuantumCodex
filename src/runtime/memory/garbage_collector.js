/**
 * Represents a conceptual quantum bit (qubit) within the simulated memory.
 * In a real quantum system, this would be a physical or logical qubit.
 */
class Qubit {
    /**
     * @param {string} id - A unique identifier for the qubit.
     * @param {any} [initialState=null] - A simplified representation of the qubit's quantum state.
     */
    constructor(id, initialState = null) {
        if (!id) {
            throw new Error("Qubit must have a unique ID.");
        }
        this.id = id;
        this.isLive = true; // Indicates if the qubit is actively in use by the program.
        this.isEntangledWith = new Set(); // Stores IDs of other qubits it's entangled with.
        this.state = initialState; // Placeholder for quantum state.
        this.markedForDeallocation = false; // Flag for GC.
    }

    /**
     * Establishes an entanglement link with another qubit.
     * @param {Qubit} otherQubit - The qubit to entangle with.
     */
    entangle(otherQubit) {
        if (this.id === otherQubit.id) {
            console.warn(`Attempted to entangle qubit ${this.id} with itself.`);
            return;
        }
        this.isEntangledWith.add(otherQubit.id);
        otherQubit.isEntangledWith.add(this.id);
        // In a real system, this would involve quantum operations.
        // Here, we just track the relationship.
        console.log(`Qubit ${this.id} entangled with ${otherQubit.id}`);
    }

    /**
     * Breaks an entanglement link with another qubit.
     * @param {Qubit} otherQubit - The qubit to disentangle from.
     */
    disentangle(otherQubit) {
        this.isEntangledWith.delete(otherQubit.id);
        otherQubit.isEntangledWith.delete(this.id);
        console.log(`Qubit ${this.id} disentangled from ${otherQubit.id}`);
    }

    /**
     * Marks the qubit as no longer needed by the application logic.
     * This doesn't immediately deallocate it, but signals the GC.
     */
    release() {
        this.isLive = false;
        console.log(`Qubit ${this.id} marked as released.`);
    }
}

/**
 * Implements 'Quantum Garbage Collection via Entanglement Distillation'.
 * This class manages the lifecycle of conceptual qubits, handling their
 * safe deallocation, especially those entangled with live qubits, by
 * simulating distillation protocols.
 */
class QuantumGarbageCollector {
    constructor() {
        /**
         * @type {Map<string, Qubit>} Stores all active and tracked qubits by their ID.
         */
        this.qubitMemory = new Map();
        console.log("Quantum Garbage Collector initialized.");
    }

    /**
     * Registers a new qubit with the garbage collector.
     * @param {Qubit} qubit - The qubit instance to register.
     */
    registerQubit(qubit) {
        if (this.qubitMemory.has(qubit.id)) {
            console.warn(`Qubit with ID ${qubit.id} already registered.`);
            return;
        }
        this.qubitMemory.set(qubit.id, qubit);
        console.log(`Qubit ${qubit.id} registered.`);
    }

    /**
     * Marks a qubit for deallocation. This is the first step in the GC process.
     * @param {string} qubitId - The ID of the qubit to mark.
     */
    markForDeallocation(qubitId) {
        const qubit = this.qubitMemory.get(qubitId);
        if (qubit) {
            qubit.markedForDeallocation = true;
            qubit.release(); // Also mark as released from application perspective
            console.log(`Qubit ${qubitId} marked for deallocation.`);
        } else {
            console.warn(`Attempted to mark non-existent qubit ${qubitId} for deallocation.`);
        }
    }

    /**
     * The main garbage collection routine.
     * Identifies qubits that are no longer live and attempts to deallocate them.
     * For entangled qubits, it simulates entanglement distillation.
     */
    collectGarbage() {
        console.log("\n--- Starting Quantum Garbage Collection Cycle ---");
        const qubitsToProcess = Array.from(this.qubitMemory.values());
        let deallocatedCount = 0;

        for (const qubit of qubitsToProcess) {
            if (qubit.markedForDeallocation && !qubit.isLive) {
                // Check if it's entangled with any *live* qubits
                const entangledLiveQubits = Array.from(qubit.isEntangledWith)
                    .map(id => this.qubitMemory.get(id))
                    .filter(otherQubit => otherQubit && otherQubit.isLive);

                if (entangledLiveQubits.length > 0) {
                    console.log(`Qubit ${qubit.id} is dead but entangled with live qubits. Initiating distillation.`);
                    // Simulate entanglement distillation
                    this._performEntanglementDistillation(qubit, entangledLiveQubits);
                    // After distillation, the dead qubit can be safely deallocated.
                    this._deallocateQubit(qubit.id);
                    deallocatedCount++;
                } else if (qubit.isEntangledWith.size > 0) {
                    // Entangled only with other dead qubits, or no live qubits in the set
                    console.log(`Qubit ${qubit.id} is dead and entangled only with other dead/untracked qubits. Deallocating.`);
                    this._deallocateQubit(qubit.id);
                    deallocatedCount++;
                } else {
                    // Not entangled at all
                    console.log(`Qubit ${qubit.id} is dead and not entangled. Deallocating.`);
                    this._deallocateQubit(qubit.id);
                    deallocatedCount++;
                }
            }
        }
        console.log(`--- Quantum Garbage Collection Cycle Finished. Deallocated ${deallocatedCount} qubits. ---\n`);
    }

    /**
     * Simulates the process of entanglement distillation.
     * In a real quantum system, this would involve complex quantum operations
     * to concentrate entanglement into a subset of qubits, allowing others to be discarded.
     * Here, it primarily involves updating entanglement links.
     * @param {Qubit} deadQubit - The qubit that is marked for deallocation.
     * @param {Qubit[]} liveEntangledQubits - Live qubits entangled with the dead qubit.
     * @private
     */
    _performEntanglementDistillation(deadQubit, liveEntangledQubits) {
        console.log(`  [Distillation Protocol] Processing dead qubit ${deadQubit.id} with live partners: ${liveEntangledQubits.map(q => q.id).join(', ')}`);

        // Metaphorical distillation:
        // The idea is that the entanglement "value" is preserved or transferred.
        // For simplicity, we'll just break the link to the dead qubit.
        // In a more complex simulation, this might involve creating new entanglement
        // between the live qubits, or modifying their states.

        for (const liveQubit of liveEntangledQubits) {
            // Remove the dead qubit from the live qubit's entanglement set
            liveQubit.isEntangledWith.delete(deadQubit.id);
            console.log(`    - Live qubit ${liveQubit.id} disentangled from dead qubit ${deadQubit.id}.`);
            // Optionally, if there were other dead qubits, their entanglement might be "redirected"
            // or "concentrated" into the remaining live qubits. This is highly speculative.
        }
        // The dead qubit itself will have its entanglement links cleared when deallocated.
        console.log(`  [Distillation Protocol] Completed for ${deadQubit.id}.`);
    }

    /**
     * Removes a qubit from the memory, effectively deallocating it.
     * @param {string} qubitId - The ID of the qubit to deallocate.
     * @private
     */
    _deallocateQubit(qubitId) {
        const qubit = this.qubitMemory.get(qubitId);
        if (qubit) {
            // Ensure all its entanglement links are broken before removal
            for (const entangledQubitId of Array.from(qubit.isEntangledWith)) {
                const otherQubit = this.qubitMemory.get(entangledQubitId);
                if (otherQubit) {
                    otherQubit.isEntangledWith.delete(qubitId);
                    console.log(`  Qubit ${otherQubit.id} disentangled from deallocating qubit ${qubitId}.`);
                }
            }
            qubit.isEntangledWith.clear(); // Clear its own set
            this.qubitMemory.delete(qubitId);
            console.log(`  Qubit ${qubitId} deallocated and removed from memory.`);
        } else {
            console.warn(`Attempted to deallocate non-existent qubit ${qubitId}.`);
        }
    }

    /**
     * Provides a snapshot of the current memory state.
     * @returns {object} An object containing information about live and dead qubits.
     */
    getMemoryStatus() {
        const liveQubits = [];
        const deadQubits = [];
        this.qubitMemory.forEach(qubit => {
            const status = {
                id: qubit.id,
                isLive: qubit.isLive,
                markedForDeallocation: qubit.markedForDeallocation,
                entangledWith: Array.from(qubit.isEntangledWith)
            };
            if (qubit.isLive) {
                liveQubits.push(status);
            } else {
                deadQubits.push(status);
            }
        });
        return {
            totalQubits: this.qubitMemory.size,
            liveQubits,
            deadQubits
        };
    }
}

// Export the classes for use in other modules
export { Qubit, QuantumGarbageCollector };