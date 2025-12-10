// File: tools/vcs/qverge.js
// Purpose: An implementation of 'Q-Verge', the Non-Classical Version Control system.
// It will handle quantum state branching, entangled history tracking, and superposition merging.

/**
 * @license
 * Copyright (c) 2023, The Q-Verge Project Authors.
 * SPDX-License-Identifier: MIT
 */

/**
 * A simple hashing function to generate unique IDs for commits and states.
 * In a real-world scenario, a more robust cryptographic hash like SHA-256 would be used.
 * @param {string} str The string to hash.
 * @returns {string} A simple hash of the string.
 */
const simpleHash = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
};

/**
 * Represents a single possible state within a Q-Commit's superposition.
 * Each state has content and a probability amplitude.
 */
class QState {
    /**
     * @param {any} content The content of this state (e.g., file content as a string).
     * @param {number} probability The probability of this state being the "real" one upon observation.
     */
    constructor(content, probability) {
        if (typeof content !== 'string') {
            // For simplicity, we'll stringify non-string content.
            this.content = JSON.stringify(content, null, 2);
        } else {
            this.content = content;
        }
        this.probability = probability;
        this.id = simpleHash(this.content);
    }
}

/**
 * Represents a Quantum Commit (Q-Commit), which is a superposition of multiple possible states.
 */
class QCommit {
    /**
     * @param {string} message The commit message.
     * @param {string[]} parentIds An array of parent Q-Commit IDs.
     * @param {QState[]} superposition An array of QState objects representing the possible realities of this commit.
     */
    constructor(message, parentIds, superposition) {
        this.message = message;
        this.parentIds = parentIds || [];
        this.timestamp = new Date().toISOString();
        this.superposition = superposition || [];
        this.entangledWith = new Set(); // Set of QCommit IDs this commit is entangled with.

        // Normalize probabilities to ensure they sum to 1.
        this.normalizeSuperposition();

        const contentToHash = this.message + this.parentIds.join('') + this.superposition.map(s => s.id).join('') + this.timestamp;
        this.id = simpleHash(contentToHash);
    }

    /**
     * Ensures the probabilities of all states in the superposition sum to 1.
     */
    normalizeSuperposition() {
        const totalProbability = this.superposition.reduce((sum, state) => sum + state.probability, 0);
        if (totalProbability > 0) {
            this.superposition.forEach(state => {
                state.probability /= totalProbability;
            });
        }
    }

    /**
     * Adds a state to the superposition.
     * @param {QState} state The state to add.
     */
    addState(state) {
        this.superposition.push(state);
        this.normalizeSuperposition();
    }

    /**
     * "Observes" the commit, collapsing its wave function to a single state.
     * This is a non-destructive observation; it returns a state without modifying the commit.
     * @returns {QState | null} A single state chosen based on probability, or null if no states exist.
     */
    observe() {
        if (this.superposition.length === 0) {
            return null;
        }

        const rand = Math.random();
        let cumulativeProbability = 0;

        for (const state of this.superposition) {
            cumulativeProbability += state.probability;
            if (rand <= cumulativeProbability) {
                return state;
            }
        }

        // Fallback in case of floating point inaccuracies
        return this.superposition[this.superposition.length - 1];
    }
}


/**
 * Q-Verge: A Non-Classical Version Control System.
 * Manages a repository of Q-Commits, allowing for quantum-inspired operations
 * like superposition merging and history entanglement.
 */
class QVerge {
    constructor() {
        /** @type {Map<string, QCommit>} */
        this.commits = new Map();
        /** @type {Map<string, string>} */
        this.branches = new Map();
        this.HEAD = null; // Points to the current branch name
    }

    /**
     * Initializes a new Q-Verge repository.
     * @param {any} initialState The initial content for the repository.
     * @returns {string} The ID of the genesis commit.
     */
    init(initialState = "Welcome to Q-Verge!") {
        const genesisState = new QState(initialState, 1.0);
        const genesisCommit = new QCommit("Genesis Commit", [], [genesisState]);

        this.commits.set(genesisCommit.id, genesisCommit);
        this.branches.set("master", genesisCommit.id);
        this.HEAD = "master";

        console.log(`Initialized empty Q-Verge repository. Genesis commit: ${genesisCommit.id}`);
        return genesisCommit.id;
    }

    /**
     * Creates a new Q-Commit on the current branch.
     * @param {string} message The commit message.
     * @param {Array<{content: any, probability: number}>} potentialStates An array of potential states for this commit.
     * @returns {string | null} The ID of the new commit, or null on failure.
     */
    commit(message, potentialStates) {
        if (!this.HEAD || !this.branches.has(this.HEAD)) {
            console.error("Error: HEAD is detached or invalid. Cannot commit.");
            return null;
        }

        if (!potentialStates || potentialStates.length === 0) {
            console.error("Error: A Q-Commit must be created with at least one potential state.");
            return null;
        }

        const parentId = this.branches.get(this.HEAD);
        const superposition = potentialStates.map(ps => new QState(ps.content, ps.probability));

        const newCommit = new QCommit(message, [parentId], superposition);
        this.commits.set(newCommit.id, newCommit);
        this.branches.set(this.HEAD, newCommit.id);

        console.log(`Created new Q-Commit ${newCommit.id} on branch '${this.HEAD}'`);
        return newCommit.id;
    }

    /**
     * Creates a new branch pointing to a specific commit.
     * @param {string} branchName The name of the new branch.
     * @param {string} [startPoint=this.HEAD] The commit ID or branch name to start from.
     */
    branch(branchName, startPoint) {
        if (this.branches.has(branchName)) {
            console.error(`Error: A branch named '${branchName}' already exists.`);
            return;
        }

        let commitId;
        if (!startPoint) {
            commitId = this.branches.get(this.HEAD);
        } else if (this.branches.has(startPoint)) {
            commitId = this.branches.get(startPoint);
        } else if (this.commits.has(startPoint)) {
            commitId = startPoint;
        } else {
            console.error(`Error: Start point '${startPoint}' is not a valid commit or branch.`);
            return;
        }

        this.branches.set(branchName, commitId);
        console.log(`Created new branch '${branchName}' at commit ${commitId}`);
    }

    /**
     * Switches the HEAD to a different branch.
     * @param {string} branchName The name of the branch to switch to.
     */
    checkout(branchName) {
        if (!this.branches.has(branchName)) {
            console.error(`Error: Branch '${branchName}' not found.`);
            return;
        }
        this.HEAD = branchName;
        console.log(`Switched to branch '${branchName}'`);
    }

    /**
     * Merges the state of one branch into another via superposition interference.
     * @param {string} fromBranch The name of the branch to merge from.
     * @param {string} toBranch The name of the branch to merge into (usually the current branch).
     * @returns {string | null} The ID of the new merge commit, or null on failure.
     */
    merge(fromBranch, toBranch = this.HEAD) {
        if (!this.branches.has(fromBranch) || !this.branches.has(toBranch)) {
            console.error("Error: One or both branches do not exist.");
            return null;
        }

        const fromCommitId = this.branches.get(fromBranch);
        const toCommitId = this.branches.get(toBranch);
        const fromCommit = this.commits.get(fromCommitId);
        const toCommit = this.commits.get(toCommitId);

        if (fromCommitId === toCommitId) {
            console.log("Branches are already up-to-date. Nothing to merge.");
            return null;
        }

        // --- Superposition Interference Logic ---
        const newSuperpositionMap = new Map();

        // Add states from the 'to' commit
        for (const state of toCommit.superposition) {
            newSuperpositionMap.set(state.id, {
                content: state.content,
                probability: state.probability
            });
        }

        // Interfere with states from the 'from' commit
        for (const state of fromCommit.superposition) {
            if (newSuperpositionMap.has(state.id)) {
                // Constructive interference: state exists in both, increase probability
                const existing = newSuperpositionMap.get(state.id);
                existing.probability += state.probability;
            } else {
                // No interference: state is new, add it
                newSuperpositionMap.set(state.id, {
                    content: state.content,
                    probability: state.probability
                });
            }
        }
        
        // NOTE: A more advanced implementation would include destructive interference
        // for "conflicting" states. For example, if two states modify the same
        // line of code differently, their probabilities could be reduced or cancelled out.
        // This simplified model only uses constructive interference.

        const mergedStates = Array.from(newSuperpositionMap.values())
            .map(s => new QState(s.content, s.probability));

        if (mergedStates.length === 0) {
            console.error("Merge resulted in a null state (total destructive interference). Aborting.");
            return null;
        }

        const message = `Merge branch '${fromBranch}' into '${toBranch}'`;
        const mergeCommit = new QCommit(message, [toCommitId, fromCommitId], mergedStates);

        this.commits.set(mergeCommit.id, mergeCommit);
        this.branches.set(toBranch, mergeCommit.id);

        console.log(`Merged '${fromBranch}' into '${toBranch}' with new commit ${mergeCommit.id}`);
        return mergeCommit.id;
    }

    /**
     * Entangles the histories of two commits.
     * When one entangled commit is measured (collapsed), it affects the superposition of the other.
     * @param {string} commitId1 First commit ID.
     * @param {string} commitId2 Second commit ID.
     */
    entangle(commitId1, commitId2) {
        const commit1 = this.commits.get(commitId1);
        const commit2 = this.commits.get(commitId2);

        if (!commit1 || !commit2) {
            console.error("Error: One or both commit IDs are invalid.");
            return;
        }

        commit1.entangledWith.add(commitId2);
        commit2.entangledWith.add(commitId1);
        console.log(`Entangled commits ${commitId1} and ${commitId2}.`);
    }

    /**
     * Collapses the wave function of a commit to a single state, permanently.
     * This action also affects any entangled commits.
     * @param {string} commitId The ID of the commit to collapse.
     * @returns {QState | null} The state that the commit collapsed into.
     */
    collapse(commitId) {
        const targetCommit = this.commits.get(commitId);
        if (!targetCommit) {
            console.error(`Error: Commit ${commitId} not found.`);
            return null;
        }

        if (targetCommit.superposition.length <= 1) {
            console.log(`Commit ${commitId} is already in a definite state.`);
            return targetCommit.superposition[0] || null;
        }

        const collapsedState = targetCommit.observe();
        console.log(`Collapsing commit ${commitId} to state ${collapsedState.id}.`);

        // The commit is now in a single, definite state.
        targetCommit.superposition = [new QState(collapsedState.content, 1.0)];

        // --- Spooky Action at a Distance ---
        // Propagate the collapse to entangled commits.
        // This is a simplified model: we remove any "conflicting" states from entangled commits.
        // A real quantum system would have more complex correlations.
        targetCommit.entangledWith.forEach(entangledId => {
            const entangledCommit = this.commits.get(entangledId);
            if (entangledCommit) {
                const originalStateCount = entangledCommit.superposition.length;
                
                // Define a simple conflict: any state that is not identical is a conflict.
                entangledCommit.superposition = entangledCommit.superposition.filter(state => {
                    // This is a placeholder for a real conflict detection algorithm.
                    // Here, we just keep states that are NOT the one we collapsed to,
                    // assuming an anti-correlation for simplicity.
                    return state.id !== collapsedState.id;
                });

                if (entangledCommit.superposition.length < originalStateCount) {
                     console.log(`  -> Entanglement with ${entangledId} caused a state reduction.`);
                     entangledCommit.normalizeSuperposition();
                }
            }
        });

        return collapsedState;
    }

    /**
     * Displays the commit history graph in a simplified format.
     */
    log() {
        if (!this.HEAD || !this.branches.has(this.HEAD)) {
            console.error("No history to show.");
            return;
        }

        let currentId = this.branches.get(this.HEAD);
        const visited = new Set();

        const printCommit = (id, indent = "") => {
            if (!id || visited.has(id)) return;
            visited.add(id);

            const commit = this.commits.get(id);
            if (!commit) return;

            const headMarker = this.branches.get(this.HEAD) === id ? ` (HEAD -> ${this.HEAD})` : "";
            const branchMarkers = Array.from(this.branches.entries())
                .filter(([_, commitId]) => commitId === id && this.branches.get(this.HEAD) !== id)
                .map(([name, _]) => ` (${name})`)
                .join('');

            console.log(`${indent}* commit ${commit.id}${headMarker}${branchMarkers}`);
            if (commit.parentIds.length > 1) {
                console.log(`${indent}| Merge: ${commit.parentIds.map(p => p.substring(0, 5)).join(' ')}`);
            }
            console.log(`${indent}| Date:  ${commit.timestamp}`);
            console.log(`${indent}| States: ${commit.superposition.length} possible realities`);
            if (commit.entangledWith.size > 0) {
                console.log(`${indent}| Entangled: {${Array.from(commit.entangledWith).map(e => e.substring(0,5)).join(', ')}}`);
            }
            console.log(`${indent}|`);
            console.log(`${indent}|   ${commit.message}`);
            console.log(`${indent}|`);

            if (commit.parentIds.length > 0) {
                commit.parentIds.forEach(parentId => printCommit(parentId, indent));
            }
        };

        printCommit(currentId);
    }

    /**
     * Shows the details of a specific commit's superposition.
     * @param {string} [commitId=this.HEAD] The commit ID or branch name to inspect.
     */
    status(commitId) {
        let id = commitId;
        if (!id) {
            id = this.branches.get(this.HEAD);
        } else if (this.branches.has(id)) {
            id = this.branches.get(id);
        }

        const commit = this.commits.get(id);
        if (!commit) {
            console.error(`Error: Commit '${commitId}' not found.`);
            return;
        }

        console.log(`Status for commit ${commit.id} ('${commit.message}')`);
        console.log("-------------------------------------------------");
        console.log(`This commit exists in a superposition of ${commit.superposition.length} state(s):`);
        commit.superposition.forEach(state => {
            console.log(`\n  State ID: ${state.id}`);
            console.log(`  Probability: ${(state.probability * 100).toFixed(2)}%`);
            console.log("  Content:");
            console.log("  --------");
            state.content.split('\n').forEach(line => console.log(`    | ${line}`));
        });
        console.log("-------------------------------------------------");
    }
}

// To make this file usable in Node.js environments for tooling
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = QVerge;
}