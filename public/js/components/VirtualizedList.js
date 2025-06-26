// VirtualizedList.js - High-performance virtualized list component for large datasets
function VirtualizedList({ 
    items, 
    itemHeight = 80, 
    containerHeight = 600, 
    renderItem, 
    overscan = 5,
    className = "",
    onScrollStateChange = null
}) {
    if (!window.React) {
        console.error('React not available for VirtualizedList');
        return null;
    }
    
    const { useState, useEffect, useRef, useMemo, useCallback } = React;
    
    const [scrollTop, setScrollTop] = useState(0);
    const [isScrolling, setIsScrolling] = useState(false);
    const scrollElementRef = useRef(null);
    const scrollTimeoutRef = useRef(null);
    
    // Calculate visible range
    const visibleRange = useMemo(() => {
        const itemCount = items.length;
        const visibleItemCount = Math.ceil(containerHeight / itemHeight);
        
        const start = Math.floor(scrollTop / itemHeight);
        const end = Math.min(start + visibleItemCount + overscan, itemCount);
        const overscanStart = Math.max(start - overscan, 0);
        
        return { start: overscanStart, end, visibleStart: start, visibleEnd: end };
    }, [scrollTop, containerHeight, itemHeight, items.length, overscan]);
    
    // Calculate total height
    const totalHeight = items.length * itemHeight;
    
    // Visible items with positioning
    const visibleItems = useMemo(() => {
        const { start, end } = visibleRange;
        return items.slice(start, end).map((item, index) => ({
            item,
            index: start + index,
            top: (start + index) * itemHeight
        }));
    }, [items, visibleRange, itemHeight]);
    
    // Handle scroll with throttling
    const handleScroll = useCallback((event) => {
        const newScrollTop = event.target.scrollTop;
        setScrollTop(newScrollTop);
        
        if (!isScrolling) {
            setIsScrolling(true);
            onScrollStateChange?.(true);
        }
        
        // Clear existing timeout
        if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
        }
        
        // Set new timeout
        scrollTimeoutRef.current = setTimeout(() => {
            setIsScrolling(false);
            onScrollStateChange?.(false);
        }, 150);
    }, [isScrolling, onScrollStateChange]);
    
    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
            }
        };
    }, []);
    
    // Scroll to specific index
    const scrollToIndex = useCallback((index) => {
        if (scrollElementRef.current) {
            const scrollTop = index * itemHeight;
            scrollElementRef.current.scrollTo({ top: scrollTop, behavior: 'smooth' });
        }
    }, [itemHeight]);
    
    // Scroll to top
    const scrollToTop = useCallback(() => {
        if (scrollElementRef.current) {
            scrollElementRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, []);
    
    // Expose scroll methods
    useEffect(() => {
        if (scrollElementRef.current) {
            scrollElementRef.current.scrollToIndex = scrollToIndex;
            scrollElementRef.current.scrollToTop = scrollToTop;
        }
    }, [scrollToIndex, scrollToTop]);
    
    return React.createElement('div', {
        ref: scrollElementRef,
        className: `overflow-auto ${className}`,
        style: { height: containerHeight },
        onScroll: handleScroll
    },
        React.createElement('div', {
            style: { 
                height: totalHeight, 
                position: 'relative',
                // Add will-change for better performance
                willChange: isScrolling ? 'transform' : 'auto'
            }
        },
            visibleItems.map(({ item, index, top }) => 
                React.createElement('div', {
                    key: item.id || index,
                    style: {
                        position: 'absolute',
                        top: top,
                        left: 0,
                        right: 0,
                        height: itemHeight,
                        // Optimize for scrolling performance
                        contain: 'layout style paint'
                    }
                }, renderItem(item, index, isScrolling))
            )
        )
    );
}

// Performance monitoring hook for virtualized list
function useVirtualListPerformance() {
    if (!window.React) {
        console.error('React not available for useVirtualListPerformance');
        return { metrics: {}, startRender: () => {}, endRender: () => {}, onScrollStateChange: () => {} };
    }
    
    const { useState, useCallback, useRef } = React;
    
    const [metrics, setMetrics] = useState({
        renderCount: 0,
        averageRenderTime: 0,
        lastRenderTime: 0,
        maxRenderTime: 0,
        isScrolling: false,
        scrollEvents: 0
    });
    
    const renderStartTime = useRef(0);
    
    const startRender = useCallback(() => {
        renderStartTime.current = performance.now();
    }, []);
    
    const endRender = useCallback(() => {
        const renderTime = performance.now() - renderStartTime.current;
        
        setMetrics(prev => {
            const newRenderCount = prev.renderCount + 1;
            const newAverageRenderTime = (prev.averageRenderTime * prev.renderCount + renderTime) / newRenderCount;
            
            return {
                ...prev,
                renderCount: newRenderCount,
                averageRenderTime: newAverageRenderTime,
                lastRenderTime: renderTime,
                maxRenderTime: Math.max(prev.maxRenderTime, renderTime)
            };
        });
    }, []);
    
    const onScrollStateChange = useCallback((isScrolling) => {
        setMetrics(prev => ({
            ...prev,
            isScrolling,
            scrollEvents: isScrolling ? prev.scrollEvents + 1 : prev.scrollEvents
        }));
    }, []);
    
    return { metrics, startRender, endRender, onScrollStateChange };
}

// High-performance article item component
function VirtualizedArticleItem({ article, index, isScrolling, onSelect, selectedArticle }) {
    const { useMemo } = React;
    
    // Memoize expensive computations
    const formattedDate = useMemo(() => {
        // Use lighter formatting during scrolling
        if (isScrolling) {
            return new Date(article.pubDate).toLocaleDateString();
        }
        return new Date(article.pubDate).toLocaleString();
    }, [article.pubDate, isScrolling]);
    
    const isSelected = selectedArticle?.id === article.id;
    
    // Optimize class names
    const itemClasses = useMemo(() => 
        `block p-3 rounded-md cursor-pointer mb-2 border-l-4 transition-colors ${
            isSelected 
                ? 'bg-gray-700 border-blue-500' 
                : 'border-transparent hover:bg-gray-700/50'
        }`, [isSelected]
    );
    
    const titleClasses = useMemo(() => 
        `font-medium ${article.isRead ? 'text-gray-500' : 'text-gray-200'}`,
        [article.isRead]
    );
    
    return React.createElement('div', {
        className: itemClasses,
        onClick: () => onSelect(article),
        style: {
            // Optimize for scrolling performance
            transform: isScrolling ? 'translateZ(0)' : 'none',
            backfaceVisibility: 'hidden'
        }
    },
        React.createElement('div', { className: "flex justify-between items-start" },
            React.createElement('span', { 
                className: titleClasses,
                style: {
                    // Prevent text selection during scrolling for better performance
                    userSelect: isScrolling ? 'none' : 'auto'
                }
            }, article.title),
            React.createElement('div', { className: "flex-shrink-0 ml-2" },
                React.createElement(window.ArticleStatusIcon, { 
                    status: article.status,
                    simplified: isScrolling // Use simplified icon during scrolling
                })
            )
        ),
        React.createElement('span', { 
            className: "text-xs text-gray-400 mt-1 block",
            style: {
                userSelect: isScrolling ? 'none' : 'auto'
            }
        }, formattedDate)
    );
}

window.VirtualizedList = VirtualizedList;
window.useVirtualListPerformance = useVirtualListPerformance;
window.VirtualizedArticleItem = VirtualizedArticleItem;