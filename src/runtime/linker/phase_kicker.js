/**
 * @file src/runtime/linker/phase_kicker.js
 * @description Implements the 'Phase-Kicked Linker', a mechanism for direct,
 * dynamic interaction between classical control flow and the phases of quantum registers.
 * This module provides the core logic for manipulating the quantum state of terminal
 * elements in response to classical events like user input, system output, or
 * scheduled ticks.
 */

/**
 * Represents a single quantum register, which holds a value and a quantum phase.
 * In the context of the terminal, a register might correspond to a character cell,
 * a cursor, or any other stateful element.
 */
class QuantumRegister {
    /**
     * Creates an instance of a QuantumRegister.
     * @param {string} id - A unique identifier for the register.
     * @param {*} initialValue - The initial classical value of the register.
     * @param {number} [initialPhase=0] - The initial phase in radians (0 to 2*PI).
     */
    constructor(id, initialValue, initialPhase = 0) {
        if (!id) {
            throw new Error("QuantumRegister must have a unique ID.");
        }
        this.id = id;
        this.value = initialValue;
        this.phase = initialPhase % (2 * Math.PI);
        this.entangledRegisters = new Set();
        this.lastKickedTimestamp = null;
        this.kickCount = 0;
    }

    /**
     * Updates the phase of the register. The new phase is wrapped to stay within [0, 2*PI).
     * @param {number} newPhase - The new phase value in radians.
     */
    setPhase(newPhase) {
        this.phase = newPhase % (2 * Math.PI);
        if (this.phase < 0) {
            this.phase += 2 * Math.PI;
        }
    }

    /**
     * Updates the classical value of the register.
     * @param {*} newValue - The new classical value.
     */
    setValue(newValue) {
        this.value = newValue;
    }

    /**
     * Records a kick event on this register.
     * @private
     */
    _recordKick() {
        this.lastKickedTimestamp = Date.now();
        this.kickCount++;
    }
}

/**
 * The PhaseKickerLinker is the central orchestrator for applying phase kicks
 * to quantum registers based on classical control flow. It manages the lifecycle
 * of registers and executes kick operations.
 */
class PhaseKickerLinker {
    /**
     * Initializes the PhaseKickerLinker.
     * @param {object} [options={}] - Configuration options.
     * @param {object} [options.eventBus=null] - An optional event bus for linking kicks to system events.
     */
    constructor(options = {}) {
        this.registers = new Map();
        this.eventBus = options.eventBus || null;
        this.linkedEvents = new Map();

        console.log("Phase-Kicked Linker initialized. Awaiting classical triggers.");
    }

    /**
     * Creates and registers a new QuantumRegister.
     * @param {string} id - The unique ID for the new register.
     * @param {*} initialValue - The initial classical value.
     * @param {number} [initialPhase=0] - The initial phase in radians.
     * @returns {QuantumRegister} The newly created register.
     */
    createRegister(id, initialValue, initialPhase = 0) {
        if (this.registers.has(id)) {
            console.warn(`A QuantumRegister with ID '${id}' already exists. Overwriting is not recommended.`);
        }
        const register = new QuantumRegister(id, initialValue, initialPhase);
        this.registers.set(id, register);
        return register;
    }

    /**
     * Retrieves a register by its ID.
     * @param {string} id - The ID of the register to retrieve.
     * @returns {QuantumRegister|undefined} The register, or undefined if not found.
     */
    getRegister(id) {
        return this.registers.get(id);
    }

    /**
     * Removes a register from the system.
     * @param {string} id - The ID of the register to destroy.
     * @returns {boolean} True if the register was found and destroyed, false otherwise.
     */
    destroyRegister(id) {
        // Also handle unlinking any entangled registers if that feature is expanded.
        const register = this.getRegister(id);
        if (register) {
            register.entangledRegisters.forEach(entangledId => {
                const entangledReg = this.getRegister(entangledId);
                if (entangledReg) {
                    entangledReg.entangledRegisters.delete(id);
                }
            });
        }
        return this.registers.delete(id);
    }

    /**
     * Applies a "kick" to a register, modifying its phase. This is the core operation
     * linking classical computation to the quantum state.
     * @param {string} registerId - The ID of the target register.
     * @param {function(QuantumRegister, object): number} kickOperator - A function that takes the
     *   current register and classical parameters, and returns the new phase.
     * @param {object} [classicalParams={}] - An object containing classical data to influence the kick.
     * @returns {boolean} True if the kick was applied successfully, false otherwise.
     */
    applyKick(registerId, kickOperator, classicalParams = {}) {
        const register = this.getRegister(registerId);
        if (!register) {
            console.error(`Attempted to apply kick to non-existent register: '${registerId}'`);
            return false;
        }

        try {
            const newPhase = kickOperator(register, classicalParams);
            register.setPhase(newPhase);
            register._recordKick();

            // If entangled, propagate the kick (this is a simplified model)
            if (register.entangledRegisters.size > 0) {
                this._propagateEntangledKick(register, kickOperator, classicalParams);
            }

            return true;
        } catch (error) {
            console.error(`Error during phase kick on register '${registerId}':`, error);
            return false;
        }
    }

    /**
     * Propagates a kick to entangled registers.
     * This is a placeholder for more complex entanglement logic. A simple model
     * might apply a related transformation to linked registers.
     * @private
     */
    _propagateEntangledKick(sourceRegister, kickOperator, classicalParams) {
        sourceRegister.entangledRegisters.forEach(entangledId => {
            // For simplicity, we apply the same kick. A real model might use a CNOT-like operator.
            this.applyKick(entangledId, kickOperator, { ...classicalParams, source: sourceRegister.id });
        });
    }

    /**
     * Creates a Bell pair-like entanglement between two registers.
     * @param {string} registerId1
     * @param {string} registerId2
     * @returns {boolean} True if entanglement was successful.
     */
    entangle(registerId1, registerId2) {
        const reg1 = this.getRegister(registerId1);
        const reg2 = this.getRegister(registerId2);

        if (!reg1 || !reg2) {
            console.error("Cannot entangle non-existent registers.");
            return false;
        }

        reg1.entangledRegisters.add(registerId2);
        reg2.entangledRegisters.add(registerId1);
        return true;
    }

    /**
     * Links a classical system event to a phase kick operation.
     * Requires an event bus to be configured in the constructor.
     * @param {string} eventName - The name of the event to listen for.
     * @param {string} registerId - The ID of the register to kick.
     * @param {function} kickOperator - The kick operator to apply.
     */
    linkToClassicalEvent(eventName, registerId, kickOperator) {
        if (!this.eventBus) {
            throw new Error("Cannot link to classical event: Event Bus not provided.");
        }

        const handler = (eventPayload) => {
            this.applyKick(registerId, kickOperator, eventPayload);
        };

        this.eventBus.on(eventName, handler);

        // Store the handler so we can unlink it later if needed
        if (!this.linkedEvents.has(eventName)) {
            this.linkedEvents.set(eventName, []);
        }
        this.linkedEvents.get(eventName).push({ registerId, handler });
    }

    /**
     * Unlinks a previously linked event.
     * @param {string} eventName - The name of the event to unlink.
     * @param {string} [registerId] - Optional. If provided, only unlinks for this specific register.
     */
    unlinkFromClassicalEvent(eventName, registerId) {
        if (!this.eventBus || !this.linkedEvents.has(eventName)) {
            return;
        }

        const links = this.linkedEvents.get(eventName);
        const remainingLinks = [];

        links.forEach(link => {
            if (!registerId || link.registerId === registerId) {
                this.eventBus.off(eventName, link.handler);
            } else {
                remainingLinks.push(link);
            }
        });

        if (remainingLinks.length === 0) {
            this.linkedEvents.delete(eventName);
        } else {
            this.linkedEvents.set(eventName, remainingLinks);
        }
    }
}

/**
 * A collection of standard kick operators. These are pure functions that calculate
 * a new phase based on a register's current state and classical parameters.
 */
export const KickOperators = {
    /**
     * A phase shift gate. Rotates the phase by a given angle theta.
     * @param {number} theta - The angle to rotate by (in radians).
     */
    PhaseShift: (theta) => (register) => register.phase + theta,

    /**
     * A Pauli-X gate equivalent. Flips the phase by PI radians (180 degrees).
     * Represents a bit-flip.
     */
    PauliX: (register) => register.phase + Math.PI,

    /**
     * A Hadamard gate equivalent. Creates a superposition of phases.
     * This is a conceptual mapping; here we can use it to randomize or reset phase.
     * For example, it could map phase `p` to `(p + PI/2)`.
     */
    Hadamard: (register) => {
        // A simple, deterministic transformation inspired by the Hadamard matrix.
        // This is not a true quantum simulation but provides complex behavior.
        const cosP = Math.cos(register.phase);
        const sinP = Math.sin(register.phase);
        // A simplified rotation that creates interesting visual patterns
        return Math.atan2(sinP - cosP, cosP + sinP);
    },

    /**
     * A "measurement" kick. Collapses the phase to a classical state (0 or PI)
     * based on its current value.
     * @param {QuantumRegister} register - The register being measured.
     * @returns {number} The new phase (0 or PI).
     */
    Measure: (register) => {
        // Collapse to the nearest classical state.
        // cos(phase) > 0 -> state |0> (phase 0)
        // cos(phase) <= 0 -> state |1> (phase PI)
        return Math.cos(register.phase) > 0 ? 0 : Math.PI;
    },

    /**
     * A kick driven by a classical value, such as a character code.
     * @param {object} params - Classical parameters.
     * @param {number} params.value - A numerical value to drive the phase shift.
     * @param {number} [params.factor=0.1] - A scaling factor.
     */
    ClassicalValueDrive: (register, params) => {
        const { value = 0, factor = 0.1 } = params;
        return register.phase + (value * factor);
    },
};

export default PhaseKickerLinker;