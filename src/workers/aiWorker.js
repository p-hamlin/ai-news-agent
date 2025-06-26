/**
 * AI Worker Thread
 * Handles AI summarization requests in a separate thread to avoid blocking the main process
 */

const { parentPort, workerData } = require('worker_threads');
const { AILoadBalancer } = require('../services/aiLoadBalancer.js');

// Initialize AI load balancer in worker
const aiLoadBalancer = new AILoadBalancer(workerData?.aiConfig || {
    instances: [
        { url: 'http://localhost:11434', model: 'phi3:mini', weight: 1 }
    ]
});

// Handle incoming messages from main thread
parentPort.on('message', async (message) => {
    const { id, type, data } = message;
    
    try {
        switch (type) {
            case 'SUMMARIZE_ARTICLE':
                const result = await handleSummarizeArticle(data);
                parentPort.postMessage({
                    id,
                    type: 'SUMMARIZE_SUCCESS',
                    result
                });
                break;
                
            case 'HEALTH_CHECK':
                parentPort.postMessage({
                    id,
                    type: 'HEALTH_CHECK_RESPONSE',
                    result: { healthy: true, timestamp: Date.now() }
                });
                break;
                
            case 'GET_LOAD_BALANCER_STATS':
                const stats = aiLoadBalancer.getStatistics();
                parentPort.postMessage({
                    id,
                    type: 'LOAD_BALANCER_STATS_RESPONSE',
                    result: stats
                });
                break;
                
            default:
                throw new Error(`Unknown message type: ${type}`);
        }
    } catch (error) {
        parentPort.postMessage({
            id,
            type: 'ERROR',
            error: {
                message: error.message,
                stack: error.stack
            }
        });
    }
});

/**
 * Handle article summarization request
 * @param {Object} data - Article data with id, content, etc.
 * @returns {Promise<Object>} Summarization result
 */
async function handleSummarizeArticle(data) {
    const { articleId, content, title, url } = data;
    
    if (!content || content.trim().length === 0) {
        throw new Error('Article content is empty or missing');
    }
    
    const startTime = Date.now();
    
    try {
        const summary = await aiLoadBalancer.generateSummary(content);
        const processingTime = Date.now() - startTime;
        
        return {
            articleId,
            summary,
            processingTime,
            timestamp: Date.now(),
            wordCount: content.split(/\s+/).length,
            summaryLength: summary.length
        };
    } catch (error) {
        const processingTime = Date.now() - startTime;
        
        // Enhanced error information
        throw new Error(`Failed to summarize article ${articleId}: ${error.message} (processed in ${processingTime}ms)`);
    }
}

// Send ready signal to main thread
parentPort.postMessage({
    type: 'WORKER_READY',
    workerId: workerData?.workerId || 'unknown',
    timestamp: Date.now()
});