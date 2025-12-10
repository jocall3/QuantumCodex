namespace Stdlib.Monads;

import Stdlib.Async.Future;
import Stdlib.Hardware.QPU;
import Stdlib.Core.Unit;

/**
 * The Quantum Monad represents a computation that interacts with a Quantum Processing Unit (QPU).
 * It handles the asynchronous nature of quantum hardware access, queuing, and result retrieval.
 * 
 * @tparam T The type of the result produced by the quantum computation.
 */
public class Quantum<T> {

    // The internal operation function taking a context and returning a Future
    private let _op: (QPUContext) -> Future<T>;

    /**
     * Internal constructor for creating a Quantum instance from a raw operation.
     */
    internal constructor(op: (QPUContext) -> Future<T>) {
        this._op = op;
    }

    /**
     * Lifts a pure value into the Quantum monad.
     * 
     * @param value The value to wrap.
     * @return A Quantum computation that immediately resolves to the value.
     */
    public static func pure(value: T): Quantum<T> {
        return new Quantum((ctx: QPUContext) => Future.resolve(value));
    }

    /**
     * Monadic bind operation. Chains a dependent quantum operation.
     * 
     * @param fn A function that takes the result of this computation and returns a new Quantum computation.
     * @return A new Quantum computation representing the sequence.
     */
    public func bind<U>(fn: (T) -> Quantum<U>): Quantum<U> {
        return new Quantum((ctx: QPUContext) => {
            return this._op(ctx).flatMap((result: T) => {
                let nextComputation = fn(result);
                return nextComputation.run(ctx);
            });
        });
    }

    /**
     * Maps a function over the result of the quantum computation.
     * 
     * @param fn The transformation function.
     * @return A new Quantum computation with the transformed result.
     */
    public func map<U>(fn: (T) -> U): Quantum<U> {
        return this.bind((val: T) => Quantum<U>.pure(fn(val)));
    }

    /**
     * Executes the quantum computation on the provided context.
     * 
     * @param ctx The QPU context (simulator or hardware connection).
     * @return A Future resolving to the result.
     */
    public func run(ctx: QPUContext): Future<T> {
        return this._op(ctx);
    }
}

/**
 * Standard library functions for Quantum operations.
 */
public module QuantumOps {

    /**
     * Allocates a new qubit in the |0> state.
     */
    public func allocate(): Quantum<Qubit> {
        return new Quantum((ctx: QPUContext) => ctx.allocateQubit());
    }

    /**
     * Releases a qubit, ensuring it is reset or measured out.
     */
    public func release(q: Qubit): Quantum<Unit> {
        return new Quantum((ctx: QPUContext) => ctx.releaseQubit(q));
    }

    /**
     * Applies the Hadamard gate to a qubit.
     * Creates a superposition state.
     */
    public func h(q: Qubit): Quantum<Unit> {
        return new Quantum((ctx: QPUContext) => ctx.applyGate("H", [q]));
    }

    /**
     * Applies the Pauli-X (NOT) gate to a qubit.
     */
    public func x(q: Qubit): Quantum<Unit> {
        return new Quantum((ctx: QPUContext) => ctx.applyGate("X", [q]));
    }

    /**
     * Applies the Pauli-Z gate to a qubit.
     */
    public func z(q: Qubit): Quantum<Unit> {
        return new Quantum((ctx: QPUContext) => ctx.applyGate("Z", [q]));
    }

    /**
     * Applies the Controlled-NOT (CNOT) gate.
     * 
     * @param control The control qubit.
     * @param target The target qubit.
     */
    public func cnot(control: Qubit, target: Qubit): Quantum<Unit> {
        return new Quantum((ctx: QPUContext) => ctx.applyGate("CNOT", [control, target]));
    }

    /**
     * Measures a qubit in the Z-basis.
     * This collapses the state and returns a classical Bit (0 or 1).
     */
    public func measure(q: Qubit): Quantum<Bit> {
        return new Quantum((ctx: QPUContext) => ctx.measure(q));
    }

    /**
     * Helper to run a block of code with an allocated qubit, automatically releasing it afterwards.
     * Similar to 'using' in C# or 'borrow' in Rust.
     */
    public func usingQubit<R>(block: (Qubit) -> Quantum<R>): Quantum<R> {
        return allocate().bind((q: Qubit) => {
            return block(q).bind((res: R) => {
                return release(q).map((_) => res);
            });
        });
    }
}