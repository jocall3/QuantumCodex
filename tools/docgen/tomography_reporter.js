/**
 * @module tomography_reporter
 * @description A module for the documentation generator that integrates 'Quantum Documentation as State Tomography'.
 *              It fetches structured codebase analysis data (the "tomography data") and formats it
 *              into human-readable Markdown reports. This provides a snapshot of the project's
 *              health, stability, and completeness.
 */

const fs = require('fs');
const path = require('path');

/**
 * A collection of formatter functions to render different sections of the tomography report.
 * Each formatter takes a data object for its section and returns a Markdown string.
 */
const formatters = {
    /**
     * Formats the report's main header and summary.
     * @param {object} summaryData - The summary data.
     * @param {string} summaryData.projectName - The name of the project.
     * @param {string} summaryData.timestamp - ISO string timestamp of the data generation.
     * @param {string} summaryData.version - The project version.
     * @param {number} summaryData.totalModules - The number of modules analyzed.
     * @returns {string} Markdown formatted summary.
     */
    summary: (summaryData) => {
        if (!summaryData) return '';
        const { projectName, timestamp, version, totalModules } = summaryData;
        const date = new Date(timestamp).toUTCString();
        return `
# Codebase State Tomography Report for ${projectName}

This report provides a multi-faceted view of the current state of the codebase, including test coverage, API stability, and performance benchmarks.

*   **Version:** \`${version || 'N/A'}\`
*   **Report Generated:** ${date}
*   **Modules Analyzed:** ${totalModules || 'N/A'}
---
`;
    },

    /**
     * Formats the test coverage section into a Markdown table.
     * @param {object} coverageData - The coverage data, typically from a tool like Jest or Istanbul.
     * @returns {string} Markdown formatted coverage report.
     */
    coverage: (coverageData) => {
        if (!coverageData) return '## Test Coverage\n\n_No coverage data available._\n';
        const { statements, branches, functions, lines } = coverageData;
        return `
## Test Coverage

This table shows the percentage of code covered by automated tests. High coverage is a strong indicator of code reliability.

| Metric      | Total | Covered | Skipped | Percentage |
|-------------|-------|---------|---------|------------|
| Statements  | ${statements.total} | ${statements.covered} | ${statements.skipped} | **${statements.pct}%** |
| Branches    | ${branches.total} | ${branches.covered} | ${branches.skipped} | **${branches.pct}%** |
| Functions   | ${functions.total} | ${functions.covered} | ${functions.skipped} | **${functions.pct}%** |
| Lines       | ${lines.total} | ${lines.covered} | ${lines.skipped} | **${lines.pct}%** |
`;
    },

    /**
     * Formats the module dependency graph section.
     * @param {object} dependencyData - An object where keys are module names and values are arrays of their dependencies.
     * @returns {string} Markdown formatted dependency list.
     */
    dependencies: (dependencyData) => {
        if (!dependencyData || Object.keys(dependencyData).length === 0) {
            return '## Module Dependencies\n\n_No dependency data available._\n';
        }
        let markdown = '## Module Dependencies\n\nThis section outlines the internal dependencies between modules.\n\n';
        for (const [module, deps] of Object.entries(dependencyData)) {
            markdown += `### \`${module}\`\n`;
            if (deps && deps.length > 0) {
                markdown += deps.map(dep => `- Depends on \`${dep}\``).join('\n') + '\n\n';
            } else {
                markdown += '_No internal dependencies._\n\n';
            }
        }
        return markdown;
    },

    /**
     * Formats the API stability and documentation status section.
     * @param {Array<object>} apiData - Array of API module data.
     * @returns {string} Markdown formatted API report.
     */
    apiStability: (apiData) => {
        if (!apiData || apiData.length === 0) {
            return '## API Stability & Documentation\n\n_No API data available._\n';
        }
        let markdown = '## API Stability & Documentation\n\n';
        markdown += 'This table tracks the stability and documentation status of public-facing APIs.\n\n';
        markdown += '| Module / Function | Stability | Documented | Description |\n';
        markdown += '|---|---|---|---|\n';

        apiData.forEach(module => {
            markdown += `| **\`${module.name}\`** | - | - | _${module.description || ''}_ |\n`;
            if (module.functions) {
                module.functions.forEach(func => {
                    const stabilityBadge = func.stability === 'stable' ? '✅ Stable' : (func.stability === 'experimental' ? '🧪 Experimental' : '❓ Unknown');
                    const documentedBadge = func.documented ? '✔️ Yes' : '❌ No';
                    markdown += `| &nbsp;&nbsp;↳ \`${func.name}\` | ${stabilityBadge} | ${documentedBadge} | ${func.description || ''} |\n`;
                });
            }
        });

        return markdown;
    },
    
    /**
     * Formats performance benchmark results.
     * @param {Array<object>} benchmarkData - The benchmark data.
     * @returns {string} Markdown formatted benchmark report.
     */
    benchmarks: (benchmarkData) => {
        if (!benchmarkData || benchmarkData.length === 0) {
            return '## Performance Benchmarks\n\n_No benchmark data available._\n';
        }
        let markdown = '## Performance Benchmarks\n\n';
        markdown += 'Performance metrics for critical operations, measured in operations per second (higher is better).\n\n';
        markdown += '| Benchmark Suite | Test Case | Ops/sec | Margin of Error |\n';
        markdown += '|---|---|---|---|\n';

        benchmarkData.forEach(suite => {
            if (suite.tests) {
                suite.tests.forEach(test => {
                    const ops = test.ops ? test.ops.toLocaleString('en-US', { maximumFractionDigits: 0 }) : 'N/A';
                    const rme = test.rme ? `±${test.rme.toFixed(2)}%` : 'N/A';
                    markdown += `| ${suite.name} | \`${test.name}\` | ${ops} | ${rme} |\n`;
                });
            }
        });
        return markdown;
    }
};

/**
 * Reads and parses the tomography data file from disk.
 * @param {string} dataPath - The path to the tomography JSON data file.
 * @returns {Promise<object>} A promise that resolves with the parsed data object.
 * @throws {Error} If the file cannot be read or parsed.
 */
async function loadTomographyData(dataPath) {
    try {
        const absolutePath = path.resolve(dataPath);
        const fileContent = await fs.promises.readFile(absolutePath, 'utf8');
        return JSON.parse(fileContent);
    } catch (error) {
        console.error(`[TomographyReporter] Error loading data from ${dataPath}:`, error.message);
        if (error.code === 'ENOENT') {
            throw new Error(`Tomography data file not found at: ${dataPath}`);
        }
        if (error instanceof SyntaxError) {
            throw new Error(`Failed to parse tomography data file. It may not be valid JSON. Reason: ${error.message}`);
        }
        throw new Error(`Failed to load tomography data file. Reason: ${error.message}`);
    }
}

/**
 * Generates a complete documentation report from tomography data.
 * It processes different sections of the data using specialized formatters
 * in a predefined order to ensure a consistent report structure.
 *
 * @param {object} tomographyData - The parsed tomography data object.
 * @returns {string} A complete Markdown report.
 */
function generateReport(tomographyData) {
    let fullReport = '';

    // The order of keys determines the order of sections in the report.
    const sectionOrder = ['summary', 'apiStability', 'coverage', 'benchmarks', 'dependencies'];

    for (const sectionKey of sectionOrder) {
        if (tomographyData[sectionKey] && formatters[sectionKey]) {
            fullReport += formatters[sectionKey](tomographyData[sectionKey]);
        }
    }

    if (fullReport.trim() === '') {
        return '# Tomography Report\n\n_No data was found to generate a report._\n';
    }

    return fullReport;
}

/**
 * Main function to generate a tomography report from a specified data file.
 * This is the primary entry point for the module. It orchestrates loading the
 * data and formatting it into a final report string.
 *
 * @param {object} options - The options for report generation.
 * @param {string} options.inputPath - Path to the input tomography JSON file.
 * @returns {Promise<string>} A promise that resolves with the generated Markdown report.
 */
async function generateTomographyReport({ inputPath }) {
    if (!inputPath) {
        throw new Error('[TomographyReporter] An input path for the tomography data file must be provided.');
    }

    console.log(`[TomographyReporter] Generating report from data at: ${inputPath}`);
    const data = await loadTomographyData(inputPath);
    const report = generateReport(data);
    console.log('[TomographyReporter] Report generation complete.');

    return report;
}

module.exports = {
    generateTomographyReport,
    // Exposing internal functions for testing purposes
    _internal: {
        loadTomographyData,
        generateReport,
        formatters
    }
};