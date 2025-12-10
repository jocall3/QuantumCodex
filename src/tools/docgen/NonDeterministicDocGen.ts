import * as fs from 'fs/promises';
import * as path from 'path';

// #############################################################################
// # Assumed Interfaces from the Quantum Engine module                         #
// # These would typically be imported from a file like 'src/quantum/types.ts' #
// #############################################################################

/**
 * Represents the outcome of measurements on classical registers.
 * The key is the classical register name, and the value is the measured bitstring.
 * @example { "c": "01" }
 */
interface QuantumMeasurement {
    [classicalRegister: string]: string;
}

/**
 * The result of a single execution (shot) of a quantum program.
 */
interface QuantumResult {
    /** Indicates if the execution was successful. */
    success: boolean;
    /** The measurement outcomes, if any. Present only on success. */
    measurements?: QuantumMeasurement;
    /** An error message, if the execution failed. */
    error?: string;
}

/**
 * Defines the contract for a quantum execution engine.
 * This allows the documentation generator to be decoupled from the specific
 * quantum simulator implementation.
 */
interface IQuantumExecutor {
    /**
     * Executes a single shot of a .u quantum program.
     * @param uCode The .u source code to execute.
     * @returns A promise that resolves to the result of the single execution.
     */
    execute(uCode: string): Promise<QuantumResult>;
}


// #############################################################################
// # Documentation Generator Configuration and Implementation                  #
// #############################################################################

/**
 * Configuration options for the NonDeterministicDocGen.
 */
export interface NonDeterministicDocGenOptions {
    /**
     * The number of times to execute each quantum code snippet
     * to build a probability distribution.
     * @default 1024
     */
    shots?: number;
}

/**
 * A map where keys are measurement outcomes (e.g., "00", "11") and
 * values are the number of times that outcome was observed.
 */
type OutcomeCounts = Map<string, number>;

const DEFAULT_SHOTS = 1024;
const DOC_TAG = 'u-quantum-doc';

/**
 * Generates documentation by executing embedded quantum code snippets.
 *
 * This tool scans documentation files (e.g., Markdown) for code blocks
 * marked with a special tag (`u-quantum-doc`). It executes the quantum code
 * within these blocks multiple times (shots) to observe its probabilistic nature.
 * The aggregated results, including outcome counts and probabilities, are then
 * formatted and injected into the documentation below the original code block.
 */
export class NonDeterministicDocGen {
    private readonly quantumExecutor: IQuantumExecutor;
    private readonly options: Required<NonDeterministicDocGenOptions>;
    private readonly codeBlockRegex: RegExp;

    /**
     * Creates an instance of the NonDeterministicDocGen.
     * @param quantumExecutor An object that conforms to the IQuantumExecutor interface,
     *                        used to run the .u code.
     * @param options Optional configuration for the generator.
     */
    constructor(quantumExecutor: IQuantumExecutor, options: NonDeterministicDocGenOptions = {}) {
        if (!quantumExecutor) {
            throw new Error("A quantum executor instance is required.");
        }
        this.quantumExecutor = quantumExecutor;
        this.options = {
            shots: options.shots ?? DEFAULT_SHOTS,
        };
        this.codeBlockRegex = new RegExp(`\`\`\`${DOC_TAG}\\n([\\s\\S]*?)\\n\`\`\``, 'g');
    }

    /**
     * Reads an input file, processes its content to generate quantum examples,
     * and writes the result to an output file.
     * @param inputFile The path to the source documentation file.
     * @param outputFile The path where the generated documentation will be saved.
     */
    public async generate(inputFile: string, outputFile: string): Promise<void> {
        try {
            console.log(`[DocGen] Processing ${inputFile}...`);
            const inputContent = await fs.readFile(inputFile, 'utf-8');
            const outputContent = await this.processContent(inputContent);

            const outputDir = path.dirname(outputFile);
            await fs.mkdir(outputDir, { recursive: true });
            await fs.writeFile(outputFile, outputContent, 'utf-8');

            console.log(`[DocGen] Successfully generated non-deterministic documentation at ${outputFile}`);
        } catch (error) {
            console.error(`[DocGen] Failed to generate documentation for ${inputFile}:`, error);
            throw error; // Re-throw for higher-level error handling or process exit
        }
    }

    /**
     * Processes a string of content, finding and executing quantum code blocks.
     * @param content The source content of the documentation file.
     * @returns A promise that resolves to the processed content with results injected.
     */
    private async processContent(content: string): Promise<string> {
        const matches = [...content.matchAll(this.codeBlockRegex)];
        if (matches.length === 0) {
            return content; // No quantum blocks found, return original content
        }

        let lastIndex = 0;
        const newContentParts: string[] = [];

        for (const match of matches) {
            const originalBlock = match[0];
            const uCode = match[1].trim();
            const startIndex = match.index!;

            // 1. Add the text before this quantum block
            newContentParts.push(content.substring(lastIndex, startIndex));

            // 2. Add the original quantum code block itself
            newContentParts.push(originalBlock);

            // 3. Execute the code and add the formatted results
            try {
                const results = await this.executeQuantumSnippet(uCode);
                const formattedResults = this.formatResults(results);
                newContentParts.push(`\n\n${formattedResults}\n`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                const errorBlock = this.formatError(errorMessage);
                newContentParts.push(`\n\n${errorBlock}\n`);
            }

            lastIndex = startIndex + originalBlock.length;
        }

        // 4. Add any remaining text after the last quantum block
        newContentParts.push(content.substring(lastIndex));

        return newContentParts.join('');
    }

    /**
     * Executes a quantum code snippet for the configured number of shots and aggregates the results.
     * @param uCode The .u source code to execute.
     * @returns A map of measurement outcomes to their observed counts.
     */
    private async executeQuantumSnippet(uCode: string): Promise<OutcomeCounts> {
        const counts: OutcomeCounts = new Map();
        const executionPromises: Promise<QuantumResult>[] = [];

        for (let i = 0; i < this.options.shots; i++) {
            executionPromises.push(this.quantumExecutor.execute(uCode));
        }

        const results = await Promise.all(executionPromises);

        for (const result of results) {
            if (!result.success || !result.measurements) {
                throw new Error(`Quantum execution failed: ${result.error || 'Unknown error'}`);
            }

            // For documentation, we simplify by assuming a primary classical register.
            // We concatenate all measurement bitstrings to form a single outcome key.
            const outcomeKey = Object.values(result.measurements).join('');
            if (outcomeKey) {
                counts.set(outcomeKey, (counts.get(outcomeKey) || 0) + 1);
            }
        }

        return counts;
    }

    /**
     * Formats the aggregated quantum execution results into a Markdown table.
     * @param results A map of outcomes to their counts.
     * @returns A string containing the formatted Markdown table.
     */
    private formatResults(results: OutcomeCounts): string {
        if (results.size === 0) {
            return `**Execution Results (${this.options.shots} shots):**\n\nNo measurement outcomes were recorded. This may be expected if the program does not contain measurement instructions.`;
        }

        const sortedOutcomes = [...results.keys()].sort();
        const totalShots = this.options.shots;

        const header = `**Execution Results (${totalShots} shots):**\n\n| Outcome | Count | Probability |\n|:--------|:------|:------------|`;
        const rows = sortedOutcomes.map(outcome => {
            const count = results.get(outcome)!;
            const probability = (count / totalShots) * 100;
            // Format to one decimal place, but remove ".0" for whole numbers.
            const probString = probability.toFixed(1).replace(/\.0$/, '');
            return `| ${outcome} | ${count} | ~${probString}% |`;
        });

        return [header, ...rows].join('\n');
    }

    /**
     * Formats an error message into a visible block for the documentation.
     * @param message The error message to format.
     * @returns A string containing the formatted error block.
     */
    private formatError(message: string): string {
        return `> **Documentation Generation Error:**
>
> Failed to execute quantum example:
> \`\`\`
> ${message}
> \`\`\``;
    }
}