import { performance } from 'perf_hooks';

/**
 * Represents a generic quantum gate within the .u language intermediate representation.
 */
export interface QuantumGate {
    name: string;
    qubits: number[];
    params?: number[];
    matrix?: number[][]; // Optional unitary matrix representation
}

/**
 * Represents a quantum circuit structure to be profiled.
 */
export interface QuantumCircuit {
    id: string;
    qubits: number;
    gates: QuantumGate[];
}

/**
 * Static metrics derived from circuit analysis.
 */
export interface CircuitMetrics {
    totalGates: number;
    qubitCount: number;
    circuitDepth: number;
    multiQubitGateCount: number;
    cliffordGateCount: number;
    nonCliffordGateCount: number;
    estimatedCoherenceTimeRequirementNs: number;
    connectivityGraph: Map<number, number[]>;
}

/**
 * Dynamic timing metrics for execution phases.
 */
export interface ExecutionTimings {
    transpilationTimeMs: number;
    optimizationTimeMs: number;
    quantumExecutionTimeMs: number;
    classicalPostProcessingTimeMs: number;
    hybridRoundTripLatencyMs: number;
    totalWallClockTimeMs: number;
}

/**
 * Snapshot of system resources during profiling.
 */
interface ResourceSnapshot {
    timestamp: number;
    label: string;
    memoryUsageBytes: number;
    cpuUsageUser?: number;
    cpuUsageSystem?: number;
}

/**
 * QuantumProfiler
 * 
 * A specialized profiling tool for the .u language runtime.
 * Measures circuit complexity, classical compilation overhead, and hybrid execution latencies.
 */
export class QuantumProfiler {
    private timers: Map<string, number> = new Map();
    private timings: ExecutionTimings = {
        transpilationTimeMs: 0,
        optimizationTimeMs: 0,
        quantumExecutionTimeMs: 0,
        classicalPostProcessingTimeMs: 0,
        hybridRoundTripLatencyMs: 0,
        totalWallClockTimeMs: 0
    };
    private circuitMetrics: CircuitMetrics | null = null;
    private snapshots: ResourceSnapshot[] = [];
    private readonly sessionId: string;

    constructor(sessionId?: string) {
        this.sessionId = sessionId || `qp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }

    /**
     * Begins tracking a specific execution phase.
     * @param phase The name of the phase (e.g., 'transpilation', 'quantum_exec').
     */
    public startPhase(phase: string): void {
        this.takeSnapshot(`Start: ${phase}`);
        this.timers.set(phase, performance.now());
    }

    /**
     * Stops tracking a phase and records the duration.
     * @param phase The name of the phase to stop.
     * @returns The duration in milliseconds.
     */
    public stopPhase(phase: string): number {
        const startTime = this.timers.get(phase);
        if (startTime === undefined) {
            console.warn(`[QuantumProfiler] Warning: Phase '${phase}' was stopped without starting.`);
            return 0;
        }

        const endTime = performance.now();
        const duration = endTime - startTime;
        this.timers.delete(phase);
        this.takeSnapshot(`End: ${phase}`);

        this.accumulateTiming(phase, duration);
        return duration;
    }

    /**
     * Analyzes the structure of a quantum circuit to generate static metrics.
     * Calculates depth, gate counts, and estimates resource requirements.
     * @param circuit The circuit object to analyze.
     */
    public analyzeCircuit(circuit: QuantumCircuit): CircuitMetrics {
        const gates = circuit.gates;
        const qubitDepths = new Array(circuit.qubits).fill(0);
        const connectivity = new Map<number, number[]>();

        let multiQubitGates = 0;
        let cliffordGates = 0;
        let nonCliffordGates = 0;

        // Initialize connectivity map
        for (let i = 0; i < circuit.qubits; i++) {
            connectivity.set(i, []);
        }

        for (const gate of gates) {
            // 1. Gate Classification
            const gateName = gate.name.toLowerCase();
            const isMultiQubit = gate.qubits.length > 1;

            if (isMultiQubit) {
                multiQubitGates++;
                // Update connectivity graph
                const q1 = gate.qubits[0];
                const q2 = gate.qubits[1]; // Assuming 2-qubit interactions primarily
                if (q2 !== undefined) {
                    if (!connectivity.get(q1)?.includes(q2)) connectivity.get(q1)?.push(q2);
                    if (!connectivity.get(q2)?.includes(q1)) connectivity.get(q2)?.push(q1);
                }
            }

            // Heuristic for Clifford vs Non-Clifford (T, Toffoli, etc.)
            if (['t', 'tdg', 'ccx', 'rx', 'ry', 'rz', 'u1', 'u2', 'u3'].some(n => gateName.startsWith(n))) {
                nonCliffordGates++;
            } else {
                cliffordGates++;
            }

            // 2. Depth Calculation (DAG path tracking)
            let maxPredecessorDepth = 0;
            for (const q of gate.qubits) {
                if (qubitDepths[q] > maxPredecessorDepth) {
                    maxPredecessorDepth = qubitDepths[q];
                }
            }
            
            const newDepth = maxPredecessorDepth + 1;
            for (const q of gate.qubits) {
                qubitDepths[q] = newDepth;
            }
        }

        const depth = Math.max(...qubitDepths, 0);

        // Heuristic: 1 depth unit approx 100ns (varies wildly by hardware, used for relative comparison)
        const estimatedCoherence = depth * 100; 

        this.circuitMetrics = {
            totalGates: gates.length,
            qubitCount: circuit.qubits,
            circuitDepth: depth,
            multiQubitGateCount: multiQubitGates,
            cliffordGateCount: cliffordGates,
            nonCliffordGateCount: nonCliffordGates,
            estimatedCoherenceTimeRequirementNs: estimatedCoherence,
            connectivityGraph: connectivity
        };

        return this.circuitMetrics;
    }

    /**
     * Records the latency of a hybrid loop iteration (Classical -> Quantum -> Classical).
     * @param latencyMs The round trip time in milliseconds.
     */
    public logHybridLatency(latencyMs: number): void {
        this.timings.hybridRoundTripLatencyMs += latencyMs;
    }

    /**
     * Returns the collected metrics and timings.
     */
    public getReport(): object {
        return {
            sessionId: this.sessionId,
            generatedAt: new Date().toISOString(),
            metrics: this.circuitMetrics,
            timings: this.timings,
            resourceSnapshots: this.snapshots
        };
    }

    /**
     * Resets all profiler data for a new run.
     */
    public reset(): void {
        this.timers.clear();
        this.snapshots = [];
        this.circuitMetrics = null;
        this.timings = {
            transpilationTimeMs: 0,
            optimizationTimeMs: 0,
            quantumExecutionTimeMs: 0,
            classicalPostProcessingTimeMs: 0,
            hybridRoundTripLatencyMs: 0,
            totalWallClockTimeMs: 0
        };
    }

    private accumulateTiming(phase: string, duration: number): void {
        // Normalize phase names to metric fields
        const p = phase.toLowerCase();
        if (p.includes('transpil') || p.includes('compil')) {
            this.timings.transpilationTimeMs += duration;
        } else if (p.includes('optimiz')) {
            this.timings.optimizationTimeMs += duration;
        } else if (p.includes('quantum') || p.includes('qpu')) {
            this.timings.quantumExecutionTimeMs += duration;
        } else if (p.includes('post') || p.includes('process')) {
            this.timings.classicalPostProcessingTimeMs += duration;
        } else if (p.includes('total')) {
            this.timings.totalWallClockTimeMs = duration;
        }
    }

    private takeSnapshot(label: string): void {
        const mem = process.memoryUsage();
        this.snapshots.push({
            timestamp: performance.now(),
            label,
            memoryUsageBytes: mem.heapUsed
        });
    }
}