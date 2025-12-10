import { 
    ASTNode, 
    Identifier, 
    FunctionDeclaration, 
    QuantumGateExpression, 
    BlockStatement 
} from '../ast/Nodes'; // Assumed imports for the .u language AST

/**
 * Represents the type of dependency between two code units.
 */
export enum DependencyType {
    CLASSICAL_DATA = 'CLASSICAL_DATA',
    CLASSICAL_CONTROL = 'CLASSICAL_CONTROL',
    QUANTUM_STATE = 'QUANTUM_STATE',
    MEASUREMENT_FEEDBACK = 'MEASUREMENT_FEEDBACK'
}

/**
 * Represents a node in the dependency graph.
 */
export interface DependencyNode {
    id: string;
    name: string;
    astNode: ASTNode;
    isQuantum: boolean;
    edges: DependencyEdge[];
}

/**
 * Represents a directed edge in the dependency graph.
 */
export interface DependencyEdge {
    targetId: string;
    type: DependencyType;
    sourceLine: number;
}

/**
 * Result of the cycle analysis.
 */
export interface CycleAnalysisResult {
    hasCycles: boolean;
    cycles: DetectedCycle[];
    isStable: boolean;
    diagnostics: string[];
}

/**
 * Details about a detected cycle.
 */
export interface DetectedCycle {
    path: string[]; // List of Node IDs
    edgeTypes: DependencyType[];
    isQuantumClassicalHybrid: boolean;
    riskLevel: 'LOW' | 'MEDIUM' | 'CRITICAL';
}

/**
 * Analyzes code for Cyclic Quantum Dependencies.
 * 
 * In the .u language, purely classical recursion is allowed (stack limited).
 * Purely quantum loops (unitary evolution) are allowed within coherence time.
 * However, loops that mix classical control flow with quantum state measurement 
 * (Measurement Feedback Loops) must be strictly analyzed for stability to prevent 
 * non-terminating quantum state collapse/preparation cycles that halt the QPU.
 */
export class CyclicDependencyAnalyzer {
    private nodes: Map<string, DependencyNode> = new Map();
    private visited: Set<string> = new Set();
    private recursionStack: Set<string> = new Set();
    private detectedCycles: DetectedCycle[] = [];

    /**
     * Main entry point for analyzing a dependency graph.
     * @param dependencyGraph A map of node IDs to DependencyNodes constructed from the AST.
     */
    public analyze(dependencyGraph: Map<string, DependencyNode>): CycleAnalysisResult {
        this.nodes = dependencyGraph;
        this.visited.clear();
        this.recursionStack.clear();
        this.detectedCycles = [];

        // Perform DFS to detect cycles
        for (const nodeId of this.nodes.keys()) {
            if (!this.visited.has(nodeId)) {
                this.dfs(nodeId, []);
            }
        }

        return this.generateReport();
    }

    /**
     * Depth First Search to detect back edges.
     */
    private dfs(nodeId: string, pathStack: { nodeId: string; edgeType: DependencyType | null }[]): void {
        this.visited.add(nodeId);
        this.recursionStack.add(nodeId);
        
        // Push current node to path for cycle reconstruction
        // The edgeType is null for the root of the DFS tree, or the edge that led here
        
        const node = this.nodes.get(nodeId);
        if (!node) return;

        for (const edge of node.edges) {
            const targetId = edge.targetId;

            if (!this.visited.has(targetId)) {
                this.dfs(targetId, [...pathStack, { nodeId, edgeType: edge.type }]);
            } else if (this.recursionStack.has(targetId)) {
                // Cycle detected
                this.recordCycle(targetId, [...pathStack, { nodeId, edgeType: edge.type }]);
            }
        }

        this.recursionStack.delete(nodeId);
    }

    /**
     * Reconstructs and analyzes a detected cycle.
     */
    private recordCycle(startNodeId: string, currentPath: { nodeId: string; edgeType: DependencyType | null }[]): void {
        // Extract the segment of the path that forms the cycle
        const startIndex = currentPath.findIndex(p => p.nodeId === startNodeId);
        if (startIndex === -1) return;

        const cyclePathNodes = currentPath.slice(startIndex).map(p => p.nodeId);
        // Add the closing node to complete the visual loop
        cyclePathNodes.push(startNodeId);

        // Extract edge types involved in the cycle
        // The first element in slice has edgeType leading TO it, which is not what we stored.
        // We stored {nodeId: source, edgeType: type_to_next}.
        
        const cycleEdges: DependencyType[] = [];
        for (let i = startIndex; i < currentPath.length; i++) {
            if (currentPath[i].edgeType) {
                cycleEdges.push(currentPath[i].edgeType!);
            }
        }
        // Add the edge that closed the loop (the one currently being processed in DFS)
        // We need to find the edge from the last node in path to startNodeId
        const lastNodeId = currentPath[currentPath.length - 1].nodeId;
        const lastNode = this.nodes.get(lastNodeId);
        const closingEdge = lastNode?.edges.find(e => e.targetId === startNodeId);
        if (closingEdge) {
            cycleEdges.push(closingEdge.type);
        }

        const isHybrid = this.checkIfHybrid(cycleEdges);
        const risk = this.assessRisk(cycleEdges, cyclePathNodes);

        this.detectedCycles.push({
            path: cyclePathNodes,
            edgeTypes: cycleEdges,
            isQuantumClassicalHybrid: isHybrid,
            riskLevel: risk
        });
    }

    /**
     * Determines if a cycle involves both Quantum and Classical dependencies.
     */
    private checkIfHybrid(edges: DependencyType[]): boolean {
        let hasQuantum = false;
        let hasClassical = false;

        for (const type of edges) {
            if (type === DependencyType.QUANTUM_STATE || type === DependencyType.MEASUREMENT_FEEDBACK) {
                hasQuantum = true;
            }
            if (type === DependencyType.CLASSICAL_CONTROL || type === DependencyType.CLASSICAL_DATA) {
                hasClassical = true;
            }
        }

        return hasQuantum && hasClassical;
    }

    /**
     * Assesses the stability risk of the cycle.
     */
    private assessRisk(edges: DependencyType[], nodeIds: string[]): 'LOW' | 'MEDIUM' | 'CRITICAL' {
        const hasMeasurementFeedback = edges.includes(DependencyType.MEASUREMENT_FEEDBACK);
        const hasQuantumState = edges.includes(DependencyType.QUANTUM_STATE);
        
        // Case 1: Purely Classical Recursion
        // Generally safe, standard stack overflow risk.
        if (!hasQuantumState && !hasMeasurementFeedback) {
            return 'LOW';
        }

        // Case 2: Purely Quantum Loop (e.g., Grover iteration)
        // Safe if bounded, but infinite unitary loops are physically impossible without decoherence.
        // We flag as Medium to ensure the compiler checks for loop unrolling or iteration limits.
        if (hasQuantumState && !edges.includes(DependencyType.CLASSICAL_CONTROL) && !hasMeasurementFeedback) {
            return 'MEDIUM';
        }

        // Case 3: Measurement Feedback Loop (Critical)
        // This is a "Classical-Quantum Feedback Loop".
        // Example: Measure Qubit -> If 0 -> Apply Gate -> Measure -> ...
        // If this cycle is tight and lacks termination guarantees, it stalls the QPU control logic.
        if (hasMeasurementFeedback) {
            return 'CRITICAL';
        }

        // Case 4: Hybrid without explicit measurement feedback (e.g. passing quantum handles through classical functions)
        return 'MEDIUM';
    }

    /**
     * Generates the final analysis report.
     */
    private generateReport(): CycleAnalysisResult {
        const diagnostics: string[] = [];
        let isStable = true;

        if (this.detectedCycles.length === 0) {
            return {
                hasCycles: false,
                cycles: [],
                isStable: true,
                diagnostics: ["No cyclic dependencies detected."]
            };
        }

        for (const cycle of this.detectedCycles) {
            const pathStr = cycle.path.map(id => this.nodes.get(id)?.name || id).join(' -> ');
            
            if (cycle.riskLevel === 'CRITICAL') {
                isStable = false;
                diagnostics.push(`[CRITICAL] Unstable Quantum-Classical Feedback Loop detected: ${pathStr}. This cycle involves measurement feedback which may prevent QPU synchronization.`);
            } else if (cycle.riskLevel === 'MEDIUM') {
                diagnostics.push(`[WARNING] Potential infinite quantum state evolution detected: ${pathStr}. Ensure loop termination is guaranteed within coherence time.`);
            } else {
                diagnostics.push(`[INFO] Classical recursion detected: ${pathStr}.`);
            }
        }

        return {
            hasCycles: true,
            cycles: this.detectedCycles,
            isStable,
            diagnostics
        };
    }

    /**
     * Helper to build a dependency graph from a list of AST nodes (simplified).
     * This would typically be called by the compiler pipeline before analysis.
     */
    public static buildGraphFromAST(nodes: ASTNode[]): Map<string, DependencyNode> {
        const graph = new Map<string, DependencyNode>();
        
        // 1. First pass: Register all nodes
        // Implementation depends on specific AST structure of .u
        // This is a placeholder for the integration point.
        
        return graph;
    }
}