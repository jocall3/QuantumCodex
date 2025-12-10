/**
 * @file tools/build/tebs.js
 * @description The core engine for the Time-Entangled Build System (TEBS).
 * TEBS is a conceptual build system designed for projects with complex,
 * probabilistic, or evolving dependencies, simulated here as "quantum states".
 * It manages both classical (deterministic) and quantum (probabilistic)
 * dependencies, features a quantum-aware cache, and can trigger rebuilds

 * based on shifts in quantum probability, simulating decoherence.
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

/**
 * Represents a quantum dependency in a superposition of states.
 * Each state is a potential source file with an associated probability amplitude.
 * The sum of the squares of amplitudes (which represents probability) for a given
 * target should always be normalized to 1.
 */
class QuantumSuperposition {
    /**
     * @param {Array<{source: string, amplitude: number}>} states
     */
    constructor(states) {
        if (!Array.isArray(states) || states.length === 0) {
            throw new Error('QuantumSuperposition must be initialized with at least one state.');
        }
        this.states = JSON.parse(JSON.stringify(states)); // Deep copy
        this.normalizeAmplitudes();
    }

    /**
     * Ensures the total probability (sum of squared amplitudes) is 1.
     * This is essential for a valid quantum state representation.
     */
    normalizeAmplitudes() {
        const totalProbability = this.states.reduce((sum, state) => sum + state.amplitude ** 2, 0);
        if (totalProbability === 0) {
            // If all amplitudes are zero, distribute probability equally.
            const equalAmplitude = Math.sqrt(1 / this.states.length);
            this.states.forEach(state => {
                state.amplitude = equalAmplitude;
            });
            return;
        }
        const normalizationFactor = Math.sqrt(totalProbability);
        this.states.forEach(state => {
            state.amplitude /= normalizationFactor;
        });
    }

    /**
     * "Measures" the superposition, collapsing it into a single classical state (a source file).
     * The outcome is probabilistic, based on the amplitudes of the states.
     * @returns {string} The resolved source file path.
     */
    measure() {
        let random = Math.random();
        let cumulativeProbability = 0;

        for (const state of this.states) {
            const probability = state.amplitude ** 2;
            cumulativeProbability += probability;
            if (random < cumulativeProbability) {
                return state.source;
            }
        }
        // Fallback to the last state due to potential floating-point inaccuracies.
        return this.states[this.states.length - 1].source;
    }

    /**
     * Simulates quantum decoherence by slightly perturbing the amplitudes of each state.
     * This can cause the system's dependencies to evolve over time.
     * @param {number} perturbationFactor - A small number (e.g., 0.01) to control the rate of change.
     */
    perturb(perturbationFactor = 0.01) {
        this.states.forEach(state => {
            const change = (Math.random() - 0.5) * perturbationFactor;
            state.amplitude += change;
            // Clamp amplitude to prevent it from becoming negative before squaring.
            state.amplitude = Math.max(0, state.amplitude);
        });
        this.normalizeAmplitudes();
    }

    /**
     * Creates a stable signature of the current quantum state.
     * @returns {string} A JSON string representing the sorted states.
     */
    getSignature() {
        // Sort states by source path to ensure a consistent signature
        const sortedStates = [...this.states].sort((a, b) => a.source.localeCompare(b.source));
        return JSON.stringify(sortedStates);
    }
}


/**
 * Time-Entangled Build System (TEBS)
 * The core class that orchestrates the build process, managing dependencies,
 * state measurement, and caching.
 */
class TEBS {
    /**
     * @param {object} options
     * @param {function(string, string[]): Promise<any>} options.buildFunction - The async function to execute a build. It receives the target path and an array of resolved dependency paths.
     * @param {string} [options.cachePath='.tebs_cache.json'] - The path to the cache file.
     */
    constructor({ buildFunction, cachePath = '.tebs_cache.json' }) {
        if (!buildFunction || typeof buildFunction !== 'function') {
            throw new Error('A `buildFunction(target, dependencies)` must be provided to TEBS.');
        }
        this.buildFunction = buildFunction;

        this.classicalGraph = new Map(); // Map<target, Set<source>>
        this.quantumGraph = new Map();   // Map<target, QuantumSuperposition>
        this.quantumCache = new Map();   // Map<cacheKey, { result: any, hash: string }>
        this.fileHashMap = new Map();    // Map<filePath, hash> (memoization for a single run)
        this.cachePath = cachePath;
        this.log('Engine Initialized. Awaiting temporal entanglement...');
    }

    log(message) {
        console.log(`[TEBS] ${new Date().toISOString()}: ${message}`);
    }

    /**
     * Defines a classical, deterministic dependency.
     * @param {string} target - The file being built.
     * @param {string} source - The file it depends on.
     */
    addClassicalDependency(target, source) {
        if (!this.classicalGraph.has(target)) {
            this.classicalGraph.set(target, new Set());
        }
        this.classicalGraph.get(target).add(source);
    }

    /**
     * Defines a quantum dependency, where the target depends on a superposition of sources.
     * @param {string} target - The file being built.
     * @param {Array<{source: string, amplitude: number}>} potentialSources - An array of potential sources and their probability amplitudes.
     */
    addQuantumDependency(target, potentialSources) {
        if (this.quantumGraph.has(target)) {
            this.log(`Warning: Overwriting quantum dependency for ${target}.`);
        }
        const superposition = new QuantumSuperposition(potentialSources);
        this.quantumGraph.set(target, superposition);
    }

    /**
     * Computes the SHA-256 hash of a file's content. Caches result in memory for the current run.
     * @param {string} filePath
     * @returns {Promise<string|null>} The hex digest of the hash, or null if the file doesn't exist.
     */
    async _getFileHash(filePath) {
        if (this.fileHashMap.has(filePath)) {
            return this.fileHashMap.get(filePath);
        }
        try {
            const content = await fs.readFile(filePath);
            const hash = crypto.createHash('sha256').update(content).digest('hex');
            this.fileHashMap.set(filePath, hash);
            return hash;
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.fileHashMap.set(filePath, null);
                return null; // File doesn't exist, which is valid for a target.
            }
            throw error;
        }
    }

    /**
     * Generates a unique cache key for a build configuration.
     * The key is a hash of the target name, the hashes of all its resolved dependencies,
     * and the signature of its quantum state (if any).
     * @param {string} target
     * @param {Map<string, string>} dependencyHashes - Map of dependency file paths to their content hashes.
     * @param {string} quantumStateSignature - A signature of the uncollapsed quantum state.
     * @returns {string} The cache key.
     */
    _getCacheKey(target, dependencyHashes, quantumStateSignature) {
        const hasher = crypto.createHash('sha256');
        hasher.update(target);
        hasher.update(quantumStateSignature); // Makes the cache "quantum-aware"

        const sortedDeps = Array.from(dependencyHashes.keys()).sort();
        for (const dep of sortedDeps) {
            hasher.update(dep);
            hasher.update(dependencyHashes.get(dep));
        }
        return hasher.digest('hex');
    }

    /**
     * The main build orchestrator for a given target.
     * @param {string} target - The path of the file to build.
     * @returns {Promise<any>} The result of the build (e.g., file path, content).
     */
    async build(target) {
        this.log(`Initiating build for target: ${target}`);
        this.fileHashMap.clear(); // Reset memoized hashes for this build run.

        // 1. Resolve all dependencies, collapsing quantum states for this specific timeline.
        const classicalDeps = this.classicalGraph.get(target) || new Set();
        const resolvedDependencies = new Set(classicalDeps);

        let quantumStateSignature = 'classical';
        if (this.quantumGraph.has(target)) {
            const superposition = this.quantumGraph.get(target);
            const measuredSource = superposition.measure();
            this.log(`Quantum state for ${target} collapsed to -> ${measuredSource}`);
            resolvedDependencies.add(measuredSource);
            quantumStateSignature = superposition.getSignature();
        }

        // 2. Get hashes of all resolved dependencies.
        const dependencyHashes = new Map();
        for (const dep of resolvedDependencies) {
            const hash = await this._getFileHash(dep);
            if (hash) {
                dependencyHashes.set(dep, hash);
            } else {
                this.log(`Dependency ${dep} for ${target} not found. Forcing rebuild.`);
                return this._executeBuild(target, resolvedDependencies, null);
            }
        }

        // 3. Generate cache key and check quantum-aware cache.
        const cacheKey = this._getCacheKey(target, dependencyHashes, quantumStateSignature);
        const cachedEntry = this.quantumCache.get(cacheKey);

        if (cachedEntry) {
            const currentTargetHash = await this._getFileHash(target);
            if (currentTargetHash && currentTargetHash === cachedEntry.hash) {
                this.log(`Cache hit for ${target}. Build is up-to-date in this timeline.`);
                return cachedEntry.result;
            }
        }

        this.log(`Cache miss or stale target for ${target}. Rebuilding...`);
        return this._executeBuild(target, resolvedDependencies, cacheKey);
    }

    /**
     * Executes the user-provided build function and caches the result.
     * @private
     */
    async _executeBuild(target, dependencies, cacheKey) {
        const depsArray = Array.from(dependencies);
        this.log(`Executing build function for ${target} with dependencies: [${depsArray.join(', ')}]`);

        const buildResult = await this.buildFunction(target, depsArray);

        // After build, hash the output target to store in cache.
        const newTargetHash = await this._getFileHash(target);

        if (cacheKey && newTargetHash) {
            this.quantumCache.set(cacheKey, {
                result: buildResult,
                hash: newTargetHash,
            });
            this.log(`Stored result for ${target} in quantum-aware cache.`);
        } else if (!newTargetHash) {
            this.log(`Warning: Target ${target} was not created by the build function. Cannot cache result.`);
        }

        return buildResult;
    }

    /**
     * Simulates universal quantum decoherence, perturbing all quantum states in the system.
     * This can trigger rebuilds on subsequent calls to `build()` even if no files have changed,
     * as the collapsed state of a dependency might change or the state signature itself will change.
     * @param {number} [perturbationFactor=0.01] - The degree of perturbation.
     */
    simulateQuantumDecoherence(perturbationFactor = 0.01) {
        this.log(`Simulating universal quantum decoherence (factor: ${perturbationFactor})...`);
        let statesShifted = 0;
        for (const superposition of this.quantumGraph.values()) {
            superposition.perturb(perturbationFactor);
            statesShifted++;
        }
        if (statesShifted > 0) {
            this.log(`Quantum states have shifted for ${statesShifted} targets. The future is uncertain.`);
        }
    }

    /**
     * Loads the cache from disk.
     */
    async loadCache() {
        try {
            const data = await fs.readFile(this.cachePath, 'utf8');
            const parsed = JSON.parse(data);
            this.quantumCache = new Map(parsed.quantumCache);
            this.log(`Quantum-aware cache loaded from ${this.cachePath} with ${this.quantumCache.size} entries.`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.log('No cache file found. Starting with a fresh cache.');
            } else {
                this.log(`Error loading cache from ${this.cachePath}: ${error.message}`);
            }
            this.quantumCache = new Map();
        }
    }

    /**
     * Saves the cache to disk.
     */
    async saveCache() {
        try {
            await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
            const data = JSON.stringify({
                quantumCache: Array.from(this.quantumCache.entries()),
            }, null, 2);
            await fs.writeFile(this.cachePath, data, 'utf8');
            this.log(`Quantum-aware cache saved to ${this.cachePath}`);
        } catch (error) {
            this.log(`Error saving cache to ${this.cachePath}: ${error.message}`);
        }
    }
}

module.exports = { TEBS, QuantumSuperposition };