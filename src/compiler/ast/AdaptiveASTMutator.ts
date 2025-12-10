/**
 * @file Implements Adaptive Quantum AST Mutation, allowing runtime modification
 * of the Q-AST based on QPU feedback.
 * @author AI Programmer
 * @project u-lang
 */

// Assuming these types are defined elsewhere in a real project.
// For self-containment, they are defined here.
// --- BEGIN AST & Type Definitions ---

export interface SourceLocation {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export interface ASTNode {
  type: string;
  location: SourceLocation;
}

export interface Identifier extends ASTNode {
  type: 'Identifier';
  name: string;
}

export interface Literal extends ASTNode {
    type: 'Literal';
    value: number | string | boolean;
}

export type Expression = Identifier | Literal;

export interface QubitDeclaration extends ASTNode {
  type: 'QubitDeclaration';
  qubit: Identifier;
  size: number; // For a qubit register
}

export interface GateApplication extends ASTNode {
  type: 'GateApplication';
  gate: Identifier;
  parameters: Expression[];
  targets: Identifier[];
  controls: Identifier[];
}

export interface Measurement extends ASTNode {
  type: 'Measurement';
  qubit: Identifier;
  targetClassicBit: Identifier;
}

export type QuantumOperation = GateApplication | Measurement;

export interface QuantumCircuit extends ASTNode {
  type: 'QuantumCircuit';
  qubits: QubitDeclaration[];
  operations: QuantumOperation[];
}

// --- END AST & Type Definitions ---


// --- BEGIN QPU Feedback Definitions ---

/**
 * Metrics for a single physical qubit.
 */
export interface QubitMetrics {
  /** Single-qubit gate fidelity. */
  fidelity: number;
  /** Readout error probability. */
  readoutError: number;
  /** T1 relaxation time in microseconds. */
  t1Time: number;
  /** T2 decoherence time in microseconds. */
  t2Time: number;
}

/**
 * Metrics for a specific hardware gate.
 */
export interface GateMetrics {
  /** Probability of error during gate execution. */
  errorRate: number;
  /** Gate execution time in nanoseconds. */
  duration: number;
}

/**
 * Represents feedback from a Quantum Processing Unit (QPU) after a calibration
 * or execution cycle. This data is used to adapt the AST for better performance.
 */
export interface QPUFeedback {
  /** Timestamp of when the feedback was generated. */
  timestamp: Date;
  /** Metrics for each physical qubit, mapped by physical qubit index. */
  qubitMetrics: Map<number, QubitMetrics>;
  /** Metrics for hardware-native gates, e.g., 'cx', 'u3'. Mapped by gate name. */
  gateMetrics: Map<string, GateMetrics>;
  /**
   * The QPU's coupling map, representing which pairs of physical qubits
   * can perform two-qubit gates.
   */
  couplingMap: [number, number][];
}

// --- END QPU Feedback Definitions ---

/**
 * Configuration options for the adaptive mutator.
 */
export interface MutatorConfig {
  /**
   * The weight given to qubit fidelity when remapping. Higher values prioritize
   * using the best qubits. Range: 0-1.
   */
  qubitFidelityWeight: number;
  /**
   * The weight given to gate error rates when considering gate swaps or decompositions.
   * Range: 0-1.
   */
  gateErrorWeight: number;
  /**
   * Enable or disable specific mutation strategies.
   */
  strategies: {
    qubitRemapping: boolean;
    gateDecomposition: boolean;
  };
}

/**
 * Default configuration for the mutator.
 */
const DEFAULT_CONFIG: MutatorConfig = {
  qubitFidelityWeight: 0.8,
  gateErrorWeight: 0.6,
  strategies: {
    qubitRemapping: true,
    gateDecomposition: false, // This is a complex strategy, disabled by default
  },
};

type LogicalQubit = string;
type PhysicalQubit = number;
type QubitMapping = Map<LogicalQubit, PhysicalQubit>;

/**
 * The AdaptiveASTMutator analyzes feedback from a QPU and modifies a
 * Quantum Abstract Syntax Tree (Q-AST) to optimize it for the specific
* hardware characteristics. This process, known as hardware-aware compilation,
 * can significantly improve the success rate of quantum algorithms.
 */
export class AdaptiveASTMutator {
  private config: MutatorConfig;
  private lastFeedback: QPUFeedback | null = null;

  /**
   * Creates an instance of the AdaptiveASTMutator.
   * @param config Optional configuration to control mutation strategies.
   */
  constructor(config: Partial<MutatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * The main entry point for mutating an AST. It takes the current AST and
   * the latest feedback from the QPU, then applies a series of optimization
   * strategies.
   *
   * @param ast The QuantumCircuit AST to be mutated.
   * @param feedback The latest calibration and performance data from the QPU.
   * @returns A new, mutated QuantumCircuit AST optimized for the hardware.
   */
  public mutate(ast: QuantumCircuit, feedback: QPUFeedback): QuantumCircuit {
    this.lastFeedback = feedback;

    // Create a deep copy to avoid mutating the original AST
    let mutatedAST: QuantumCircuit = JSON.parse(JSON.stringify(ast));

    if (this.config.strategies.qubitRemapping) {
      mutatedAST = this._applyQubitRemapping(mutatedAST, feedback);
    }

    if (this.config.strategies.gateDecomposition) {
      mutatedAST = this._applyGateDecomposition(mutatedAST, feedback);
    }

    // Future strategies can be added here, e.g.:
    // mutatedAST = this._applyPulseLevelOptimization(mutatedAST, feedback);

    return mutatedAST;
  }

  /**
   * Remaps logical qubits in the AST to the best available physical qubits
   * based on fidelity and error metrics from QPU feedback.
   *
   * @param ast The QuantumCircuit AST.
   * @param feedback The QPU feedback data.
   * @returns A new AST with remapped qubit identifiers.
   */
  private _applyQubitRemapping(ast: QuantumCircuit, feedback: QPUFeedback): QuantumCircuit {
    const logicalQubits = this._extractLogicalQubits(ast);
    if (logicalQubits.length === 0) {
      return ast;
    }

    const physicalQubits = Array.from(feedback.qubitMetrics.keys());
    if (logicalQubits.length > physicalQubits.length) {
      console.warn(`[AdaptiveASTMutator] Warning: Program requires ${logicalQubits.length} qubits, but QPU only has ${physicalQubits.length}. Remapping may be suboptimal.`);
    }

    const bestPhysicalQubits = this._findBestPhysicalQubits(
      logicalQubits.length,
      feedback
    );

    const mapping: QubitMapping = new Map();
    logicalQubits.forEach((logicalId, i) => {
      if (i < bestPhysicalQubits.length) {
        mapping.set(logicalId, bestPhysicalQubits[i]);
      }
    });

    console.log('[AdaptiveASTMutator] Applying qubit remapping:', mapping);

    // In a real compiler, this mapping would be passed to the code generator
    // or a later transpilation stage. For demonstration, we annotate the AST
    // with the mapping information for subsequent stages to use.

    const visitor = (node: ASTNode) => {
        if (node.type === 'GateApplication' || node.type === 'Measurement') {
            const op = node as GateApplication | Measurement;
            const targets = 'targets' in op ? op.targets : [op.qubit];
            const controls = 'controls' in op ? op.controls : [];

            const allQubits = [...targets, ...controls];
            allQubits.forEach(logicalIdent => {
                if (mapping.has(logicalIdent.name)) {
                    // Annotate the identifier node with its physical mapping.
                    (logicalIdent as any).physicalMapping = mapping.get(logicalIdent.name);
                }
            });
        }
    };

    this._traverse(ast, visitor);

    // Add the complete mapping to the top-level circuit node for easy access
    // by the next compiler stage.
    (ast as any).qubitMapping = Object.fromEntries(mapping);

    return ast;
  }

  /**
   * Finds the best set of physical qubits based on a scoring model.
   * @param count The number of physical qubits required.
   * @param feedback The QPU feedback.
   * @returns An array of physical qubit indices, sorted by score.
   */
  private _findBestPhysicalQubits(count: number, feedback: QPUFeedback): PhysicalQubit[] {
    const scoredQubits = Array.from(feedback.qubitMetrics.entries()).map(
      ([id, metrics]) => {
        // Simple scoring model. Lower score is better.
        const score =
          (1 - metrics.fidelity) * this.config.qubitFidelityWeight +
          metrics.readoutError * (1 - this.config.qubitFidelityWeight);
        return { id, score };
      }
    );

    // Sort by score (ascending, lower is better)
    scoredQubits.sort((a, b) => a.score - b.score);

    return scoredQubits.slice(0, count).map(q => q.id);
  }

  /**
   * Extracts all unique logical qubit names from the AST.
   * @param ast The QuantumCircuit AST.
   * @returns An array of logical qubit names.
   */
  private _extractLogicalQubits(ast: QuantumCircuit): LogicalQubit[] {
    const qubitNames = new Set<string>();
    ast.qubits.forEach(qDecl => {
        // Assuming registers q[n] are handled by a later stage,
        // we just care about the base name for now.
        qubitNames.add(qDecl.qubit.name);
    });
    return Array.from(qubitNames);
  }

  /**
   * Placeholder for a strategy that decomposes complex or non-native gates
   * into a sequence of hardware-native gates with the lowest error rates.
   *
   * @param ast The QuantumCircuit AST.
   * @param feedback The QPU feedback data.
   * @returns A new AST with optimized gate decompositions.
   */
  private _applyGateDecomposition(ast: QuantumCircuit, feedback: QPUFeedback): QuantumCircuit {
    console.warn('[AdaptiveASTMutator] Gate decomposition strategy is not yet implemented.');
    // TODO: Implement gate decomposition logic.
    // 1. Identify non-native gates in the AST.
    // 2. For each, find equivalent sequences of native gates (from feedback.gateMetrics.keys()).
    // 3. Calculate the total error and duration for each sequence.
    // 4. Replace the original gate node with the sequence of new GateApplication nodes
    //    that has the lowest composite error rate.
    return ast;
  }

  /**
   * A generic AST traversal utility.
   * @param node The AST node to start traversal from.
   * @param visitor A function to call for each node.
   */
  private _traverse(node: ASTNode, visitor: (node: ASTNode) => void) {
    visitor(node);

    switch (node.type) {
      case 'QuantumCircuit':
        (node as QuantumCircuit).qubits.forEach(q => this._traverse(q, visitor));
        (node as QuantumCircuit).operations.forEach(op => this._traverse(op, visitor));
        break;
      case 'GateApplication':
        const gateApp = node as GateApplication;
        this._traverse(gateApp.gate, visitor);
        gateApp.parameters.forEach(p => this._traverse(p, visitor));
        gateApp.targets.forEach(t => this._traverse(t, visitor));
        gateApp.controls.forEach(c => this._traverse(c, visitor));
        break;
      case 'Measurement':
        const measure = node as Measurement;
        this._traverse(measure.qubit, visitor);
        this._traverse(measure.targetClassicBit, visitor);
        break;
      case 'QubitDeclaration':
        this._traverse((node as QubitDeclaration).qubit, visitor);
        break;
      // Base cases that don't have children to traverse
      case 'Identifier':
      case 'Literal':
        break;
    }
  }
}