/**
 * @fileoverview Implements the `QuantumThread` and `QuantumThreadPool` abstractions
 * for managing concurrent classical orchestration of asynchronous quantum tasks.
 *
 * In this context, "quantum" is a metaphor for asynchronous operations that
 * exist in a state of "superposition" (i.e., pending) until they are "measured"
 * (i.e., they resolve or reject), at which point they "collapse" to a definite state.
 * This provides a flavorful abstraction for a standard thread/worker pool pattern
 * suited for managing tasks in a highly concurrent environment like a modern web terminal.
 */

/**
 * Represents the possible states of a QuantumThread.
 * @enum {string}
 */
export const QuantumState = {
  /** The thread has been created but has not yet been put into superposition. */
  PRISTINE: 'PRISTINE',
  /** The thread is actively executing its asynchronous task. It is in a state of superposition. */
  SUPERPOSITION: 'SUPERPOSITION',
  /** The thread's task has completed, and its state has been measured (resolved or rejected). */
  COLLAPSED: 'COLLAPSED',
};

/**
 * Represents a single unit of asynchronous work, conceptualized as a "quantum thread".
 * Each thread encapsulates a single promise-based task. When the task is executed,
 * the thread enters a state of "superposition". When the task completes, the thread
 * "collapses" into a definite state, yielding a result or an error.
 */
export class QuantumThread {
  /**
   * @param {number} id A unique identifier for the thread.
   * @param {function(): Promise<any>} task The asynchronous function to be executed.
   */
  constructor(id, task) {
    if (typeof task !== 'function') {
      throw new TypeError('Task must be a function that returns a Promise.');
    }
    /** @type {number} */
    this.id = id;
    /** @private @type {function(): Promise<any>} */
    this._task = task;
    /** @type {QuantumState} */
    this.state = QuantumState.PRISTINE;
    /** @type {any} */
    this.result = undefined;
    /** @type {Error|any} */
    this.error = undefined;
    /** @private @type {Promise<any> | null} */
    this._collapsePromise = null;
  }

  /**
   * Puts the thread into superposition by executing its task.
   * This method is idempotent; it will only execute the task once.
   * @returns {Promise<any>} A promise that resolves with the task's result
   * or rejects with its error upon collapse.
   */
  entangle() {
    if (this.state !== QuantumState.PRISTINE) {
      return this._collapsePromise;
    }

    this.state = QuantumState.SUPERPOSITION;

    this._collapsePromise = new Promise((resolve, reject) => {
      // Execute the task asynchronously to avoid blocking the event loop.
      Promise.resolve()
        .then(() => this._task())
        .then(value => {
          this.state = QuantumState.COLLAPSED;
          this.result = value;
          resolve(value);
        })
        .catch(err => {
          this.state = QuantumState.COLLAPSED;
          this.error = err;
          reject(err);
        });
    });

    return this._collapsePromise;
  }

  /**
   * Checks if the thread is currently in superposition (running).
   * @returns {boolean}
   */
  isSuperposed() {
    return this.state === QuantumState.SUPERPOSITION;
  }

  /**
   * Checks if the thread has collapsed (finished).
   * @returns {boolean}
   */
  isCollapsed() {
    return this.state === QuantumState.COLLAPSED;
  }

  /**
   * Gets the measured outcome of the thread.
   * @returns {{result: any, error: any}} The final state after collapse.
   */
  getMeasurement() {
    if (!this.isCollapsed()) {
      console.warn(`QuantumThread ${this.id} has not collapsed yet. Measurement may be indeterminate.`);
    }
    return { result: this.result, error: this.error };
  }
}

/**
 * Manages a pool of QuantumThreads to limit concurrency.
 * It orchestrates the execution of many asynchronous tasks, ensuring that
 * no more than a specified number are in "superposition" at any given time.
 */
export class QuantumThreadPool {
  /**
   * @param {number} [maxConcurrency=navigator.hardwareConcurrency || 4] The maximum number of threads
   * that can be in superposition simultaneously.
   */
  constructor(maxConcurrency) {
    const defaultConcurrency = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : 4;
    this.poolSize = maxConcurrency > 0 ? maxConcurrency : defaultConcurrency;

    /** @private @type {Set<QuantumThread>} */
    this._activeThreads = new Set();
    /** @private @type {Array<{task: function(): Promise<any>, resolve: function, reject: function}>} */
    this._queue = [];
    /** @private @type {number} */
    this._nextThreadId = 0;
    /** @private @type {boolean} */
    this._isShutdown = false;
  }

  /**
   * The number of threads currently in superposition.
   * @returns {number}
   */
  get activeCount() {
    return this._activeThreads.size;
  }

  /**
   * The number of tasks waiting in the queue to be entangled.
   * @returns {number}
   */
  get pendingCount() {
    return this._queue.length;
  }

  /**
   * Submits a new quantum task to the pool for execution.
   * The task will be queued and will be put into superposition as soon as a
   * thread becomes available.
   * @param {function(): Promise<any>} task The asynchronous task to execute.
   * @returns {Promise<any>} A promise that resolves or rejects with the task's outcome.
   */
  submit(task) {
    if (this._isShutdown) {
        return Promise.reject(new Error('QuantumThreadPool has been shut down. No new tasks can be submitted.'));
    }
    return new Promise((resolve, reject) => {
      this._queue.push({ task, resolve, reject });
      this._schedule();
    });
  }

  /**
   * @private
   * The core scheduler. It checks if a slot is available in the pool and
   * if there are tasks in the queue. If so, it dequeues a task, creates a
   * new QuantumThread for it, and entangles it.
   */
  _schedule() {
    if (this.activeCount >= this.poolSize || this._queue.length === 0 || this._isShutdown) {
      return; // Pool is full, queue is empty, or pool is shutting down
    }

    const { task, resolve, reject } = this._queue.shift();
    const threadId = this._nextThreadId++;
    const thread = new QuantumThread(threadId, task);

    this._activeThreads.add(thread);

    thread.entangle()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        this._activeThreads.delete(thread);
        // A thread has collapsed, try to schedule the next one.
        this._schedule();
      });
  }

  /**
   * Waits for all currently active and queued tasks to complete.
   * No new tasks can be submitted after calling this.
   * @returns {Promise<void>} A promise that resolves when the pool becomes idle.
   */
  async shutdown() {
    this._isShutdown = true;
    // This promise will resolve when both active and queued tasks are zero.
    return new Promise(resolve => {
        const checkIdle = () => {
            if (this.activeCount === 0 && this.pendingCount === 0) {
                resolve();
            } else {
                // Check again on the next tick. A more robust implementation
                // might use an event emitter, but polling is simpler here.
                setTimeout(checkIdle, 50);
            }
        };
        checkIdle();
    });
  }
}