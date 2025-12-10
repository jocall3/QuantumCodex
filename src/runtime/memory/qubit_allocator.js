/**
 * @file src/runtime/memory/qubit_allocator.js
 * @description Implements an environment-aware qubit allocation strategy for managing
 * virtual and physical qubits. This allocator considers QPU topology, noise profiles,
 * and application requirements to optimize qubit mapping.
 */

/**
 * Represents an error during the qubit allocation process.
 */
class QubitAllocationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'QubitAllocationError';
    }
}

/**
 * Manages the allocation of physical qubits to virtual qubits based on
 * environmental factors like QPU topology and noise characteristics.
 *
 * The allocator maintains a pool of physical qubits and maps them to
 * virtual qubits requested by a quantum program. The goal is to provide
 * the best possible physical qubits for a given task, improving the
 * fidelity of the computation.
 */
class QubitAllocator {
    /**
     * Initializes the Qubit Allocator.
     * @param {object} qpuProfile - Describes the physical Quantum Processing Unit.
     * @param {number} qpuProfile.totalQubits - The total number of physical qubits.
     * @param {Object.<number, number[]>} qpuProfile.connectivity - An adjacency list representing the qubit coupling graph. E.g., {0: [1], 1: [0, 2], ...}.
     * @param {Object.<number, object>} qpuProfile.noiseProfile - Noise characteristics for each physical qubit.
     * @param {number} qpuProfile.noiseProfile.errorRate - A representative error rate (e.g., average gate error).
     * @param {object} [qcfConfig={}] - Quantum Configuration File settings.
     * @param {'low-noise' | 'high-connectivity' | 'contiguous'} [qcfConfig.preferredAllocationStrategy='low-noise'] - The default strategy for allocation.
     */
    constructor(qpuProfile, qcfConfig = {}) {
        if (!qpuProfile || typeof qpuProfile.totalQubits !== 'number' || !qpuProfile.connectivity || !qpuProfile.noiseProfile) {
            throw new QubitAllocationError('Invalid QPU profile provided.');
        }

        this.qpuProfile = qpuProfile;
        this.config = {
            preferredAllocationStrategy: 'low-noise',
            ...qcfConfig,
        };

        /** @private @type {Map<number, object>} */
        this.physicalQubits = new Map();
        /** @private @type {Map<number, object>} */
        this.virtualQubits = new Map();
        /** @private @type {Map<number, number>} */
        this.allocationMap = new Map(); // virtualId -> physicalId
        /** @private @type {Map<number, number>} */
        this.reverseAllocationMap = new Map(); // physicalId -> virtualId

        /** @private @type {number} */
        this._nextVirtualQubitId = 0;

        this._initializePools();
    }

    /**
     * @private
     * Initializes the physical qubit pool based on the QPU profile.
     */
    _initializePools() {
        for (let i = 0; i < this.qpuProfile.totalQubits; i++) {
            const noiseData = this.qpuProfile.noiseProfile[i] || { errorRate: 0.1 }; // Default noise if not specified
            const connections = this.qpuProfile.connectivity[i] || [];

            this.physicalQubits.set(i, {
                id: i,
                isAllocated: false,
                noiseData: noiseData,
                connections: connections,
                mappedVirtualQubitId: null,
            });
        }
    }

    /**
     * Allocates a specified number of virtual qubits, mapping them to the best
     * available physical qubits based on the chosen strategy.
     *
     * @param {number} numQubits - The number of virtual qubits to allocate.
     * @param {object} [hints={}] - Allocation hints to override the default configuration.
     * @param {'low-noise' | 'high-connectivity' | 'contiguous'} [hints.strategy] - The allocation strategy for this specific request.
     * @returns {number[]} An array of the newly allocated virtual qubit IDs.
     * @throws {QubitAllocationError} If not enough physical qubits are available.
     */
    allocate(numQubits, hints = {}) {
        const freePhysicalQubits = this._getFreePhysicalQubits();

        if (freePhysicalQubits.length < numQubits) {
            throw new QubitAllocationError(`Cannot allocate ${numQubits} qubits. Only ${freePhysicalQubits.length} are available.`);
        }

        const strategy = hints.strategy || this.config.preferredAllocationStrategy;
        let selectedPhysicalQubits;

        switch (strategy) {
            case 'high-connectivity':
                selectedPhysicalQubits = this._strategyHighConnectivity(freePhysicalQubits, numQubits);
                break;
            case 'contiguous':
                selectedPhysicalQubits = this._strategyContiguous(freePhysicalQubits, numQubits);
                break;
            case 'low-noise':
            default:
                selectedPhysicalQubits = this._strategyLowNoise(freePhysicalQubits, numQubits);
                break;
        }

        const allocatedVirtualIds = [];
        for (const physicalQubit of selectedPhysicalQubits) {
            const virtualId = this._nextVirtualQubitId++;
            
            // Create virtual qubit representation
            this.virtualQubits.set(virtualId, {
                id: virtualId,
                mappedPhysicalQubitId: physicalQubit.id,
            });

            // Update physical qubit state
            physicalQubit.isAllocated = true;
            physicalQubit.mappedVirtualQubitId = virtualId;

            // Update maps
            this.allocationMap.set(virtualId, physicalQubit.id);
            this.reverseAllocationMap.set(physicalQubit.id, virtualId);
            
            allocatedVirtualIds.push(virtualId);
        }

        return allocatedVirtualIds;
    }

    /**
     * Frees a set of virtual qubits, making their corresponding physical qubits
     * available for future allocations.
     *
     * @param {number | number[]} virtualQubitIds - A single virtual qubit ID or an array of IDs to free.
     */
    free(virtualQubitIds) {
        const idsToFree = Array.isArray(virtualQubitIds) ? virtualQubitIds : [virtualQubitIds];

        for (const virtualId of idsToFree) {
            if (this.allocationMap.has(virtualId)) {
                const physicalId = this.allocationMap.get(virtualId);
                const physicalQubit = this.physicalQubits.get(physicalId);

                if (physicalQubit) {
                    physicalQubit.isAllocated = false;
                    physicalQubit.mappedVirtualQubitId = null;
                }

                this.allocationMap.delete(virtualId);
                this.reverseAllocationMap.delete(physicalId);
                this.virtualQubits.delete(virtualId);
            }
            // Silently ignore requests to free non-existent or already-freed qubits.
        }
    }

    /**
     * Retrieves the physical qubit details corresponding to a virtual qubit ID.
     * @param {number} virtualQubitId - The ID of the virtual qubit.
     * @returns {object | null} The physical qubit object or null if not found.
     */
    getPhysicalQubit(virtualQubitId) {
        const physicalId = this.allocationMap.get(virtualQubitId);
        if (physicalId === undefined) {
            return null;
        }
        return this.physicalQubits.get(physicalId) || null;
    }

    /**
     * Returns a copy of the current virtual-to-physical qubit mapping.
     * @returns {Map<number, number>} A map of virtual qubit IDs to physical qubit IDs.
     */
    getMapping() {
        return new Map(this.allocationMap);
    }

    /**
     * Provides statistics about the current state of the allocator.
     * @returns {object} An object containing allocation statistics.
     */
    getStats() {
        const allocatedCount = this.allocationMap.size;
        const totalCount = this.physicalQubits.size;
        return {
            totalPhysicalQubits: totalCount,
            allocatedQubits: allocatedCount,
            freeQubits: totalCount - allocatedCount,
            utilization: totalCount > 0 ? allocatedCount / totalCount : 0,
        };
    }

    /**
     * @private
     * Gets a list of all unallocated physical qubits.
     * @returns {object[]} An array of free physical qubit objects.
     */
    _getFreePhysicalQubits() {
        const freeQubits = [];
        for (const qubit of this.physicalQubits.values()) {
            if (!qubit.isAllocated) {
                freeQubits.push(qubit);
            }
        }
        return freeQubits;
    }

    /**
     * @private
     * Allocation strategy: select qubits with the lowest error rates.
     * @param {object[]} freeQubits - Array of available physical qubits.
     * @param {number} numToAllocate - The number of qubits to select.
     * @returns {object[]} The selected physical qubits.
     */
    _strategyLowNoise(freeQubits, numToAllocate) {
        return freeQubits
            .sort((a, b) => a.noiseData.errorRate - b.noiseData.errorRate)
            .slice(0, numToAllocate);
    }

    /**
     * @private
     * Allocation strategy: select qubits with the highest number of connections.
     * @param {object[]} freeQubits - Array of available physical qubits.
     * @param {number} numToAllocate - The number of qubits to select.
     * @returns {object[]} The selected physical qubits.
     */
    _strategyHighConnectivity(freeQubits, numToAllocate) {
        return freeQubits
            .sort((a, b) => b.connections.length - a.connections.length)
            .slice(0, numToAllocate);
    }

    /**
     * @private
     * Allocation strategy: find a connected block of qubits.
     * This is a greedy implementation that starts with a seed qubit and expands.
     * @param {object[]} freeQubits - Array of available physical qubits.
     * @param {number} numToAllocate - The number of qubits to select.
     * @returns {object[]} The selected physical qubits.
     */
    _strategyContiguous(freeQubits, numToAllocate) {
        if (numToAllocate === 0) return [];
        if (freeQubits.length < numToAllocate) return [];

        // Find the best seed qubit to start from. A good heuristic is a low-noise,
        // well-connected qubit.
        const seedCandidates = [...freeQubits].sort((a, b) => {
            const scoreA = a.connections.length - a.noiseData.errorRate * 10;
            const scoreB = b.connections.length - b.noiseData.errorRate * 10;
            return scoreB - scoreA;
        });

        let bestSet = [];
        // Try starting from a few of the best candidates to find a good cluster.
        for (let i = 0; i < Math.min(seedCandidates.length, 5); i++) {
            const seed = seedCandidates[i];
            const currentSet = this._findConnectedSet(seed, freeQubits, numToAllocate);
            if (currentSet.length === numToAllocate) {
                // A full set was found. We can evaluate if it's better than previous ones.
                // For now, we take the first full set found.
                bestSet = currentSet;
                break;
            }
            if (currentSet.length > bestSet.length) {
                bestSet = currentSet;
            }
        }
        
        // If no contiguous block of the required size was found, fall back to low-noise.
        if (bestSet.length < numToAllocate) {
            console.warn(`Could not find a contiguous block of ${numToAllocate} qubits. Falling back to low-noise strategy.`);
            return this._strategyLowNoise(freeQubits, numToAllocate);
        }

        return bestSet;
    }

    /**
     * @private
     * Helper for the contiguous strategy. Performs a breadth-first search to find a
     * connected set of free qubits.
     * @param {object} startQubit - The physical qubit to start the search from.
     * @param {object[]} freeQubits - Array of all available physical qubits.
     * @param {number} targetSize - The desired number of qubits in the set.
     * @returns {object[]} The found set of connected qubits.
     */
    _findConnectedSet(startQubit, freeQubits, targetSize) {
        const freeQubitIds = new Set(freeQubits.map(q => q.id));
        const connectedSet = new Set([startQubit.id]);
        const queue = [startQubit];
        
        while (queue.length > 0 && connectedSet.size < targetSize) {
            const currentQubit = queue.shift();

            for (const neighborId of currentQubit.connections) {
                if (freeQubitIds.has(neighborId) && !connectedSet.has(neighborId)) {
                    connectedSet.add(neighborId);
                    const neighborQubit = this.physicalQubits.get(neighborId);
                    queue.push(neighborQubit);
                    if (connectedSet.size === targetSize) {
                        break;
                    }
                }
            }
            if (connectedSet.size === targetSize) {
                break;
            }
        }

        // Convert set of IDs back to qubit objects
        return Array.from(connectedSet).map(id => this.physicalQubits.get(id));
    }
}

// This allows the class to be used in Node.js environments (e.g., for testing)
// and also in browser environments.
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = { QubitAllocator, QubitAllocationError };
}