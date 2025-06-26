// memoryOptimizer.js - Advanced memory management for large article collections
class MemoryOptimizer {
    constructor(options = {}) {
        this.maxArticlesInMemory = options.maxArticlesInMemory || 1000;
        this.maxContentCacheSize = options.maxContentCacheSize || 50 * 1024 * 1024; // 50MB
        this.gcInterval = options.gcInterval || 30000; // 30 seconds
        this.compressionThreshold = options.compressionThreshold || 10 * 1024; // 10KB
        
        // Article storage with priority-based eviction
        this.articleCache = new Map();
        this.contentCache = new Map();
        this.accessTracker = new Map();
        
        // Memory usage tracking
        this.currentCacheSize = 0;
        this.compressionStats = {
            compressed: 0,
            originalSize: 0,
            compressedSize: 0,
            compressionRatio: 0
        };
        
        // Cleanup scheduling
        this.gcTimer = null;
        this.isOptimizing = false;
        
        this.startGarbageCollection();
    }
    
    // Article management with intelligent caching
    
    addArticles(articles, feedId = null) {
        const startTime = performance.now();
        const addedCount = 0;
        
        articles.forEach(article => {
            this.addSingleArticle(article, feedId);
        });
        
        // Trigger cleanup if we're over the limit
        if (this.articleCache.size > this.maxArticlesInMemory) {
            this.scheduleCleanup();
        }
        
        const duration = performance.now() - startTime;
        console.log(`Added ${articles.length} articles in ${duration.toFixed(2)}ms`);
        
        return articles.length;
    }
    
    addSingleArticle(article, feedId = null) {
        // Create optimized article object
        const optimizedArticle = this.optimizeArticleForStorage(article);
        
        // Store with priority scoring
        const priority = this.calculatePriority(optimizedArticle, feedId);
        const cacheEntry = {
            article: optimizedArticle,
            priority,
            feedId,
            addedAt: Date.now(),
            lastAccessed: Date.now(),
            accessCount: 0,
            memoryFootprint: this.estimateMemoryFootprint(optimizedArticle)
        };
        
        this.articleCache.set(article.id, cacheEntry);
        this.accessTracker.set(article.id, Date.now());
        
        // Compress large content if needed
        if (optimizedArticle.content && optimizedArticle.content.length > this.compressionThreshold) {
            this.compressArticleContent(article.id, optimizedArticle.content);
        }
    }
    
    getArticle(articleId) {
        const cacheEntry = this.articleCache.get(articleId);
        if (!cacheEntry) return null;
        
        // Update access tracking
        cacheEntry.lastAccessed = Date.now();
        cacheEntry.accessCount++;
        this.accessTracker.set(articleId, Date.now());
        
        // Decompress content if needed
        const article = { ...cacheEntry.article };
        if (this.contentCache.has(articleId)) {
            article.content = this.decompressContent(articleId);
        }
        
        return article;
    }
    
    getArticlesByFeed(feedId, limit = null) {
        const articles = [];
        
        for (const [articleId, cacheEntry] of this.articleCache) {
            if (cacheEntry.feedId === feedId) {
                articles.push({
                    ...cacheEntry.article,
                    id: articleId
                });
                
                // Update access tracking
                cacheEntry.lastAccessed = Date.now();
                cacheEntry.accessCount++;
            }
            
            if (limit && articles.length >= limit) break;
        }
        
        return articles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    }
    
    removeArticle(articleId) {
        const removed = this.articleCache.delete(articleId);
        this.accessTracker.delete(articleId);
        this.contentCache.delete(articleId);
        return removed;
    }
    
    removeArticlesByFeed(feedId) {
        let removedCount = 0;
        
        for (const [articleId, cacheEntry] of this.articleCache) {
            if (cacheEntry.feedId === feedId) {
                this.removeArticle(articleId);
                removedCount++;
            }
        }
        
        return removedCount;
    }
    
    // Memory optimization methods
    
    optimizeArticleForStorage(article) {
        // Create a lightweight version of the article
        const optimized = {
            id: article.id,
            title: article.title || '',
            link: article.link || '',
            pubDate: article.pubDate || new Date().toISOString(),
            isRead: Boolean(article.isRead),
            status: article.status || 'new'
        };
        
        // Only include summary if it exists and is reasonably sized
        if (article.summary && article.summary.length < 5000) {
            optimized.summary = article.summary;
        }
        
        // Handle content compression separately for large content
        if (article.content) {
            if (article.content.length > this.compressionThreshold) {
                // Will be compressed separately
                optimized.hasCompressedContent = true;
            } else {
                optimized.content = article.content;
            }
        }
        
        return optimized;
    }
    
    calculatePriority(article, feedId) {
        let priority = 0;
        
        // Recent articles get higher priority
        const age = Date.now() - new Date(article.pubDate).getTime();
        const ageInDays = age / (24 * 60 * 60 * 1000);
        priority += Math.max(0, 100 - ageInDays * 2);
        
        // Unread articles get higher priority
        if (!article.isRead) {
            priority += 50;
        }
        
        // Summarized articles get medium priority
        if (article.status === 'summarized') {
            priority += 30;
        }
        
        // Failed articles get lower priority
        if (article.status === 'failed') {
            priority -= 20;
        }
        
        return Math.max(0, priority);
    }
    
    estimateMemoryFootprint(article) {
        // Rough estimation of memory usage in bytes
        let size = 0;
        
        for (const [key, value] of Object.entries(article)) {
            if (typeof value === 'string') {
                size += value.length * 2; // UTF-16 encoding
            } else if (typeof value === 'number') {
                size += 8;
            } else if (typeof value === 'boolean') {
                size += 4;
            } else if (value !== null && value !== undefined) {
                size += JSON.stringify(value).length * 2;
            }
        }
        
        return size;
    }
    
    // Content compression using simple algorithm
    compressArticleContent(articleId, content) {
        try {
            // Simple compression using LZ-string-like algorithm
            const compressed = this.simpleCompress(content);
            
            if (compressed.length < content.length * 0.8) { // Only if we save at least 20%
                this.contentCache.set(articleId, compressed);
                this.currentCacheSize += compressed.length;
                
                // Update compression stats
                this.compressionStats.compressed++;
                this.compressionStats.originalSize += content.length;
                this.compressionStats.compressedSize += compressed.length;
                this.compressionStats.compressionRatio = 
                    this.compressionStats.compressedSize / this.compressionStats.originalSize;
                
                console.log(`Compressed article ${articleId}: ${content.length} -> ${compressed.length} bytes`);
                return true;
            }
        } catch (error) {
            console.warn(`Failed to compress article ${articleId}:`, error);
        }
        
        return false;
    }
    
    decompressContent(articleId) {
        const compressed = this.contentCache.get(articleId);
        if (!compressed) return null;
        
        try {
            return this.simpleDecompress(compressed);
        } catch (error) {
            console.warn(`Failed to decompress article ${articleId}:`, error);
            this.contentCache.delete(articleId);
            return null;
        }
    }
    
    // Simple compression algorithm (placeholder for more sophisticated compression)
    simpleCompress(text) {
        // This is a simplified compression - in production, you might want to use
        // a proper compression library like pako (zlib) or lz-string
        const repeated = {};
        const words = text.split(/\s+/);
        let compressed = '';
        let dictionary = {};
        let dictSize = 0;
        
        for (const word of words) {
            if (word.length > 3) {
                if (!dictionary[word]) {
                    dictionary[word] = `~${dictSize++}~`;
                }
                compressed += dictionary[word] + ' ';
            } else {
                compressed += word + ' ';
            }
        }
        
        // Prepend dictionary for decompression
        const dictStr = JSON.stringify(dictionary);
        return `${dictStr.length}:${dictStr}${compressed}`;
    }
    
    simpleDecompress(compressed) {
        const colonIndex = compressed.indexOf(':');
        const dictLen = parseInt(compressed.substring(0, colonIndex));
        const dictStr = compressed.substring(colonIndex + 1, colonIndex + 1 + dictLen);
        const content = compressed.substring(colonIndex + 1 + dictLen);
        
        const dictionary = JSON.parse(dictStr);
        const reverseDict = {};
        for (const [word, code] of Object.entries(dictionary)) {
            reverseDict[code] = word;
        }
        
        let decompressed = content;
        for (const [code, word] of Object.entries(reverseDict)) {
            decompressed = decompressed.replace(new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), word);
        }
        
        return decompressed.trim();
    }
    
    // Garbage collection and cleanup
    
    startGarbageCollection() {
        this.gcTimer = setInterval(() => {
            this.performGarbageCollection();
        }, this.gcInterval);
    }
    
    stopGarbageCollection() {
        if (this.gcTimer) {
            clearInterval(this.gcTimer);
            this.gcTimer = null;
        }
    }
    
    performGarbageCollection() {
        if (this.isOptimizing) return;
        
        this.isOptimizing = true;
        const startTime = performance.now();
        
        try {
            const initialSize = this.articleCache.size;
            const initialCacheSize = this.currentCacheSize;
            
            // Remove articles that exceed memory limit
            if (this.articleCache.size > this.maxArticlesInMemory) {
                this.evictLowPriorityArticles();
            }
            
            // Clean up content cache if it's too large
            if (this.currentCacheSize > this.maxContentCacheSize) {
                this.cleanupContentCache();
            }
            
            // Remove very old access tracking entries
            this.cleanupAccessTracker();
            
            const endTime = performance.now();
            const finalSize = this.articleCache.size;
            const finalCacheSize = this.currentCacheSize;
            
            if (initialSize !== finalSize || initialCacheSize !== finalCacheSize) {
                console.log(`GC completed in ${(endTime - startTime).toFixed(2)}ms: ` +
                          `${initialSize} -> ${finalSize} articles, ` +
                          `${this.formatBytes(initialCacheSize)} -> ${this.formatBytes(finalCacheSize)} cache`);
            }
        } finally {
            this.isOptimizing = false;
        }
    }
    
    evictLowPriorityArticles() {
        const articlesToEvict = this.articleCache.size - this.maxArticlesInMemory;
        if (articlesToEvict <= 0) return;
        
        // Sort by priority (ascending) and age (oldest first)
        const sortedEntries = Array.from(this.articleCache.entries()).sort((a, b) => {
            const [idA, entryA] = a;
            const [idB, entryB] = b;
            
            // First by priority
            if (entryA.priority !== entryB.priority) {
                return entryA.priority - entryB.priority;
            }
            
            // Then by last access time
            return entryA.lastAccessed - entryB.lastAccessed;
        });
        
        // Remove the lowest priority articles
        for (let i = 0; i < articlesToEvict; i++) {
            const [articleId] = sortedEntries[i];
            this.removeArticle(articleId);
        }
    }
    
    cleanupContentCache() {
        const cacheEntries = Array.from(this.contentCache.entries()).sort((a, b) => {
            const accessA = this.accessTracker.get(a[0]) || 0;
            const accessB = this.accessTracker.get(b[0]) || 0;
            return accessA - accessB; // Oldest access first
        });
        
        let cleaned = 0;
        for (const [articleId, content] of cacheEntries) {
            if (this.currentCacheSize <= this.maxContentCacheSize * 0.8) break;
            
            this.contentCache.delete(articleId);
            this.currentCacheSize -= content.length;
            cleaned++;
        }
        
        if (cleaned > 0) {
            console.log(`Cleaned up ${cleaned} compressed content entries`);
        }
    }
    
    cleanupAccessTracker() {
        const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago
        let cleaned = 0;
        
        for (const [articleId, lastAccess] of this.accessTracker) {
            if (lastAccess < cutoffTime && !this.articleCache.has(articleId)) {
                this.accessTracker.delete(articleId);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`Cleaned up ${cleaned} old access tracking entries`);
        }
    }
    
    scheduleCleanup() {
        // Debounced cleanup scheduling
        clearTimeout(this.cleanupTimeout);
        this.cleanupTimeout = setTimeout(() => {
            this.performGarbageCollection();
        }, 1000);
    }
    
    // Statistics and monitoring
    
    getMemoryStats() {
        const totalMemoryFootprint = Array.from(this.articleCache.values())
            .reduce((sum, entry) => sum + entry.memoryFootprint, 0);
        
        return {
            articlesInMemory: this.articleCache.size,
            maxArticles: this.maxArticlesInMemory,
            memoryUsage: this.formatBytes(totalMemoryFootprint),
            contentCacheSize: this.formatBytes(this.currentCacheSize),
            maxCacheSize: this.formatBytes(this.maxContentCacheSize),
            compressionStats: {
                ...this.compressionStats,
                compressionRatio: (this.compressionStats.compressionRatio * 100).toFixed(1) + '%',
                originalSize: this.formatBytes(this.compressionStats.originalSize),
                compressedSize: this.formatBytes(this.compressionStats.compressedSize)
            },
            accessTrackerSize: this.accessTracker.size
        };
    }
    
    getArticleStats() {
        const stats = {
            total: this.articleCache.size,
            byStatus: {},
            byFeed: {},
            priorityDistribution: { high: 0, medium: 0, low: 0 }
        };
        
        for (const [articleId, entry] of this.articleCache) {
            // Count by status
            const status = entry.article.status || 'unknown';
            stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
            
            // Count by feed
            const feedId = entry.feedId || 'unknown';
            stats.byFeed[feedId] = (stats.byFeed[feedId] || 0) + 1;
            
            // Count by priority
            if (entry.priority > 70) {
                stats.priorityDistribution.high++;
            } else if (entry.priority > 30) {
                stats.priorityDistribution.medium++;
            } else {
                stats.priorityDistribution.low++;
            }
        }
        
        return stats;
    }
    
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // Control methods
    
    clear() {
        this.articleCache.clear();
        this.contentCache.clear();
        this.accessTracker.clear();
        this.currentCacheSize = 0;
        this.compressionStats = {
            compressed: 0,
            originalSize: 0,
            compressedSize: 0,
            compressionRatio: 0
        };
    }
    
    destroy() {
        this.stopGarbageCollection();
        this.clear();
    }
}

// React hook for memory optimization
function useMemoryOptimizer(options = {}) {
    const { useRef, useEffect, useCallback } = React;
    const optimizer = useRef(null);
    
    useEffect(() => {
        if (!optimizer.current) {
            optimizer.current = new MemoryOptimizer(options);
        }
        
        return () => {
            if (optimizer.current) {
                optimizer.current.destroy();
            }
        };
    }, []);
    
    const addArticles = useCallback((articles, feedId) => {
        if (!optimizer.current) return 0;
        return optimizer.current.addArticles(articles, feedId);
    }, []);
    
    const getArticle = useCallback((articleId) => {
        if (!optimizer.current) return null;
        return optimizer.current.getArticle(articleId);
    }, []);
    
    const getArticlesByFeed = useCallback((feedId, limit) => {
        if (!optimizer.current) return [];
        return optimizer.current.getArticlesByFeed(feedId, limit);
    }, []);
    
    const getStats = useCallback(() => {
        if (!optimizer.current) return null;
        return {
            memory: optimizer.current.getMemoryStats(),
            articles: optimizer.current.getArticleStats()
        };
    }, []);
    
    return {
        addArticles,
        getArticle,
        getArticlesByFeed,
        getStats,
        optimizer: optimizer.current
    };
}

// Global memory optimizer instance
window.memoryOptimizer = new MemoryOptimizer();

window.MemoryOptimizer = MemoryOptimizer;
window.useMemoryOptimizer = useMemoryOptimizer;