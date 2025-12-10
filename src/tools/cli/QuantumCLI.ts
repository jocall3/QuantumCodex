import { Command } from 'commander';
import { exec, ExecException } from 'child_process';
import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid';

// --- Type Definitions for Quantum State ---

type OperationID = string;

interface QuantumOperationBase {
    id: OperationID;
    type: 'superposition' | 'entanglement';
    createdAt: Date;
}

interface SuperpositionState extends QuantumOperationBase {
    type: 'superposition';
    commands: string[];
}

interface EntangledState extends QuantumOperationBase {
    type: 'entanglement';
    commandA: string;
    commandB: string;
}

type QuantumOperation = SuperpositionState | EntangledState;

// --- State Management ---

/**
 * Manages the in-memory state of active quantum operations.
 */
class QuantumStateManager {
    private operations: Map<OperationID, QuantumOperation> = new Map();

    /**
     * Creates and stores a new superposition state.
     * @param commands An array of command strings in superposition.
     * @returns The newly created SuperpositionState object.
     */
    public addSuperposition(commands: string[]): SuperpositionState {
        const state: SuperpositionState = {
            id: uuidv4(),
            type: 'superposition',
            commands,
            createdAt: new Date(),
        };
        this.operations.set(state.id, state);
        return state;
    }

    /**
     * Creates and stores a new entangled state.
     * @param commandA The first command in the entangled pair.
     * @param commandB The second command in the entangled pair.
     * @returns The newly created EntangledState object.
     */
    public addEntanglement(commandA: string, commandB: string): EntangledState {
        const state: EntangledState = {
            id: uuidv4(),
            type: 'entanglement',
            commandA,
            commandB,
            createdAt: new Date(),
        };
        this.operations.set(state.id, state);
        return state;
    }

    /**
     * Retrieves a quantum operation by its ID.
     * @param id The ID of the operation.
     * @returns The operation, or undefined if not found.
     */
    public getOperation(id: OperationID): QuantumOperation | undefined {
        return this.operations.get(id);
    }

    /**
     * Removes a quantum operation from the state.
     * @param id The ID of the operation to remove.
     * @returns True if the operation was found and removed, false otherwise.
     */
    public removeOperation(id: OperationID): boolean {
        return this.operations.delete(id);
    }

    /**
     * Retrieves all active quantum operations.
     * @returns An array of all QuantumOperation objects.
     */
    public getAllOperations(): QuantumOperation[] {
        return Array.from(this.operations.values());
    }
}

// --- Main CLI Class ---

/**
 * Implements the Quantum CLI for the .u language ecosystem.
 * Supports metaphorical quantum operations like superposition and entanglement for shell commands.
 */
export class QuantumCLI {
    private readonly program: Command;
    private readonly stateManager: QuantumStateManager;

    constructor() {
        this.program = new Command();
        this.stateManager = new QuantumStateManager();
        this.setupCommands();
    }

    /**
     * Configures all available CLI commands and options.
     */
    private setupCommands(): void {
        this.program
            .name('u')
            .version('0.1.0-quantum')
            .description('The Quantum CLI for the .u language.');

        this.program
            .command('run <file>')
            .description('Compiles and runs a .u source file (Not yet implemented).')
            .action(this.handleRun);

        this.program
            .command('superpose <commands...>')
            .description('Places multiple shell commands into a superposition.')
            .action((commands) => this.handleSuperpose(commands));

        this.program
            .command('entangle <commandA>')
            .description('Entangles two shell commands, linking their execution outcomes.')
            .requiredOption('-w, --with <commandB>', 'The second command to entangle.')
            .action((commandA, options) => this.handleEntangle(commandA, options));

        this.program
            .command('measure <id>')
            .description('Collapses a quantum operation (superposition or entanglement) to a classical outcome.')
            .action((id) => this.handleMeasure(id));

        this.program
            .command('state')
            .description('Displays the current quantum state (all active operations).')
            .action(() => this.handleState());
    }

    /**
     * Parses command-line arguments and executes the corresponding command.
     * @param argv The command-line arguments array (e.g., process.argv).
     */
    public run(argv: string[]): void {
        this.program.parse(argv);
    }

    // --- Command Handlers ---

    private handleRun(filePath: string): void {
        console.log(chalk.cyan(`Quantum Compiler targeting: ${filePath}`));
        console.log(chalk.yellow('Note: .u language interpreter is not yet implemented.'));
    }

    private handleSuperpose(commands: string[]): void {
        if (commands.length < 2) {
            console.error(chalk.red('Error: Superposition requires at least two commands.'));
            return;
        }
        const state = this.stateManager.addSuperposition(commands);
        console.log(chalk.green('Created superposition |ψ⟩ with ID:'));
        console.log(chalk.yellow(state.id));
    }

    private handleEntangle(commandA: string, options: { with: string }): void {
        const state = this.stateManager.addEntanglement(commandA, options.with);
        console.log(chalk.green('Created entangled pair |Φ+⟩ with ID:'));
        console.log(chalk.yellow(state.id));
    }

    private async handleMeasure(id: OperationID): Promise<void> {
        const operation = this.stateManager.getOperation(id);
        if (!operation) {
            console.error(chalk.red(`Error: No quantum operation found with ID: ${id}`));
            return;
        }

        console.log(chalk.cyan(`\nMeasuring operation ${chalk.yellow(id)}...`));
        console.log(chalk.cyan('Wave function collapsing...'));

        switch (operation.type) {
            case 'superposition':
                await this.measureSuperposition(operation);
                break;
            case 'entanglement':
                await this.measureEntanglement(operation);
                break;
        }

        this.stateManager.removeOperation(id);
        console.log(chalk.gray(`\nOperation ${id} has collapsed and been removed from the quantum state.`));
    }

    private handleState(): void {
        const operations = this.stateManager.getAllOperations();
        if (operations.length === 0) {
            console.log(chalk.green('The quantum state is empty. No active operations.'));
            return;
        }

        console.log(chalk.bold.underline('Active Quantum Operations:'));
        operations.forEach(op => {
            console.log(chalk.cyan(`\nID: ${chalk.yellow(op.id)}`));
            console.log(`  Type: ${chalk.magenta(op.type)}`);
            console.log(`  Age: ${chalk.gray(((new Date().getTime() - op.createdAt.getTime()) / 1000).toFixed(2) + 's')}`);
            if (op.type === 'superposition') {
                console.log(chalk.blue('  Potential Commands:'));
                op.commands.forEach(cmd => console.log(`    - "${cmd}"`));
            } else if (op.type === 'entanglement') {
                console.log(chalk.blue('  Entangled Pair:'));
                console.log(`    A: "${op.commandA}"`);
                console.log(`    B: "${op.commandB}"`);
            }
        });
    }

    // --- Measurement Logic ---

    private async measureSuperposition(op: SuperpositionState): Promise<void> {
        const chosenCommand = op.commands[Math.floor(Math.random() * op.commands.length)];
        console.log(chalk.magenta(`\nCollapsed to outcome: "${chosenCommand}"`));
        
        try {
            const { stdout } = await this.executeShellCommand(chosenCommand);
            console.log(chalk.green.bold('\n--- Observation (stdout) ---'));
            console.log(stdout || chalk.gray('(No output)'));
            console.log(chalk.green.bold('--- End Observation ---'));
        } catch (error: any) {
            console.error(chalk.red.bold('\n--- Observation (stderr) ---'));
            console.error(error.stderr || 'An unknown error occurred during execution.');
            console.error(chalk.red.bold('--- End Observation ---'));
        }
    }

    private async measureEntanglement(op: EntangledState): Promise<void> {
        console.log(chalk.magenta(`\nObserving first part of the pair: "${op.commandA}"`));
        try {
            const { stdout: stdoutA } = await this.executeShellCommand(op.commandA);
            console.log(chalk.green.bold('\n--- Observation A (stdout) ---'));
            console.log(stdoutA || chalk.gray('(No output)'));
            console.log(chalk.green.bold('--- End Observation A ---'));

            console.log(chalk.magenta(`\nEntanglement held. Observing second part: "${op.commandB}"`));
            try {
                const { stdout: stdoutB } = await this.executeShellCommand(op.commandB);
                console.log(chalk.green.bold('\n--- Observation B (stdout) ---'));
                console.log(stdoutB || chalk.gray('(No output)'));
                console.log(chalk.green.bold('--- End Observation B ---'));
                console.log(chalk.cyan.bold('\nResult: Entanglement successful. Both states observed without decoherence.'));
            } catch (errorB: any) {
                console.error(chalk.red.bold('\n--- Observation B (stderr) ---'));
                console.error(errorB.stderr || 'An unknown error occurred during execution.');
                console.error(chalk.red.bold('--- End Observation B ---'));
                console.error(chalk.red.bold('\nResult: Decoherence! Entanglement broken during observation of the second state.'));
            }
        } catch (errorA: any) {
            console.error(chalk.red.bold('\n--- Observation A (stderr) ---'));
            console.error(errorA.stderr || 'An unknown error occurred during execution.');
            console.error(chalk.red.bold('--- End Observation A ---'));
            console.error(chalk.red.bold('\nResult: Decoherence! Entanglement broken during observation of the first state. Second part was not observed.'));
        }
    }

    // --- Utility Methods ---

    /**
     * Executes a shell command in a child process.
     * @param command The command string to execute.
     * @returns A promise that resolves with stdout/stderr or rejects on error.
     */
    private executeShellCommand(command: string): Promise<{ stdout: string; stderr:string }> {
        return new Promise((resolve, reject) => {
            exec(command, (error: ExecException | null, stdout: string, stderr: string) => {
                if (error) {
                    reject({ error, stdout, stderr });
                } else {
                    resolve({ stdout, stderr });
                }
            });
        });
    }
}

// --- Entry Point ---

// This allows the file to be executed directly from the command line.
// In a larger project, this logic would typically be in a dedicated `bin` script.
if (require.main === module) {
    const cli = new QuantumCLI();
    cli.run(process.argv);
}