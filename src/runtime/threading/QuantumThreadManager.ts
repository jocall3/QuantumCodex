/**
 * @file Manages `QuantumThread` instances and `QuantumThreadPools` for concurrent quantum task execution.
 * @author AI Programmer
 * @version 1.0.0
 */

import { Worker } from 'worker_threads';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';

/**
 * Defines the structure of a task to be executed in a worker thread.
 */
export interface QuantumTask {
    /** A unique identifier for the task, for tracking purposes. */
    id: string;
    /** The absolute path to the ES module containing the function to execute. */
    modulePath: string;
    /** The name of the exported function to call from the module. */
    functionName: string;
    /** An array of arguments to pass to the function. Arguments must be serializable. */
    args: any[];
}

/**
 * Represents a single, long-lived worker thread that can execute QuantumTasks.
 * It is a wrapper around Node.js's `worker_threads.Worker`.
 *
 * @emits idle - When the thread finishes a task and is ready for a new one.
 * @emits error - When an unhandled error occurs in the worker.
 * @emits exit - When the underlying worker thread exits.
 */
export class QuantumThread extends EventEmitter {
    public readonly id: number;
    private worker: Worker;
    private isBusy: boolean = false;
    private currentTask: { 
        task: QuantumTask; 
        resolve: (value: any) => void; 
        reject: (reason: any) => void; 
    } | null = null;

    /**
     * Creates a new QuantumThread.
     * @param id - A unique identifier for the thread.
     * @param workerScriptPath - The path to the worker script to execute.
     */
    constructor(id: number, workerScriptPath: string) {
        super();
        this.id = id;
        
        this.worker = new Worker(workerScriptPath, {
            workerData: { threadId: this.id }
        });

        this.worker.on('message', this.handleMessage.bind(this));
        this.worker.on('error', this.handleError.bind(this));
        this.worker.on('exit', (code) => {
            if (code !== 0 && this.isBusy) {
                this.handleError(new Error(`Worker ${this.id} stopped unexpectedly with exit code ${code}`));
            }
            this.emit('exit', this.id);
        });
    }

    /**
     * Executes a task in the worker thread.
     * @param task - The QuantumTask to execute.
     * @returns A promise that resolves with the task's result or rejects on error.
     */
    public run(task: QuantumTask): Promise<any> {
        if (this.isBusy) {
            return Promise.reject(new Error(`Thread ${this.id} is already busy.`));
        }
        this.isBusy = true;

        return new Promise((resolve, reject) => {
            this.currentTask = { task, resolve, reject };
            this.worker.postMessage(task);
        });
    }

    /**
     * Handles messages received from the worker thread.
     * @param result - The result object from the worker.
     */
    private handleMessage(result: { success: boolean; data: any; error?: any }): void {
        if (!this.currentTask) return;

        if (result.success) {
            this.currentTask.resolve(result.data);
        } else {
            const error = new Error(result.error.message);
            error.name = result.error.name;
            error.stack = result.error.stack;
            this.currentTask.reject(error);
        }

        this.currentTask = null;
        this.isBusy = false;
        this.emit('idle', this);
    }

    /**
     * Handles errors from the worker thread.
     * @param err - The error object.
     */
    private handleError(err: Error): void {
        if (this.currentTask) {
            this.currentTask.reject(err);
            this.currentTask = null;
        }
        this.isBusy = false;
        this.emit('error', err);
        this.emit('idle', this); // Signal that it's "idle" so the pool can replace it.
    }

    /**
     * Terminates the worker thread immediately.
     * @returns A promise that resolves with the exit code of the worker.
     */
    public terminate(): Promise<number> {
        this.isBusy = false;
        return this.worker.terminate();
    }

    /**
     * Checks if the thread is currently executing a task.
     */
    public get isWorking(): boolean {
        return this.isBusy;
    }
}

/**
 * Manages a fixed-size pool of QuantumThreads to execute tasks concurrently.
 * Tasks are queued if all threads are busy.
 */
export class QuantumThreadPool {
    public readonly name: string;
    private readonly size: number;
    private workers: QuantumThread[] = [];
    private idleWorkers: QuantumThread[] = [];
    private taskQueue: { 
        task: QuantumTask; 
        resolve: (value: any) => void; 
        reject: (reason: any) => void; 
    }[] = [];
    private workerScriptPath: string;
    private idProvider: () => number;
    private isShuttingDown = false;

    /**
     * Creates a new QuantumThreadPool.
     * @param name - A unique name for the pool.
     * @param size - The number of threads in the pool.
     * @param workerScriptPath - The path to the worker script.
     * @param idProvider - A function that provides unique IDs for new workers.
     */
    constructor(name: string, size: number, workerScriptPath: string, idProvider: () => number) {
        this.name = name;
        this.size = size;
        this.workerScriptPath = workerScriptPath;
        this.idProvider = idProvider;

        for (let i = 0; i < size; i++) {
            this.addNewWorker();
        }
    }

    /**
     * Creates, configures, and adds a new worker to the pool.
     */
    private addNewWorker(): void {
        const workerId = this.idProvider();
        const worker = new QuantumThread(workerId, this.workerScriptPath);
        
        worker.on('idle', (idleWorker: QuantumThread) => {
            this.handleWorkerIdle(idleWorker);
        });

        worker.on('exit', (exitedWorkerId: number) => {
            this.workers = this.workers.filter(w => w.id !== exitedWorkerId);
            this.idleWorkers = this.idleWorkers.filter(w => w.id !== exitedWorkerId);
            
            if (!this.isShuttingDown) {
                console.warn(`[QuantumThreadPool] Worker ${exitedWorkerId} from pool "${this.name}" exited unexpectedly. Replacing it.`);
                this.addNewWorker();
                this.dispatch(); // Check if a queued task can be run on the new worker
            }
        });

        this.workers.push(worker);
        this.idleWorkers.push(worker);
    }

    /**
     * Handles a worker becoming idle. Assigns a new task if one is queued.
     * @param worker - The worker that has become idle.
     */
    private handleWorkerIdle(worker: QuantumThread): void {
        if (!this.idleWorkers.some(w => w.id === worker.id)) {
            this.idleWorkers.push(worker);
        }
        this.dispatch();
    }

    /**
     * Dispatches a queued task to an available idle worker.
     */
    private dispatch(): void {
        if (this.isShuttingDown || this.taskQueue.length === 0 || this.idleWorkers.length === 0) {
            return;
        }

        const { task, resolve, reject } = this.taskQueue.shift()!;
        const worker = this.idleWorkers.pop()!;
        
        worker.run(task).then(resolve).catch(reject);
    }

    /**
     * Submits a task to the pool for execution.
     * The task will be queued if all threads are currently busy.
     * @param task - The QuantumTask to execute.
     * @returns A promise that resolves with the task's result or rejects on error.
     */
    public submit(task: QuantumTask): Promise<any> {
        if (this.isShuttingDown) {
            return Promise.reject(new Error(`Pool "${this.name}" is shutting down. No new tasks accepted.`));
        }
        return new Promise((resolve, reject) => {
            this.taskQueue.push({ task, resolve, reject });
            this.dispatch();
        });
    }

    /**
     * Retrieves statistics about the pool's current state.
     */
    public getStatistics() {
        return {
            poolName: this.name,
            totalWorkers: this.workers.length,
            idleWorkers: this.idleWorkers.length,
            activeWorkers: this.workers.length - this.idleWorkers.length,
            queuedTasks: this.taskQueue.length,
        };
    }

    /**
     * Gracefully shuts down the thread pool.
     * It waits for all active and queued tasks to complete before terminating workers.
     */
    public async shutdown(): Promise<void> {
        this.isShuttingDown = true;

        const poll = (resolve: () => void) => {
            if (this.taskQueue.length === 0 && this.getStatistics().activeWorkers === 0) {
                resolve();
            } else {
                setTimeout(() => poll(resolve), 100);
            }
        };
        await new Promise<void>(poll);

        await Promise.all(this.workers.map(worker => worker.terminate()));
        this.workers = [];
        this.idleWorkers = [];
    }
}

/**
 * A singleton manager for all quantum threading operations.
 * It creates and manages thread pools and provides a central point for task submission.
 */
export class QuantumThreadManager {
    private static instance: QuantumThreadManager;

    private pools = new Map<string, QuantumThreadPool>();
    private threadIdCounter = 1;
    private readonly maxConcurrentThreads: number;
    private readonly workerScriptPath: string;

    private constructor() {
        const numCores = os.cpus().length;
        this.maxConcurrentThreads = Math.max(4, Math.min(numCores * 2, 64));

        // This path must point to the compiled JavaScript worker file.
        // Path resolution might need adjustment depending on the project's build process
        // (e.g., for projects using TypeScript with an output directory like 'dist').
        this.workerScriptPath = path.resolve(__dirname, 'QuantumWorker.js');
    }

    /**
     * Gets the singleton instance of the QuantumThreadManager.
     */
    public static getInstance(): QuantumThreadManager {
        if (!QuantumThreadManager.instance) {
            QuantumThreadManager.instance = new QuantumThreadManager();
        }
        return QuantumThreadManager.instance;
    }

    /**
     * Creates a new thread pool.
     * @param name - A unique name for the pool.
     * @param [size=os.cpus().length - 1] - The number of threads in the pool. Defaults to a sensible value based on CPU cores.
     * @returns The newly created QuantumThreadPool.
     * @throws If a pool with the same name already exists.
     * @throws If creating the pool would exceed the maximum concurrent thread limit.
     */
    public createThreadPool(name: string, size?: number): QuantumThreadPool {
        if (this.pools.has(name)) {
            throw new Error(`A thread pool with the name "${name}" already exists.`);
        }

        const numCores = os.cpus().length;
        const poolSize = size || Math.max(1, numCores > 1 ? numCores - 1 : 1);

        const currentThreadCount = this.getTotalActiveThreads();
        if (currentThreadCount + poolSize > this.maxConcurrentThreads) {
            throw new Error(`Cannot create pool of size ${poolSize}. It would exceed the maximum concurrent thread limit of ${this.maxConcurrentThreads}. Current threads: ${currentThreadCount}.`);
        }

        const pool = new QuantumThreadPool(name, poolSize, this.workerScriptPath, () => this.threadIdCounter++);
        this.pools.set(name, pool);
        
        console.log(`[QuantumThreadManager] Pool "${name}" created with ${poolSize} threads.`);
        return pool;
    }

    /**
     * Retrieves an existing thread pool by its name.
     * @param name - The name of the pool to retrieve.
     * @returns The QuantumThreadPool instance, or undefined if not found.
     */
    public getThreadPool(name: string): QuantumThreadPool | undefined {
        return this.pools.get(name);
    }

    /**
     * Gets the default thread pool, creating it if it doesn't exist.
     * @returns The default QuantumThreadPool.
     */
    public getDefaultPool(): QuantumThreadPool {
        const defaultPoolName = 'default';
        let pool = this.getThreadPool(defaultPoolName);
        if (!pool) {
            pool = this.createThreadPool(defaultPoolName);
        }
        return pool;
    }

    /**
     * Submits a task for execution in a specified or default thread pool.
     * @param task - The QuantumTask to execute.
     * @param [poolName='default'] - The name of the pool to use.
     * @returns A promise that resolves with the task's result.
     */
    public submitTask(task: QuantumTask, poolName: string = 'default'): Promise<any> {
        const pool = this.pools.get(poolName) ?? this.getDefaultPool();
        return pool.submit(task);
    }

    /**
     * Gets the total number of active worker threads across all pools.
     */
    public getTotalActiveThreads(): number {
        let count = 0;
        for (const pool of this.pools.values()) {
            count += pool.getStatistics().totalWorkers;
        }
        return count;
    }

    /**
     * Retrieves statistics for the entire thread management system.
     */
    public getStatistics() {
        const poolStats = Array.from(this.pools.values()).map(p => p.getStatistics());
        return {
            maxConcurrentThreads: this.maxConcurrentThreads,
            totalActiveThreads: this.getTotalActiveThreads(),
            poolCount: this.pools.size,
            pools: poolStats,
        };
    }

    /**
     * Gracefully shuts down all managed thread pools.
     * Waits for all tasks to complete before terminating threads.
     */
    public async shutdown(): Promise<void> {
        console.log('[QuantumThreadManager] Shutting down all thread pools...');
        const shutdownPromises = Array.from(this.pools.values()).map(pool => pool.shutdown());
        await Promise.all(shutdownPromises);
        this.pools.clear();
        console.log('[QuantumThreadManager] All thread pools have been shut down.');
    }
}

/**
 * The singleton instance of the QuantumThreadManager, exported for easy access.
 */
export const quantumThreadManager = QuantumThreadManager.getInstance();