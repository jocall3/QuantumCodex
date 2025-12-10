/// ----------------------------------------------------------------------
/// Copyright (c) The .u Foundation. All rights reserved.
/// ----------------------------------------------------------------------

namespace U.Code.StdLib.Graph.Quantum {

    open Microsoft.Quantum.Canon;
    open Microsoft.Quantum.Intrinsic;
    open Microsoft.Quantum.Arrays;
    open Microsoft.Quantum.Convert;
    open Microsoft.Quantum.Math;
    open Microsoft.Quantum.Diagnostics;

    // ##################################################################
    // # USER-DEFINED TYPES FOR QUANTUM GRAPH REPRESENTATION
    // ##################################################################

    /// Represents an oracle that marks an edge between two nodes.
    ///
    /// The oracle acts on three qubit registers:
    /// 1. `Qubit[]`: A little-endian register representing the first node index `u`.
    /// 2. `Qubit[]`: A little-endian register representing the second node index `v`.
    /// 3. `Qubit`: A target qubit that is flipped if an edge `(u, v)` exists.
    newtype AdjacencyOracle = ((Qubit[], Qubit[], Qubit) => Unit is Adj + Ctl);

    /// Represents a quantum index for a graph structure, enabling quantum-accelerated queries.
    ///
    /// This structure encapsulates the essential properties of a graph for quantum algorithms,
    /// namely its size and an oracle to query its edge structure.
    newtype QuantumGraphIndex = (
        NumNodes : Int,
        AdjacencyOracle : AdjacencyOracle
    );


    // ##################################################################
    // # INDEX CREATION
    // ##################################################################

    /// Creates a `QuantumGraphIndex` from a classical adjacency list.
    /// The graph is assumed to be undirected.
    ///
    /// ## Parameters
    /// - `numNodes`: The total number of nodes in the graph, indexed from 0 to `numNodes - 1`.
    /// - `edges`: An array of tuples, where each tuple `(u, v)` represents an undirected edge.
    ///
    /// ## Returns
    /// A `QuantumGraphIndex` instance that can be used for quantum graph queries.
    operation CreateQuantumGraphIndex(numNodes : Int, edges : (Int, Int)[]) : QuantumGraphIndex {
        // Use partial application to "bake in" the classical edges array into the oracle operation.
        let oracleImpl = AdjacencyOracleImpl(edges, _, _, _);
        return QuantumGraphIndex(numNodes, AdjacencyOracle(oracleImpl));
    }


    // ##################################################################
    // # CORE QUERY OPERATIONS
    // ##################################################################

    /// Checks if an edge exists between two specified nodes using the quantum graph index.
    ///
    /// ## Parameters
    /// - `graphIndex`: The quantum graph index to query.
    /// - `u`: The index of the first node.
    /// - `v`: The index of the second node.
    ///
    /// ## Returns
    /// `true` if an edge exists between `u` and `v`, `false` otherwise.
    operation CheckEdge(graphIndex : QuantumGraphIndex, u : Int, v : Int) : Bool {
        let (numNodes, adjacencyOracle) = graphIndex;
        let numQubits = BitSizeI(numNodes - 1);

        use (uRegister, vRegister, target) = (Qubit[numQubits], Qubit[numQubits], Qubit()) {
            // Prepare the state |u>|v>|->
            ApplyXorInPlace(u, uRegister);
            ApplyXorInPlace(v, vRegister);
            within {
                X(target);
                H(target);
            } apply {
                // The oracle flips the target if an edge exists.
                // |u>|v>|-> -> (-1)^f(u,v) |u>|v>|->
                // If f(u,v)=1 (edge exists), state becomes -|u>|v>|->.
                // This is equivalent to flipping |+> to |->, which is a Z operation.
                // The oracle is defined with an X flip, so we use it in the |-> basis.
                adjacencyOracle(uRegister, vRegister, target);
            }

            // If the target flipped, its state in the X-basis is One.
            let result = MResetZ(target) == One;
            ResetAll(uRegister);
            ResetAll(vRegister);
            return result;
        }
    }

    /// Finds a single neighbor of a given node using Grover's search algorithm.
    ///
    /// This operation provides a quantum speedup for finding a neighbor in dense graphs.
    ///
    /// ## Parameters
    /// - `graphIndex`: The quantum graph index to query.
    /// - `node`: The index of the node whose neighbor is to be found.
    ///
    _Deprecated("This implementation uses a fixed number of iterations. For robust applications, consider a version with quantum counting or oblivious amplitude amplification.")
    operation FindAnyNeighbor(graphIndex : QuantumGraphIndex, node : Int) : Int {
        let numNodes = graphIndex::NumNodes;
        if numNodes < 2 { return -1; }
        let numQubits = BitSizeI(numNodes - 1);

        // The state preparation oracle prepares |node> ⊗ |ψ⟩ where |ψ⟩ is a uniform superposition
        // over all possible neighbor nodes.
        let statePrep = PrepareSuperpositionOverPotentialNeighbors(node, _, _);

        // The phase oracle marks states |node⟩|v⟩ where v is a neighbor of `node`.
        let phaseOracle = PhaseOracleForNeighbors(graphIndex, _, _);

        // For a robust implementation, the number of iterations should be determined by
        // estimating the number of neighbors (M) and setting iterations ≈ π/4 * sqrt(N/M).
        // Here we use a single iteration for simplicity, which is non-optimal but illustrative.
        let nIterations = 1;

        use register = Qubit[2 * numQubits] {
            let (nodeRegister, neighborRegister) = (register[0..numQubits-1], register[numQubits..2*numQubits-1]);

            // Run Grover's search algorithm.
            within {
                statePrep(nodeRegister, neighborRegister);
            } apply {
                for _ in 1..nIterations {
                    phaseOracle(nodeRegister, neighborRegister);
                    ReflectAboutInitialState(statePrep, nodeRegister, neighborRegister);
                }
            }

            let measuredNeighbor = MeasureInteger(neighborRegister);

            // Because the number of iterations may not be optimal, the search can fail.
            // We classically verify the result to ensure correctness.
            if CheckEdge(graphIndex, node, measuredNeighbor) {
                ResetAll(register);
                return measuredNeighbor;
            } else {
                ResetAll(register);
                return -1; // Search failed or no neighbors exist.
            }
        }
    }


    // ##################################################################
    // # BUILDING BLOCKS FOR ADVANCED ALGORITHMS (E.G., QUANTUM WALKS)
    // ##################################################################

    /// Implements a Grover diffusion operator, which can be used as a "coin" in a
    /// discrete-time quantum walk. This operator reflects about the uniform superposition state.
    ///
    /// ## Parameters
    /// - `qubits`: The register to apply the coin operator to.
    operation GroverCoin(qubits : Qubit[]) : Unit is Adj + Ctl {
        within {
            ApplyToEachA(H, qubits);
            ApplyToEachA(X, qubits);
        } apply {
            Controlled Z(Most(qubits), Tail(qubits));
        }
    }

    /// Implements a controlled-shift operator for a quantum walk.
    /// This operator swaps the states of `walkerRegister` and `targetRegister`
    /// if an edge exists between the nodes they represent.
    ///
    /// ## Parameters
    /// - `graphIndex`: The quantum graph index defining the graph structure.
    /// - `walkerRegister`: A register representing the current position of the walker.
    /// - `targetRegister`: A register representing a potential next position.
    operation ControlledShift(graphIndex : QuantumGraphIndex, walkerRegister : Qubit[], targetRegister : Qubit[]) : Unit is Adj + Ctl {
        use flag = Qubit() {
            let (_, adjacencyOracle) = graphIndex;

            // Set the flag qubit if an edge exists between the nodes in the registers.
            adjacencyOracle(walkerRegister, targetRegister, flag);

            // Swap the walker and target states, controlled by the flag.
            Controlled SWAP([flag], walkerRegister, targetRegister);

            // Uncompute the flag to restore it to the |0⟩ state.
            (Adjoint adjacencyOracle)(walkerRegister, targetRegister, flag);
        }
    }


    // ##################################################################
    // # INTERNAL HELPER OPERATIONS
    // ##################################################################

    /// The concrete implementation of the adjacency oracle.
    /// It checks a classical list of edges to determine connectivity.
    internal operation AdjacencyOracleImpl(edges : (Int, Int)[], uRegister : Qubit[], vRegister : Qubit[], target : Qubit) : Unit is Adj + Ctl {
        for (u, v) in edges {
            // Check for edge (u, v)
            ApplyControlledOnInt(u, uRegister, () => {
                ApplyControlledOnInt(v, vRegister, () => {
                    X(target);
                });
            });
            // Check for edge (v, u) for undirected graph
            if u != v {
                ApplyControlledOnInt(v, uRegister, () => {
                    ApplyControlledOnInt(u, vRegister, () => {
                        X(target);
                    });
                });
            }
        }
    }

    /// Helper for Grover's search: Prepares the state |node⟩ ⊗ H^n|0...0⟩.
    internal operation PrepareSuperpositionOverPotentialNeighbors(node : Int, nodeRegister : Qubit[], neighborRegister : Qubit[]) : Unit is Adj + Ctl {
        ApplyXorInPlace(node, nodeRegister);
        ApplyToEachA(H, neighborRegister);
    }

    /// Helper for Grover's search: Oracle that flips the phase of states |u⟩|v⟩ if (u,v) is an edge.
    internal operation PhaseOracleForNeighbors(graphIndex : QuantumGraphIndex, uRegister : Qubit[], vRegister : Qubit[]) : Unit is Adj + Ctl {
        use target = Qubit() {
            within {
                // Put target in the |-⟩ state to convert a controlled-X into a controlled-Z (phase flip).
                X(target);
                H(target);
            } apply {
                let (_, adjacencyOracle) = graphIndex;
                adjacencyOracle(uRegister, vRegister, target);
            }
        }
    }

    /// Helper for Grover's search: Reflects about the initial state prepared by `statePrep`.
    internal operation ReflectAboutInitialState(statePrep : ((Qubit[], Qubit[]) => Unit is Adj + Ctl), nodeRegister : Qubit[], neighborRegister : Qubit[]) : Unit is Adj + Ctl {
        let register = nodeRegister + neighborRegister;
        within {
            Adjoint statePrep(nodeRegister, neighborRegister);
            ApplyToEachA(X, register);
        } apply {
            Controlled Z(Most(register), Tail(register));
        }
    }
}