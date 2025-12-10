/**
 * @file Contains a collection of standard optimization passes for the classical
 * components of the CQIR (Classical-Quantum Intermediate Representation).
 * These passes aim to improve the efficiency of the classical control logic
 * by applying well-known compiler optimization techniques.
 */

// --- Helper Functions ---

/**
 * Checks if an operand is a constant literal (e.g., a number).
 * @param {*} operand The operand to check.
 * @returns {boolean} True if the operand is a constant.
 */
const isConstant = (operand) => typeof operand === 'number';

/**
 * Checks if an operand is a variable/register identifier.
 * @param {*} operand The operand to check.
 * @returns {boolean} True if the operand is a variable.
 */
const isVariable = (operand) => typeof operand === 'string';

/**
 * Determines if an instruction has side effects.
 * Instructions with side effects (like I/O, memory stores, or function calls)
 * cannot be safely removed even if their result is unused.
 * @param {object} instruction The CQIR instruction.
 * @returns {boolean} True if the instruction is pure (has no side effects).
 */
const isPure = (instruction) => {
    const sideEffectOpcodes = new Set([
        'CALL', 'STORE', 'PRINT', 'READ', // Example side-effect opcodes
        'Q_MEASURE', 'Q_GATE' // Quantum operations are considered to have side effects
    ]);
    return !sideEffectOpcodes.has(instruction.opcode);
};

/**
 * Collects all variables used as operands in an instruction.
 * @param {object} instruction The instruction.
 * @returns {Set<string>} A set of variable names used.
 */
const getUsedVariables = (instruction) => {
    const used = new Set();
    if (instruction.operands) {
        for (const op of instruction.operands) {
            if (isVariable(op)) {
                used.add(op);
            }
        }
    }
    // For conditional jumps, the condition variable is also used
    if (instruction.opcode === 'CJMP' && isVariable(instruction.condition)) {
        used.add(instruction.condition);
    }
    return used;
};


// --- Optimization Passes ---

/**
 * Performs constant folding on arithmetic and logical operations.
 * This pass iterates through all instructions and evaluates expressions
 * where all operands are constants, replacing them with a single MOV instruction.
 *
 * Example:
 *   ADD r1, 10, 5  =>  MOV r1, 15
 *
 * @param {object} func The function object from the CQIR.
 * @returns {boolean} True if the IR was modified, false otherwise.
 */
export function constantFoldingPass(func) {
    let modified = false;

    for (const blockId in func.blocks) {
        const block = func.blocks[blockId];
        const newInstructions = [];

        for (const instr of block.instructions) {
            if (!instr.dest || !instr.operands || instr.operands.some(op => !isConstant(op))) {
                newInstructions.push(instr);
                continue;
            }

            // All operands are constants, let's try to fold.
            let result;
            const [op1, op2] = instr.operands;

            switch (instr.opcode) {
                case 'ADD': result = op1 + op2; break;
                case 'SUB': result = op1 - op2; break;
                case 'MUL': result = op1 * op2; break;
                case 'DIV': result = op1 / op2; break; // Note: potential division by zero
                case 'EQ':  result = (op1 === op2) ? 1 : 0; break;
                case 'NEQ': result = (op1 !== op2) ? 1 : 0; break;
                case 'LT':  result = (op1 < op2) ? 1 : 0; break;
                case 'GT':  result = (op1 > op2) ? 1 : 0; break;
                case 'LTE': result = (op1 <= op2) ? 1 : 0; break;
                case 'GTE': result = (op1 >= op2) ? 1 : 0; break;
                // Add more foldable operations as needed
                default:
                    newInstructions.push(instr);
                    continue; // Not a foldable instruction
            }

            if (result !== undefined) {
                newInstructions.push({
                    opcode: 'MOV',
                    dest: instr.dest,
                    operands: [result]
                });
                modified = true;
            }
        }
        block.instructions = newInstructions;
    }
    return modified;
}

/**
 * Performs dead code elimination (DCE).
 * This pass removes instructions whose results are never used. It works by
 * first performing a global liveness analysis to determine which variables
 * are live at the exit of each basic block, and then sweeping through each
 * block to remove dead instructions.
 *
 * @param {object} func The function object from the CQIR.
 * @returns {boolean} True if the IR was modified, false otherwise.
 */
export function deadCodeEliminationPass(func) {
    // --- 1. Build CFG: predecessors and successors for each block ---
    const successors = {};
    const predecessors = {};
    for (const blockId in func.blocks) {
        successors[blockId] = [];
        predecessors[blockId] = predecessors[blockId] || [];
    }

    for (const blockId in func.blocks) {
        const terminator = func.blocks[blockId].terminator;
        if (terminator.opcode === 'JMP') {
            successors[blockId].push(terminator.target);
            predecessors[terminator.target] = predecessors[terminator.target] || [];
            predecessors[terminator.target].push(blockId);
        } else if (terminator.opcode === 'CJMP') {
            successors[blockId].push(terminator.trueTarget, terminator.falseTarget);
            predecessors[terminator.trueTarget] = predecessors[terminator.trueTarget] || [];
            predecessors[terminator.trueTarget].push(blockId);
            predecessors[terminator.falseTarget] = predecessors[terminator.falseTarget] || [];
            predecessors[terminator.falseTarget].push(blockId);
        }
    }

    // --- 2. Compute USE and DEF sets for each block ---
    const use = {};
    const def = {};
    for (const blockId in func.blocks) {
        const block = func.blocks[blockId];
        const blockUse = new Set();
        const blockDef = new Set();
        
        // Variables used in the terminator
        if (block.terminator.condition && isVariable(block.terminator.condition)) {
            blockUse.add(block.terminator.condition);
        }
        if (block.terminator.opcode === 'RET' && block.terminator.value && isVariable(block.terminator.value)) {
            blockUse.add(block.terminator.value);
        }

        for (const instr of block.instructions) {
            getUsedVariables(instr).forEach(v => {
                if (!blockDef.has(v)) {
                    blockUse.add(v);
                }
            });
            if (instr.dest) {
                blockDef.add(instr.dest);
            }
        }
        use[blockId] = blockUse;
        def[blockId] = blockDef;
    }

    // --- 3. Liveness Analysis (backward dataflow) ---
    const liveIn = {};
    const liveOut = {};
    for (const blockId in func.blocks) {
        liveIn[blockId] = new Set();
        liveOut[blockId] = new Set();
    }

    let changed = true;
    while (changed) {
        changed = false;
        const blockIds = Object.keys(func.blocks).reverse(); // Process in reverse order for faster convergence
        for (const blockId of blockIds) {
            // liveOut[B] = U_{S in succ(B)} liveIn[S]
            const newLiveOut = new Set();
            for (const succId of successors[blockId]) {
                liveIn[succId].forEach(v => newLiveOut.add(v));
            }

            // liveIn[B] = use[B] U (liveOut[B] - def[B])
            const liveOutMinusDef = new Set([...newLiveOut].filter(v => !def[blockId].has(v)));
            const newLiveIn = new Set([...use[blockId], ...liveOutMinusDef]);

            if (newLiveIn.size !== liveIn[blockId].size || ![...newLiveIn].every(v => liveIn[blockId].has(v))) {
                liveIn[blockId] = newLiveIn;
                changed = true;
            }
            liveOut[blockId] = newLiveOut;
        }
    }

    // --- 4. Sweep and eliminate dead instructions ---
    let modified = false;
    for (const blockId in func.blocks) {
        const block = func.blocks[blockId];
        const newInstructions = [];
        const live = new Set(liveOut[blockId]);

        // Add variables used by terminator to initial live set for the block sweep
        if (block.terminator.condition && isVariable(block.terminator.condition)) {
            live.add(block.terminator.condition);
        }
        if (block.terminator.opcode === 'RET' && block.terminator.value && isVariable(block.terminator.value)) {
            live.add(block.terminator.value);
        }

        for (let i = block.instructions.length - 1; i >= 0; i--) {
            const instr = block.instructions[i];
            
            if (instr.dest && !live.has(instr.dest) && isPure(instr)) {
                // This instruction is dead
                modified = true;
                continue;
            }
            
            // This instruction is live, update live set
            if (instr.dest) {
                live.delete(instr.dest);
            }
            getUsedVariables(instr).forEach(v => live.add(v));
            newInstructions.unshift(instr);
        }
        
        if (block.instructions.length !== newInstructions.length) {
            block.instructions = newInstructions;
        }
    }

    return modified;
}


/**
 * Runs a sequence of classical optimization passes until a fixed point is reached.
 * Passes are run repeatedly because one optimization can create opportunities
 * for another (e.g., constant folding can lead to dead code).
 *
 * @param {object} func The function object from the CQIR to optimize.
 * @returns {object} The optimized function object.
 */
export function runClassicalPasses(func) {
    let changedInRound = true;
    const maxRounds = 10; // Safeguard against infinite loops
    let round = 0;

    while (changedInRound && round < maxRounds) {
        changedInRound = false;
        
        // Run constant folding
        if (constantFoldingPass(func)) {
            changedInRound = true;
        }

        // Run dead code elimination
        if (deadCodeEliminationPass(func)) {
            changedInRound = true;
        }

        // Add other passes here in the desired order
        // e.g., if (someOtherPass(func)) { changedInRound = true; }

        round++;
    }

    if (round >= maxRounds) {
        console.warn(`Optimizer reached max rounds (${maxRounds}) for function ${func.name}. May not have reached a fixed point.`);
    }

    return func;
}