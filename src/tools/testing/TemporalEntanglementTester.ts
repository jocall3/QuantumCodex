/**
 * @file src/tools/testing/TemporalEntanglementTester.ts
 * @purpose Test runner that supports Temporal Entanglement of Unit Tests,
 *          preserving and passing state across a sequence of tests within a suite.
 *          This allows for testing stateful processes and workflows in a deterministic order.
 */

// --- Utility: ANSI Colors for Console Output ---

const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    gray: "\x1b[90m",
    bold: "\x1b[1m",
};

const symbols = {
    pass: `${colors.green}✓${colors.reset}`,
    fail: `${colors.red}✗${colors.reset}`,
    suite: `${colors.bold}${colors.cyan}●${colors.reset}`,
};

// --- Custom Error for Assertions ---

/**
 * Custom error class to distinguish assertion failures from other exceptions.
 */
export class AssertionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AssertionError';
    }
}

// --- Deep Equality Helper ---

/**
 * Performs a deep equality check between two values.
 * @param a The first value.
 * @param b The second value.
 * @returns True if the values are deeply equal, false otherwise.
 */
function deepEqual(a: any, b: any): boolean {
    if (a === b) return true;

    if (a && b && typeof a === 'object' && typeof b === 'object') {
        if (a.constructor !== b.constructor) return false;

        if (Array.isArray(a)) {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (!deepEqual(a[i], b[i])) return false;
            }
            return true;
        }

        if (a instanceof Map && b instanceof Map) {
            if (a.size !== b.size) return false;
            for (const [key, val] of a) {
                if (!b.has(key) || !deepEqual(val, b.get(key))) {
                    return false;
                }
            }
            return true;
        }

        if (a instanceof Set && b instanceof Set) {
            if (a.size !== b.size) return false;
            const aValues = [...a.values()];
            const bValues = [...b.values()];
            for (let i = 0; i < aValues.length; i++) {
                if (!deepEqual(aValues[i], bValues[i])) return false;
            }
            return true;
        }

        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;

        for (const key of keysA) {
            if (!keysB.includes(key) || !deepEqual(a[key], b[key])) {
                return false;
            }
        }

        return true;
    }

    // Handles NaN
    return a !== a && b !== b;
}


// --- Assertion Library: expect ---

class Expectation<T> {
    constructor(private actual: T, private isNot: boolean = false) {}

    /**
     * Inverts the next assertion.
     */
    public get not(): Expectation<T> {
        return new Expectation(this.actual, !this.isNot);
    }

    private assert(condition: boolean, message: string): void {
        if (this.isNot ? condition : !condition) {
            throw new AssertionError(message);
        }
    }

    /**
     * Asserts strict equality (===).
     */
    public toBe(expected: any): void {
        this.assert(
            this.actual === expected,
            `expected ${String(this.actual)} ${this.isNot ? 'not ' : ''}to be ${String(expected)}`
        );
    }

    /**
     * Asserts deep equality for objects and arrays.
     */
    public toEqual(expected: any): void {
        this.assert(
            deepEqual(this.actual, expected),
            `expected ${JSON.stringify(this.actual, null, 2)} ${this.isNot ? 'not ' : ''}to equal ${JSON.stringify(expected, null, 2)}`
        );
    }

    /**
     * Asserts that the value is truthy.
     */
    public toBeTruthy(): void {
        this.assert(
            !!this.actual,
            `expected ${String(this.actual)} to be truthy`
        );
    }

    /**
     * Asserts that the value is falsy.
     */
    public toBeFalsy(): void {
        this.assert(
            !this.actual,
            `expected ${String(this.actual)} to be falsy`
        );
    }

    /**
     * Asserts that the value is null.
     */
    public toBeNull(): void {
        this.assert(
            this.actual === null,
            `expected ${String(this.actual)} to be null`
        );
    }

    /**
     * Asserts that a function throws an error.
     */
    public toThrow(expectedError?: string | RegExp): void {
        if (typeof this.actual !== 'function') {
            throw new Error('expect(...).toThrow() must be used with a function.');
        }

        try {
            this.actual();
        } catch (error: any) {
            if (this.isNot) {
                throw new AssertionError(`expected function not to throw, but it threw: ${error.message}`);
            }
            if (expectedError) {
                if (typeof expectedError === 'string' && !error.message.includes(expectedError)) {
                    throw new AssertionError(`expected error message "${error.message}" to include "${expectedError}"`);
                }
                if (expectedError instanceof RegExp && !expectedError.test(error.message)) {
                    throw new AssertionError(`expected error message "${error.message}" to match ${expectedError}`);
                }
            }
            // If we are here, the test passed (it threw as expected).
            return;
        }

        if (!this.isNot) {
            throw new AssertionError('expected function to throw, but it did not.');
        }
    }
}

/**
 * Creates an expectation for an assertion.
 * @param actual The value to be tested.
 * @returns An Expectation instance to chain assertion methods.
 */
export function expect<T>(actual: T): Expectation<T> {
    return new Expectation(actual);
}


// --- Core Test Runner ---

type TestFunction<TState> = (state: TState) => void | Promise<void>;

interface Test<TState> {
    name: string;
    fn: TestFunction<TState>;
    duration?: number;
    error?: Error;
}

interface Suite<TState> {
    name: string;
    tests: Test<TState>[];
    beforeAll?: () => TState | Promise<TState>;
    failures: Test<TState>[];
}

/**
 * A test runner that supports "Temporal Entanglement," where state is intentionally
 * preserved and passed between tests in a suite. This is useful for testing
 * ordered sequences of operations or stateful workflows.
 */
export class TemporalEntanglementTester<TState = any> {
    private suites: Suite<TState>[] = [];
    private currentSuite: Suite<TState> | null = null;

    /**
     * Defines a test suite, which is a collection of related tests.
     * State is entangled within a single suite but isolated between suites.
     * @param name The name of the suite.
     * @param callback A function containing `beforeAll` and `it` calls.
     */
    public describe = (name: string, callback: () => void): void => {
        const suite: Suite<TState> = { name, tests: [], failures: [] };
        this.suites.push(suite);
        this.currentSuite = suite;
        callback();
        this.currentSuite = null;
    };

    /**
     * Defines a setup function that runs once before any tests in the current suite.
     * The return value of this function becomes the initial state for the first test.
     * @param fn The setup function.
     */
    public beforeAll = (fn: () => TState | Promise<TState>): void => {
        if (!this.currentSuite) {
            throw new Error('"beforeAll" can only be called inside a "describe" block.');
        }
        this.currentSuite.beforeAll = fn;
    };

    /**
     * Defines an individual test case.
     * @param name The name of the test.
     * @param fn The test function, which receives the current entangled state.
     */
    public it = (name: string, fn: TestFunction<TState>): void => {
        if (!this.currentSuite) {
            throw new Error('"it" can only be called inside a "describe" block.');
        }
        this.currentSuite.tests.push({ name, fn });
    };

    /**
     * Runs all defined test suites and reports the results.
     * @returns A promise that resolves to true if all tests passed, false otherwise.
     */
    public async run(): Promise<boolean> {
        const startTime = Date.now();
        let passedCount = 0;
        let failedCount = 0;

        console.log('\nStarting Temporal Entanglement Test Runner...');

        for (const suite of this.suites) {
            console.log(`\n${colors.cyan}${suite.name}${colors.reset}`);
            let entangledState: TState = {} as TState;

            try {
                if (suite.beforeAll) {
                    entangledState = await suite.beforeAll();
                }
            } catch (error: any) {
                console.error(`${colors.red}Error in beforeAll for suite "${suite.name}": ${error.message}${colors.reset}`);
                failedCount += suite.tests.length; // Fail all tests in suite
                continue;
            }

            for (const test of suite.tests) {
                const testStartTime = Date.now();
                try {
                    await test.fn(entangledState);
                    test.duration = Date.now() - testStartTime;
                    console.log(`  ${symbols.pass} ${test.name} ${colors.gray}(${test.duration}ms)${colors.reset}`);
                    passedCount++;
                } catch (error: any) {
                    test.duration = Date.now() - testStartTime;
                    test.error = error;
                    suite.failures.push(test);
                    console.log(`  ${symbols.fail} ${test.name} ${colors.gray}(${test.duration}ms)${colors.reset}`);
                    failedCount++;
                }
            }
        }

        this.printSummary(startTime, passedCount, failedCount);
        return failedCount === 0;
    }

    private printSummary(startTime: number, passed: number, failed: number): void {
        const duration = Date.now() - startTime;
        console.log('\n' + '-'.repeat(40));

        if (failed > 0) {
            console.log(`\n${colors.bold}${colors.red}FAILURES:${colors.reset}`);
            let failureIndex = 1;
            for (const suite of this.suites) {
                if (suite.failures.length > 0) {
                    for (const test of suite.failures) {
                        console.log(`\n  ${failureIndex}) ${symbols.suite} ${suite.name} › ${test.name}`);
                        const error = test.error as Error;
                        const errorMessage = error instanceof AssertionError
                            ? `${colors.yellow}${error.message}${colors.reset}`
                            : `${colors.red}${error.stack || error.message}${colors.reset}`;
                        console.log(`\n     ${errorMessage.split('\n').join('\n     ')}`);
                        failureIndex++;
                    }
                }
            }
        }

        console.log('\n' + '-'.repeat(40));
        console.log(`${colors.bold}SUMMARY${colors.reset}`);
        const total = passed + failed;
        const resultColor = failed > 0 ? colors.red : colors.green;

        console.log(`${resultColor}Tests:  ${passed} passed, ${failed} failed, ${total} total${colors.reset}`);
        console.log(`Time:   ${duration}ms`);
        console.log('-'.repeat(40) + '\n');
    }
}