// LazyContentPanel.js - High-performance content panel with lazy loading and caching
function LazyContentPanel({ article, onRetrySummarization }) {
    const { useState, useEffect, useRef, useMemo, useCallback } = React;
    
    // Content loading state
    const [isContentLoading, setIsContentLoading] = useState(false);
    const [contentCache, setContentCache] = useState(new Map());
    const [renderTime, setRenderTime] = useState(0);
    const [imageLoadErrors, setImageLoadErrors] = useState(new Set());
    
    // Performance monitoring
    const renderStartTime = useRef(0);
    const intersectionObserver = useRef(null);
    
    // Lazy loading for images in content
    const setupImageLazyLoading = useCallback(() => {
        if (!intersectionObserver.current) {
            intersectionObserver.current = new IntersectionObserver(
                (entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const img = entry.target;
                            if (img.dataset.src) {
                                img.src = img.dataset.src;
                                img.removeAttribute('data-src');
                                intersectionObserver.current.unobserve(img);
                            }
                        }
                    });
                },
                { threshold: 0.1 }
            );
        }
        
        // Find all lazy images and observe them
        const lazyImages = document.querySelectorAll('img[data-src]');
        lazyImages.forEach(img => {
            intersectionObserver.current.observe(img);
        });
    }, []);
    
    // Process content for lazy loading
    const processContentForLazyLoading = useCallback((htmlContent) => {
        if (!htmlContent) return htmlContent;
        
        // Replace img src with data-src for lazy loading
        return htmlContent.replace(
            /<img([^>]*)\ssrc="([^"]*)"([^>]*)>/gi,
            '<img$1 data-src="$2" src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB2aWV3Qm94PSIwIDAgMSAxIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNmM2Y0ZjYiLz48L3N2Zz4=" class="lazy-image bg-gray-300 rounded"$3>'
        );
    }, []);
    
    // Memoize processed summary content
    const processedSummary = useMemo(() => {
        if (!article?.summary) return null;
        
        renderStartTime.current = performance.now();
        
        try {
            const parsed = marked.parse(article.summary);
            const processed = processContentForLazyLoading(parsed);
            
            // Cache the processed content
            setContentCache(prev => {
                const newCache = new Map(prev);
                newCache.set(article.id, processed);
                return newCache;
            });
            
            return processed;
        } catch (error) {
            console.error('Error processing article summary:', error);
            return '<p class="text-red-400">Error displaying summary</p>';
        }
    }, [article?.summary, article?.id, processContentForLazyLoading]);
    
    // Track render performance
    useEffect(() => {
        if (processedSummary) {
            const endTime = performance.now();
            const duration = endTime - renderStartTime.current;
            setRenderTime(duration);
            
            // Log slow renders
            if (duration > 100) {
                console.warn(`Slow content render: ${duration.toFixed(2)}ms for article ${article?.id}`);
            }
        }
    }, [processedSummary, article?.id]);
    
    // Setup lazy loading after content renders
    useEffect(() => {
        if (processedSummary) {
            // Use requestAnimationFrame to ensure DOM is updated
            requestAnimationFrame(() => {
                setupImageLazyLoading();
            });
        }
    }, [processedSummary, setupImageLazyLoading]);
    
    // Handle image load errors
    const handleImageError = useCallback((event) => {
        const img = event.target;
        const src = img.src || img.dataset.src;
        
        if (src && !imageLoadErrors.has(src)) {
            setImageLoadErrors(prev => new Set(prev).add(src));
            
            // Replace with placeholder
            img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDIwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9IiNmM2Y0ZjYiLz48dGV4dCB4PSIxMDAiIHk9IjUwIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzZiNzI4MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBhdmFpbGFibGU8L3RleHQ+PC9zdmc+';
            img.alt = 'Image not available';
            img.className += ' opacity-50';
        }
    }, [imageLoadErrors]);
    
    // Add event listeners for image error handling
    useEffect(() => {
        const images = document.querySelectorAll('.lazy-image');
        images.forEach(img => {
            img.addEventListener('error', handleImageError);
        });
        
        return () => {
            images.forEach(img => {
                img.removeEventListener('error', handleImageError);
            });
        };
    }, [processedSummary, handleImageError]);
    
    // Cleanup intersection observer
    useEffect(() => {
        return () => {
            if (intersectionObserver.current) {
                intersectionObserver.current.disconnect();
            }
        };
    }, []);
    
    // Enhanced retry with loading state
    const handleRetryWithLoading = useCallback(async (articleId) => {
        setIsContentLoading(true);
        try {
            await onRetrySummarization(articleId);
        } finally {
            setIsContentLoading(false);
        }
    }, [onRetrySummarization]);
    
    // Render performance info (dev mode)
    const renderPerformanceInfo = () => {
        const isDevelopment = window.browserEnv ? window.browserEnv.isDevelopment : 
                             (window.location.hostname === 'localhost' || 
                              window.location.search.includes('debug=true'));
        if (!isDevelopment) return null;
        
        return React.createElement('div', { 
            className: "text-xs text-gray-500 border-t border-gray-700 pt-2 mt-2" 
        },
            `Render: ${renderTime.toFixed(1)}ms | Cache: ${contentCache.size} items | Errors: ${imageLoadErrors.size}`
        );
    };
    
    // Empty state
    if (!article) {
        return React.createElement('div', { className: "h-full flex items-center justify-center p-6" },
            React.createElement('div', { className: "text-center text-gray-500" },
                React.createElement('i', { className: "fas fa-arrow-left text-3xl mb-4" }),
                React.createElement('p', null, "Select an article to view.")
            )
        );
    }
    
    return React.createElement('div', { 
        className: "h-full flex flex-col p-6 overflow-y-auto",
        style: {
            // Optimize scrolling performance
            willChange: 'scroll-position',
            transform: 'translateZ(0)'
        }
    },
        // Article title with performance-optimized rendering
        React.createElement('h1', { 
            className: "text-3xl font-bold mb-4",
            style: { 
                // Prevent layout thrashing
                contain: 'layout style paint'
            }
        }, article.title),
        
        // Summary section
        React.createElement('div', { className: "bg-gray-800 p-4 rounded-lg mb-4" },
            React.createElement('div', { className: "flex justify-between items-center mb-2" },
                React.createElement('h3', { className: "text-lg font-semibold text-blue-400" }, "AI Summary"),
                renderTime > 0 && React.createElement('span', { 
                    className: "text-xs text-gray-400 font-mono" 
                }, `${renderTime.toFixed(1)}ms`)
            ),
            
            // Loading state
            (article.status === 'summarizing' || isContentLoading) && 
                React.createElement('div', { className: "text-center p-4" },
                    React.createElement('i', { className: "fas fa-spinner fa-spin mr-2" }),
                    " Generating summary..."
                ),
            
            // Failed state with enhanced retry
            article.status === 'failed' && !isContentLoading &&
                React.createElement('div', { className: "text-center p-4 bg-red-900/50 rounded-md" },
                    React.createElement('p', { className: "text-red-400 mb-3" }, "Summarization failed."),
                    React.createElement('button', { 
                        onClick: () => handleRetryWithLoading(article.id),
                        disabled: isContentLoading,
                        className: "bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white font-bold py-1 px-3 rounded-md transition-colors text-sm"
                    },
                        React.createElement('i', { 
                            className: `fas ${isContentLoading ? 'fa-spinner fa-spin' : 'fa-sync-alt'} mr-2` 
                        }),
                        isContentLoading ? "Retrying..." : "Retry"
                    )
                ),
            
            // Summarized content with lazy loading
            article.status === 'summarized' && processedSummary &&
                React.createElement('div', {
                    className: "prose prose-invert max-w-none text-gray-300 leading-relaxed",
                    dangerouslySetInnerHTML: { __html: processedSummary },
                    style: {
                        // Optimize for large content
                        contain: 'layout style paint'
                    }
                }),
            
            // New article state
            article.status === 'new' && 
                React.createElement('div', { className: "text-gray-400" }, 
                    "This article hasn't been summarized yet."
                ),
            
            renderPerformanceInfo()
        ),
        
        // Spacer
        React.createElement('div', { className: "flex-grow" }),
        
        // Article actions
        React.createElement('div', { className: "flex space-x-4 mt-4" },
            React.createElement('a', { 
                href: article.link, 
                target: "_blank", 
                rel: "noopener noreferrer", 
                className: "flex-1 text-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors",
                onClick: () => {
                    // Track external link clicks for analytics
                    console.log(`External link clicked: ${article.link}`);
                }
            },
                React.createElement('i', { className: "fas fa-book-open mr-2" }),
                "Show Full Article"
            ),
            
            // Copy link button
            React.createElement('button', {
                onClick: () => {
                    navigator.clipboard.writeText(article.link).then(() => {
                        // Could show a toast notification here
                        console.log('Link copied to clipboard');
                    });
                },
                className: "px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors",
                title: "Copy link"
            },
                React.createElement('i', { className: "fas fa-copy" })
            )
        )
    );
}

// Enhanced content cache management
function useContentCache() {
    const { useState, useCallback } = React;
    const [cache, setCache] = useState(new Map());
    const maxCacheSize = 100; // Limit cache size
    
    const addToCache = useCallback((key, content) => {
        setCache(prev => {
            const newCache = new Map(prev);
            
            // Remove oldest entries if cache is full
            if (newCache.size >= maxCacheSize) {
                const firstKey = newCache.keys().next().value;
                newCache.delete(firstKey);
            }
            
            newCache.set(key, {
                content,
                timestamp: Date.now(),
                accessCount: 1
            });
            
            return newCache;
        });
    }, []);
    
    const getFromCache = useCallback((key) => {
        const cached = cache.get(key);
        if (cached) {
            // Update access count
            setCache(prev => {
                const newCache = new Map(prev);
                newCache.set(key, {
                    ...cached,
                    accessCount: cached.accessCount + 1,
                    lastAccessed: Date.now()
                });
                return newCache;
            });
            return cached.content;
        }
        return null;
    }, [cache]);
    
    const clearCache = useCallback(() => {
        setCache(new Map());
    }, []);
    
    const getCacheStats = useCallback(() => {
        return {
            size: cache.size,
            maxSize: maxCacheSize,
            totalAccesses: Array.from(cache.values()).reduce((sum, item) => sum + item.accessCount, 0)
        };
    }, [cache]);
    
    return { addToCache, getFromCache, clearCache, getCacheStats };
}

window.LazyContentPanel = LazyContentPanel;
window.useContentCache = useContentCache;