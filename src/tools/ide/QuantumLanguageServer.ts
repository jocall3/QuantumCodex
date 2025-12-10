import {
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
    MarkupKind,
    CodeAction,
    CodeActionKind,
    Command,
    ExecuteCommandParams
} from 'vscode-languageserver/node';

import {
    TextDocument
} from 'vscode-languageserver-textdocument';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

// Quantum State Simulation Cache
interface QuantumState {
    qubits: number;
    amplitudes: Record<string, string>; // binary string -> complex number string
    entanglements: Array<[number, number]>;
}

const documentStates: Map<string, QuantumState> = new Map();

connection.onInitialize((params: InitializeParams) => {
    const capabilities = params.capabilities;

    // Does the client support the `workspace/configuration` request?
    // If not, we fall back using global settings.
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

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            // Tell the client that this server supports code completion.
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ['.', ':', '>']
            },
            hoverProvider: true,
            codeActionProvider: true,
            executeCommandProvider: {
                commands: ['quantum.visualize', 'quantum.debug.hybrid']
            }
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

// The example settings
interface QuantumSettings {
    maxSimulationQubits: number;
    autoVisualize: boolean;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
const defaultSettings: QuantumSettings = { maxSimulationQubits: 10, autoVisualize: true };
let globalSettings: QuantumSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<QuantumSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        // Reset all cached document settings
        documentSettings.clear();
    } else {
        globalSettings = <QuantumSettings>(
            (change.settings.quantumLanguageServer || defaultSettings)
        );
    }

    // Revalidate all open text documents
    documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<QuantumSettings> {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'quantumLanguageServer'
        });
        documentSettings.set(resource, result);
    }
    return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
    documentStates.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
    validateTextDocument(change.document);
    analyzeQuantumState(change.document);
});

/**
 * Analyzes the .u file for quantum syntax and simulates a lightweight state
 * for visualization purposes.
 */
function analyzeQuantumState(textDocument: TextDocument): void {
    const text = textDocument.getText();
    const lines = text.split(/\r?\n/);
    
    // Mock simulation logic for the .u language
    let qubitCount = 0;
    const entanglements: Array<[number, number]> = [];
    
    // Simple regex parser for demonstration of the .u language structure
    const qubitDeclRegex = /\bqubit\s+(\w+)/g;
    const entangleRegex = /\bentangle\s+(\w+)\s*,\s*(\w+)/g;
    
    const qubitMap = new Map<string, number>();
    
    let match;
    while ((match = qubitDeclRegex.exec(text)) !== null) {
        qubitMap.set(match[1], qubitCount++);
    }
    
    while ((match = entangleRegex.exec(text)) !== null) {
        const q1 = qubitMap.get(match[1]);
        const q2 = qubitMap.get(match[2]);
        if (q1 !== undefined && q2 !== undefined) {
            entanglements.push([q1, q2]);
        }
    }

    // Construct a mock state vector (amplitudes)
    // In a real implementation, this would interface with the U Compiler/Runtime
    const amplitudes: Record<string, string> = {};
    if (qubitCount > 0) {
        // Default to |0...0>
        const zeroState = '0'.repeat(qubitCount);
        amplitudes[zeroState] = "1.0 + 0.0i";
        
        // If "superposition" keyword exists, split probability
        if (text.includes('superposition')) {
            const oneState = '1'.repeat(qubitCount);
            amplitudes[zeroState] = "0.707 + 0.0i";
            amplitudes[oneState] = "0.707 + 0.0i";
        }
    }

    const newState: QuantumState = {
        qubits: qubitCount,
        amplitudes,
        entanglements
    };

    documentStates.set(textDocument.uri, newState);

    // Send notification to client for real-time visualization
    connection.sendNotification("quantum/stateUpdate", {
        uri: textDocument.uri,
        state: newState
    });
}

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
    const settings = await getDocumentSettings(textDocument.uri);
    const text = textDocument.getText();
    const pattern = /\b(measure|collapse)\b/g;
    let m: RegExpExecArray | null;

    const diagnostics: Diagnostic[] = [];
    
    // 1. Check for measurement without defined qubits
    if (!text.includes('qubit') && (m = pattern.exec(text))) {
        const diagnostic: Diagnostic = {
            severity: DiagnosticSeverity.Error,
            range: {
                start: textDocument.positionAt(m.index),
                end: textDocument.positionAt(m.index + m[0].length)
            },
            message: `Cannot ${m[0]} quantum state without allocating qubits first.`,
            source: 'Quantum Compiler (.u)'
        };
        diagnostics.push(diagnostic);
    }

    // 2. Check for coherence limit warnings (mock logic)
    const lines = text.split(/\r?\n/);
    if (lines.length > 100 && settings.maxSimulationQubits < 20) {
        const diagnostic: Diagnostic = {
            severity: DiagnosticSeverity.Warning,
            range: {
                start: textDocument.positionAt(0),
                end: textDocument.positionAt(10)
            },
            message: `High circuit depth detected. Simulation may diverge from physical execution on current settings.`,
            source: 'Quantum Optimizer'
        };
        diagnostics.push(diagnostic);
    }

    // 3. Validate Entanglement Syntax
    const entangleRegex = /\bentangle\s+(\w+)\s*,\s*(\w+)/g;
    while ((m = entangleRegex.exec(text)) !== null) {
        if (m[1] === m[2]) {
            const diagnostic: Diagnostic = {
                severity: DiagnosticSeverity.Error,
                range: {
                    start: textDocument.positionAt(m.index),
                    end: textDocument.positionAt(m.index + m[0].length)
                },
                message: `Self-entanglement is not a valid operation in .u topology.`,
                source: 'Quantum Topology'
            };
            diagnostics.push(diagnostic);
        }
    }

    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(_change => {
    connection.console.log('We received an file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
    (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
        return [
            {
                label: 'qubit',
                kind: CompletionItemKind.Keyword,
                data: 1,
                detail: 'Allocate a new Qubit',
                documentation: 'Allocates a new logical qubit in the |0> state.'
            },
            {
                label: 'hadamard',
                kind: CompletionItemKind.Function,
                data: 2,
                detail: 'H-Gate',
                documentation: 'Applies a Hadamard gate to create superposition.'
            },
            {
                label: 'cnot',
                kind: CompletionItemKind.Function,
                data: 3,
                detail: 'Controlled-NOT',
                documentation: 'Entangles two qubits.'
            },
            {
                label: 'measure',
                kind: CompletionItemKind.Method,
                data: 4,
                detail: 'Measurement Operator',
                documentation: 'Collapses the wavefunction and returns a classical bit.'
            },
            {
                label: 'u_gate',
                kind: CompletionItemKind.Function,
                data: 5,
                detail: 'Universal Gate',
                documentation: 'Applies an arbitrary rotation defined by theta, phi, lambda.'
            }
        ];
    }
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
    (item: CompletionItem): CompletionItem => {
        if (item.data === 1) {
            item.detail = 'qubit <name>';
            item.documentation = 'Syntax: qubit q1;';
        } else if (item.data === 2) {
            item.detail = 'hadamard(<qubit>)';
            item.documentation = 'Syntax: hadamard(q1);';
        }
        return item;
    }
);

connection.onHover((params: TextDocumentPositionParams): Hover | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const offset = document.offsetAt(params.position);
    const text = document.getText();
    
    // Simple word detection around cursor
    const wordRegex = /[\w]+/g;
    let match;
    let currentWord = "";
    
    while ((match = wordRegex.exec(text)) !== null) {
        if (offset >= match.index && offset <= match.index + match[0].length) {
            currentWord = match[0];
            break;
        }
    }

    if (!currentWord) return null;

    // Check if the word is a known qubit in the current state
    const state = documentStates.get(params.textDocument.uri);
    if (state) {
        // This is a heuristic check, assuming variable names match
        // In a real compiler, we'd have a symbol table
        if (text.includes(`qubit ${currentWord}`)) {
            return {
                contents: {
                    kind: MarkupKind.Markdown,
                    value: `**Quantum Register**: \`${currentWord}\`\n\n` +
                           `**Status**: Coherent\n` +
                           `**Entanglement Degree**: ${getEntanglementDegree(currentWord, state)}`
                }
            };
        }
    }

    if (currentWord === 'superposition') {
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `**Superposition**\n\nA state where the system exists in multiple basis states simultaneously.`
            }
        };
    }

    return null;
});

function getEntanglementDegree(qubitName: string, state: QuantumState): string {
    // Mock logic to determine entanglement based on our simple parser
    // We need to map name to index, which we did in analyzeQuantumState but didn't persist the map.
    // For this single file demo, we return a placeholder or random value.
    const isEntangled = state.entanglements.length > 0; 
    return isEntangled ? "High (Bell State)" : "None (Separable)";
}

connection.onCodeAction((params) => {
    const textDocument = documents.get(params.textDocument.uri);
    if (!textDocument) return undefined;

    const codeActions: CodeAction[] = [];

    // Example: If "measure" is found, offer to add a visualization hook
    for (const diagnostic of params.context.diagnostics) {
        if (diagnostic.source === 'Quantum Optimizer') {
            const action: CodeAction = {
                title: 'Optimize Circuit Depth',
                kind: CodeActionKind.QuickFix,
                command: {
                    title: 'Optimize',
                    command: 'quantum.optimize',
                    arguments: [textDocument.uri]
                }
            };
            codeActions.push(action);
        }
    }

    return codeActions;
});

connection.onExecuteCommand(async (params: ExecuteCommandParams) => {
    if (params.command === 'quantum.visualize') {
        const uri = params.arguments?.[0];
        if (uri) {
            const state = documentStates.get(uri);
            connection.window.showInformationMessage(`Visualizing Quantum State for ${state?.qubits} qubits.`);
            // Trigger client-side visualization panel
            connection.sendNotification('quantum/showVisualizer', { uri });
        }
    }
    
    if (params.command === 'quantum.debug.hybrid') {
        connection.window.showInformationMessage('Starting Hybrid Quantum-Classical Debugger...');
        // Logic to attach to the .u runtime debugger
    }
});

// Listen on the connection
connection.listen();