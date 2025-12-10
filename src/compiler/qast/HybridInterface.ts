import { QASTNode, BaseNode, SourceLocation } from './Core';
import { Expression, Identifier, Statement } from './Classical';
import { QubitReference, QuantumBlock } from './Quantum';
import { Type } from '../types/Types';

/**
 * Enum defining the specific kinds of Hybrid Interface nodes.
 * These identify operations that bridge the Classical/Quantum boundary.
 */
export enum HybridNodeKind {
    QuantumKernelInvocation = 'QuantumKernelInvocation',
    Measure = 'Measure',
    ClassicalFeedback = 'ClassicalFeedback',
    Barrier = 'Barrier',
    HostDeviceTransfer = 'HostDeviceTransfer'
}

/**
 * Abstract base class for all Hybrid Interface Layer nodes.
 * These nodes manage the interaction, synchronization, and data marshalling
 * between the Host (CPU) and the Device (QPU).
 */
export abstract class HybridInterfaceNode extends BaseNode {
    constructor(
        public readonly kind: HybridNodeKind,
        public readonly loc: SourceLocation
    ) {
        super(kind, loc);
    }
}

/**
 * Represents a call to a Quantum Kernel (a distinct quantum program or circuit)
 * from the classical host code.
 * 
 * This node handles:
 * 1. Marshalling classical arguments to quantum parameters (e.g., rotation angles).
 * 2. Mapping classical variables to qubit registers.
 * 3. Triggering the execution of the quantum circuit.
 */
export class QuantumKernelInvocation extends HybridInterfaceNode {
    /**
     * @param kernelName The identifier of the quantum kernel being called.
     * @param args Classical expressions passed as arguments (e.g., angles, loop counts).
     * @param qubitMap Mapping of formal qubit parameters to actual qubit references.
     * @param loc Source location.
     */
    constructor(
        public readonly kernelName: Identifier,
        public readonly args: Expression[],
        public readonly qubitMap: Map<string, QubitReference>,
        loc: SourceLocation
    ) {
        super(HybridNodeKind.QuantumKernelInvocation, loc);
    }

    public accept<T>(visitor: any): T {
        return visitor.visitQuantumKernelInvocation(this);
    }
}

/**
 * Represents a Measurement operation.
 * This is the primary mechanism for extracting data from the Quantum layer
 * back to the Classical layer.
 * 
 * It collapses the quantum state of a qubit and stores the result in a 
 * classical bit/boolean variable.
 */
export class MeasureStatement extends HybridInterfaceNode {
    /**
     * @param sourceQubit The qubit being measured.
     * @param targetVariable The classical variable (or register slot) receiving the result.
     * @param basis The measurement basis (defaults to Z-basis if undefined).
     * @param loc Source location.
     */
    constructor(
        public readonly sourceQubit: QubitReference,
        public readonly targetVariable: Identifier,
        public readonly basis: 'X' | 'Y' | 'Z' = 'Z',
        loc: SourceLocation
    ) {
        super(HybridNodeKind.Measure, loc);
    }

    public accept<T>(visitor: any): T {
        return visitor.visitMeasureStatement(this);
    }
}

/**
 * Represents Classical Feedback Control (Fast Feedback).
 * 
 * This allows for control flow divergence within the quantum execution timeline
 * based on the result of a mid-circuit measurement. This is critical for
 * protocols like Quantum Teleportation or Error Correction.
 */
export class ClassicalFeedbackStatement extends HybridInterfaceNode {
    /**
     * @param condition A classical expression, typically involving a measurement result.
     * @param thenBlock The quantum operations to execute if the condition is true.
     * @param elseBlock The quantum operations to execute if the condition is false (optional).
     * @param loc Source location.
     */
    constructor(
        public readonly condition: Expression,
        public readonly thenBlock: QuantumBlock,
        public readonly elseBlock: QuantumBlock | undefined,
        loc: SourceLocation
    ) {
        super(HybridNodeKind.ClassicalFeedback, loc);
    }

    public accept<T>(visitor: any): T {
        return visitor.visitClassicalFeedbackStatement(this);
    }
}

/**
 * Represents a synchronization barrier.
 * 
 * Ensures that all operations (classical and quantum) preceding the barrier
 * complete before any operations following the barrier begin. This is essential
 * for timing alignment in hybrid algorithms.
 */
export class BarrierStatement extends HybridInterfaceNode {
    /**
     * @param qubits Optional list of specific qubits to apply the barrier to. 
     *               If empty, applies a global barrier across all active qubits.
     * @param loc Source location.
     */
    constructor(
        public readonly qubits: QubitReference[],
        loc: SourceLocation
    ) {
        super(HybridNodeKind.Barrier, loc);
    }

    public accept<T>(visitor: any): T {
        return visitor.visitBarrierStatement(this);
    }
}

/**
 * Defines the direction of data transfer for explicit marshalling nodes.
 */
export enum TransferDirection {
    HostToDevice = 'HostToDevice', // CPU -> QPU
    DeviceToHost = 'DeviceToHost'  // QPU -> CPU
}

/**
 * Represents an explicit data transfer operation between Host and Device memory.
 * 
 * While simple parameters are marshalled via Kernel Invocation, complex data structures
 * (like large arrays of angles for variational algorithms) may require explicit
 * transfer to device memory banks or pulse generators.
 */
export class HostDeviceTransfer extends HybridInterfaceNode {
    /**
     * @param direction The direction of the data flow.
     * @param source The source expression or variable.
     * @param destination The destination identifier.
     * @param dataType The type of data being transferred.
     * @param loc Source location.
     */
    constructor(
        public readonly direction: TransferDirection,
        public readonly source: Expression,
        public readonly destination: Identifier,
        public readonly dataType: Type,
        loc: SourceLocation
    ) {
        super(HybridNodeKind.HostDeviceTransfer, loc);
    }

    public accept<T>(visitor: any): T {
        return visitor.visitHostDeviceTransfer(this);
    }
}