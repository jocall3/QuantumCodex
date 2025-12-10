/**
 * @file src/compiler/analysis/QuantumCohomologyAnalyzer.ts
 * @purpose Performs Quantum Cohomology analysis to identify topological invariants and quantum corrections in code structure.
 *
 * @description
 * This analyzer models the Abstract Syntax Tree (AST) as a topological space (specifically, a simplicial complex
 * derived from the Control Flow Graph). It then applies concepts from Quantum Cohomology to analyze the structure.
 *
 * In this metaphor:
 * - **Classical Cohomology**: Represents static, structural properties of the code, such as cyclomatic complexity
 *   (related to the first Betti number) and component count (zeroth Betti number). These are the "topological invariants."
 * - **Quantum Corrections**: These deform the classical view by incorporating dynamic-like aspects such as data flow
 *   and variable scope. "Pseudo-holomorphic curves" from Gromov-Witten theory are modeled as "code flow curves"
 *   (e.g., the path of a variable from declaration to use). The "energy" of these curves, our Gromov-Witten invariant,
 *   quantifies non-local interactions and potential for "spooky action at a distance" in the code.
 *
 * The analysis aims to uncover hidden complexities and fragile points in the code that are not apparent from
 * simple static analysis alone. A high quantum correction on a node suggests it's a critical nexus of complex
 * data and control flows, making it a candidate for careful review or refactoring.
 */

import { ASTNode, NodeType } from '../ast/node';
import { SymbolTable, SymbolInfo } from './SymbolTable';

// --- Type Definitions for Analysis Results ---

/**
 * Represents a fundamental, stable property of the code's structure,
 * analogous to topological invariants in mathematics.
 */
export interface TopologicalInvariant {
    name: 'BettiNumberB0' | 'BettiNumberB1' | 'EulerCharacteristic';
    value: number;
    description: string;
}

/**
 * Represents a "quantum correction" to the classical understanding of a code block's complexity.
 * It highlights nodes that are part of complex, non-local interactions.
 */
export interface QuantumCorrection {
    nodeId: string;
    nodeType: NodeType;
    correctionFactor: number;
    reason: string;
    implicatedFlows: CodeFlowCurve[];
}

/**
 * Models a "pseudo-holomorphic curve" as a path of data or control flow through the code.
 * These curves are the basis for calculating quantum corrections.
 */
export interface CodeFlowCurve {
    id: string;
    startNodeId: string;
    endNodeId: string;
    path: string[]; // Sequence of node IDs forming the curve
    energy: number; // Analogous to a Gromov-Witten invariant for this curve
    type: 'data-flow' | 'control-flow';
}

/**
 * The complete result of the Quantum Cohomology analysis.
 */
export interface QuantumAnalysisResult {
    invariants: TopologicalInvariant[];
    corrections: QuantumCorrection[];
    quantumComplexity: number; // An aggregated score representing the overall "quantum entanglement" of the code.
}

// --- The Analyzer Class ---

/**
 * An analyzer that applies principles of Quantum Cohomology to a program's AST.
 * It identifies deep structural properties and potential for non-local side effects.
 */
export class QuantumCohomologyAnalyzer {
    private readonly astRoot: ASTNode;
    private readonly symbolTable: SymbolTable;
    private readonly nodes: Map<string, ASTNode> = new Map();
    private readonly controlFlowGraph: Map<string, string[]> = new Map();

    /**
     * @param astRoot The root of the Abstract Syntax Tree to be analyzed.
     * @param symbolTable A pre-populated symbol table for the given AST.
     */
    constructor(astRoot: ASTNode, symbolTable: SymbolTable) {
        this.astRoot = astRoot;
        this.symbolTable = symbolTable;
        this.buildNodeMapAndControlFlowGraph();
    }

    /**
     * Performs the full quantum cohomology analysis.
     * @returns {QuantumAnalysisResult} The results of the analysis.
     */
    public analyze(): QuantumAnalysisResult {
        const invariants = this.calculateClassicalInvariants();
        const curves = this.identifyCodeFlowCurves();
        const corrections = this.computeQuantumCorrections(curves);

        const quantumComplexity = corrections.reduce((sum, corr) => sum + corr.correctionFactor, 0);

        return {
            invariants,
            corrections,
            quantumComplexity,
        };
    }

    /**
     * Traverses the AST to populate the node map and build the Control Flow Graph (CFG).
     * The CFG is a directed graph where nodes are AST nodes and edges represent possible flow of control.
     */
    private buildNodeMapAndControlFlowGraph(): void {
        const queue: { node: ASTNode; parentSuccessor: ASTNode | null }[] = [{ node: this.astRoot, parentSuccessor: null }];
        const visited = new Set<string>();

        while (queue.length > 0) {
            const { node, parentSuccessor } = queue.shift()!;
            if (!node.id || visited.has(node.id)) continue;
            visited.add(node.id);

            this.nodes.set(node.id, node);
            this.controlFlowGraph.set(node.id, []);

            const successors: { node: ASTNode; parentSuccessor: ASTNode | null }[] = [];

            switch (node.type) {
                case NodeType.IfStatement: {
                    const testSuccessor = node.consequent;
                    this.addEdge(node.id, testSuccessor.id);
                    successors.push({ node: testSuccessor, parentSuccessor });

                    if (node.alternate) {
                        this.addEdge(node.id, node.alternate.id);
                        successors.push({ node: node.alternate, parentSuccessor });
                    } else if (parentSuccessor) {
                        this.addEdge(node.id, parentSuccessor.id);
                    }
                    break;
                }
                case NodeType.WhileStatement:
                case NodeType.ForStatement: {
                    const body = node.body;
                    this.addEdge(node.id, body.id); // Edge into the loop
                    successors.push({ node: body, parentSuccessor: node }); // Loop body successor is the loop itself
                    if (parentSuccessor) {
                        this.addEdge(node.id, parentSuccessor.id); // Edge to exit the loop
                    }
                    break;
                }
                case NodeType.BlockStatement: {
                    for (let i = 0; i < node.body.length; i++) {
                        const child = node.body[i];
                        const nextChild = node.body[i + 1] || parentSuccessor;
                        if (i === 0) {
                            this.addEdge(node.id, child.id);
                        }
                        if (nextChild) {
                            successors.push({ node: child, parentSuccessor: nextChild });
                        } else {
                            successors.push({ node: child, parentSuccessor });
                        }
                    }
                    if (node.body.length === 0 && parentSuccessor) {
                        this.addEdge(node.id, parentSuccessor.id);
                    }
                    break;
                }
                default: {
                    // For simple statements, flow goes to the parent's successor
                    if (parentSuccessor) {
                        this.addEdge(node.id, parentSuccessor.id);
                    }
                    // Generic traversal for children that don't define control flow
                    (node.children || []).forEach(child => {
                        successors.push({ node: child, parentSuccessor });
                    });
                    break;
                }
            }
            queue.push(...successors);
        }
    }

    private addEdge(fromId: string, toId: string): void {
        if (this.controlFlowGraph.has(fromId)) {
            this.controlFlowGraph.get(fromId)!.push(toId);
        }
    }

    /**
     * Calculates classical topological invariants from the CFG.
     * - B0 (Betti number 0): Number of connected components (e.g., separate functions).
     * - B1 (Betti number 1): Number of independent cycles (loops).
     * - Euler Characteristic: V - E, a fundamental graph invariant.
     */
    private calculateClassicalInvariants(): TopologicalInvariant[] {
        const V = this.nodes.size;
        const E = Array.from(this.controlFlowGraph.values()).reduce((sum, edges) => sum + edges.length, 0);
        
        const { componentCount, cycleCount } = this.analyzeGraphConnectivity();

        const b0: TopologicalInvariant = {
            name: 'BettiNumberB0',
            value: componentCount,
            description: 'Number of disconnected control flow components (e.g., functions).',
        };

        const b1: TopologicalInvariant = {
            name: 'BettiNumberB1',
            value: cycleCount,
            description: 'Number of fundamental cycles in the control flow (loops).',
        };

        const euler: TopologicalInvariant = {
            name: 'EulerCharacteristic',
            value: V - E,
            description: 'Euler characteristic of the CFG (Vertices - Edges).',
        };

        return [b0, b1, euler];
    }

    /**
     * Helper to find connected components and cycles using DFS.
     */
    private analyzeGraphConnectivity(): { componentCount: number; cycleCount: number } {
        let componentCount = 0;
        let cycleCount = 0;
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const dfs = (nodeId: string) => {
            visited.add(nodeId);
            recursionStack.add(nodeId);

            for (const neighborId of this.controlFlowGraph.get(nodeId) || []) {
                if (recursionStack.has(neighborId)) {
                    cycleCount++;
                }
                if (!visited.has(neighborId)) {
                    dfs(neighborId);
                }
            }
            recursionStack.delete(nodeId);
        };

        for (const nodeId of this.nodes.keys()) {
            if (!visited.has(nodeId)) {
                componentCount++;
                dfs(nodeId);
            }
        }
        return { componentCount, cycleCount };
    }

    /**
     * Identifies code flow curves by tracing variable usage from declaration to use sites.
     * Each such path is a "data-flow curve".
     */
    private identifyCodeFlowCurves(): CodeFlowCurve[] {
        const curves: CodeFlowCurve[] = [];
        const allSymbols = this.symbolTable.getAllSymbols();

        for (const symbol of allSymbols) {
            const declNode = this.nodes.get(symbol.declarationNodeId);
            if (!declNode) continue;

            for (const use of symbol.usages) {
                const useNode = this.nodes.get(use.nodeId);
                if (!useNode) continue;

                // Find a path in the CFG from declaration to use
                const path = this.findShortestPath(declNode.id, useNode.id);
                if (path) {
                    const curve: CodeFlowCurve = {
                        id: `curve-${declNode.id}-${useNode.id}`,
                        startNodeId: declNode.id,
                        endNodeId: useNode.id,
                        path,
                        energy: 0, // To be calculated
                        type: 'data-flow',
                    };
                    curve.energy = this.calculateGromovWittenInvariant(curve, symbol);
                    curves.push(curve);
                }
            }
        }
        return curves;
    }

    /**
     * Calculates the "energy" of a code flow curve, analogous to a Gromov-Witten invariant.
     * The energy is a heuristic based on path length, scope crossings, and type complexity.
     * @param curve The code flow curve to analyze.
     * @param symbol The symbol associated with this data-flow curve.
     */
    private calculateGromovWittenInvariant(curve: CodeFlowCurve, symbol: SymbolInfo): number {
        const pathLength = curve.path.length;
        
        // Calculate scope crossings
        const startScope = this.symbolTable.getScope(curve.startNodeId);
        const endScope = this.symbolTable.getScope(curve.endNodeId);
        const scopeDistance = this.symbolTable.getScopeDistance(startScope, endScope);

        // Heuristic for type complexity (e.g., complex objects have higher energy)
        const typeComplexity = symbol.type === 'object' || symbol.type === 'function' ? 1.5 : 1.0;

        // Energy = (base path length) * (penalty for crossing scopes) * (penalty for complex types)
        const energy = pathLength * (1 + scopeDistance * 0.5) * typeComplexity;
        
        return parseFloat(energy.toFixed(2));
    }

    /**
     * Aggregates the energy of all curves passing through each node to compute quantum corrections.
     * @param curves All identified code flow curves.
     */
    private computeQuantumCorrections(curves: CodeFlowCurve[]): QuantumCorrection[] {
        const nodeEnergies: Map<string, { totalEnergy: number; curves: CodeFlowCurve[] }> = new Map();

        for (const curve of curves) {
            for (const nodeId of curve.path) {
                if (!nodeEnergies.has(nodeId)) {
                    nodeEnergies.set(nodeId, { totalEnergy: 0, curves: [] });
                }
                const entry = nodeEnergies.get(nodeId)!;
                entry.totalEnergy += curve.energy;
                entry.curves.push(curve);
            }
        }

        const corrections: QuantumCorrection[] = [];
        for (const [nodeId, { totalEnergy, curves }] of nodeEnergies.entries()) {
            if (totalEnergy > 5.0) { // Threshold for significant correction
                const node = this.nodes.get(nodeId)!;
                corrections.push({
                    nodeId,
                    nodeType: node.type,
                    correctionFactor: parseFloat(Math.log10(totalEnergy).toFixed(2)),
                    reason: `Node is a nexus for ${curves.length} high-energy data flows, indicating high structural entanglement.`,
                    implicatedFlows: curves,
                });
            }
        }

        return corrections.sort((a, b) => b.correctionFactor - a.correctionFactor);
    }

    /**
     * Finds the shortest path between two nodes in the CFG using Breadth-First Search (BFS).
     * @param startNodeId The starting node ID.
     * @param endNodeId The target node ID.
     * @returns An array of node IDs representing the path, or null if no path exists.
     */
    private findShortestPath(startNodeId: string, endNodeId: string): string[] | null {
        if (startNodeId === endNodeId) return [startNodeId];

        const queue: string[][] = [[startNodeId]];
        const visited = new Set<string>([startNodeId]);

        while (queue.length > 0) {
            const path = queue.shift()!;
            const lastNode = path[path.length - 1];

            if (lastNode === endNodeId) {
                return path;
            }

            for (const neighbor of this.controlFlowGraph.get(lastNode) || []) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    const newPath = [...path, neighbor];
                    queue.push(newPath);
                }
            }
        }

        return null; // No path found
    }
}