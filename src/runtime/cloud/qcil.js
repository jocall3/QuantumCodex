/**
 * @file src/runtime/cloud/qcil.js
 * @description The main file for the Quantum Cloud Integration Layer (QCIL).
 * It provides a unified interface for submitting jobs, monitoring status, and
 * retrieving results from various cloud QPU providers.
 */

/**
 * Standardized job status constants used across all providers.
 * @enum {string}
 */
export const JobStatus = Object.freeze({
    CREATING: 'CREATING',
    VALIDATING: 'VALIDATING',
    QUEUED: 'QUEUED',
    RUNNING: 'RUNNING',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
    ERROR: 'ERROR',
    UNKNOWN: 'UNKNOWN'
});

/**
 * Custom error class for QCIL-related issues.
 */
export class QCILError extends Error {
    /**
     * @param {string} message - The error message.
     * @param {object} [details] - Additional details about the error.
     */
    constructor(message, details = {}) {
        super(message);
        this.name = 'QCILError';
        this.details = details;
    }
}

/**
 * @abstract
 * @class BaseProvider
 * @description Abstract base class for all quantum cloud providers.
 * Defines the common interface for interacting with a provider's API.
 */
class BaseProvider {
    /**
     * @param {string} providerName - The name of the provider.
     * @param {string} apiKey - The API key for authentication.
     */
    constructor(providerName, apiKey) {
        if (this.constructor === BaseProvider) {
            throw new TypeError("Abstract class 'BaseProvider' cannot be instantiated directly.");
        }
        this.providerName = providerName;
        this.apiKey = apiKey;
    }

    /**
     * Submits a quantum circuit for execution.
     * @abstract
     * @param {object} circuit - A standardized representation of the quantum circuit.
     * @param {string} backend - The name of the backend device to run the job on.
     * @param {number} shots - The number of times to execute the circuit.
     * @returns {Promise<string>} A promise that resolves with the unique job ID.
     */
    async submitJob(circuit, backend, shots) {
        throw new Error("Method 'submitJob()' must be implemented.");
    }

    /**
     * Retrieves the current status of a job.
     * @abstract
     * @param {string} jobId - The ID of the job to check.
     * @returns {Promise<JobStatus>} A promise that resolves with the job's status.
     */
    async getJobStatus(jobId) {
        throw new Error("Method 'getJobStatus()' must be implemented.");
    }

    /**
     * Retrieves the results of a completed job.
     * @abstract
     * @param {string} jobId - The ID of the job to retrieve results for.
     * @returns {Promise<object>} A promise that resolves with the standardized job results.
     * The result object should include properties like `counts`, `shots`, `backend`, etc.
     */
    async getJobResult(jobId) {
        throw new Error("Method 'getJobResult()' must be implemented.");
    }

    /**
     * Lists the available backends for this provider.
     * @abstract
     * @returns {Promise<Array<object>>} A promise that resolves with a list of backend objects.
     * Each object should contain details like `name`, `qubits`, `status`, etc.
     */
    async listBackends() {
        throw new Error("Method 'listBackends()' must be implemented.");
    }

    /**
     * Cancels a running or queued job.
     * @abstract
     * @param {string} jobId - The ID of the job to cancel.
     * @returns {Promise<boolean>} A promise that resolves to true if cancellation was successful.
     */
    async cancelJob(jobId) {
        throw new Error("Method 'cancelJob()' must be implemented.");
    }
}

/**
 * @class SimulatedProvider
 * @extends BaseProvider
 * @description A simulated provider for local testing and development.
 * It mimics the behavior of a real quantum cloud provider without making network requests.
 */
class SimulatedProvider extends BaseProvider {
    constructor(apiKey) {
        super('simulated', apiKey);
        this.jobs = new Map();
        this.backendList = [
            { name: 'sim_qpu_5', qubits: 5, status: 'online', description: '5-qubit simulated QPU' },
            { name: 'sim_qpu_16', qubits: 16, status: 'online', description: '16-qubit simulated QPU' },
            { name: 'sim_qpu_32', qubits: 32, status: 'maintenance', description: '32-qubit simulated QPU' },
        ];
    }

    /** @override */
    async submitJob(circuit, backend, shots) {
        if (!this.backendList.some(b => b.name === backend && b.status === 'online')) {
            throw new QCILError(`Backend '${backend}' is not available.`, { backend });
        }

        const jobId = `sim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const jobData = {
            id: jobId,
            circuit,
            backend,
            shots,
            status: JobStatus.QUEUED,
            createdAt: Date.now(),
            result: null,
        };
        this.jobs.set(jobId, jobData);

        // Simulate the job lifecycle
        setTimeout(() => {
            if (jobData.status === JobStatus.QUEUED) jobData.status = JobStatus.RUNNING;
            setTimeout(() => {
                if (jobData.status === JobStatus.RUNNING) {
                    jobData.status = JobStatus.COMPLETED;
                    jobData.result = this._generateSimulatedResults(circuit, shots);
                }
            }, 2000 + Math.random() * 3000); // Simulate run time
        }, 1000 + Math.random() * 2000); // Simulate queue time

        return jobId;
    }

    /** @override */
    async getJobStatus(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) {
            throw new QCILError(`Job with ID '${jobId}' not found.`, { jobId });
        }
        return job.status;
    }

    /** @override */
    async getJobResult(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) {
            throw new QCILError(`Job with ID '${jobId}' not found.`, { jobId });
        }
        if (job.status !== JobStatus.COMPLETED) {
            throw new QCILError(`Job '${jobId}' has not completed. Current status: ${job.status}`, { jobId, status: job.status });
        }
        return {
            jobId: job.id,
            status: job.status,
            backend: job.backend,
            shots: job.shots,
            counts: job.result,
            metadata: {
                simulation: true,
                execution_time_ms: 5000,
                created_at: new Date(job.createdAt).toISOString(),
            }
        };
    }

    /** @override */
    async listBackends() {
        return Promise.resolve(this.backendList);
    }

    /** @override */
    async cancelJob(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) {
            throw new QCILError(`Job with ID '${jobId}' not found.`, { jobId });
        }
        if (job.status === JobStatus.QUEUED || job.status === JobStatus.RUNNING) {
            job.status = JobStatus.CANCELLED;
            return true;
        }
        return false;
    }

    /**
     * Generates plausible-looking random results for a given circuit.
     * @private
     * @param {object} circuit - The circuit object.
     * @param {number} shots - The number of shots.
     * @returns {object} A counts dictionary.
     */
    _generateSimulatedResults(circuit, shots) {
        // This is a very naive simulation. A real one would be more complex.
        const numQubits = circuit.qubits || 5; // Assume 5 qubits if not specified
        const counts = {};
        let remainingShots = shots;

        // Generate a few dominant states
        const numStates = Math.min(Math.pow(2, numQubits), 10);
        for (let i = 0; i < numStates - 1 && remainingShots > 0; i++) {
            const state = Math.floor(Math.random() * Math.pow(2, numQubits));
            const bitstring = state.toString(2).padStart(numQubits, '0');
            const count = Math.floor(Math.random() * (remainingShots / 2));
            counts[bitstring] = count;
            remainingShots -= count;
        }

        // Assign remaining shots to one last state
        if (remainingShots > 0) {
            const lastState = Math.floor(Math.random() * Math.pow(2, numQubits));
            const lastBitstring = lastState.toString(2).padStart(numQubits, '0');
            counts[lastBitstring] = (counts[lastBitstring] || 0) + remainingShots;
        }

        return counts;
    }
}


/**
 * @class QCIL
 * @description The Quantum Cloud Integration Layer manager.
 * This class acts as a factory and registry for different cloud provider clients.
 */
class QCIL {
    constructor() {
        /** @private */
        this.providers = new Map();
        this.registerDefaultProviders();
    }

    /**
     * Registers the built-in provider implementations.
     * @private
     */
    registerDefaultProviders() {
        this.registerProvider('simulated', SimulatedProvider);
        // To add a new provider:
        // 1. Create the provider class (e.g., IBMQuantumProvider extends BaseProvider)
        // 2. Register it here: this.registerProvider('ibm', IBMQuantumProvider);
    }

    /**
     * Registers a new provider implementation.
     * @param {string} name - The identifier for the provider (e.g., 'ibm', 'rigetti').
     * @param {typeof BaseProvider} providerClass - The class constructor for the provider.
     */
    registerProvider(name, providerClass) {
        if (!(providerClass.prototype instanceof BaseProvider)) {
            throw new TypeError("Provider class must extend BaseProvider.");
        }
        this.providers.set(name.toLowerCase(), providerClass);
    }

    /**
     * Gets an initialized client for a specific quantum cloud provider.
     * @param {string} providerName - The name of the provider to use.
     * @param {string} apiKey - The API key for authenticating with the provider.
     * @returns {BaseProvider} An instance of the requested provider client.
     * @throws {QCILError} If the provider is not supported or API key is missing.
     */
    getClient(providerName, apiKey) {
        const name = providerName.toLowerCase();
        const ProviderClass = this.providers.get(name);

        if (!ProviderClass) {
            throw new QCILError(`Provider '${providerName}' is not supported.`);
        }
        if (!apiKey && name !== 'simulated') {
            // Simulated provider might not need a key, but others will.
            throw new QCILError(`API key is required for provider '${providerName}'.`);
        }

        return new ProviderClass(apiKey);
    }

    /**
     * Lists the names of all registered providers.
     * @returns {string[]} An array of supported provider names.
     */
    listSupportedProviders() {
        return Array.from(this.providers.keys());
    }
}

/**
 * Singleton instance of the QCIL manager.
 * Use this instance to interact with the QCIL system.
 * @example
 * import { qcil, JobStatus } from './qcil.js';
 *
 * async function run() {
 *   try {
 *     const provider = qcil.getClient('simulated', 'dummy-api-key');
 *     const backends = await provider.listBackends();
 *     console.log('Available backends:', backends);
 *
 *     const myCircuit = { qubits: 2, gates: [{ type: 'h', target: 0 }, { type: 'cx', control: 0, target: 1 }] };
 *     const jobId = await provider.submitJob(myCircuit, 'sim_qpu_5', 1024);
 *     console.log(`Job submitted with ID: ${jobId}`);
 *
 *     // Poll for status
 *     let status = await provider.getJobStatus(jobId);
 *     while (status !== JobStatus.COMPLETED && status !== JobStatus.ERROR && status !== JobStatus.CANCELLED) {
 *       console.log(`Job status: ${status}`);
 *       await new Promise(resolve => setTimeout(resolve, 2000));
 *       status = await provider.getJobStatus(jobId);
 *     }
 *
 *     if (status === JobStatus.COMPLETED) {
 *       const results = await provider.getJobResult(jobId);
 *       console.log('Job results:', results.counts);
 *     } else {
 *       console.error(`Job finished with status: ${status}`);
 *     }
 *   } catch (error) {
 *     console.error('An error occurred:', error.message);
 *   }
 * }
 *
 * // run(); // Example execution
 */
export const qcil = new QCIL();