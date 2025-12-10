/**
 * @file src/language/monads.js
 * @description Provides the implementation for 'Quantum Monads for Async Operations'.
 * This file defines the `Quantum` monad and its associated functions for composing
 * and executing asynchronous QPU (Quantum Processing Unit) interactions in a
 * functional, composable, and lazy manner.
 */

/**
 * Represents a lazy, asynchronous computation that can either succeed with a value
 * or fail with an error. The Quantum monad is designed to chain asynchronous
 * operations, such as QPU calls, in a declarative and robust way.
 *
 * The computation is not executed until the `run()` method is called. This allows
 * for building up complex asynchronous workflows that are only executed when needed.
 *
 * @template T The type of the success value.
 * @template E The type of the failure value.
 */
class Quantum {
    /**
     * The core of the Quantum monad. It holds the asynchronous computation.
     * The computation function is what gets executed when `run()` is called.
     * @private
     * @param {function(resolve: (value: T) => void, reject: (error: E) => void): void} computation
     */
    constructor(computation) {
        if (typeof computation !== 'function') {
            throw new TypeError('Quantum constructor expects a function.');
        }
        this.computation = computation;
    }

    /**
     * Lifts a value into the Quantum context. Creates a Quantum that resolves
     * immediately with the given value upon execution.
     * Also known as `of` or `return`.
     * @static
     * @template V
     * @param {V} value The value to wrap in a Quantum.
     * @returns {Quantum<V, any>} A new Quantum instance that will resolve with the value.
     */
    static pure(value) {
        return new Quantum((resolve, _) => resolve(value));
    }

    /**
     * Creates a Quantum that rejects immediately with the given error upon execution.
     * @static
     * @template F
     * @param {F} error The error to reject with.
     * @returns {Quantum<any, F>} A new Quantum instance that will reject with the error.
     */
    static reject(error) {
        return new Quantum((_, reject) => reject(error));
    }

    /**
     * Creates a Quantum from a Promise-returning function.
     * The function is executed lazily only when the Quantum is run.
     * This is the primary bridge for integrating with existing Promise-based APIs.
     * @static
     * @template V
     * @param {() => Promise<V>} promiseFn A function that returns a Promise.
     * @returns {Quantum<V, Error>} A new Quantum instance representing the promise's outcome.
     */
    static fromPromise(promiseFn) {
        return new Quantum((resolve, reject) => {
            try {
                promiseFn().then(resolve).catch(reject);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Transforms the success value of the Quantum using a synchronous function.
     * This is the Functor interface for the Quantum monad.
     * @template U
     * @param {(value: T) => U} fn The function to apply to the success value.
     * @returns {Quantum<U, E>} A new Quantum with the transformed value.
     */
    map(fn) {
        return this.flatMap(value => Quantum.pure(fn(value)));
    }

    /**
     * Chains a new asynchronous computation to the current one.
     * The provided function must return a new Quantum. This allows for sequencing
     * of asynchronous operations where the next operation depends on the result of the previous one.
     * This is the core of the Monad interface, also known as `bind` or `chain`.
     * @template U
     * @param {(value: T) => Quantum<U, E>} fn A function that takes the success value
     *   and returns a new Quantum.
     * @returns {Quantum<U, E>} A new Quantum representing the sequenced computation.
     */
    flatMap(fn) {
        return new Quantum((resolve, reject) => {
            this.computation(
                (value) => {
                    try {
                        const nextQuantum = fn(value);
                        if (!(nextQuantum instanceof Quantum)) {
                           throw new TypeError('Function passed to flatMap must return a Quantum.');
                        }
                        nextQuantum.computation(resolve, reject);
                    } catch (error) {
                        reject(error);
                    }
                },
                reject
            );
        });
    }

    /**
     * Recovers from a failure in the computation chain.
     * The provided function must return a new Quantum, which can be used to
     * provide a default value or an alternative computation.
     * @param {(error: E) => Quantum<T, any>} fn A function that takes the error
     *   and returns a new Quantum for recovery.
     * @returns {Quantum<T, any>} A new Quantum that can handle the failure.
     */
    catch(fn) {
        return new Quantum((resolve, reject) => {
            this.computation(
                resolve,
                (error) => {
                    try {
                        const recoveryQuantum = fn(error);
                        if (!(recoveryQuantum instanceof Quantum)) {
                           throw new TypeError('Function passed to catch must return a Quantum.');
                        }
                        recoveryQuantum.computation(resolve, reject);
                    } catch (recoveryError) {
                        reject(recoveryError);
                    }
                }
            );
        });
    }

    /**
     * Executes the lazy computation and returns a Promise.
     * This is the "end of the world" function that triggers the entire chain of
     * computations. The returned Promise can be used with `async/await`.
     * @returns {Promise<T>} A Promise that will resolve or reject based on the
     *   outcome of the Quantum computation.
     */
    run() {
        return new Promise(this.computation);
    }

    /**
     * An alias for `pure`. This is a common name for the unit function in many
     * functional programming libraries.
     * @static
     * @template V
     * @param {V} value The value to wrap in a Quantum.
     * @returns {Quantum<V, any>} A new Quantum instance.
     */
    static of(value) {
        return Quantum.pure(value);
    }
}

export default Quantum;