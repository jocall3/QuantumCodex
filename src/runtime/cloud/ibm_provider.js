/**
 * @file An QCIL provider implementation for IBM Quantum.
 * @description This module provides a class to interact with the IBM Quantum API,
 * allowing users to list backends, run quantum circuits, and retrieve results.
 * It abstracts the complexities of authentication and job management.
 */

const API_BASE_URL = 'https://api.quantum-computing.ibm.com/api';
const AUTH_URL = 'https://auth.quantum-computing.ibm.com/api/users/loginWithToken';

/**
 * Represents a job submitted to the IBM Quantum service.
 * Provides methods to check status and retrieve results through polling.
 */
class IBMJob {
    /**
     * @param {string} jobId - The unique identifier for the job.
     * @param {IBMProvider} provider - The provider instance used to create this job.
     */
    constructor(jobId, provider) {
        if (!jobId || !provider) {
            throw new Error("Job ID and provider instance are required.");
        }
        this.jobId = jobId;
        this.provider = provider;
        this.status = 'INITIALIZING';
        this._data = null;
    }

    /**
     * Fetches the latest job data from the API and updates the internal state.
     * @returns {Promise<string>} The current status of the job.
     */
    async refresh() {
        this._data = await this.provider.getJob(this.jobId);
        this.status = this._data?.status || 'UNKNOWN';
        return this.status;
    }

    /**
     * Gets the current status of the job, fetching it if not already known.
     * @returns {Promise<string>} The job status (e.g., 'QUEUED', 'RUNNING', 'DONE').
     */
    async getStatus() {
        // Only refresh if we don't have data, or if the status is not terminal.
        const terminalStates = ['DONE', 'ERROR', 'CANCELLED'];
        if (!this._data || !terminalStates.includes(this.status)) {
            await this.refresh();
        }
        return this.status;
    }

    /**
     * Waits for the job to complete and retrieves the result.
     * This method polls the job status until it reaches a terminal state.
     * @param {number} [timeout=300] - Timeout in seconds.
     * @param {number} [wait=5] - Wait time in seconds between polls.
     * @returns {Promise<object>} The job result data.
     */
    async getResult(timeout = 300, wait = 5) {
        const startTime = Date.now();
        while ((Date.now() - startTime) < timeout * 1000) {
            const status = await this.getStatus();
            if (status === 'DONE') {
                // The getJob response often contains the result directly when done.
                return this._data.result;
            } else if (status === 'ERROR' || status === 'CANCELLED') {
                const errorMessage = this._data?.error?.message || `Job ${this.jobId} failed with status: ${status}`;
                throw new Error(errorMessage);
            }
            // Wait for 'wait' seconds before polling again
            await new Promise(resolve => setTimeout(resolve, wait * 1000));
        }
        throw new Error(`Timeout waiting for job ${this.jobId} to complete.`);
    }
}


/**
 * A provider for interacting with IBM Quantum services.
 * Handles authentication, backend management, and job execution.
 */
export class IBMProvider {
    /**
     * @param {string} apiToken - The API token from the IBM Quantum account page.
     */
    constructor(apiToken) {
        if (!apiToken) {
            throw new Error('IBM Quantum API token is required.');
        }
        this.apiToken = apiToken;
        this.accessToken = null;
    }

    /**
     * Authenticates with the IBM Quantum API to get a temporary access token.
     * This token is required for all subsequent API calls.
     * @returns {Promise<void>}
     */
    async authenticate() {
        try {
            const response = await fetch(AUTH_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiToken: this.apiToken }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Authentication failed' }));
                throw new Error(`Authentication failed: ${response.status} ${response.statusText} - ${errorData.message || 'Unknown error'}`);
            }

            const data = await response.json();
            this.accessToken = data.id;
        } catch (error) {
            console.error('Error during IBM Quantum authentication:', error);
            this.accessToken = null;
            throw error;
        }
    }

    /**
     * Ensures the provider is authenticated before making an API call.
     * @private
     */
    async _ensureAuthenticated() {
        if (!this.accessToken) {
            await this.authenticate();
        }
    }

    /**
     * A helper method for making authenticated API requests to the IBM Quantum API.
     * @private
     * @param {string} endpoint - The API endpoint path (e.g., '/Backends').
     * @param {object} [options={}] - The options for the fetch call (method, body, etc.).
     * @returns {Promise<object>} The JSON response from the API.
     */
    async _apiRequest(endpoint, options = {}) {
        await this._ensureAuthenticated();

        const url = `${API_BASE_URL}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            'X-Access-Token': this.accessToken,
            ...options.headers,
        };

        const response = await fetch(url, { ...options, headers });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API request to ${endpoint} failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        return response.status === 204 ? null : response.json();
    }

    /**
     * Lists available backends (quantum devices and simulators).
     * @returns {Promise<Array<object>>} A list of backend objects, filtered for operational systems.
     */
    async listBackends() {
        // Note: A more advanced implementation would need to specify hub/group/project.
        // This uses a common public endpoint.
        const backends = await this._apiRequest('/Backends');
        return backends
            .filter(b => b.status === 'active')
            .map(b => ({
                name: b.backend_name,
                version: b.backend_version,
                qubits: b.n_qubits,
                simulator: b.simulator,
                status: b.status,
                description: `Qubits: ${b.n_qubits}, Version: ${b.backend_version}, Simulator: ${b.simulator}`,
            }));
    }

    /**
     * Runs a quantum circuit on a specified backend.
     * @param {string} qasm - The quantum circuit in OpenQASM 2.0 format.
     * @param {string} backendName - The name of the backend to run on.
     * @param {number} shots - The number of times to run the circuit.
     * @param {object} [options={}] - Additional options for the job (e.g., hub, group, project).
     * @returns {Promise<IBMJob>} An IBMJob instance to track the execution.
     */
    async run(qasm, backendName, shots, options = {}) {
        // The IBM API for running jobs is complex and often involves websockets.
        // This is a simplified REST-based polling approach.
        // The endpoint is also likely namespaced by hub/group/project.
        // We assume a simplified payload structure.
        const payload = {
            backend: { name: backendName },
            qasm: qasm,
            shots: shots,
            ...options,
        };

        // This uses a hypothetical simplified job submission endpoint.
        // The real API might require a pre-formatted Qobj.
        const jobData = await this._apiRequest('/Jobs', {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        if (!jobData || !jobData.id) {
            throw new Error('Failed to submit job: Invalid response from API.');
        }

        return new IBMJob(jobData.id, this);
    }

    /**
     * Retrieves the details of a specific job by its ID.
     * @param {string} jobId - The ID of the job to retrieve.
     * @returns {Promise<object>} The job data object from the API.
     */
    async getJob(jobId) {
        return this._apiRequest(`/Jobs/${jobId}`);
    }
}