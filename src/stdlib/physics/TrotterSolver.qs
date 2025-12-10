// Copyright (c) U.Code.Language Team.
// Licensed under the MIT License.

/// Provides a standard library for simulating the time-evolution of quantum systems
/// described by Hamiltonians using Trotter-Suzuki decompositions.
namespace U.Code.Language.Std.Physics {

    open Microsoft.Quantum.Canon;
    open Microsoft.Quantum.Intrinsic;
    open Microsoft.Quantum.Convert;
    open Microsoft.Quantum.Math;

    /// Represents a Hamiltonian as a sum of Pauli terms.
    /// Each term is a tuple containing a coefficient (Double) and a Pauli string (Pauli[]).
    /// The overall Hamiltonian is the sum of these terms: H = Σᵢ cᵢ Pᵢ.
    newtype QHamiltonian = (Double, Pauli[])[];

    /// # Summary
    /// Applies a single Trotter-Suzuki decomposition step for a given Hamiltonian.
    ///
    /// # Input
    /// ## hamiltonian
    /// The Hamiltonian to be simulated, represented as a sum of Pauli terms.
    /// ## timeStep
    /// The duration of the simulation for this single step.
    /// ## qubits
    /// The register of qubits on which the Hamiltonian acts.
    /// ## order
    /// The order of the Trotter-Suzuki integrator to use. Currently, only 1 (Lie-Trotter)
    /// and 2 (symmetric) are supported.
    ///
    /// # Remarks
    /// This is a helper operation called by `Evolve`.
    internal operation ApplyTrotterStep(hamiltonian : QHamiltonian, timeStep : Double, qubits : Qubit[], order : Int) : Unit is Adj + Ctl {
        if order == 1 {
            // First-order Lie-Trotter-Suzuki decomposition:
            // e^(-i(A+B)t) ≈ e^(-iAt)e^(-iBt)
            for term in hamiltonian {
                let (coefficient, pauliString) = term;
                Exp(pauliString, coefficient * timeStep, qubits);
            }
        } elif order == 2 {
            // Second-order symmetric Trotter-Suzuki decomposition:
            // e^(-i(A+B)t) ≈ e^(-iAt/2)e^(-iBt)e^(-iAt/2)
            // For a multi-term Hamiltonian H = Σ Hᵢ, this becomes:
            // e^(-iHt) ≈ (Πᵢ e^(-i Hᵢ t/2)) * (Πᵢᴿ e^(-i Hᵢ t/2))
            // where Πᴿ is the product in reverse order.
            let halfTimeStep = timeStep / 2.0;

            // Forward evolution for t/2
            for term in hamiltonian {
                let (coefficient, pauliString) = term;
                Exp(pauliString, coefficient * halfTimeStep, qubits);
            }

            // Backward evolution for t/2
            // The Reversed function from Canon creates a new array in reverse order.
            for term in Reversed(hamiltonian) {
                let (coefficient, pauliString) = term;
                Exp(pauliString, coefficient * halfTimeStep, qubits);
            }
        } else {
            fail $"Trotter order {order} is not supported. Only orders 1 and 2 are implemented.";
        }
    }

    /// # Summary
    /// Simulates the time-evolution of a quantum system under a given Hamiltonian
    /// using a Trotter-Suzuki decomposition.
    ///
    /// # Description
    /// This operation approximates the unitary evolution operator U(t) = e^(-iHt)
    /// by breaking the evolution into a sequence of smaller, easily simulable steps.
    ///
    /// # Input
    /// ## hamiltonian
    /// The `QHamiltonian` describing the system to be simulated.
    /// ## evolutionTime
    /// The total time `t` for which the system should be evolved.
    /// ## qubits
    /// The register of qubits on which the Hamiltonian acts.
    /// ## trotterOrder
    /// The order of the Trotter-Suzuki integrator to use. A higher order generally
    /// leads to higher accuracy but requires more quantum gates.
    /// Supported values: 1, 2.
    /// ## trotterSteps
    /// The number of discrete time steps `n` to use for the simulation. The total
    /// evolution time is divided into `n` slices of duration `Δt = t/n`.
    ///
    /// # Example
    /// ```qsharp
    /// // Define a simple transverse-field Ising model Hamiltonian
    /// // H = -Σᵢ ZᵢZᵢ₊₁ - gΣᵢ Xᵢ
    /// let g = 1.5;
    /// let terms = [
    ///     (-1.0, [PauliZ, PauliZ, PauliI]),
    ///     (-1.0, [PauliI, PauliZ, PauliZ]),
    ///     (-g,   [PauliX, PauliI, PauliI]),
    ///     (-g,   [PauliI, PauliX, PauliI]),
    ///     (-g,   [PauliI, PauliI, PauliX])
    /// ];
    /// let hamiltonian = QHamiltonian(terms);
    ///
    /// use qubits = Qubit[3];
    /// // Evolve the system for time π/4 using a 2nd-order Trotter
    /// // decomposition with 10 steps.
    /// Evolve(hamiltonian, PI() / 4.0, qubits, 2, 10);
    /// ```
    operation Evolve(hamiltonian : QHamiltonian, evolutionTime : Double, qubits : Qubit[], trotterOrder : Int, trotterSteps : Int) : Unit is Adj + Ctl {
        if trotterSteps <= 0 {
            fail "The number of Trotter steps must be a positive integer.";
        }
        if evolutionTime == 0.0 {
            // No evolution needed.
            return ();
        }

        let timeStep = evolutionTime / IntAsDouble(trotterSteps);

        for _ in 1..trotterSteps {
            ApplyTrotterStep(hamiltonian, timeStep, qubits, trotterOrder);
        }
    }
}