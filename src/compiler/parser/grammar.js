/*
 * Q-Script Grammar Definition
 *
 * This file defines the formal grammar for the Q-Script language, designed for
 * a web-based terminal environment. It is intended to be used by a parser
* generator like Jison. The grammar specifies the structure of valid Q-Script
 * programs, encompassing classical control flow, dedicated quantum blocks,
 * hybrid function calls, and the unique Bra-Ket commenting system inspired by
 * Dirac notation.
 *
 * The grammar rules are designed to produce an Abstract Syntax Tree (AST)
 * that can be consumed by a compiler or interpreter.
 *
 * Assumed Tokens from Lexer:
 * IDENTIFIER, NUMBER, STRING, true, false, null,
 * let, const, if, else, while, for, function, return,
 * quantum, qdef, measure,
 * +, -, *, /, %, **, =, ==, !=, <, >, <=, >=, &&, ||, !,
 * (, ), {, }, [, ], ,, ;, ., ->,
 * BRA_KET_COMMENT (e.g., <any|text|here>)
 */

const grammar = {
    // Operator precedence and associativity, from lowest to highest.
    operators: [
        ['left', '||'],
        ['left', '&&'],
        ['left', '==', '!='],
        ['left', '<', '>', '<=', '>='],
        ['left', '+', '-'],
        ['left', '*', '/', '%'],
        ['right', '**'],
        ['right', 'UMINUS'], // Custom precedence for unary minus
        ['right', '!'],
    ],

    // The grammar rules in a format similar to Backus-Naur Form (BNF).
    // Each rule's action is a string of JavaScript code that builds an AST node.
    // `$$` represents the result of the rule, `$1`, `$2`, etc., represent the matched symbols.
    bnf: {
        // --- Program Entry Point ---
        Program: [
            ['StatementList', 'return { type: "Program", body: $1 };']
        ],

        StatementList: [
            ['', '$$ = [];'], // Handle empty programs
            ['Statement', '$$ = [$1];'],
            ['StatementList Statement', '$1.push($2); $$ = $1;']
        ],

        // --- General Statements ---
        Statement: [
            'ExpressionStatement',
            'BlockStatement',
            'EmptyStatement',
            'VariableStatement',
            'IfStatement',
            'IterationStatement',
            'FunctionDeclaration',
            'ReturnStatement',
            'QuantumBlock',
            'BraKetComment' // Comments are part of the AST for rich rendering
        ],

        EmptyStatement: [
            [';', '$$ = { type: "EmptyStatement" };']
        ],

        BlockStatement: [
            ['{ StatementList }', '$$ = { type: "BlockStatement", body: $2 };'],
            ['{ }', '$$ = { type: "BlockStatement", body: [] };']
        ],

        // --- Bra-Ket Commenting System ---
        BraKetComment: [
            // The lexer should provide the full comment token, including delimiters.
            ['BRA_KET_COMMENT', '$$ = { type: "BraKetComment", value: $1.substring(1, $1.length - 1) };']
        ],

        // --- Classical Statements ---
        VariableStatement: [
            ['VariableDeclarationList ;', '$$ = { type: "VariableStatement", declarations: $1 };']
        ],

        VariableDeclarationList: [
            ['VariableDeclaration', '$$ = [$1];'],
            ['VariableDeclarationList , VariableDeclaration', '$1.push($3); $$ = $1;']
        ],

        VariableDeclaration: [
            ['let IDENTIFIER', '$$ = { type: "VariableDeclarator", id: { type: "Identifier", name: $2 }, init: null, kind: "let" };'],
            ['let IDENTIFIER = AssignmentExpression', '$$ = { type: "VariableDeclarator", id: { type: "Identifier", name: $2 }, init: $4, kind: "let" };'],
            ['const IDENTIFIER = AssignmentExpression', '$$ = { type: "VariableDeclarator", id: { type: "Identifier", name: $2 }, init: $4, kind: "const" };']
        ],

        IfStatement: [
            ['if ( Expression ) Statement', '$$ = { type: "IfStatement", test: $3, consequent: $5, alternate: null };'],
            ['if ( Expression ) Statement else Statement', '$$ = { type: "IfStatement", test: $3, consequent: $5, alternate: $7 };']
        ],

        IterationStatement: [
            'WhileStatement',
            'ForStatement'
        ],

        WhileStatement: [
            ['while ( Expression ) Statement', '$$ = { type: "WhileStatement", test: $3, body: $5 };']
        ],

        ForStatement: [
            ['for ( VariableStatement Expression ; Expression ) Statement', '$$ = { type: "ForStatement", init: $3, test: $4, update: $6, body: $8 };'],
            ['for ( ExpressionStatement Expression ; Expression ) Statement', '$$ = { type: "ForStatement", init: $3, test: $4, update: $6, body: $8 };'],
            ['for ( ; Expression ; Expression ) Statement', '$$ = { type: "ForStatement", init: null, test: $3, update: $5, body: $7 };'],
            ['for ( ; ; ) Statement', '$$ = { type: "ForStatement", init: null, test: null, update: null, body: $5 };']
        ],

        FunctionDeclaration: [
            ['function IDENTIFIER ( FormalParameterList ) BlockStatement', '$$ = { type: "FunctionDeclaration", id: { type: "Identifier", name: $2 }, params: $4, body: $6, async: false };'],
            ['function IDENTIFIER ( ) BlockStatement', '$$ = { type: "FunctionDeclaration", id: { type: "Identifier", name: $2 }, params: [], body: $5, async: false };']
        ],

        FormalParameterList: [
            ['IDENTIFIER', '$$ = [{ type: "Identifier", name: $1 }];'],
            ['FormalParameterList , IDENTIFIER', '$1.push({ type: "Identifier", name: $3 }); $$ = $1;']
        ],

        ReturnStatement: [
            ['return ;', '$$ = { type: "ReturnStatement", argument: null };'],
            ['return Expression ;', '$$ = { type: "ReturnStatement", argument: $2 };']
        ],

        ExpressionStatement: [
            ['Expression ;', '$$ = { type: "ExpressionStatement", expression: $1 };']
        ],

        // --- Quantum Constructs ---
        QuantumBlock: [
            ['quantum { QuantumStatementList }', '$$ = { type: "QuantumBlock", body: $3 };'],
            ['quantum { }', '$$ = { type: "QuantumBlock", body: [] };']
        ],

        QuantumStatementList: [
            ['', '$$ = [];'],
            ['QuantumStatement', '$$ = [$1];'],
            ['QuantumStatementList QuantumStatement', '$1.push($2); $$ = $1;']
        ],

        QuantumStatement: [
            'QubitDeclaration',
            'GateApplication',
            'Measurement',
            'BraKetComment' // Comments are also valid inside quantum blocks
        ],

        QubitDeclaration: [
            ['qdef IDENTIFIER ;', '$$ = { type: "QubitDeclaration", id: { type: "Identifier", name: $2 }, size: { type: "Literal", value: 1 } };'],
            ['qdef IDENTIFIER [ NUMBER ] ;', '$$ = { type: "QubitDeclaration", id: { type: "Identifier", name: $2 }, size: { type: "Literal", value: parseInt($4, 10) } };']
        ],

        GateApplication: [
            ['IDENTIFIER QubitList ;', '$$ = { type: "GateApplication", gate: { type: "Identifier", name: $1 }, params: [], targets: $2 };'],
            ['IDENTIFIER ( ExpressionList ) QubitList ;', '$$ = { type: "GateApplication", gate: { type: "Identifier", name: $1 }, params: $3, targets: $5 };']
        ],

        QubitList: [
            ['IDENTIFIER', '$$ = [{ type: "Identifier", name: $1 }];'],
            ['QubitList , IDENTIFIER', '$1.push({ type: "Identifier", name: $3 }); $$ = $1;']
        ],

        Measurement: [
            ['measure QubitList -> IDENTIFIER ;', '$$ = { type: "Measurement", source: $2, destination: { type: "Identifier", name: $4 } };']
        ],

        // --- Expressions (following standard precedence) ---
        Expression: ['AssignmentExpression'],

        AssignmentExpression: [
            ['LeftHandSideExpression = AssignmentExpression', '$$ = { type: "AssignmentExpression", operator: "=", left: $1, right: $3 };'],
            'LogicalORExpression'
        ],

        LogicalORExpression: [
            ['LogicalORExpression || LogicalANDExpression', '$$ = { type: "LogicalExpression", operator: "||", left: $1, right: $3 };'],
            'LogicalANDExpression'
        ],

        LogicalANDExpression: [
            ['LogicalANDExpression && EqualityExpression', '$$ = { type: "LogicalExpression", operator: "&&", left: $1, right: $3 };'],
            'EqualityExpression'
        ],

        EqualityExpression: [
            ['EqualityExpression == RelationalExpression', '$$ = { type: "BinaryExpression", operator: "==", left: $1, right: $3 };'],
            ['EqualityExpression != RelationalExpression', '$$ = { type: "BinaryExpression", operator: "!=", left: $1, right: $3 };'],
            'RelationalExpression'
        ],

        RelationalExpression: [
            ['RelationalExpression < AdditiveExpression', '$$ = { type: "BinaryExpression", operator: "<", left: $1, right: $3 };'],
            ['RelationalExpression > AdditiveExpression', '$$ = { type: "BinaryExpression", operator: ">", left: $1, right: $3 };'],
            ['RelationalExpression <= AdditiveExpression', '$$ = { type: "BinaryExpression", operator: "<=", left: $1, right: $3 };'],
            ['RelationalExpression >= AdditiveExpression', '$$ = { type: "BinaryExpression", operator: ">=", left: $1, right: $3 };'],
            'AdditiveExpression'
        ],

        AdditiveExpression: [
            ['AdditiveExpression + MultiplicativeExpression', '$$ = { type: "BinaryExpression", operator: "+", left: $1, right: $3 };'],
            ['AdditiveExpression - MultiplicativeExpression', '$$ = { type: "BinaryExpression", operator: "-", left: $1, right: $3 };'],
            'MultiplicativeExpression'
        ],

        MultiplicativeExpression: [
            ['MultiplicativeExpression * UnaryExpression', '$$ = { type: "BinaryExpression", operator: "*", left: $1, right: $3 };'],
            ['MultiplicativeExpression / UnaryExpression', '$$ = { type: "BinaryExpression", operator: "/", left: $1, right: $3 };'],
            ['MultiplicativeExpression % UnaryExpression', '$$ = { type: "BinaryExpression", operator: "%", left: $1, right: $3 };'],
            'UnaryExpression'
        ],

        UnaryExpression: [
            ['- UnaryExpression', { prec: 'UMINUS', action: '$$ = { type: "UnaryExpression", operator: "-", argument: $2, prefix: true };' }],
            ['! UnaryExpression', '$$ = { type: "UnaryExpression", operator: "!", argument: $2, prefix: true };'],
            'LeftHandSideExpression'
        ],

        LeftHandSideExpression: [
            'CallExpression',
            'MemberExpression'
        ],

        CallExpression: [
            ['MemberExpression ( ArgumentList )', '$$ = { type: "CallExpression", callee: $1, arguments: $3 };'],
            ['MemberExpression ( )', '$$ = { type: "CallExpression", callee: $1, arguments: [] };']
        ],

        ArgumentList: [
            ['AssignmentExpression', '$$ = [$1];'],
            ['ArgumentList , AssignmentExpression', '$1.push($3); $$ = $1;']
        ],

        MemberExpression: [
            'PrimaryExpression',
            ['MemberExpression [ Expression ]', '$$ = { type: "MemberExpression", computed: true, object: $1, property: $3 };'],
            ['MemberExpression . IDENTIFIER', '$$ = { type: "MemberExpression", computed: false, object: $1, property: { type: "Identifier", name: $3 } };']
        ],

        PrimaryExpression: [
            ['IDENTIFIER', '$$ = { type: "Identifier", name: $1 };'],
            'Literal',
            ['( Expression )', '$$ = $2;']
        ],

        // --- Literals ---
        Literal: [
            'NumericLiteral',
            'StringLiteral',
            'BooleanLiteral',
            'NullLiteral'
        ],

        NumericLiteral: [
            ['NUMBER', '$$ = { type: "Literal", value: Number($1), raw: $1 };']
        ],

        StringLiteral: [
            ['STRING', '$$ = { type: "Literal", value: $1.slice(1, -1), raw: $1 };']
        ],

        BooleanLiteral: [
            ['true', '$$ = { type: "Literal", value: true, raw: "true" };'],
            ['false', '$$ = { type: "Literal", value: false, raw: "false" };']
        ],

        NullLiteral: [
            ['null', '$$ = { type: "Literal", value: null, raw: "null" };']
        ],

        // --- Helper for Quantum Gate Parameter Lists ---
        ExpressionList: [
            ['Expression', '$$ = [$1];'],
            ['ExpressionList , Expression', '$1.push($3); $$ = $1;']
        ]
    }
};

// Export the grammar for use by a parser generator.
// This format is compatible with both CommonJS and can be adapted for ES Modules.
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = grammar;
}