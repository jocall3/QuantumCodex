/**
 * @file Implements the logic for 'Superposition Commands' within the Q-CLI.
 * This file manages the quantum state associated with superposed and entangled command invocations,
 * providing a simulated quantum computing layer for the terminal.
 *
 * @exports handleSuperpositionCommand - The main entry point for all 'q' commands.
 */

// Represents the global quantum state of the CLI commands.
const quantumSystem = {
    nextId: 1,
    superpositions: new Map(), // Stores superposition objects, keyed by ID.
    entanglements: new Map(), // Stores entanglement groups, keyed by group ID.
    nextEntanglementId: 1,
};

/**
 * Creates a new superposition of commands.
 * Each command provided becomes a basis state with an equal initial probability.
 * @param {string[]} commandStrings - An array of command strings to be put into superposition.
 * @param {object} cli - The CLI instance for outputting messages.
 * @returns {number|null} The ID of the newly created superposition, or null on failure.
 */
function createSuperposition(commandStrings, cli) {
    if (!commandStrings || commandStrings.length < 2) {
        cli.error("Superposition requires at least two commands separated by '|'.");
        cli.error("Example: q create ls -a | ls -l");
        return null;
    }

    const id = quantumSystem.nextId++;
    const numStates = commandStrings.length;
    // For a uniform superposition, the amplitude of each state is 1/sqrt(N).
    const initialAmplitude = Math.sqrt(1 / numStates);

    const states = commandStrings.map(cmd => ({
        command: cmd.trim(),
        amplitude: initialAmplitude,
    }));

    const superposition = {
        id,
        states,
        entanglementGroupId: null,
        isMeasured: false,
        collapsedStateIndex: null,
    };

    quantumSystem.superpositions.set(id, superposition);
    cli.print(`Created superposition #${id} with ${numStates} states.`);
    return id;
}

/**
 * Displays the current quantum state of the system, including all superpositions
 * and their entanglement status.
 * @param {object} cli - The CLI instance for outputting messages.
 */
function displayState(cli) {
    if (quantumSystem.superpositions.size === 0) {
        cli.print("Quantum state is empty. No superpositions exist.");
        return;
    }

    cli.print("--- Quantum System State ---");
    for (const [id, sup] of quantumSystem.superpositions.entries()) {
        let stateStr = `[Superposition #${id}]`;
        if (sup.entanglementGroupId) {
            stateStr += ` (Entangled in group E${sup.entanglementGroupId})`;
        }
        if (sup.isMeasured) {
            const collapsedCmd = sup.states[sup.collapsedStateIndex].command;
            stateStr += ` - COLLAPSED to state |${sup.collapsedStateIndex}>: '${collapsedCmd}'`;
            cli.print(stateStr);
        } else {
            cli.print(stateStr);
            sup.states.forEach((state, index) => {
                const probability = Math.pow(state.amplitude, 2) * 100;
                cli.print(`  |${index}>: ${probability.toFixed(2)}% -> '${state.command}'`);
            });
        }
    }
    cli.print("--------------------------");
}

/**
 * Measures a superposition, collapsing it into a single definite state based on its
 * state amplitudes. If the superposition is entangled, it triggers a measurement of
 * the entire entangled group.
 * @param {number} id - The ID of the superposition to measure.
 * @param {object} cli - The CLI instance for outputting messages.
 * @returns {string|null} The command string of the collapsed state, or null if measurement fails.
 */
function measureSuperposition(id, cli) {
    const superposition = quantumSystem.superpositions.get(id);

    if (!superposition) {
        cli.error(`Superposition #${id} not found.`);
        return null;
    }

    if (superposition.isMeasured) {
        cli.print(`Superposition #${id} has already collapsed.`);
        return superposition.states[superposition.collapsedStateIndex].command;
    }

    // If entangled, the entire group must be measured together.
    if (superposition.entanglementGroupId) {
        return measureEntangledGroup(superposition.entanglementGroupId, cli);
    }

    // Perform probabilistic collapse for a single superposition.
    const rand = Math.random();
    let cumulativeProbability = 0;
    let collapsedIndex = -1;

    for (let i = 0; i < superposition.states.length; i++) {
        cumulativeProbability += Math.pow(superposition.states[i].amplitude, 2);
        if (rand <= cumulativeProbability) {
            collapsedIndex = i;
            break;
        }
    }
    
    // Fallback for floating point inaccuracies.
    if (collapsedIndex === -1) {
        collapsedIndex = superposition.states.length - 1;
    }

    superposition.isMeasured = true;
    superposition.collapsedStateIndex = collapsedIndex;

    const collapsedCommand = superposition.states[collapsedIndex].command;
    cli.print(`Measured #${id}: Collapsed to state |${collapsedIndex}>. Executing: '${collapsedCommand}'`);
    
    return collapsedCommand;
}

/**
 * Measures an entire entangled group, ensuring their states collapse in a correlated way.
 * The collapse of the first unmeasured member determines the outcome for all others.
 * @param {number} groupId - The ID of the entanglement group.
 * @param {object} cli - The CLI instance for outputting messages.
 * @returns {string|null} The command from the first measured superposition in the group.
 */
function measureEntangledGroup(groupId, cli) {
    const entanglement = quantumSystem.entanglements.get(groupId);
    if (!entanglement) {
        cli.error(`Entanglement group E${groupId} not found.`);
        return null;
    }

    // Find the first unmeasured member to act as the driver for the collapse.
    const drivingSuperposition = entanglement.members
        .map(id => quantumSystem.superpositions.get(id))
        .find(sup => sup && !sup.isMeasured);

    if (!drivingSuperposition) {
        cli.print(`Entanglement group E${groupId} has already been measured.`);
        const anyMember = quantumSystem.superpositions.get(entanglement.members[0]);
        return anyMember.states[anyMember.collapsedStateIndex].command;
    }

    // Perform probabilistic collapse for the driving superposition.
    const rand = Math.random();
    let cumulativeProbability = 0;
    let collapsedIndex = -1;

    for (let i = 0; i < drivingSuperposition.states.length; i++) {
        cumulativeProbability += Math.pow(drivingSuperposition.states[i].amplitude, 2);
        if (rand <= cumulativeProbability) {
            collapsedIndex = i;
            break;
        }
    }
    if (collapsedIndex === -1) {
        collapsedIndex = drivingSuperposition.states.length - 1;
    }

    cli.print(`Measuring entangled group E${groupId}... Collapse driven by #${drivingSuperposition.id}.`);
    cli.print(`Group collapsed to correlated state index |${collapsedIndex}>.`);

    let firstCommandToExecute = null;

    // Apply the same collapsed index to all members of the group.
    for (const memberId of entanglement.members) {
        const sup = quantumSystem.superpositions.get(memberId);
        if (sup && !sup.isMeasured) {
            if (collapsedIndex >= sup.states.length) {
                cli.error(`Entanglement error: Superposition #${memberId} has fewer states than the collapsed index.`);
                continue;
            }
            sup.isMeasured = true;
            sup.collapsedStateIndex = collapsedIndex;
            const collapsedCmd = sup.states[collapsedIndex].command;
            cli.print(` -> #${memberId} collapsed to: '${collapsedCmd}'`);
            if (firstCommandToExecute === null) {
                firstCommandToExecute = collapsedCmd;
            }
        }
    }

    return firstCommandToExecute;
}

/**
 * Entangles two or more superpositions.
 * For this simulation, entangled systems must have the same number of basis states.
 * @param {number[]} ids - An array of superposition IDs to entangle.
 * @param {object} cli - The CLI instance for outputting messages.
 */
function entangleSuperpositions(ids, cli) {
    if (ids.length < 2) {
        cli.error("Entanglement requires at least two superposition IDs.");
        return;
    }

    const superpositions = ids.map(id => quantumSystem.superpositions.get(id));

    // Validate all potential members of the entanglement.
    let firstSupStateCount = -1;
    for (let i = 0; i < superpositions.length; i++) {
        const sup = superpositions[i];
        const id = ids[i];
        if (!sup) {
            cli.error(`Superposition #${id} not found.`);
            return;
        }
        if (sup.isMeasured) {
            cli.error(`Cannot entangle #${id}; it has already been measured.`);
            return;
        }
        if (sup.entanglementGroupId) {
            cli.error(`Cannot entangle #${id}; it is already part of group E${sup.entanglementGroupId}.`);
            return;
        }
        if (i === 0) {
            firstSupStateCount = sup.states.length;
        } else if (sup.states.length !== firstSupStateCount) {
            cli.error(`Cannot entangle #${ids[0]} and #${id}: They must have the same number of states.`);
            return;
        }
    }

    const groupId = quantumSystem.nextEntanglementId++;
    quantumSystem.entanglements.set(groupId, { id: groupId, members: ids });

    // Update each superposition to link it to the group.
    ids.forEach(id => {
        quantumSystem.superpositions.get(id).entanglementGroupId = groupId;
    });

    cli.print(`Successfully entangled superpositions ${ids.map(id => `#${id}`).join(', ')} into group E${groupId}.`);
}

/**
 * Main handler for the 'q' (quantum) command. Parses subcommands and delegates to the appropriate functions.
 * @param {string[]} args - The arguments passed to the command.
 * @param {object} cli - The CLI instance, providing `print`, `error`, and `execute` methods.
 */
export async function handleSuperpositionCommand(args, cli) {
    const subCommand = args[0];
    const subArgs = args.slice(1);

    switch (subCommand) {
        case 'create':
        case 'superpose': {
            const commandString = subArgs.join(' ');
            const commands = commandString.split('|').map(s => s.trim()).filter(Boolean);
            createSuperposition(commands, cli);
            break;
        }

        case 'entangle': {
            const ids = subArgs.map(arg => parseInt(arg.replace('#', ''), 10)).filter(id => !isNaN(id));
            entangleSuperpositions(ids, cli);
            break;
        }

        case 'measure': {
            if (subArgs.length === 0) {
                cli.error("Usage: q measure <#id> | all");
                return;
            }
            if (subArgs[0] === 'all') {
                cli.print("Measuring all uncollapsed superpositions...");
                const unmeasuredIds = Array.from(quantumSystem.superpositions.values())
                    .filter(s => !s.isMeasured)
                    .map(s => s.id);
                
                for (const id of unmeasuredIds) {
                    // Re-check if measured, as a prior entanglement measurement might have collapsed it.
                    if (!quantumSystem.superpositions.get(id)?.isMeasured) {
                        const commandToRun = measureSuperposition(id, cli);
                        if (commandToRun) {
                            await cli.execute(commandToRun);
                        }
                    }
                }
            } else {
                const id = parseInt(subArgs[0].replace('#', ''), 10);
                if (isNaN(id)) {
                    cli.error(`Invalid superposition ID: ${subArgs[0]}`);
                    return;
                }
                const commandToRun = measureSuperposition(id, cli);
                if (commandToRun) {
                    await cli.execute(commandToRun);
                }
            }
            break;
        }

        case 'state':
        case 'observe':
            displayState(cli);
            break;
            
        case 'reset':
            quantumSystem.nextId = 1;
            quantumSystem.superpositions.clear();
            quantumSystem.entanglements.clear();
            quantumSystem.nextEntanglementId = 1;
            cli.print("Quantum system has been reset to its ground state.");
            break;

        case 'help':
        default:
            cli.print("Quantum Command System (q)");
            cli.print("Usage: q <subcommand> [options]");
            cli.print("");
            cli.print("Subcommands:");
            cli.print("  create <cmd1> | <cmd2> ... - Creates a superposition of commands.");
            cli.print("  entangle <#id1> <#id2> ... - Entangles two or more superpositions.");
            cli.print("  measure <#id | all>       - Collapses a superposition and executes the resulting command.");
            cli.print("  state                       - Displays the current state of all superpositions.");
            cli.print("  reset                       - Clears all superpositions and entanglements.");
            cli.print("  help                        - Shows this help message.");
            break;
    }
}