/**
 * AI Load Balancer Service
 * Manages multiple Ollama instances for parallel AI processing with load balancing
 */

const sanitizeHtml = require('sanitize-html');

class AILoadBalancer {
    constructor(options = {}) {
        this.instances = options.instances || [
            { url: 'http://localhost:11434', model: 'phi3:mini', weight: 1 },
        ];
        this.requestTimeout = options.requestTimeout || 60000; // 60 seconds
        this.retryAttempts = options.retryAttempts || 2;
        this.healthCheckInterval = options.healthCheckInterval || 5 * 60 * 1000; // 5 minutes
        
        // Instance health tracking
        this.instanceHealth = new Map();
        this.requestCounts = new Map();
        this.lastHealthCheck = 0;
        this.roundRobinIndex = 0;
        
        // Initialize health tracking
        this.initializeInstanceHealth();
        
        // Start periodic health checks
        this.startHealthChecks();
    }

    /**
     * Initialize health tracking for all instances
     */
    initializeInstanceHealth() {
        this.instances.forEach((instance, index) => {
            const key = this.getInstanceKey(instance);
            this.instanceHealth.set(key, {
                healthy: true,
                lastCheck: 0,
                consecutiveFailures: 0,
                averageResponseTime: 0,
                totalRequests: 0,
                successfulRequests: 0
            });
            this.requestCounts.set(key, 0);
        });
    }

    /**
     * Get a unique key for an instance
     * @param {Object} instance - Instance configuration
     * @returns {string} Unique key
     */
    getInstanceKey(instance) {
        return `${instance.url}-${instance.model}`;
    }

    /**
     * Start periodic health checks
     */
    startHealthChecks() {
        setInterval(async () => {
            await this.performHealthChecks();
        }, this.healthCheckInterval);
        
        // Perform initial health check
        setTimeout(() => this.performHealthChecks(), 1000);
    }

    /**
     * Perform health checks on all instances
     */
    async performHealthChecks() {
        console.log('[AILoadBalancer] Performing health checks...');
        const healthPromises = this.instances.map(instance => this.checkInstanceHealth(instance));
        await Promise.allSettled(healthPromises);
        this.lastHealthCheck = Date.now();
    }

    /**
     * Check health of a specific instance
     * @param {Object} instance - Instance to check
     */
    async checkInstanceHealth(instance) {
        const key = this.getInstanceKey(instance);
        const health = this.instanceHealth.get(key);
        
        try {
            const startTime = Date.now();
            const response = await fetch(`${instance.url}/api/tags`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(10000) // 10 second timeout for health check
            });

            if (response.ok) {
                const responseTime = Date.now() - startTime;
                health.healthy = true;
                health.consecutiveFailures = 0;
                health.lastCheck = Date.now();
                health.averageResponseTime = health.averageResponseTime > 0 
                    ? (health.averageResponseTime * 0.8 + responseTime * 0.2)
                    : responseTime;
                
                console.log(`[AILoadBalancer] Instance ${key} healthy (${responseTime}ms)`);
            } else {
                throw new Error(`Health check failed with status ${response.status}`);
            }
        } catch (error) {
            health.healthy = false;
            health.consecutiveFailures++;
            health.lastCheck = Date.now();
            
            console.warn(`[AILoadBalancer] Instance ${key} health check failed:`, error.message);
        }

        this.instanceHealth.set(key, health);
    }

    /**
     * Get the best available instance using weighted round-robin with health consideration
     * @returns {Object|null} Best instance or null if none available
     */
    getNextInstance() {
        const healthyInstances = this.instances.filter(instance => {
            const key = this.getInstanceKey(instance);
            const health = this.instanceHealth.get(key);
            return health && health.healthy;
        });

        if (healthyInstances.length === 0) {
            return null;
        }

        // Simple round-robin among healthy instances
        const instance = healthyInstances[this.roundRobinIndex % healthyInstances.length];
        this.roundRobinIndex++;
        
        // Update request count
        const key = this.getInstanceKey(instance);
        this.requestCounts.set(key, this.requestCounts.get(key) + 1);
        
        return instance;
    }

    /**
     * Generate summary using the best available instance
     * @param {string} articleContent - Article content to summarize
     * @param {Object} options - Additional options
     * @returns {Promise<string>} Generated summary
     */
    async generateSummary(articleContent, options = {}) {
        // Sanitize and prepare content
        const cleanContent = sanitizeHtml(articleContent, {
            allowedTags: [],
            allowedAttributes: {},
        });

        const truncatedContent = cleanContent.substring(0, 15000);
        
        if (!truncatedContent.trim()) {
            throw new Error('Article content is empty after sanitization');
        }

        const systemPrompt = `You are a senior editor at a major news publication, an expert in distilling complex topics into clear, concise, and unbiased summaries for a general audience. Your task is to summarize the provided news article. Do not include any information that you would not publish to a large audience.`;

        const userPrompt = `**TASK:** Generate a summary of the article that adheres to the following strict guidelines:

1.  **Headline:** Start with a short, impactful headline that captures the essence of the article. Do not use the original article's title.
2.  **Key Takeaways:** Provide a bulleted list of the 3-4 most important takeaways from the article. Each bullet point should be a complete sentence.
3.  **Broader Context:** In a concluding sentence, briefly explain the broader context or potential implications of the news.

**CONSTRAINTS:**
*   **Tone:** Maintain a strictly neutral, objective, and professional tone.
*   **Length:** The entire summary should be no more than 150 words.
*   **Format:** Use Markdown for formatting. The headline should be bold, followed by the bulleted list, and then the concluding sentence.

**ARTICLE:**
${truncatedContent}`;

        let lastError = null;
        let attempts = 0;

        while (attempts < this.retryAttempts) {
            attempts++;
            
            const instance = this.getNextInstance();
            if (!instance) {
                throw new Error('No healthy AI instances available');
            }

            const key = this.getInstanceKey(instance);
            const health = this.instanceHealth.get(key);
            
            try {
                const startTime = Date.now();
                
                console.log(`[AILoadBalancer] Sending request to ${key} (attempt ${attempts})`);
                
                const response = await fetch(`${instance.url}/api/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: AbortSignal.timeout(this.requestTimeout),
                    body: JSON.stringify({
                        model: instance.model,
                        prompt: userPrompt,
                        system: systemPrompt,
                        stream: false,
                        options: {
                            temperature: 0.2,
                            top_k: 20,
                            top_p: 0.5,
                            seed: 42
                        }
                    }),
                });

                if (!response.ok) {
                    const errorBody = await response.text();
                    throw new Error(`AI API request failed with status ${response.status}: ${errorBody}`);
                }

                const data = await response.json();
                const responseTime = Date.now() - startTime;
                
                // Update health statistics
                health.totalRequests++;
                health.successfulRequests++;
                health.averageResponseTime = health.averageResponseTime > 0 
                    ? (health.averageResponseTime * 0.9 + responseTime * 0.1)
                    : responseTime;
                this.instanceHealth.set(key, health);
                
                console.log(`[AILoadBalancer] Successfully received summary from ${key} in ${responseTime}ms`);
                
                const summary = data.response.trim();
                const words = summary.split(/\s+/);

                if (words.length > 200) {
                    const truncatedSummary = words.slice(0, 200).join(' ') + '...';
                    console.log(`Summary truncated from ${words.length} to 200 words.`);
                    return truncatedSummary;
                }

                return summary;

            } catch (error) {
                lastError = error;
                
                // Update health statistics
                health.totalRequests++;
                health.consecutiveFailures++;
                
                // Mark as unhealthy if too many consecutive failures
                if (health.consecutiveFailures >= 3) {
                    health.healthy = false;
                    console.warn(`[AILoadBalancer] Marking instance ${key} as unhealthy after ${health.consecutiveFailures} failures`);
                }
                
                this.instanceHealth.set(key, health);
                
                console.warn(`[AILoadBalancer] Request to ${key} failed (attempt ${attempts}):`, error.message);
                
                // Don't retry on certain errors
                if (error.message.includes('timeout') || error.message.includes('AbortError')) {
                    continue;
                }
            }
        }

        throw new Error(`All AI instances failed. Last error: ${lastError?.message || 'Unknown error'}`);
    }

    /**
     * Get load balancer statistics
     * @returns {Object} Statistics object
     */
    getStatistics() {
        const totalInstances = this.instances.length;
        const healthyInstances = Array.from(this.instanceHealth.values())
            .filter(health => health.healthy).length;
        
        const instanceStats = this.instances.map(instance => {
            const key = this.getInstanceKey(instance);
            const health = this.instanceHealth.get(key);
            const requestCount = this.requestCounts.get(key);
            
            return {
                url: instance.url,
                model: instance.model,
                healthy: health.healthy,
                averageResponseTime: Math.round(health.averageResponseTime),
                totalRequests: health.totalRequests,
                successfulRequests: health.successfulRequests,
                successRate: health.totalRequests > 0 
                    ? Math.round((health.successfulRequests / health.totalRequests) * 100)
                    : 0,
                consecutiveFailures: health.consecutiveFailures,
                requestCount
            };
        });

        return {
            totalInstances,
            healthyInstances,
            unhealthyInstances: totalInstances - healthyInstances,
            lastHealthCheck: this.lastHealthCheck,
            instances: instanceStats,
            roundRobinIndex: this.roundRobinIndex
        };
    }

    /**
     * Add a new AI instance
     * @param {Object} instance - Instance configuration
     */
    addInstance(instance) {
        this.instances.push(instance);
        const key = this.getInstanceKey(instance);
        this.instanceHealth.set(key, {
            healthy: true,
            lastCheck: 0,
            consecutiveFailures: 0,
            averageResponseTime: 0,
            totalRequests: 0,
            successfulRequests: 0
        });
        this.requestCounts.set(key, 0);
        
        // Immediately check health
        setTimeout(() => this.checkInstanceHealth(instance), 100);
    }

    /**
     * Remove an AI instance
     * @param {string} url - Instance URL to remove
     * @param {string} model - Instance model to remove
     */
    removeInstance(url, model) {
        const key = `${url}-${model}`;
        this.instances = this.instances.filter(instance => 
            this.getInstanceKey(instance) !== key
        );
        this.instanceHealth.delete(key);
        this.requestCounts.delete(key);
    }

    /**
     * Force health check on all instances
     */
    async forceHealthCheck() {
        await this.performHealthChecks();
        return this.getStatistics();
    }
}

module.exports = { AILoadBalancer };