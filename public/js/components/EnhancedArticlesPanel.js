// EnhancedArticlesPanel.js - High-performance articles panel with virtualization and pagination
function EnhancedArticlesPanel({ 
    articles, 
    selectedArticle, 
    onSelectArticle, 
    isLoading,
    enableVirtualization = true,
    pageSize = 50
}) {
    const { useState, useMemo, useCallback, useRef, useEffect } = React;
    
    // Pagination state
    const [currentPage, setCurrentPage] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('date'); // 'date', 'title', 'status'
    const [sortOrder, setSortOrder] = useState('desc'); // 'asc', 'desc'
    const [showOnlyUnread, setShowOnlyUnread] = useState(false);
    
    // Performance monitoring
    const { metrics, startRender, endRender, onScrollStateChange } = window.useVirtualListPerformance();
    const virtualListRef = useRef(null);
    
    // Filter and sort articles
    const processedArticles = useMemo(() => {
        startRender();
        
        let filtered = articles;
        
        // Apply search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(article => 
                article.title.toLowerCase().includes(query) ||
                (article.summary && article.summary.toLowerCase().includes(query))
            );
        }
        
        // Apply unread filter
        if (showOnlyUnread) {
            filtered = filtered.filter(article => !article.isRead);
        }
        
        // Sort articles
        filtered.sort((a, b) => {
            let comparison = 0;
            
            switch (sortBy) {
                case 'title':
                    comparison = a.title.localeCompare(b.title);
                    break;
                case 'status':
                    const statusOrder = { 'new': 0, 'summarizing': 1, 'summarized': 2, 'failed': 3 };
                    comparison = (statusOrder[a.status] || 4) - (statusOrder[b.status] || 4);
                    break;
                case 'date':
                default:
                    comparison = new Date(a.pubDate) - new Date(b.pubDate);
                    break;
            }
            
            endRender();
            return sortOrder === 'asc' ? comparison : -comparison;
        });
        
        return filtered;
    }, [articles, searchQuery, sortBy, sortOrder, showOnlyUnread, startRender, endRender]);
    
    // Pagination calculations
    const totalPages = Math.ceil(processedArticles.length / pageSize);
    const paginatedArticles = useMemo(() => {
        if (!enableVirtualization) {
            const start = currentPage * pageSize;
            return processedArticles.slice(start, start + pageSize);
        }
        return processedArticles; // Virtualization handles its own slicing
    }, [processedArticles, currentPage, pageSize, enableVirtualization]);
    
    // Reset to first page when articles change
    useEffect(() => {
        setCurrentPage(0);
    }, [articles]);
    
    // Scroll to top when page changes
    useEffect(() => {
        if (virtualListRef.current?.scrollToTop) {
            virtualListRef.current.scrollToTop();
        }
    }, [currentPage]);
    
    // Enhanced article selection with performance tracking
    const handleSelectArticle = useCallback((article) => {
        const startTime = performance.now();
        onSelectArticle(article);
        const selectionTime = performance.now() - startTime;
        
        if (selectionTime > 16) { // Log slow selections (>16ms)
            console.warn(`Slow article selection: ${selectionTime.toFixed(2)}ms`);
        }
    }, [onSelectArticle]);
    
    // Render virtualized article item
    const renderArticleItem = useCallback((article, index, isScrolling) => {
        return React.createElement(window.VirtualizedArticleItem, {
            article,
            index,
            isScrolling,
            onSelect: handleSelectArticle,
            selectedArticle
        });
    }, [handleSelectArticle, selectedArticle]);
    
    // Search and filter controls
    const renderControls = () => {
        return React.createElement('div', { className: "mb-4 space-y-3" },
            // Search input
            React.createElement('div', { className: "relative" },
                React.createElement('input', {
                    type: 'text',
                    placeholder: 'Search articles...',
                    value: searchQuery,
                    onChange: (e) => setSearchQuery(e.target.value),
                    className: "w-full pl-8 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                }),
                React.createElement('i', {
                    className: "fas fa-search absolute left-2.5 top-3 text-gray-400 text-sm"
                })
            ),
            
            // Filter and sort controls
            React.createElement('div', { className: "flex flex-wrap gap-2 text-sm" },
                // Sort by dropdown
                React.createElement('select', {
                    value: sortBy,
                    onChange: (e) => setSortBy(e.target.value),
                    className: "bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200"
                },
                    React.createElement('option', { value: 'date' }, 'Date'),
                    React.createElement('option', { value: 'title' }, 'Title'),
                    React.createElement('option', { value: 'status' }, 'Status')
                ),
                
                // Sort order button
                React.createElement('button', {
                    onClick: () => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'),
                    className: "bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 hover:bg-gray-600"
                },
                    React.createElement('i', { 
                        className: `fas fa-sort-${sortOrder === 'asc' ? 'up' : 'down'}` 
                    })
                ),
                
                // Unread filter toggle
                React.createElement('button', {
                    onClick: () => setShowOnlyUnread(!showOnlyUnread),
                    className: `border border-gray-600 rounded px-2 py-1 text-sm ${
                        showOnlyUnread 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                    }`
                }, 'Unread Only')
            ),
            
            // Article count and performance info
            React.createElement('div', { className: "flex justify-between text-xs text-gray-400" },
                React.createElement('span', null, 
                    `${processedArticles.length} articles${articles.length !== processedArticles.length ? ` (${articles.length} total)` : ''}`
                ),
                React.createElement('span', null, 
                    `Avg render: ${metrics.averageRenderTime.toFixed(1)}ms`
                )
            )
        );
    };
    
    // Pagination controls
    const renderPagination = () => {
        if (enableVirtualization || totalPages <= 1) return null;
        
        return React.createElement('div', { className: "mt-4 flex justify-between items-center text-sm" },
            React.createElement('button', {
                onClick: () => setCurrentPage(Math.max(0, currentPage - 1)),
                disabled: currentPage === 0,
                className: "px-3 py-1 bg-gray-700 border border-gray-600 rounded disabled:opacity-50 hover:bg-gray-600"
            }, 'Previous'),
            
            React.createElement('span', { className: "text-gray-400" },
                `Page ${currentPage + 1} of ${totalPages}`
            ),
            
            React.createElement('button', {
                onClick: () => setCurrentPage(Math.min(totalPages - 1, currentPage + 1)),
                disabled: currentPage >= totalPages - 1,
                className: "px-3 py-1 bg-gray-700 border border-gray-600 rounded disabled:opacity-50 hover:bg-gray-600"
            }, 'Next')
        );
    };
    
    // Loading state
    if (isLoading) {
        return React.createElement('div', { 
            className: "bg-gray-800/50 h-full flex flex-col p-4 border-l border-r border-gray-700" 
        },
            React.createElement('h2', { className: "text-xl font-bold mb-4" }, "Articles"),
            React.createElement('div', { className: "flex items-center justify-center h-full" },
                React.createElement('i', { className: "fas fa-spinner fa-spin text-3xl text-gray-400" })
            )
        );
    }
    
    // Empty state
    if (processedArticles.length === 0) {
        return React.createElement('div', { 
            className: "bg-gray-800/50 h-full flex flex-col p-4 border-l border-r border-gray-700" 
        },
            React.createElement('h2', { className: "text-xl font-bold mb-4" }, "Articles"),
            renderControls(),
            React.createElement('div', { className: "text-center text-gray-500 mt-10" }, 
                searchQuery ? "No articles match your search." : "Select a feed to see articles."
            )
        );
    }
    
    // Main render
    return React.createElement('div', { 
        className: "bg-gray-800/50 h-full flex flex-col p-4 border-l border-r border-gray-700" 
    },
        React.createElement('h2', { className: "text-xl font-bold mb-4 flex items-center gap-2" }, 
            "Articles",
            enableVirtualization && React.createElement('span', {
                className: "text-xs bg-green-600 px-2 py-1 rounded",
                title: "Virtualized rendering enabled for optimal performance"
            }, "⚡")
        ),
        
        renderControls(),
        
        // Article list
        enableVirtualization ? 
            React.createElement(window.VirtualizedList, {
                ref: virtualListRef,
                items: paginatedArticles,
                itemHeight: 80,
                containerHeight: 500, // Adjust based on available space
                renderItem: renderArticleItem,
                overscan: 10,
                className: "flex-grow",
                onScrollStateChange
            }) :
            React.createElement('div', { className: "flex-grow overflow-y-auto" },
                React.createElement('ul', { className: "space-y-2" },
                    paginatedArticles.map((article, index) => 
                        React.createElement('li', { key: article.id },
                            renderArticleItem(article, index, false)
                        )
                    )
                )
            ),
        
        renderPagination()
    );
}

window.EnhancedArticlesPanel = EnhancedArticlesPanel;