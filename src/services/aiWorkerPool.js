/**
 * AI Worker Pool Manager
 * Manages a pool of worker threads for AI processing to prevent blocking the main thread
 */

const { Worker } = require('worker_threads');
const path = require('path');
const EventEmitter = require('events');

class AIWorkerPool extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.poolSize = options.poolSize || 2; // Default 2 workers
        this.maxQueueSize = options.maxQueueSize || 100;
        this.workerTimeout = options.workerTimeout || 60000; // 60 seconds
        this.aiConfig = options.aiConfig || {
            instances: [
                { url: 'http://localhost:11434', model: 'phi3:mini', weight: 1 }
            ]
        };
        this.workers = [];
        this.availableWorkers = [];
        this.taskQueue = [];
        this.pendingTasks = new Map();
        this.nextTaskId = 1;
        this.workerPath = path.join(__dirname, '../workers/aiWorker.js');
        this.isShuttingDown = false;
        
        // Statistics
        this.stats = {
            tasksCompleted: 0,
            tasksErrored: 0,
            totalProcessingTime: 0,
            averageProcessingTime: 0,
            queuePeakSize: 0,
            workersCreated: 0,
            workersTerminated: 0
        };
    }

    /**
     * Initialize the worker pool
     */
    async initialize() {
        console.log(`[AIWorkerPool] Initializing pool with ${this.poolSize} workers...`);
        
        for (let i = 0; i < this.poolSize; i++) {
            await this.createWorker(i);
        }
        
        console.log(`[AIWorkerPool] Pool initialized with ${this.workers.length} workers`);
        this.emit('ready');
    }

    /**
     * Create a new worker
     * @param {number} workerId - Worker identifier
     */
    async createWorker(workerId) {
        return new Promise((resolve, reject) => {
            const worker = new Worker(this.workerPath, {
                workerData: { 
                    workerId,
                    aiConfig: this.aiConfig
                }
            });

            worker.workerId = workerId;
            worker.isAvailable = false;
            worker.currentTask = null;
            worker.createdAt = Date.now();
            
            worker.on('message', (message) => {
                this.handleWorkerMessage(worker, message);
            });

            worker.on('error', (error) => {
                console.error(`[AIWorkerPool] Worker ${workerId} error:`, error);
                this.handleWorkerError(worker, error);
            });

            worker.on('exit', (code) => {
                console.log(`[AIWorkerPool] Worker ${workerId} exited with code ${code}`);
                this.handleWorkerExit(worker, code);
            });

            // Wait for worker ready signal
            const readyTimeout = setTimeout(() => {
                reject(new Error(`Worker ${workerId} failed to initialize within timeout`));
            }, 10000);

            worker.once('message', (message) => {
                if (message.type === 'WORKER_READY') {
                    clearTimeout(readyTimeout);
                    worker.isAvailable = true;
                    this.workers.push(worker);
                    this.availableWorkers.push(worker);
                    this.stats.workersCreated++;
                    console.log(`[AIWorkerPool] Worker ${workerId} ready`);
                    resolve(worker);
                }
            });
        });
    }

    /**
     * Handle messages from workers
     * @param {Worker} worker - The worker that sent the message
     * @param {Object} message - The message from the worker
     */
    handleWorkerMessage(worker, message) {
        const { id, type, result, error } = message;

        if (type === 'WORKER_READY') {
            return; // Already handled in createWorker
        }

        const task = this.pendingTasks.get(id);
        if (!task) {
            console.warn(`[AIWorkerPool] Received message for unknown task ${id}`);
            return;
        }

        // Clear task timeout
        if (task.timeout) {
            clearTimeout(task.timeout);
        }

        // Remove from pending tasks
        this.pendingTasks.delete(id);
        
        // Mark worker as available
        worker.isAvailable = true;
        worker.currentTask = null;
        this.availableWorkers.push(worker);

        // Handle the response
        if (type === 'ERROR' || error) {
            this.stats.tasksErrored++;
            task.reject(new Error(error?.message || 'Unknown worker error'));
        } else {
            this.stats.tasksCompleted++;
            
            if (result?.processingTime) {
                this.stats.totalProcessingTime += result.processingTime;
                this.stats.averageProcessingTime = this.stats.totalProcessingTime / this.stats.tasksCompleted;
            }
            
            task.resolve(result);
        }

        // Process next task in queue
        this.processNextTask();
    }

    /**
     * Handle worker errors
     * @param {Worker} worker - The worker that errored
     * @param {Error} error - The error
     */
    handleWorkerError(worker, error) {
        // Remove worker from available list
        const availableIndex = this.availableWorkers.indexOf(worker);
        if (availableIndex !== -1) {
            this.availableWorkers.splice(availableIndex, 1);
        }

        // Reject current task if any
        if (worker.currentTask) {
            const task = this.pendingTasks.get(worker.currentTask);
            if (task) {
                this.pendingTasks.delete(worker.currentTask);
                task.reject(error);
            }
        }

        // Replace the worker if not shutting down
        if (!this.isShuttingDown) {
            setTimeout(() => {
                this.createWorker(worker.workerId);
            }, 1000);
        }
    }

    /**
     * Handle worker exit
     * @param {Worker} worker - The worker that exited
     * @param {number} code - Exit code
     */
    handleWorkerExit(worker, code) {
        this.stats.workersTerminated++;
        
        // Remove from workers array
        const workerIndex = this.workers.indexOf(worker);
        if (workerIndex !== -1) {
            this.workers.splice(workerIndex, 1);
        }

        // Remove from available workers
        const availableIndex = this.availableWorkers.indexOf(worker);
        if (availableIndex !== -1) {
            this.availableWorkers.splice(availableIndex, 1);
        }

        this.handleWorkerError(worker, new Error(`Worker exited with code ${code}`));
    }

    /**
     * Submit a task to the worker pool
     * @param {string} type - Task type
     * @param {Object} data - Task data
     * @returns {Promise} Promise that resolves with the task result
     */
    async submitTask(type, data) {
        if (this.isShuttingDown) {
            throw new Error('Worker pool is shutting down');
        }

        if (this.taskQueue.length >= this.maxQueueSize) {
            throw new Error('Task queue is full');
        }

        return new Promise((resolve, reject) => {
            const taskId = this.nextTaskId++;
            const task = {
                id: taskId,
                type,
                data,
                resolve,
                reject,
                submittedAt: Date.now()
            };

            this.taskQueue.push(task);
            this.stats.queuePeakSize = Math.max(this.stats.queuePeakSize, this.taskQueue.length);

            // Try to process immediately
            this.processNextTask();
        });
    }

    /**
     * Process the next task in the queue
     */
    processNextTask() {
        if (this.taskQueue.length === 0 || this.availableWorkers.length === 0) {
            return;
        }

        const task = this.taskQueue.shift();
        const worker = this.availableWorkers.shift();

        if (!worker || !worker.isAvailable) {
            // Put task back in queue if worker is not available
            this.taskQueue.unshift(task);
            return;
        }

        // Mark worker as busy
        worker.isAvailable = false;
        worker.currentTask = task.id;

        // Set up task timeout
        task.timeout = setTimeout(() => {
            this.pendingTasks.delete(task.id);
            task.reject(new Error(`Task ${task.id} timed out after ${this.workerTimeout}ms`));
            
            // Terminate and recreate the worker
            worker.terminate();
        }, this.workerTimeout);

        // Store pending task
        this.pendingTasks.set(task.id, task);

        // Send task to worker
        worker.postMessage({
            id: task.id,
            type: task.type,
            data: task.data
        });
    }

    /**
     * Summarize an article using the worker pool
     * @param {Object} articleData - Article data
     * @returns {Promise<Object>} Summarization result
     */
    async summarizeArticle(articleData) {
        return this.submitTask('SUMMARIZE_ARTICLE', articleData);
    }

    /**
     * Get pool statistics
     * @returns {Object} Pool statistics
     */
    getStatistics() {
        return {
            ...this.stats,
            poolSize: this.poolSize,
            activeWorkers: this.workers.length,
            availableWorkers: this.availableWorkers.length,
            busyWorkers: this.workers.length - this.availableWorkers.length,
            queueSize: this.taskQueue.length,
            pendingTasks: this.pendingTasks.size,
            uptime: Date.now() - (this.workers[0]?.createdAt || Date.now())
        };
    }

    /**
     * Health check for the pool
     * @returns {Promise<Object>} Health status
     */
    async healthCheck() {
        if (this.workers.length === 0) {
            return { healthy: false, reason: 'No workers available' };
        }

        try {
            // Test with a simple health check task
            const healthPromises = this.workers.map(worker => {
                if (!worker.isAvailable) return Promise.resolve({ healthy: true });
                
                return new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        resolve({ healthy: false, reason: 'Health check timeout' });
                    }, 5000);

                    worker.postMessage({
                        id: `health-${Date.now()}`,
                        type: 'HEALTH_CHECK',
                        data: {}
                    });

                    worker.once('message', (message) => {
                        clearTimeout(timeout);
                        resolve({ healthy: message.type === 'HEALTH_CHECK_RESPONSE' });
                    });
                });
            });

            const results = await Promise.all(healthPromises);
            const healthyWorkers = results.filter(r => r.healthy).length;

            return {
                healthy: healthyWorkers > 0,
                workersHealthy: healthyWorkers,
                totalWorkers: this.workers.length,
                healthPercentage: (healthyWorkers / this.workers.length) * 100
            };
        } catch (error) {
            return { healthy: false, reason: error.message };
        }
    }

    /**
     * Shutdown the worker pool
     */
    async shutdown() {
        console.log('[AIWorkerPool] Shutting down...');
        this.isShuttingDown = true;

        // Reject all pending tasks
        for (const task of this.pendingTasks.values()) {
            if (task.timeout) clearTimeout(task.timeout);
            task.reject(new Error('Worker pool is shutting down'));
        }
        this.pendingTasks.clear();

        // Reject queued tasks
        for (const task of this.taskQueue) {
            task.reject(new Error('Worker pool is shutting down'));
        }
        this.taskQueue.length = 0;

        // Terminate all workers
        const terminationPromises = this.workers.map(worker => {
            return new Promise((resolve) => {
                worker.once('exit', resolve);
                worker.terminate();
            });
        });

        await Promise.all(terminationPromises);
        console.log('[AIWorkerPool] Shutdown complete');
    }
}

module.exports = { AIWorkerPool };