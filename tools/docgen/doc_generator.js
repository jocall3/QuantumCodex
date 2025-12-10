/**
 * @file Non-Deterministic Documentation Generator (NDDG)
 * @description The main engine for generating adaptive and probabilistic documentation.
 * This tool leverages principles of quantum superposition and entanglement to create
 * documentation that is unique with every generation, adapting its tone, technical depth,
 * and examples based on a probabilistic model.
 *
 * By treating each documentation section as a quantum state, we can exist in a
 * superposition of multiple potential phrasings. The act of generation is equivalent
 * to a "measurement," collapsing the waveform into a single, coherent reality.
 * Entanglement between sections ensures that this collapsed reality is internally consistent.
 */

const fs = require('fs');
const path = require('path');

/**
 * Represents a quantum state, a superposition of multiple possible string values.
 */
class QuantumState {
    /**
     * @param {Array<Object>} possibilities An array of possible outcomes.
     * Each object should have a 'value' (string) and a 'weight' (number).
     */
    constructor(possibilities) {
        this.possibilities = possibilities;
        this.entangledStates = [];
        this.normalizeWeights();
        this.collapsedState = null;
    }

    /**
     * Normalizes the weights of all possibilities to ensure they sum to 1.
     * This is crucial for accurate probabilistic measurement.
     */
    normalizeWeights() {
        const totalWeight = this.possibilities.reduce((sum, p) => sum + p.weight, 0);
        if (totalWeight === 0) {
            // If all weights are zero, distribute them equally to prevent division by zero.
            const equalWeight = 1 / this.possibilities.length;
            this.possibilities.forEach(p => p.weight = equalWeight);
        } else {
            this.possibilities.forEach(p => p.weight /= totalWeight);
        }
    }

    /**
     * "Measures" the quantum state, collapsing its superposition into a single definite value.
     * Once measured, the state cannot be measured again.
     * @returns {string} The collapsed string value.
     */
    measure() {
        if (this.collapsedState !== null) {
            return this.collapsedState.value;
        }

        const rand = Math.random();
        let cumulativeWeight = 0;

        for (const possibility of this.possibilities) {
            cumulativeWeight += possibility.weight;
            if (rand < cumulativeWeight) {
                this.collapsedState = possibility;
                break;
            }
        }
        
        // If floating point errors prevent a selection, default to the last one.
        if (this.collapsedState === null) {
            this.collapsedState = this.possibilities[this.possibilities.length - 1];
        }

        // Trigger entanglement effects
        this.propagateEntanglement();

        return this.collapsedState.value;
    }

    /**
     * Entangles this state with another. When this state is measured, it will
     * influence the probabilities of the other state.
     * @param {QuantumState} otherState The state to entangle with.
     * @param {Function} influenceFunction A function that takes the collapsed outcome of this
     * state and modifies the possibilities of the other state.
     */
    entangle(otherState, influenceFunction) {
        this.entangledStates.push({ target: otherState, influence: influenceFunction });
    }

    /**
     * Propagates the effects of this state's collapse to all entangled states.
     * @private
     */
    propagateEntanglement() {
        if (!this.collapsedState) return;

        for (const entanglement of this.entangledStates) {
            entanglement.target.applyInfluence(
                (possibilities) => entanglement.influence(this.collapsedState, possibilities)
            );
        }
    }

    /**
     * Applies an influence function to its possibilities and renormalizes.
     * This is called by an entangled partner state after it has collapsed.
     * @param {Function} updaterFunction The function to apply to the possibilities array.
     */
    applyInfluence(updaterFunction) {
        // Can only influence a state that hasn't collapsed yet.
        if (this.collapsedState !== null) return;

        this.possibilities = updaterFunction(this.possibilities);
        this.normalizeWeights();
    }
}

/**
 * The main engine for orchestrating the non-deterministic documentation generation.
 */
class DocGenerator {
    constructor(config) {
        this.config = config;
        this.quantumDoc = {};
        this.generationOrder = [];
    }

    /**
     * Initializes the quantum documentation states from the configuration.
     */
    initializeStates() {
        console.log("Initializing quantum superposition of documentation...");
        for (const key in this.config.states) {
            // Deep copy possibilities to avoid mutation across runs
            const possibilities = JSON.parse(JSON.stringify(this.config.states[key]));
            this.quantumDoc[key] = new QuantumState(possibilities);
            this.generationOrder.push(key);
        }
    }

    /**
     * Sets up the entanglement between documentation states as defined in the config.
     */
    setupEntanglement() {
        console.log("Weaving the fabric of reality (setting up entanglements)...");
        if (!this.config.entanglements) return;

        for (const entanglement of this.config.entanglements) {
            const sourceState = this.quantumDoc[entanglement.source];
            const targetState = this.quantumDoc[entanglement.target];
            const influence = this.config.influences[entanglement.influence];

            if (sourceState && targetState && influence) {
                sourceState.entangle(targetState, influence);
            } else {
                console.warn(`Could not create entanglement: ${entanglement.source} -> ${entanglement.target}`);
            }
        }
    }

    /**
     * Generates the documentation by measuring all quantum states in order.
     * @returns {string} The fully generated, coherent documentation.
     */
    generate() {
        this.initializeStates();
        this.setupEntanglement();

        console.log("Collapsing the documentation waveform...");
        const finalDocParts = [];

        for (const key of this.generationOrder) {
            const sectionHeader = `\n## ${key.replace(/_/g, ' ')}\n\n`;
            const collapsedValue = this.quantumDoc[key].measure();
            finalDocParts.push(sectionHeader + collapsedValue);
        }

        const finalDoc = `# Project Documentation (Probabilistic Generation #${Math.floor(Date.now() * Math.random())})\n` +
                         finalDocParts.join('\n');
        
        console.log("A single reality has been chosen. Documentation generated.");
        return finalDoc;
    }
}

// --- Configuration for the Documentation Universe ---

const DOC_UNIVERSE_CONFIG = {
    states: {
        Introduction: [
            { value: "This project is a cutting-edge terminal renderer designed for web platforms, offering unparalleled performance and compatibility.", weight: 1, tags: ['formal', 'technical'] },
            { value: "Welcome to the raddest terminal for your browser! It's like the Linux terminal, but, you know, better and on GitHub Pages.", weight: 1, tags: ['informal', 'enthusiastic'] },
            { value: "An experimental implementation of a VT100-compatible terminal emulator, focusing on modern web standards and performance optimization.", weight: 0.5, tags: ['formal', 'very_technical'] },
            { value: "So, you want a terminal on a webpage. We did that. It's pretty neat.", weight: 0.2, tags: ['informal', 'sarcastic'] }
        ],
        Core_API_Overview: [
            { value: "The core API exposes a `Terminal` class which accepts an options object for configuration. Key methods include `write()`, `clear()`, and `onData()` for handling user input.", weight: 1, tags: ['technical'] },
            { value: "Basically, you make a new `Terminal`, throw some text at it with `.write()`, and listen for keyboard mashing with `.onData()`. Easy peasy.", weight: 1, tags: ['informal'] },
            { value: "The primary interface is the `Terminal` constructor, which returns a singleton instance bound to a DOM element. The API surface is intentionally minimal to reduce complexity, providing `write(data: string)` for output and an event emitter for input.", weight: 0.8, tags: ['very_technical'] }
        ],
        Performance_Considerations: [
            { value: "Performance is critical. The rendering engine uses a canvas-based approach with batch-drawing to minimize reflows and ensure a smooth experience, even with high-frequency output.", weight: 1, tags: ['technical'] },
            { value: "We made it go fast. It uses some fancy canvas tricks so your browser doesn't cry when you `cat` a giant file.", weight: 1, tags: ['informal'] },
            { value: "The rendering pipeline is optimized for low-latency character throughput. It leverages offscreen canvases and glyph caching to achieve rendering speeds comparable to native applications. We recommend disabling certain features for maximum performance in constrained environments.", weight: 1.2, tags: ['very_technical'] }
        ],
        Getting_Started: [
            { value: "To get started, simply include the main script and instantiate the `Terminal` class, attaching it to a DOM element. See the example below for a minimal setup.", weight: 1, tags: ['technical'] },
            { value: "Just grab the JS file, make a `div`, and call `new Terminal(yourDiv)`. Boom, you've got a terminal.", weight: 1, tags: ['informal'] }
        ]
    },
    entanglements: [
        { source: "Introduction", target: "Core_API_Overview", influence: "tone_and_tech" },
        { source: "Introduction", target: "Performance_Considerations", influence: "tone_and_tech" },
        { source: "Core_API_Overview", target: "Getting_Started", influence: "tone_consistency" }
    ],
    influences: {
        /**
         * An influence function that makes the target's tone and technical level
         * consistent with the source's collapsed state.
         */
        tone_and_tech: (sourceOutcome, targetPossibilities) => {
            const sourceTags = sourceOutcome.tags || [];
            return targetPossibilities.map(p => {
                const targetTags = p.tags || [];
                // Find common tags
                const intersection = sourceTags.filter(tag => targetTags.includes(tag));
                // Boost weight based on similarity. Add a small base to avoid zero weights.
                p.weight = Math.pow(2, intersection.length) + 0.1;
                return p;
            });
        },
        /**
         * A simpler influence that just tries to match informal vs formal tone.
         */
        tone_consistency: (sourceOutcome, targetPossibilities) => {
            const isInformal = (sourceOutcome.tags || []).includes('informal');
            return targetPossibilities.map(p => {
                const hasMatchingTone = (p.tags || []).includes('informal') === isInformal;
                // Heavily boost possibilities with a matching tone.
                p.weight = hasMatchingTone ? p.weight * 4 : p.weight * 0.25;
                return p;
            });
        }
    }
};

/**
 * Main execution function.
 */
function main() {
    const args = process.argv.slice(2);
    const outputFile = args[0] || 'QUANTUM_DOCS.md';

    console.log("Preparing Non-Deterministic Documentation Generator...");
    console.log(`Target reality will be materialized at: ${path.resolve(outputFile)}`);

    try {
        const generator = new DocGenerator(DOC_UNIVERSE_CONFIG);
        const documentation = generator.generate();
        fs.writeFileSync(outputFile, documentation, 'utf8');
        console.log(`\n✅ Success! Documentation materialized in ${outputFile}`);
        console.log("Note: This version of reality is unique. Re-running the generator will create a different, parallel universe of documentation.");
    } catch (error) {
        console.error("\n❌ A paradox occurred! The documentation waveform could not be collapsed.");
        console.error(error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    QuantumState,
    DocGenerator,
    DOC_UNIVERSE_CONFIG
};