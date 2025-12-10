import Parser from '../../src/compiler/parser';
import Lexer from '../../src/compiler/lexer';

// Helper function to simplify parsing in tests and check for errors
const parseProgram = (source) => {
    const lexer = new Lexer(source);
    const parser = new Parser(lexer);
    const program = parser.parse();
    const errors = parser.getErrors();

    if (errors.length > 0) {
        throw new Error(`Parser encountered errors: \n${errors.join('\n')}`);
    }

    return program;
};

// Helper to check for specific parsing errors
const expectParseError = (source, expectedError) => {
    const lexer = new Lexer(source);
    const parser = new Parser(lexer);
    parser.parse();
    const errors = parser.getErrors();
    expect(errors.length).toBeGreaterThan(0);
    if (expectedError) {
        // Check if at least one error message contains the expected substring
        expect(errors.some(e => e.includes(expectedError))).toBe(true);
    }
};

describe('Q-Script Parser', () => {

    describe('Literals', () => {
        test('should parse numeric literals', () => {
            const source = '42;';
            const ast = parseProgram(source);
            expect(ast.body[0].type).toBe('ExpressionStatement');
            expect(ast.body[0].expression).toEqual({
                type: 'NumericLiteral',
                value: 42,
            });
        });

        test('should parse string literals', () => {
            const source = '"hello world";';
            const ast = parseProgram(source);
            expect(ast.body[0].type).toBe('ExpressionStatement');
            expect(ast.body[0].expression).toEqual({
                type: 'StringLiteral',
                value: 'hello world',
            });
        });

        test('should parse boolean literals', () => {
            let source = 'true;';
            let ast = parseProgram(source);
            expect(ast.body[0].expression).toEqual({
                type: 'BooleanLiteral',
                value: true,
            });

            source = 'false;';
            ast = parseProgram(source);
            expect(ast.body[0].expression).toEqual({
                type: 'BooleanLiteral',
                value: false,
            });
        });

        test('should parse null literal', () => {
            const source = 'null;';
            const ast = parseProgram(source);
            expect(ast.body[0].expression).toEqual({
                type: 'NullLiteral',
                value: null,
            });
        });
    });

    describe('Variable Declarations', () => {
        test('should parse a let declaration with initializer', () => {
            const source = 'let x = 10;';
            const ast = parseProgram(source);
            const stmt = ast.body[0];
            expect(stmt.type).toBe('VariableDeclaration');
            expect(stmt.kind).toBe('let');
            expect(stmt.declarations[0].id.name).toBe('x');
            expect(stmt.declarations[0].init.value).toBe(10);
        });

        test('should parse a const declaration with initializer', () => {
            const source = 'const PI = 3.14;';
            const ast = parseProgram(source);
            const stmt = ast.body[0];
            expect(stmt.type).toBe('VariableDeclaration');
            expect(stmt.kind).toBe('const');
            expect(stmt.declarations[0].id.name).toBe('PI');
            expect(stmt.declarations[0].init.value).toBe(3.14);
        });

        test('should parse a let declaration without initializer', () => {
            const source = 'let y;';
            const ast = parseProgram(source);
            const stmt = ast.body[0];
            expect(stmt.type).toBe('VariableDeclaration');
            expect(stmt.kind).toBe('let');
            expect(stmt.declarations[0].id.name).toBe('y');
            expect(stmt.declarations[0].init).toBe(null);
        });

        test('should throw on const declaration without initializer', () => {
            expectParseError('const Z;', 'Constant variable must be initialized');
        });
    });

    describe('Expressions', () => {
        test('should parse identifier expressions', () => {
            const source = 'myVar;';
            const ast = parseProgram(source);
            expect(ast.body[0].expression).toEqual({
                type: 'Identifier',
                name: 'myVar',
            });
        });

        test('should parse unary expressions', () => {
            const testCases = [
                { source: '!true;', operator: '!', argument: { type: 'BooleanLiteral', value: true } },
                { source: '-15;', operator: '-', argument: { type: 'NumericLiteral', value: 15 } },
            ];

            testCases.forEach(({ source, operator, argument }) => {
                const ast = parseProgram(source);
                const expr = ast.body[0].expression;
                expect(expr.type).toBe('UnaryExpression');
                expect(expr.operator).toBe(operator);
                expect(expr.argument).toEqual(argument);
            });
        });

        test('should parse binary expressions', () => {
            const testCases = [
                { source: '5 + 5;', left: 5, operator: '+', right: 5 },
                { source: '10 - 2;', left: 10, operator: '-', right: 2 },
                { source: '2 * 8;', left: 2, operator: '*', right: 8 },
                { source: '16 / 4;', left: 16, operator: '/', right: 4 },
                { source: '10 % 3;', left: 10, operator: '%', right: 3 },
                { source: 'a > b;', left: 'a', operator: '>', right: 'b' },
                { source: 'a < b;', left: 'a', operator: '<', right: 'b' },
                { source: 'a >= b;', left: 'a', operator: '>=', right: 'b' },
                { source: 'a <= b;', left: 'a', operator: '<=', right: 'b' },
                { source: 'a == b;', left: 'a', operator: '==', right: 'b' },
                { source: 'a != b;', left: 'a', operator: '!=', right: 'b' },
            ];

            testCases.forEach(({ source, left, operator, right }) => {
                const ast = parseProgram(source);
                const expr = ast.body[0].expression;
                expect(expr.type).toBe('BinaryExpression');
                expect(expr.operator).toBe(operator);
                if (typeof left === 'number') {
                    expect(expr.left.value).toBe(left);
                } else {
                    expect(expr.left.name).toBe(left);
                }
                if (typeof right === 'number') {
                    expect(expr.right.value).toBe(right);
                } else {
                    expect(expr.right.name).toBe(right);
                }
            });
        });

        test('should parse logical expressions', () => {
            const testCases = [
                { source: 'true && false;', left: true, operator: '&&', right: false },
                { source: 'a || b;', left: 'a', operator: '||', right: 'b' },
            ];

            testCases.forEach(({ source, operator }) => {
                const ast = parseProgram(source);
                const expr = ast.body[0].expression;
                expect(expr.type).toBe('LogicalExpression');
                expect(expr.operator).toBe(operator);
            });
        });

        test('should handle operator precedence correctly', () => {
            const testCases = {
                '1 + 2 * 3;': '(1 + (2 * 3))',
                '(1 + 2) * 3;': '((1 + 2) * 3)',
                'a + b / c;': '(a + (b / c))',
                'a * b + c;': '((a * b) + c)',
                '1 + 2 + 3;': '((1 + 2) + 3)',
                'true || false && true;': '(true || (false && true))',
                '-a * b': '((-a) * b)',
                'a + -b': '(a + (-b))',
                '5 > 4 == 3 < 4': '((5 > 4) == (3 < 4))',
            };

            // A simple stringifier for AST expressions to check structure
            const stringify = (node) => {
                if (!node) return '';
                if (node.type === 'NumericLiteral') return node.value.toString();
                if (node.type === 'Identifier') return node.name;
                if (node.type === 'BooleanLiteral') return node.value.toString();
                if (node.type === 'UnaryExpression') return `(${node.operator}${stringify(node.argument)})`;
                if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
                    return `(${stringify(node.left)} ${node.operator} ${stringify(node.right)})`;
                }
                return '';
            };

            Object.entries(testCases).forEach(([source, expected]) => {
                const ast = parseProgram(source);
                const expr = ast.body[0].expression;
                expect(stringify(expr)).toBe(expected);
            });
        });

        test('should parse assignment expressions', () => {
            const source = 'x = 10;';
            const ast = parseProgram(source);
            const expr = ast.body[0].expression;
            expect(expr.type).toBe('AssignmentExpression');
            expect(expr.operator).toBe('=');
            expect(expr.left.name).toBe('x');
            expect(expr.right.value).toBe(10);
        });
    });

    describe('Statements', () => {
        test('should parse block statements', () => {
            const source = '{ let a = 1; a + 1; }';
            const ast = parseProgram(source);
            const stmt = ast.body[0];
            expect(stmt.type).toBe('BlockStatement');
            expect(stmt.body.length).toBe(2);
            expect(stmt.body[0].type).toBe('VariableDeclaration');
            expect(stmt.body[1].type).toBe('ExpressionStatement');
        });

        test('should parse if statements', () => {
            const source = 'if (x > 5) { x = 1; }';
            const ast = parseProgram(source);
            const stmt = ast.body[0];
            expect(stmt.type).toBe('IfStatement');
            expect(stmt.test.type).toBe('BinaryExpression');
            expect(stmt.consequent.type).toBe('BlockStatement');
            expect(stmt.alternate).toBe(null);
        });

        test('should parse if-else statements', () => {
            const source = 'if (x < 10) { x = 2; } else { x = 3; }';
            const ast = parseProgram(source);
            const stmt = ast.body[0];
            expect(stmt.type).toBe('IfStatement');
            expect(stmt.consequent.type).toBe('BlockStatement');
            expect(stmt.alternate.type).toBe('BlockStatement');
        });

        test('should parse chained if-else statements', () => {
            const source = 'if (a) { 1; } else if (b) { 2; } else { 3; }';
            const ast = parseProgram(source);
            const stmt = ast.body[0];
            expect(stmt.type).toBe('IfStatement');
            expect(stmt.alternate.type).toBe('IfStatement');
            expect(stmt.alternate.alternate.type).toBe('BlockStatement');
        });

        test('should parse while statements', () => {
            const source = 'while (x < 10) { x = x + 1; }';
            const ast = parseProgram(source);
            const stmt = ast.body[0];
            expect(stmt.type).toBe('WhileStatement');
            expect(stmt.test.type).toBe('BinaryExpression');
            expect(stmt.body.type).toBe('BlockStatement');
        });

        test('should parse for statements', () => {
            const source = 'for (let i = 0; i < 10; i = i + 1) { print(i); }';
            const ast = parseProgram(source);
            const stmt = ast.body[0];
            expect(stmt.type).toBe('ForStatement');
            expect(stmt.init.type).toBe('VariableDeclaration');
            expect(stmt.test.type).toBe('BinaryExpression');
            expect(stmt.update.type).toBe('AssignmentExpression');
            expect(stmt.body.type).toBe('BlockStatement');
        });

        test('should parse for statements with empty clauses', () => {
            const source = 'for (;;) {}';
            const ast = parseProgram(source);
            const stmt = ast.body[0];
            expect(stmt.type).toBe('ForStatement');
            expect(stmt.init).toBe(null);
            expect(stmt.test).toBe(null);
            expect(stmt.update).toBe(null);
        });

        test('should parse return statements', () => {
            let source = 'return 5;';
            let ast = parseProgram(source);
            let stmt = ast.body[0];
            expect(stmt.type).toBe('ReturnStatement');
            expect(stmt.argument.value).toBe(5);

            source = 'return;';
            ast = parseProgram(source);
            stmt = ast.body[0];
            expect(stmt.type).toBe('ReturnStatement');
            expect(stmt.argument).toBe(null);
        });
    });

    describe('Functions', () => {
        test('should parse function declarations', () => {
            const source = 'function add(a, b) { return a + b; }';
            const ast = parseProgram(source);
            const stmt = ast.body[0];
            expect(stmt.type).toBe('FunctionDeclaration');
            expect(stmt.id.name).toBe('add');
            expect(stmt.params.length).toBe(2);
            expect(stmt.params[0].name).toBe('a');
            expect(stmt.params[1].name).toBe('b');
            expect(stmt.body.type).toBe('BlockStatement');
        });

        test('should parse function declarations with no parameters', () => {
            const source = 'function noop() {}';
            const ast = parseProgram(source);
            const stmt = ast.body[0];
            expect(stmt.type).toBe('FunctionDeclaration');
            expect(stmt.id.name).toBe('noop');
            expect(stmt.params.length).toBe(0);
            expect(stmt.body.body.length).toBe(0);
        });

        test('should parse call expressions', () => {
            const source = 'add(1, 2);';
            const ast = parseProgram(source);
            const expr = ast.body[0].expression;
            expect(expr.type).toBe('CallExpression');
            expect(expr.callee.name).toBe('add');
            expect(expr.arguments.length).toBe(2);
            expect(expr.arguments[0].value).toBe(1);
            expect(expr.arguments[1].value).toBe(2);
        });

        test('should parse nested call expressions', () => {
            const source = 'add(1, multiply(2, 3));';
            const ast = parseProgram(source);
            const expr = ast.body[0].expression;
            expect(expr.type).toBe('CallExpression');
            expect(expr.callee.name).toBe('add');
            const nestedCall = expr.arguments[1];
            expect(nestedCall.type).toBe('CallExpression');
            expect(nestedCall.callee.name).toBe('multiply');
        });
    });

    describe('Data Structures', () => {
        test('should parse array literals', () => {
            const source = '[1, "two", true];';
            const ast = parseProgram(source);
            const expr = ast.body[0].expression;
            expect(expr.type).toBe('ArrayLiteral');
            expect(expr.elements.length).toBe(3);
            expect(expr.elements[0].value).toBe(1);
            expect(expr.elements[1].value).toBe('two');
            expect(expr.elements[2].value).toBe(true);
        });

        test('should parse empty array literals', () => {
            const source = '[];';
            const ast = parseProgram(source);
            const expr = ast.body[0].expression;
            expect(expr.type).toBe('ArrayLiteral');
            expect(expr.elements.length).toBe(0);
        });

        test('should parse member expressions (array indexing)', () => {
            const source = 'myArray[0];';
            const ast = parseProgram(source);
            const expr = ast.body[0].expression;
            expect(expr.type).toBe('MemberExpression');
            expect(expr.object.name).toBe('myArray');
            expect(expr.property.value).toBe(0);
            expect(expr.computed).toBe(true);
        });

        test('should parse object literals', () => {
            const source = '{ "key": "value", another: 123 };';
            const ast = parseProgram(source);
            const expr = ast.body[0].expression;
            expect(expr.type).toBe('ObjectLiteral');
            expect(expr.properties.length).toBe(2);

            const prop1 = expr.properties[0];
            expect(prop1.key.type).toBe('StringLiteral');
            expect(prop1.key.value).toBe('key');
            expect(prop1.value.value).toBe('value');

            const prop2 = expr.properties[1];
            expect(prop2.key.type).toBe('Identifier');
            expect(prop2.key.name).toBe('another');
            expect(prop2.value.value).toBe(123);
        });

        test('should parse empty object literals', () => {
            const source = '{};';
            const ast = parseProgram(source);
            const expr = ast.body[0].expression;
            expect(expr.type).toBe('ObjectLiteral');
            expect(expr.properties.length).toBe(0);
        });

        test('should parse member expressions (dot notation)', () => {
            const source = 'myObject.property;';
            const ast = parseProgram(source);
            const expr = ast.body[0].expression;
            expect(expr.type).toBe('MemberExpression');
            expect(expr.object.name).toBe('myObject');
            expect(expr.property.name).toBe('property');
            expect(expr.computed).toBe(false);
        });
    });

    describe('Error Handling', () => {
        test('should throw on unexpected token', () => {
            expectParseError('let x = @;', 'Unexpected token');
        });

        test('should throw on incomplete variable declaration', () => {
            expectParseError('let x =', 'Unexpected end of input');
        });

        test('should throw on missing closing parenthesis', () => {
            expectParseError('add(1, 2', 'Expected )');
        });

        test('should throw on missing closing brace', () => {
            expectParseError('if (true) {', 'Unexpected end of input');
        });

        test('should throw on missing closing bracket', () => {
            expectParseError('[1, 2', 'Expected ]');
        });

        test('should throw on invalid assignment target', () => {
            expectParseError('5 = 10;', 'Invalid assignment target');
        });

        test('should throw on multiple expressions without semicolon', () => {
            expectParseError('let a = 1 let b = 2', 'Unexpected token');
        });
    });
});