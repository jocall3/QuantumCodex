// File: tools/ide/language_server.js

// Imports from vscode-languageserver
const {
    createConnection,
    TextDocuments,
    Diagnostic,
    DiagnosticSeverity,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    CompletionItemKind,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
    Hover,
    MarkupKind
} = require('vscode-languageserver/node');

const {
    TextDocument
} = require('vscode-languageserver-textdocument');

// --- Language Server Setup ---

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params) => {
    const capabilities = params.capabilities;

    // Does the client support the `workspace/configuration` request?
    // If not, we fall back to global settings.
    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    hasDiagnosticRelatedInformationCapability = !!(
        capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation
    );

    const result = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            // Tell the client that the server supports code completion.
            completionProvider: {
                resolveProvider: true
            },
            hoverProvider: true
        }
    };
    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true
            }
        };
    }
    return result;
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
            connection.console.log('Workspace folder change event received.');
        });
    }
});


// --- Q-Script Language Definition & Simulation ---

const QSCRIPT_KEYWORDS = {
    'QREG': {
        description: 'Declares a quantum register. Usage: QREG name[size]',
        kind: CompletionItemKind.Keyword
    },
    'CREG': {
        description: 'Declares a classical register. Usage: CREG name[size]',
        kind: CompletionItemKind.Keyword
    },
    'H': {
        description: 'Hadamard Gate. Puts a qubit into superposition. Usage: H q[index]',
        kind: CompletionItemKind.Function
    },
    'X': {
        description: 'Pauli-X (NOT) Gate. Flips the state of a qubit. Usage: X q[index]',
        kind: CompletionItemKind.Function
    },
    'CX': {
        description: 'Controlled-NOT (CNOT) Gate. Flips the target qubit if the control is |1>. Usage: CX q[control], q[target]',
        kind: CompletionItemKind.Function
    },
    'MEASURE': {
        description: 'Measures a qubit into a classical bit. Usage: MEASURE q[index] -> c[index]',
        kind: CompletionItemKind.Function
    },
    'BARRIER': {
        description: 'Acts as a barrier to prevent gate reordering by compilers. Usage: BARRIER',
        kind: CompletionItemKind.Function
    }
};

/**
 * A very simple quantum circuit simulator.
 * This is for demonstration purposes and not a high-performance simulator.
 */
class QuantumSimulator {
    constructor() {
        this.qubits = 0;
        this.stateVector = []; // Array of complex numbers { re, im }
    }

    /**
     * Initializes the state to |0...0> for a given number of qubits.
     * @param {number} numQubits
     */
    init(numQubits) {
        this.qubits = numQubits;
        const stateSize = Math.pow(2, numQubits);
        this.stateVector = Array(stateSize).fill(null).map(() => ({ re: 0, im: 0 }));
        if (stateSize > 0) {
            this.stateVector[0] = { re: 1, im: 0 };
        }
    }

    /**
     * Applies a single-qubit gate to the state vector.
     * @param {number[][]} gateMatrix 2x2 matrix of complex numbers
     * @param {number} targetQubit The index of the qubit to apply the gate to.
     */
    applyGate(gateMatrix, targetQubit) {
        if (targetQubit >= this.qubits) return;

        const newStateVector = Array(this.stateVector.length).fill(null).map(() => ({ re: 0, im: 0 }));
        const k = this.qubits - 1 - targetQubit;

        for (let i = 0; i < this.stateVector.length; i++) {
            const isBit1 = (i >> k) & 1;
            const basisState0 = i & ~(1 << k);
            const basisState1 = i | (1 << k);

            if (!isBit1) { // This is a |..0..> basis state
                const alpha = this.stateVector[basisState0];
                const beta = this.stateVector[basisState1];

                // newState[basisState0] = gate[0][0]*alpha + gate[0][1]*beta
                newStateVector[basisState0] = this.addComplex(
                    this.mulComplex(gateMatrix[0][0], alpha),
                    this.mulComplex(gateMatrix[0][1], beta)
                );

                // newState[basisState1] = gate[1][0]*alpha + gate[1][1]*beta
                newStateVector[basisState1] = this.addComplex(
                    this.mulComplex(gateMatrix[1][0], alpha),
                    this.mulComplex(gateMatrix[1][1], beta)
                );
            }
        }
        this.stateVector = newStateVector;
    }
    
    /**
     * Applies a CNOT gate.
     * @param {number} controlQubit
     * @param {number} targetQubit
     */
    applyCNOT(controlQubit, targetQubit) {
        if (controlQubit >= this.qubits || targetQubit >= this.qubits) return;

        const newStateVector = [...this.stateVector];
        const controlMask = 1 << (this.qubits - 1 - controlQubit);
        const targetMask = 1 << (this.qubits - 1 - targetQubit);

        for (let i = 0; i < this.stateVector.length; i++) {
            // Apply CNOT only if control bit is 1
            if ((i & controlMask) !== 0) {
                const targetState = i ^ targetMask; // The state with the target bit flipped
                // Swap amplitudes
                const temp = newStateVector[i];
                newStateVector[i] = newStateVector[targetState];
                newStateVector[targetState] = temp;
            }
        }
        // Since we iterate through all states, each swap happens twice.
        // We only need to iterate through half the states where control is 1.
        // A simpler way is to just swap pairs.
        for (let i = 0; i < this.stateVector.length; i++) {
            if ((i & controlMask) !== 0 && (i & targetMask) === 0) {
                const targetState = i | targetMask;
                const temp = this.stateVector[i];
                this.stateVector[i] = this.stateVector[targetState];
                this.stateVector[targetState] = temp;
            }
        }
    }

    // --- Complex number utilities ---
    addComplex(a, b) { return { re: a.re + b.re, im: a.im + b.im }; }
    mulComplex(a, b) { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
}

const GATES = {
    H: [
        [{ re: 1 / Math.sqrt(2), im: 0 }, { re: 1 / Math.sqrt(2), im: 0 }],
        [{ re: 1 / Math.sqrt(2), im: 0 }, { re: -1 / Math.sqrt(2), im: 0 }]
    ],
    X: [
        [{ re: 0, im: 0 }, { re: 1, im: 0 }],
        [{ re: 1, im: 0 }, { re: 0, im: 0 }]
    ]
};


// --- Document Validation and Analysis ---

/**
 * Analyzes the text document for problems and simulates the quantum state.
 * @param {TextDocument} textDocument
 */
async function validateAndAnalyzeDocument(textDocument) {
    const text = textDocument.getText();
    const lines = text.split(/\r?\n/g);
    const diagnostics = [];
    const simulator = new QuantumSimulator();

    const registers = { q: {}, c: {} };
    let qregSize = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lineNumber = i;

        // Skip empty lines and comments
        if (line.length === 0 || line.startsWith('//')) {
            continue;
        }

        const parts = line.split(/\s+/);
        const command = parts[0].toUpperCase();

        if (!QSCRIPT_KEYWORDS[command]) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNumber, character: 0 },
                    end: { line: lineNumber, character: parts[0].length }
                },
                message: `Unknown command: '${parts[0]}'`,
                source: 'qscript-ls'
            });
            continue;
        }

        // --- Command Parsing & Validation ---
        try {
            switch (command) {
                case 'QREG':
                case 'CREG': {
                    const regMatch = parts[1]?.match(/^([a-zA-Z0-9_]+)\[(\d+)]$/);
                    if (!regMatch) {
                        throw new Error(`Invalid register declaration. Expected format: name[size]`);
                    }
                    const [, name, sizeStr] = regMatch;
                    const size = parseInt(sizeStr, 10);
                    if (isNaN(size) || size <= 0) {
                        throw new Error(`Register size must be a positive integer.`);
                    }
                    const regType = command === 'QREG' ? 'q' : 'c';
                    if (registers[regType][name]) {
                        throw new Error(`Register '${name}' is already declared.`);
                    }
                    registers[regType][name] = { size };
                    if (regType === 'q') {
                        // For this simple simulator, we only support one quantum register.
                        if (qregSize > 0) throw new Error('Multiple QREG declarations are not supported by this simulator.');
                        qregSize = size;
                        simulator.init(size);
                    }
                    break;
                }
                case 'H':
                case 'X': {
                    if (qregSize === 0) throw new Error('No quantum register (QREG) declared.');
                    const targetMatch = parts[1]?.match(/^([a-zA-Z0-9_]+)\[(\d+)]$/);
                    if (!targetMatch) throw new Error(`Invalid qubit target. Expected format: qreg_name[index]`);
                    const [, regName, indexStr] = targetMatch;
                    const index = parseInt(indexStr, 10);
                    if (!registers.q[regName]) throw new Error(`Quantum register '${regName}' not declared.`);
                    if (index >= registers.q[regName].size) throw new Error(`Qubit index ${index} is out of bounds for register '${regName}' of size ${registers.q[regName].size}.`);
                    
                    // Apply gate in simulator
                    simulator.applyGate(GATES[command], index);
                    break;
                }
                case 'CX': {
                    if (qregSize === 0) throw new Error('No quantum register (QREG) declared.');
                    const args = parts.slice(1).join('').split(',');
                    if (args.length !== 2) throw new Error('CX gate requires two arguments: control, target.');
                    
                    const controlMatch = args[0]?.match(/^([a-zA-Z0-9_]+)\[(\d+)]$/);
                    const targetMatch = args[1]?.match(/^([a-zA-Z0-9_]+)\[(\d+)]$/);

                    if (!controlMatch || !targetMatch) throw new Error('Invalid CX arguments. Expected format: q[control], q[target]');
                    
                    const [, controlReg, controlIndexStr] = controlMatch;
                    const [, targetReg, targetIndexStr] = targetMatch;
                    const controlIndex = parseInt(controlIndexStr, 10);
                    const targetIndex = parseInt(targetIndexStr, 10);

                    if (!registers.q[controlReg] || !registers.q[targetReg]) throw new Error('Quantum register not declared.');
                    if (controlIndex >= registers.q[controlReg].size || targetIndex >= registers.q[targetReg].size) throw new Error('Qubit index out of bounds.');
                    if (controlIndex === targetIndex) throw new Error('Control and target qubits cannot be the same.');

                    // Apply CNOT in simulator
                    simulator.applyCNOT(controlIndex, targetIndex);
                    break;
                }
                case 'MEASURE':
                case 'BARRIER':
                    // Not implemented in simulator, but syntactically valid.
                    break;
            }
        } catch (e) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNumber, character: 0 },
                    end: { line: lineNumber, character: line.length }
                },
                message: e.message,
                source: 'qscript-ls'
            });
        }
    }

    // Send diagnostics to the client.
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });

    // Send custom notification with the quantum state vector.
    connection.sendNotification('qscript/updateStateVector', {
        uri: textDocument.uri,
        stateVector: simulator.stateVector,
        qubits: simulator.qubits
    });
}


// --- Event Handlers ---

// The content of a text document has changed. This event is emitted
// when the text document is first opened or when its content has changed.
documents.onDidChangeContent(change => {
    validateAndAnalyzeDocument(change.document);
});

connection.onCompletion(
    (_textDocumentPosition) => {
        // The pass parameter contains the position of the text document in
        // which code complete got requested. For now, we return a static list of all keywords.
        return Object.keys(QSCRIPT_KEYWORDS).map(key => ({
            label: key,
            kind: QSCRIPT_KEYWORDS[key].kind,
            data: key
        }));
    }
);

// This handler provides additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
    (item) => {
        if (QSCRIPT_KEYWORDS[item.data]) {
            item.detail = `Q-Script: ${item.data}`;
            item.documentation = QSCRIPT_KEYWORDS[item.data].description;
        }
        return item;
    }
);

connection.onHover(({ textDocument, position }) => {
    const doc = documents.get(textDocument.uri);
    if (!doc) {
        return null;
    }

    const line = doc.getText({ start: { line: position.line, character: 0 }, end: { line: position.line, character: Infinity } });
    const wordMatch = line.match(/\b[a-zA-Z]+\b/g);
    if (!wordMatch) return null;

    let hoveredWord = null;
    let charIndex = 0;
    for (const word of wordMatch) {
        const wordStartIndex = line.indexOf(word, charIndex);
        const wordEndIndex = wordStartIndex + word.length;
        if (position.character >= wordStartIndex && position.character <= wordEndIndex) {
            hoveredWord = word.toUpperCase();
            break;
        }
        charIndex = wordEndIndex;
    }

    if (hoveredWord && QSCRIPT_KEYWORDS[hoveredWord]) {
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: [
                    `**${hoveredWord}**`,
                    '---',
                    QSCRIPT_KEYWORDS[hoveredWord].description
                ].join('\n')
            }
        };
    }

    return null;
});


// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();