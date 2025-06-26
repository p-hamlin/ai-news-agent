/**
 * Concurrent Feed Processing Service
 * Handles parallel RSS feed fetching with configurable concurrency and error handling
 */

const Parser = require('rss-parser');

class FeedProcessor {
    constructor(options = {}) {
        this.concurrencyLimit = options.concurrencyLimit || 5;
        this.requestTimeout = options.requestTimeout || 30000; // 30 seconds
        this.retryAttempts = options.retryAttempts || 3;
        this.retryDelay = options.retryDelay || 1000; // 1 second base delay
        this.dbService = options.dbService; // Database service for metadata
        this.parser = new Parser({
            timeout: this.requestTimeout,
            headers: {
                'User-Agent': 'AI-News-Agent/1.0'
            }
        });
        
        // Track failed feeds for exponential backoff
        this.failureTracker = new Map();
    }

    /**
     * Process multiple feeds concurrently with controlled concurrency
     * @param {Array} feeds - Array of feed objects with id, url, name
     * @param {Function} onFeedProcessed - Callback for each processed feed
     * @returns {Promise<Array>} Results array with success/failure status
     */
    async processFeeds(feeds, onFeedProcessed) {
        const results = [];
        const semaphore = new Semaphore(this.concurrencyLimit);
        
        const processingPromises = feeds.map(async (feed) => {
            return semaphore.acquire(async () => {
                const result = await this.processSingleFeed(feed);
                if (onFeedProcessed) {
                    await onFeedProcessed(feed, result);
                }
                results.push(result);
                return result;
            });
        });

        await Promise.allSettled(processingPromises);
        return results;
    }

    /**
     * Process a single feed with retry logic, conditional requests, and diff optimization
     * @param {Object} feed - Feed object with id, url, name
     * @returns {Promise<Object>} Processing result
     */
    async processSingleFeed(feed) {
        const feedKey = `${feed.id}-${feed.url}`;
        const failureInfo = this.failureTracker.get(feedKey);
        
        // Check if feed is in backoff period
        if (failureInfo && Date.now() < failureInfo.nextRetryTime) {
            return {
                feedId: feed.id,
                feedName: feed.name,
                feedUrl: feed.url,
                success: false,
                skipped: true,
                reason: 'In backoff period',
                nextRetryTime: failureInfo.nextRetryTime
            };
        }

        // Get feed metadata for conditional requests
        let conditionalHeaders = {};
        if (this.dbService) {
            try {
                const metadata = await this.dbService.feedMetadata.get(feed.id);
                if (metadata) {
                    if (metadata.etag) {
                        conditionalHeaders['If-None-Match'] = metadata.etag;
                    }
                    if (metadata.lastModified) {
                        conditionalHeaders['If-Modified-Since'] = metadata.lastModified;
                    }
                }
            } catch (error) {
                console.warn(`[FeedProcessor] Could not get metadata for feed ${feed.name}:`, error.message);
            }
        }

        let lastError = null;
        let attempts = 0;
        
        while (attempts < this.retryAttempts) {
            attempts++;
            
            try {
                const startTime = Date.now();
                
                // Create custom parser with conditional headers
                const customParser = new Parser({
                    timeout: this.requestTimeout,
                    headers: {
                        'User-Agent': 'AI-News-Agent/1.0',
                        ...conditionalHeaders
                    }
                });
                
                const parsedFeed = await customParser.parseURL(feed.url);
                const processingTime = Date.now() - startTime;
                
                // Extract response headers if available (for caching)
                const responseHeaders = parsedFeed.responseHeaders || {};
                const etag = responseHeaders.etag || responseHeaders.ETag;
                const lastModified = responseHeaders['last-modified'] || responseHeaders['Last-Modified'];
                
                // Reset failure tracker on success
                this.failureTracker.delete(feedKey);
                
                // Update feed metadata with success
                if (this.dbService) {
                    try {
                        await this.dbService.feedMetadata.updateSuccess(
                            feed.id, 
                            parsedFeed.items?.length || 0,
                            etag,
                            lastModified
                        );
                    } catch (error) {
                        console.warn(`[FeedProcessor] Could not update metadata for feed ${feed.name}:`, error.message);
                    }
                }
                
                return {
                    feedId: feed.id,
                    feedName: feed.name,
                    feedUrl: feed.url,
                    success: true,
                    articles: parsedFeed.items || [],
                    processingTime,
                    attempts,
                    etag,
                    lastModified,
                    wasConditional: Object.keys(conditionalHeaders).length > 0
                };
                
            } catch (error) {
                lastError = error;
                
                // Check if this is a 304 Not Modified response
                if (error.message && error.message.includes('304')) {
                    // Reset failure tracker on 304 (it's a successful conditional request)
                    this.failureTracker.delete(feedKey);
                    
                    return {
                        feedId: feed.id,
                        feedName: feed.name,
                        feedUrl: feed.url,
                        success: true,
                        notModified: true,
                        articles: [],
                        processingTime: Date.now() - startTime,
                        attempts,
                        wasConditional: true
                    };
                }
                
                console.warn(`[FeedProcessor] Attempt ${attempts} failed for feed ${feed.name}: ${error.message}`);
                
                // Wait before retry (except on last attempt)
                if (attempts < this.retryAttempts) {
                    await this.delay(this.retryDelay * attempts);
                }
            }
        }

        // All attempts failed - update failure tracker and metadata
        this.updateFailureTracker(feedKey, failureInfo);
        
        if (this.dbService) {
            try {
                await this.dbService.feedMetadata.updateFailure(feed.id, lastError.message);
            } catch (error) {
                console.warn(`[FeedProcessor] Could not update failure metadata for feed ${feed.name}:`, error.message);
            }
        }
        
        return {
            feedId: feed.id,
            feedName: feed.name,
            feedUrl: feed.url,
            success: false,
            error: lastError.message,
            attempts,
            nextRetryTime: this.failureTracker.get(feedKey).nextRetryTime
        };
    }

    /**
     * Update failure tracker with exponential backoff
     * @param {string} feedKey - Unique feed identifier
     * @param {Object} existingFailure - Existing failure info
     */
    updateFailureTracker(feedKey, existingFailure) {
        const failureCount = existingFailure ? existingFailure.count + 1 : 1;
        const backoffMinutes = Math.min(Math.pow(2, failureCount - 1) * 5, 240); // Max 4 hours
        const nextRetryTime = Date.now() + (backoffMinutes * 60 * 1000);
        
        this.failureTracker.set(feedKey, {
            count: failureCount,
            lastFailureTime: Date.now(),
            nextRetryTime
        });
        
        console.log(`[FeedProcessor] Feed ${feedKey} will be retried in ${backoffMinutes} minutes`);
    }

    /**
     * Get statistics about feed processing
     * @returns {Object} Processing statistics
     */
    getStatistics() {
        const totalTrackedFeeds = this.failureTracker.size;
        const feedsInBackoff = Array.from(this.failureTracker.values())
            .filter(failure => Date.now() < failure.nextRetryTime).length;
        
        return {
            totalTrackedFeeds,
            feedsInBackoff,
            concurrencyLimit: this.concurrencyLimit,
            requestTimeout: this.requestTimeout
        };
    }

    /**
     * Clear failure tracking for a specific feed
     * @param {number} feedId - Feed ID to clear
     * @param {string} feedUrl - Feed URL to clear
     */
    clearFailureTracking(feedId, feedUrl) {
        const feedKey = `${feedId}-${feedUrl}`;
        this.failureTracker.delete(feedKey);
    }

    /**
     * Utility method for delays
     * @param {number} ms - Milliseconds to delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Semaphore implementation for controlling concurrency
 */
class Semaphore {
    constructor(permits) {
        this.permits = permits;
        this.waiting = [];
    }

    async acquire(task) {
        return new Promise((resolve, reject) => {
            if (this.permits > 0) {
                this.permits--;
                this.executeTask(task, resolve, reject);
            } else {
                this.waiting.push({ task, resolve, reject });
            }
        });
    }

    async executeTask(task, resolve, reject) {
        try {
            const result = await task();
            resolve(result);
        } catch (error) {
            reject(error);
        } finally {
            this.permits++;
            if (this.waiting.length > 0) {
                const { task: nextTask, resolve: nextResolve, reject: nextReject } = this.waiting.shift();
                this.permits--;
                this.executeTask(nextTask, nextResolve, nextReject);
            }
        }
    }
}

module.exports = { FeedProcessor };