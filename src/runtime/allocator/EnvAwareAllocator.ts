import { v4 as uuidv4 } from 'uuid';

/**
 * Defines the execution environment for the .u runtime.
 */
export enum ExecutionEnvironment {
    LOCAL_SIMULATOR = 'LOCAL_SIMULATOR',
    CLOUD_QPU = 'CLOUD_QPU',
    HYBRID = 'HYBRID'
}

/**
 * Represents a physical or virtual qubit resource.
 */
export interface QubitResource {
    virtualId: number;       // The ID used by the .u program
    physicalId?: string;     // The ID on the actual hardware (if applicable)
    isAllocated: boolean;
    coherenceTime?: number;  // Estimated T1/T2 in microseconds (optional simulation param)
    connectivity: string[];  // List of physical IDs this qubit connects to
}

/**
 * Configuration for the Allocator.
 */
export interface AllocatorConfig {
    environment: ExecutionEnvironment;
    totalQubits: number;
    // Adjacency list representing hardware topology: physicalId -> physicalId[]
    hardwareTopology?: Record<string, string[]>; 
    // Optional mapping of physical IDs to specific properties (fidelity, etc.)
    calibrationData?: Record<string, any>;
}

/**
 * Error thrown when allocation fails.
 */
export class AllocationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AllocationError';
    }
}

/**
 * A resource allocator that intelligently assigns qubits based on the execution environment.
 * 
 * - In LOCAL_SIMULATOR mode, it optimizes for array contiguity and memory usage.
 * - In CLOUD_QPU mode, it optimizes for connectivity to reduce SWAP gate overhead.
 */
export class EnvAwareAllocator {
    private environment: ExecutionEnvironment;
    private totalCapacity: number;
    private activeAllocations: Map<number, QubitResource>; // virtualId -> Resource
    private hardwareTopology: Record<string, string[]>;
    private physicalAvailability: Map<string, boolean>; // physicalId -> isAvailable
    private nextVirtualId: number;

    constructor(config: AllocatorConfig) {
        this.environment = config.environment;
        this.totalCapacity = config.totalQubits;
        this.activeAllocations = new Map();
        this.nextVirtualId = 0;
        
        this.hardwareTopology = config.hardwareTopology || {};
        this.physicalAvailability = new Map();

        // Initialize physical availability
        if (this.environment === ExecutionEnvironment.CLOUD_QPU && config.hardwareTopology) {
            Object.keys(config.hardwareTopology).forEach(pid => {
                this.physicalAvailability.set(pid, true);
            });
        } else {
            // For simulation, we treat physical IDs as abstract indices '0', '1', ...
            for (let i = 0; i < this.totalCapacity; i++) {
                this.physicalAvailability.set(i.toString(), true);
            }
        }
    }

    /**
     * Allocates a set of qubits for a quantum register.
     * @param count Number of qubits required.
     * @returns Array of allocated QubitResources.
     */
    public allocate(count: number): QubitResource[] {
        if (count <= 0) return [];
        
        const availableCount = Array.from(this.physicalAvailability.values()).filter(v => v).length;
        if (availableCount < count) {
            throw new AllocationError(`Insufficient quantum resources. Requested: ${count}, Available: ${availableCount}`);
        }

        switch (this.environment) {
            case ExecutionEnvironment.CLOUD_QPU:
                return this.allocatePhysical(count);
            case ExecutionEnvironment.LOCAL_SIMULATOR:
            default:
                return this.allocateVirtual(count);
        }
    }

    /**
     * Frees the specified qubits, making them available for future allocation.
     * @param qubits Array of qubits to deallocate.
     */
    public deallocate(qubits: QubitResource[]): void {
        for (const qubit of qubits) {
            if (this.activeAllocations.has(qubit.virtualId)) {
                this.activeAllocations.delete(qubit.virtualId);
                if (qubit.physicalId) {
                    this.physicalAvailability.set(qubit.physicalId, true);
                }
            }
        }
    }

    /**
     * Resets the allocator, freeing all resources.
     */
    public reset(): void {
        this.activeAllocations.clear();
        for (const key of this.physicalAvailability.keys()) {
            this.physicalAvailability.set(key, true);
        }
        this.nextVirtualId = 0;
    }

    /**
     * Returns the current utilization metrics.
     */
    public getStats() {
        const used = this.activeAllocations.size;
        return {
            environment: this.environment,
            totalCapacity: this.totalCapacity,
            usedQubits: used,
            freeQubits: this.totalCapacity - used,
            utilizationPct: (used / this.totalCapacity) * 100
        };
    }

    // -------------------------------------------------------------------------
    // Private Allocation Strategies
    // -------------------------------------------------------------------------

    /**
     * Simple linear allocation for simulators.
     * Does not worry about topology, just grabs the next available slots.
     */
    private allocateVirtual(count: number): QubitResource[] {
        const allocated: QubitResource[] = [];
        const physicalIds = Array.from(this.physicalAvailability.keys());
        
        let found = 0;
        for (const pid of physicalIds) {
            if (found >= count) break;
            if (this.physicalAvailability.get(pid)) {
                this.physicalAvailability.set(pid, false);
                
                const res: QubitResource = {
                    virtualId: this.nextVirtualId++,
                    physicalId: pid,
                    isAllocated: true,
                    connectivity: [] // Simulation usually assumes all-to-all or handles swaps internally
                };
                
                this.activeAllocations.set(res.virtualId, res);
                allocated.push(res);
                found++;
            }
        }

        return allocated;
    }

    /**
     * Topology-aware allocation for Physical QPUs.
     * Attempts to find a connected subgraph of qubits to minimize SWAP errors.
     * Uses a Breadth-First Search (BFS) strategy to find a cluster.
     */
    private allocatePhysical(count: number): QubitResource[] {
        const availablePids = Array.from(this.physicalAvailability.entries())
            .filter(([_, avail]) => avail)
            .map(([pid, _]) => pid);

        // Heuristic: Try to find a starting node with high degree (connectivity) 
        // to maximize chances of finding neighbors.
        availablePids.sort((a, b) => {
            const degA = (this.hardwareTopology[a] || []).length;
            const degB = (this.hardwareTopology[b] || []).length;
            return degB - degA;
        });

        for (const startNode of availablePids) {
            const subgraph = this.findConnectedSubgraph(startNode, count);
            if (subgraph.length === count) {
                // Commit allocation
                const result: QubitResource[] = [];
                for (const pid of subgraph) {
                    this.physicalAvailability.set(pid, false);
                    const res: QubitResource = {
                        virtualId: this.nextVirtualId++,
                        physicalId: pid,
                        isAllocated: true,
                        connectivity: this.hardwareTopology[pid] || []
                    };
                    this.activeAllocations.set(res.virtualId, res);
                    result.push(res);
                }
                return result;
            }
        }

        // Fallback: If no connected subgraph is found (fragmentation), 
        // return fragmented qubits but warn (or throw depending on strictness).
        // For this implementation, we fall back to greedy allocation.
        console.warn(`[EnvAwareAllocator] Warning: Could not find contiguous qubit block of size ${count}. Allocating fragmented resources.`);
        
        const fragmented: QubitResource[] = [];
        let gathered = 0;
        for (const pid of availablePids) {
            if (gathered >= count) break;
            this.physicalAvailability.set(pid, false);
            const res: QubitResource = {
                virtualId: this.nextVirtualId++,
                physicalId: pid,
                isAllocated: true,
                connectivity: this.hardwareTopology[pid] || []
            };
            this.activeAllocations.set(res.virtualId, res);
            fragmented.push(res);
            gathered++;
        }
        return fragmented;
    }

    /**
     * Helper to find a connected set of available physical qubits using BFS.
     */
    private findConnectedSubgraph(startNode: string, targetSize: number): string[] {
        const visited = new Set<string>();
        const queue: string[] = [startNode];
        const result: string[] = [];

        visited.add(startNode);

        while (queue.length > 0 && result.length < targetSize) {
            const current = queue.shift()!;
            
            // Only add if currently available
            if (this.physicalAvailability.get(current)) {
                result.push(current);
            } else {
                // If the node itself is occupied, we can't use it, 
                // but we might still traverse through it if the hardware supports routing through used qubits?
                // Usually, we only want to allocate unused ones. 
                // If we can't use it, we stop this branch or skip adding it to result.
                // Here we assume strict allocation: we only pick available ones.
                continue; 
            }

            const neighbors = this.hardwareTopology[current] || [];
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor) && this.physicalAvailability.get(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }

        return result;
    }
}