import * as fs from 'fs/promises';
import * as path from 'path';

// In a complete project, a parser module would provide these types.
// For example: import { QuantumStateVector } from '../../language/parser';

/**
 * Represents a complex number with real and imaginary parts.
 */
class Complex {
    constructor(public re: number = 0, public im: number = 0) {}

    /**
     * Creates a Complex number from another Complex number or a real number.
     */
    static from(c: Complex | number): Complex {
        if (typeof c === 'number') {
            return new Complex(c, 0);
        }
        return new Complex(c.re, c.im);
    }

    /**
     * Returns the complex conjugate of the number.
     */
    conjugate(): Complex {
        return new Complex(this.re, -this.im);
    }

    /**
     * Multiplies this complex number by another.
     * @param other - The number to multiply by.
     * @returns The product as a new Complex number.
     */
    multiply(other: Complex | number): Complex {
        const o = Complex.from(other);
        return new Complex(this.re * o.re - this.im * o.im, this.re * o.im + this.im * o.re);
    }

    /**
     * Returns the magnitude (absolute value) of the complex number.
     */
    magnitude(): number {
        return Math.sqrt(this.re * this.re + this.im * this.im);
    }
}

type QuantumStateVector = Complex[];
type DensityMatrix = Complex[][];

/**
 * Generates documentation for .u files by visualizing the quantum state's
 * density matrix, a technique inspired by Quantum State Tomography.
 *
 * This tool creates an HTML file containing a graphical representation
 * of the density matrix, which provides insight into the final state
 * of a quantum computation described in a .u file.
 */
export class StateTomographyDocGenerator {
    
    /**
     * Generates and saves a documentation file for a given .u source file.
     * @param uFilePath - The absolute path to the .u source file.
     * @param outputDir - The directory where the documentation file will be saved.
     */
    public async generate(uFilePath: string, outputDir: string): Promise<void> {
        try {
            const sourceCode = await fs.readFile(uFilePath, 'utf-8');
            
            // Step 1: Parse the .u code to get the final quantum state vector.
            // This is a placeholder for the actual .u language parser and simulator.
            const stateVector = this.parseAndSimulateUCode(sourceCode);

            // Step 2: Calculate the density matrix from the state vector.
            const densityMatrix = this.calculateDensityMatrix(stateVector);

            // Step 3: Visualize the density matrix as an SVG graphic.
            const svgVisualization = this.visualizeDensityMatrix(densityMatrix);

            // Step 4: Create a self-contained HTML wrapper for the documentation.
            const docTitle = `State Tomography for ${path.basename(uFilePath)}`;
            const htmlContent = this.createHtmlWrapper(docTitle, svgVisualization);

            // Step 5: Write the final HTML documentation to a file.
            const outputFileName = `${path.basename(uFilePath, '.u')}.html`;
            const outputPath = path.join(outputDir, outputFileName);
            await fs.mkdir(outputDir, { recursive: true });
            await fs.writeFile(outputPath, htmlContent);

            console.log(`[DocGen] Successfully generated state tomography documentation at: ${outputPath}`);

        } catch (error) {
            console.error(`[DocGen] Failed to generate documentation for ${uFilePath}:`, error);
            throw error;
        }
    }

    /**
     * Placeholder for the .u language parser and quantum circuit simulator.
     * This should be replaced with a call to the actual implementation.
     * For demonstration purposes, it returns a 2-qubit Bell state: (|00> + |11>)/sqrt(2).
     * @param sourceCode - The source code of the .u file.
     * @returns The final quantum state vector after simulation.
     */
    private parseAndSimulateUCode(sourceCode: string): QuantumStateVector {
        // In a real implementation, this would involve a full AST traversal
        // and quantum circuit simulation based on the .u code.
        // The length of the source code is passed to console to avoid 'unused variable' linting issues.
        console.log(`[DocGen] Parsing source code (length: ${sourceCode.length})... (using placeholder state)`);
        
        const oneOverSqrt2 = 1 / Math.sqrt(2);
        return [
            new Complex(oneOverSqrt2, 0), // Amplitude for |00>
            new Complex(0, 0),             // Amplitude for |01>
            new Complex(0, 0),             // Amplitude for |10>
            new Complex(oneOverSqrt2, 0), // Amplitude for |11>
        ];
    }

    /**
     * Calculates the density matrix ρ = |ψ⟩⟨ψ| from a state vector |ψ⟩.
     * @param stateVector - The quantum state vector |ψ⟩.
     * @returns The corresponding density matrix ρ.
     */
    private calculateDensityMatrix(stateVector: QuantumStateVector): DensityMatrix {
        const size = stateVector.length;
        const densityMatrix: DensityMatrix = Array(size).fill(null).map(() => Array(size).fill(new Complex(0, 0)));

        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                // ρ_ij = ψ_i * ψ_j* (where * denotes complex conjugate)
                densityMatrix[i][j] = stateVector[i].multiply(stateVector[j].conjugate());
            }
        }
        return densityMatrix;
    }

    /**
     * Creates an SVG visualization of the density matrix.
     * This generates two Hinton-style plots: one for the real part and one for the imaginary part.
     * @param matrix - The density matrix to visualize.
     * @returns An SVG string.
     */
    private visualizeDensityMatrix(matrix: DensityMatrix): string {
        const size = matrix.length;
        if (size === 0) return '<svg></svg>';
        
        const numQubits = Math.log2(size);
        const cellSize = 50;
        const padding = 40;
        const plotWidth = size * cellSize;
        const totalWidth = 2 * plotWidth + 3 * padding;
        const totalHeight = plotWidth + 2 * padding;

        let maxAbsValue = 0;
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                maxAbsValue = Math.max(maxAbsValue, Math.abs(matrix[i][j].re), Math.abs(matrix[i][j].im));
            }
        }
        // Avoid division by zero for a zero matrix
        const norm = maxAbsValue > 1e-9 ? maxAbsValue : 1;

        const generateGrid = (offsetX: number, title: string): string => {
            let grid = `<text x="${offsetX + plotWidth / 2}" y="${padding - 15}" text-anchor="middle" font-size="16" fill="#abb2bf">${title}</text>`;
            for (let i = 0; i < size; i++) {
                for (let j = 0; j < size; j++) {
                    grid += `<rect x="${offsetX + j * cellSize}" y="${padding + i * cellSize}" width="${cellSize}" height="${cellSize}" fill="none" stroke="#4b5263" stroke-width="0.5" />`;
                }
            }
            // Add basis state labels
            for (let i = 0; i < size; i++) {
                const label = i.toString(2).padStart(numQubits, '0');
                grid += `<text x="${offsetX - 5}" y="${padding + i * cellSize + cellSize / 2}" text-anchor="end" dominant-baseline="middle" font-size="10" fill="#abb2bf">|${label}⟩</text>`;
                grid += `<text x="${offsetX + i * cellSize + cellSize / 2}" y="${padding - 5}" text-anchor="middle" font-size="10" fill="#abb2bf">⟨${label}|</text>`;
            }
            return grid;
        };

        const generatePlot = (offsetX: number, part: 're' | 'im'): string => {
            let plot = '';
            for (let i = 0; i < size; i++) {
                for (let j = 0; j < size; j++) {
                    const value = matrix[i][j][part];
                    if (Math.abs(value) < 1e-9) continue;

                    const scale = Math.sqrt(Math.abs(value) / norm);
                    const squareSize = scale * cellSize;
                    const offset = (cellSize - squareSize) / 2;
                    const x = offsetX + j * cellSize + offset;
                    const y = padding + i * cellSize + offset;
                    const color = value > 0 ? (part === 're' ? '#61afef' : '#98c379') : (part === 're' ? '#e06c75' : '#e5c07b');
                    
                    plot += `<rect x="${x}" y="${y}" width="${squareSize}" height="${squareSize}" fill="${color}" />`;
                }
            }
            return plot;
        };

        const realPartX = padding;
        const imagPartX = padding + plotWidth + padding;

        const svgContent = `
            <g>${generateGrid(realPartX, 'Real Part')}</g>
            <g>${generatePlot(realPartX, 're')}</g>
            <g>${generateGrid(imagPartX, 'Imaginary Part')}</g>
            <g>${generatePlot(imagPartX, 'im')}</g>
        `;

        return `<svg width="${totalWidth}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg" style="background-color: #282c34; font-family: 'SF Mono', 'Consolas', 'Menlo', monospace;">${svgContent}</svg>`;
    }

    /**
     * Creates a simple, self-contained HTML document to wrap the SVG visualization.
     * @param title - The title of the HTML document.
     * @param svgContent - The SVG string to embed.
     * @returns The full HTML content as a string.
     */
    private createHtmlWrapper(title: string, svgContent: string): string {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            background-color: #282c34;
            color: #abb2bf;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
        }
        h1 {
            color: #61afef;
            border-bottom: 2px solid #56b6c2;
            padding-bottom: 10px;
            margin-top: 0;
        }
        .container {
            background-color: #21252b;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            max-width: 100%;
            overflow-x: auto;
        }
        .legend {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 20px;
            margin-top: 20px;
            font-size: 14px;
        }
        .legend-item {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .legend-color {
            width: 15px;
            height: 15px;
            border: 1px solid #4b5263;
            border-radius: 3px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${title}</h1>
        ${svgContent}
        <div class="legend">
            <div class="legend-item"><div class="legend-color" style="background-color: #61afef;"></div><span>Positive Real</span></div>
            <div class="legend-item"><div class="legend-color" style="background-color: #e06c75;"></div><span>Negative Real</span></div>
            <div class="legend-item"><div class="legend-color" style="background-color: #98c379;"></div><span>Positive Imaginary</span></div>
            <div class="legend-item"><div class="legend-color" style="background-color: #e5c07b;"></div><span>Negative Imaginary</span></div>
        </div>
    </div>
    <p style="margin-top: 20px; font-size: 12px; color: #5c6370;">Generated by the .u language toolchain</p>
</body>
</html>
        `;
    }
}