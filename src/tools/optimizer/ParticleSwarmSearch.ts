/**
 * @file src/tools/optimizer/ParticleSwarmSearch.ts
 * @purpose Implements Particle Swarm Code Searching for optimizing quantum circuits and hybrid algorithms.
 *
 * This file provides a robust implementation of the Particle Swarm Optimization (PSO) algorithm.
 * PSO is a metaheuristic inspired by the social behavior of bird flocking. It is effective for
 * finding optimal parameters in complex, high-dimensional, and non-convex search spaces,
 * which are common in variational quantum algorithms (VQAs) and other hybrid quantum-classical tasks.
 */

/**
 * Defines the bounds for a single parameter in the search space.
 * The tuple represents `[minimumValue, maximumValue]`.
 */
export type ParameterBound = [number, number];

/**
 * A function that takes a set of parameters and returns a numerical cost.
 * The optimizer will attempt to minimize this value. The function can be
 * synchronous or asynchronous.
 */
export type CostFunction = (params: number[]) => number | Promise<number>;

/**
 * Configuration options for the Particle Swarm Optimizer.
 */
export interface ParticleSwarmOptions {
    /** Number of particles in the swarm. A larger number increases exploration but is computationally more expensive. Default: 30 */
    numParticles?: number;
    /** Maximum number of iterations to run the optimization. Default: 100 */
    maxIterations?: number;
    /** Inertia weight (w). Controls the particle's momentum from the previous step. Typically in [0.4, 0.9]. Default: 0.729 */
    inertiaWeight?: number;
    /** Cognitive weight (c1). Represents the particle's attraction to its own personal best position. Default: 1.494 */
    cognitiveWeight?: number;
    /** Social weight (c2). Represents the particle's attraction to the swarm's global best position. Default: 1.494 */
    socialWeight?: number;
    /**
     * Optional velocity clamping to prevent "particle explosion" where velocities become too large.
     * If provided, the velocity for each dimension will be clamped to `[-maxVelocity, maxVelocity]`.
     * A common heuristic is a fraction of the parameter range, e.g., 0.2 * (max - min).
     */
    maxVelocity?: number;
    /**
     * A function to determine if the optimization should stop early.
     * @param iteration - The current iteration number (0-indexed).
     * @param globalBestCost - The best cost found so far by the entire swarm.
     * @returns `true` to stop the optimization, `false` to continue.
     */
    stoppingCondition?: (iteration: number, globalBestCost: number) => boolean;
}

/**
 * Represents a single particle within the swarm, tracking its state.
 */
interface Particle {
    /** Current position (parameter values) in the search space. */
    position: number[];
    /** Current velocity of the particle. */
    velocity: number[];
    /** Cost associated with the current position. */
    cost: number;
    /** The best position this individual particle has found so far. */
    bestPosition: number[];
    /** The cost associated with the best personal position. */
    bestCost: number;
}

/**
 * The result returned by the optimization process.
 */
export interface OptimizationResult {
    /** The best set of parameters found that minimizes the cost function. */
    optimalParameters: number[];
    /** The minimum cost value achieved. */
    minValue: number;
    /** The total number of iterations performed before termination. */
    iterations: number;
}

/**
 * Implements the Particle Swarm Optimization (PSO) algorithm for finding the
 * minimum of a given cost function within a bounded search space.
 */
export class ParticleSwarmSearch {
    private readonly costFunction: CostFunction;
    private readonly parameterBounds: ParameterBound[];
    private readonly options: Required<ParticleSwarmOptions>;
    private readonly dimensions: number;

    private particles: Particle[] = [];
    private globalBestPosition: number[] = [];
    private globalBestCost: number = Infinity;

    /**
     * Creates an instance of the ParticleSwarmSearch optimizer.
     * @param costFunction The function to minimize. It takes an array of parameters and returns a cost.
     * @param parameterBounds An array defining the search space for each parameter, e.g., `[[-Math.PI, Math.PI], [0, 1]]`.
     * @param options Optional configuration for the PSO algorithm.
     */
    constructor(
        costFunction: CostFunction,
        parameterBounds: ParameterBound[],
        options: ParticleSwarmOptions = {}
    ) {
        if (!parameterBounds || parameterBounds.length === 0) {
            throw new Error("Parameter bounds cannot be null or empty.");
        }

        this.costFunction = costFunction;
        this.parameterBounds = parameterBounds;
        this.dimensions = parameterBounds.length;

        // Set default options, often chosen for good general performance
        this.options = {
            numParticles: options.numParticles ?? 30,
            maxIterations: options.maxIterations ?? 100,
            inertiaWeight: options.inertiaWeight ?? 0.729, // A common choice for stability
            cognitiveWeight: options.cognitiveWeight ?? 1.49445, // c1 = c2 ≈ 1.49
            socialWeight: options.socialWeight ?? 1.49445,
            maxVelocity: options.maxVelocity ?? Infinity,
            stoppingCondition: options.stoppingCondition ?? (() => false),
        };

        if (this.options.numParticles <= 0) {
            throw new Error("Number of particles must be a positive integer.");
        }
        if (this.options.maxIterations <= 0) {
            throw new Error("Maximum iterations must be a positive integer.");
        }
    }

    /**
     * Runs the optimization process to find the minimum of the cost function.
     * @returns A promise that resolves to the optimization result.
     */
    public async optimize(): Promise<OptimizationResult> {
        await this.initializeSwarm();

        for (let i = 0; i < this.options.maxIterations; i++) {
            // Update each particle in the swarm
            const particleUpdatePromises = this.particles.map(async (particle) => {
                this.updateVelocity(particle);
                this.updatePosition(particle);
                await this.evaluateCost(particle);
            });
            await Promise.all(particleUpdatePromises);

            // Check for early termination
            if (this.options.stoppingCondition(i, this.globalBestCost)) {
                return {
                    optimalParameters: this.globalBestPosition,
                    minValue: this.globalBestCost,
                    iterations: i + 1,
                };
            }
        }

        return {
            optimalParameters: this.globalBestPosition,
            minValue: this.globalBestCost,
            iterations: this.options.maxIterations,
        };
    }

    /**
     * Initializes the swarm with random positions and velocities within the defined bounds.
     * Evaluates the initial cost for each particle.
     */
    private async initializeSwarm(): Promise<void> {
        this.particles = [];
        this.globalBestCost = Infinity;
        this.globalBestPosition = new Array(this.dimensions).fill(NaN);

        const particlePromises = Array.from({ length: this.options.numParticles }, async () => {
            const position = this.parameterBounds.map(([min, max]) => min + Math.random() * (max - min));
            const velocity = this.parameterBounds.map(([min, max]) => (Math.random() - 0.5) * (max - min));
            
            const cost = await this.costFunction(position);

            return {
                position,
                velocity,
                cost,
                bestPosition: [...position],
                bestCost: cost,
            };
        });

        this.particles = await Promise.all(particlePromises);

        // Initialize global best after all initial particles are evaluated
        for (const particle of this.particles) {
            if (particle.bestCost < this.globalBestCost) {
                this.globalBestCost = particle.bestCost;
                this.globalBestPosition = [...particle.bestPosition];
            }
        }
    }

    /**
     * Updates the velocity of a single particle based on its own experience and the swarm's experience.
     * v(t+1) = w*v(t) + c1*r1*(p_best - x(t)) + c2*r2*(g_best - x(t))
     * @param particle The particle to update.
     */
    private updateVelocity(particle: Particle): void {
        const { inertiaWeight, cognitiveWeight, socialWeight, maxVelocity } = this.options;

        for (let i = 0; i < this.dimensions; i++) {
            const r1 = Math.random();
            const r2 = Math.random();

            const inertiaComponent = inertiaWeight * particle.velocity[i];
            const cognitiveComponent = cognitiveWeight * r1 * (particle.bestPosition[i] - particle.position[i]);
            const socialComponent = socialWeight * r2 * (this.globalBestPosition[i] - particle.position[i]);

            let newVelocity = inertiaComponent + cognitiveComponent + socialComponent;

            // Clamp velocity if maxVelocity is set
            if (maxVelocity !== Infinity) {
                newVelocity = Math.max(-maxVelocity, Math.min(maxVelocity, newVelocity));
            }

            particle.velocity[i] = newVelocity;
        }
    }

    /**
     * Updates the position of a single particle based on its new velocity.
     * Ensures the particle stays within the defined search space bounds.
     * x(t+1) = x(t) + v(t+1)
     * @param particle The particle to update.
     */
    private updatePosition(particle: Particle): void {
        for (let i = 0; i < this.dimensions; i++) {
            particle.position[i] += particle.velocity[i];

            // Clamp position to the defined bounds (reflective or absorptive boundary)
            const [min, max] = this.parameterBounds[i];
            if (particle.position[i] < min) {
                particle.position[i] = min;
                particle.velocity[i] *= -0.5; // Optional: bounce back with reduced velocity
            } else if (particle.position[i] > max) {
                particle.position[i] = max;
                particle.velocity[i] *= -0.5; // Optional: bounce back with reduced velocity
            }
        }
    }

    /**
     * Evaluates the cost of a particle's current position and updates
     * its personal best and the swarm's global best if a better position is found.
     * @param particle The particle to evaluate.
     */
    private async evaluateCost(particle: Particle): Promise<void> {
        particle.cost = await this.costFunction(particle.position);

        // Update personal best
        if (particle.cost < particle.bestCost) {
            particle.bestCost = particle.cost;
            particle.bestPosition = [...particle.position];

            // Update global best
            if (particle.bestCost < this.globalBestCost) {
                this.globalBestCost = particle.bestCost;
                this.globalBestPosition = [...particle.bestPosition];
            }
        }
    }
}