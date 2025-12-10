import { ExecutionContext } from '../context/ExecutionContext';
import { CPUExecutor } from './CPUExecutor';
import { QPUExecutor } from './QPUExecutor';
import { Program, ExecutionBlock, BlockType, ExecutionResult } from '../../types/RuntimeTypes';
import { Logger } from '../../utils/Logger';
import { RuntimeException } from '../../errors/RuntimeException';

/**
 * InterleavedExecutor
 * 
 * This class is the core engine for the .u language runtime. It orchestrates the execution
 * of hybrid quantum-classical programs by managing the control flow between the Classical Processing Unit (CPU)
 * and the Quantum Processing Unit (QPU).
 * 
 * It analyzes the execution blocks of a parsed program and delegates execution to the appropriate
 * sub-executor, handling memory synchronization and context switching (handoffs) transparently.
 */
export class InterleavedExecutor {
    private cpuExecutor: CPUExecutor;
    private qpuExecutor: QPUExecutor;
    private logger: Logger;
    private executionMetrics: {
        cpuTime: number;
        qpuTime: number;
        handoffs: number;
    };

    constructor(cpuExecutor: CPUExecutor, qpuExecutor: QPUExecutor) {
        this.cpuExecutor = cpuExecutor;
        this.qpuExecutor = qpuExecutor;
        this.logger = new Logger('InterleavedExecutor');
        this.executionMetrics = {
            cpuTime: 0,
            qpuTime: 0,
            handoffs: 0
        };
    }

    /**
     * Executes a full .u program containing interleaved quantum and classical layers.
     * 
     * @param program The parsed program structure containing execution blocks.
     * @param context The shared execution memory context (registers, heap, qubits).
     */
    public async execute(program: Program, context: ExecutionContext): Promise<ExecutionResult> {
        this.logger.info(`Starting execution of program: ${program.id}`);
        const startTime = Date.now();

        try {
            // Validate program structure before execution
            this.validateProgram(program);

            for (const block of program.blocks) {
                await this.dispatchBlock(block, context);
            }

            const totalTime = Date.now() - startTime;
            this.logger.info(`Execution completed successfully in ${totalTime}ms.`);
            this.logMetrics();

            return {
                success: true,
                output: context.getOutputBuffer(),
                metrics: this.executionMetrics
            };

        } catch (error) {
            this.logger.error('Execution failed during interleaved processing', error);
            return {
                success: false,
                error: error instanceof Error ? error : new Error(String(error)),
                metrics: this.executionMetrics
            };
        }
    }

    /**
     * Dispatches a single execution block to the appropriate hardware abstraction layer.
     * Handles the "handoff" logic, ensuring memory consistency before switching modes.
     */
    private async dispatchBlock(block: ExecutionBlock, context: ExecutionContext): Promise<void> {
        const startBlockTime = Date.now();

        switch (block.type) {
            case BlockType.CLASSICAL:
                await this.handleClassicalBlock(block, context);
                this.executionMetrics.cpuTime += (Date.now() - startBlockTime);
                break;

            case BlockType.QUANTUM:
                await this.handleQuantumBlock(block, context);
                this.executionMetrics.qpuTime += (Date.now() - startBlockTime);
                break;

            case BlockType.HYBRID_CONTROL:
                // Special block type for tight loops involving both (e.g., VQE optimization loops)
                await this.handleHybridBlock(block, context);
                break;

            default:
                throw new RuntimeException(`Unknown execution block type: ${(block as any).type}`);
        }
    }

    /**
     * Manages execution on the CPU.
     * Ensures that any pending quantum measurement results are available in the classical registers.
     */
    private async handleClassicalBlock(block: ExecutionBlock, context: ExecutionContext): Promise<void> {
        if (context.isQuantumStateDirty()) {
            this.logger.debug('Handoff: QPU -> CPU. Synchronizing measurement registers.');
            this.executionMetrics.handoffs++;
            context.syncQuantumResultsToClassical();
        }

        this.logger.debug(`Executing Classical Block ${block.id}`);
        await this.cpuExecutor.executeBlock(block, context);
    }

    /**
     * Manages execution on the QPU.
     * Ensures that classical parameters (e.g., rotation angles calculated by CPU) are injected into the quantum circuit.
     */
    private async handleQuantumBlock(block: ExecutionBlock, context: ExecutionContext): Promise<void> {
        if (context.isClassicalStateDirty()) {
            this.logger.debug('Handoff: CPU -> QPU. Injecting classical parameters.');
            this.executionMetrics.handoffs++;
            context.syncClassicalParamsToQuantum();
        }

        this.logger.debug(`Executing Quantum Block ${block.id}`);
        
        // Check if QPU is available or if we need to queue
        if (!this.qpuExecutor.isReady()) {
            this.logger.warn('QPU busy, waiting for availability...');
            await this.qpuExecutor.waitForAvailability();
        }

        await this.qpuExecutor.executeBlock(block, context);
    }

    /**
     * Handles complex hybrid control flow structures where context switching happens rapidly
     * or requires specific optimization (e.g., variational loops).
     */
    private async handleHybridBlock(block: ExecutionBlock, context: ExecutionContext): Promise<void> {
        this.logger.debug(`Entering Hybrid Control Block ${block.id}`);
        
        // Example: A loop where CPU updates parameters based on QPU output
        // This is a simplified representation of a variational loop
        let iterations = 0;
        const maxIterations = block.metadata?.maxIterations || 100;

        while (!context.evaluateCondition(block.condition) && iterations < maxIterations) {
            // 1. Run Quantum Circuit
            await this.handleQuantumBlock(block.subBlocks.quantum, context);
            
            // 2. Run Classical Optimization Step
            await this.handleClassicalBlock(block.subBlocks.classical, context);
            
            iterations++;
        }

        if (iterations >= maxIterations) {
            this.logger.warn(`Hybrid block ${block.id} terminated due to iteration limit.`);
        }
    }

    private validateProgram(program: Program): void {
        if (!program || !Array.isArray(program.blocks)) {
            throw new RuntimeException("Invalid program structure: Missing execution blocks.");
        }
        if (program.version !== 1) {
            this.logger.warn(`Program version ${program.version} differs from runtime version 1.`);
        }
    }

    private logMetrics(): void {
        this.logger.info('--- Execution Metrics ---');
        this.logger.info(`CPU Time: ${this.executionMetrics.cpuTime}ms`);
        this.logger.info(`QPU Time: ${this.executionMetrics.qpuTime}ms`);
        this.logger.info(`Context Switches (Handoffs): ${this.executionMetrics.handoffs}`);
        this.logger.info('-------------------------');
    }
}