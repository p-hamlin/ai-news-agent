// EnhancedApp.js - Performance-optimized main application component
function EnhancedApp() {
    const { useState, useEffect, useCallback, useRef } = React;
    const { state, dispatch } = window.useAppState();
    // Only use performance monitoring in development
    const isDevelopmentMode = window.browserEnv ? window.browserEnv.isDevelopment : 
                              (window.location.hostname === 'localhost' || 
                               window.location.search.includes('debug=true'));
    
    const performanceHooks = (isDevelopmentMode && window.usePerformanceMonitor) ? 
        window.usePerformanceMonitor() : {
            measureRender: () => null,
            endMeasurement: () => {},
            recordInteraction: () => {},
            getReport: () => null
        };
    const { measureRender, endMeasurement, recordInteraction, getReport } = performanceHooks;
    const { feeds, folders, articles, selectedFeed, selectedArticle, isSettingsVisible, isLoadingArticles, expandedFolders, draggedItem, dragOverItem, isSearchVisible, searchResults, searchQuery } = state;
    
    // Performance optimization settings
    const [useVirtualization, setUseVirtualization] = useState(true);
    const [useLazyContent, setUseLazyContent] = useState(true);
    const [showPerformanceStats, setShowPerformanceStats] = useState(false);
    const renderMeasurement = useRef(null);
    
    // Start render measurement (only in development)
    useEffect(() => {
        const isDevelopment = window.browserEnv ? window.browserEnv.isDevelopment : 
                             (window.location.hostname === 'localhost' || 
                              window.location.search.includes('debug=true'));
        
        if (isDevelopment) {
            renderMeasurement.current = measureRender('EnhancedApp');
            return () => {
                if (renderMeasurement.current) {
                    endMeasurement(renderMeasurement.current);
                }
            };
        }
    });
    
    // Performance monitoring setup
    useEffect(() => {
        // Start performance reporting in development or when debug=true
        const isDevelopment = window.browserEnv ? window.browserEnv.isDevelopment : 
                             (window.location.hostname === 'localhost' || 
                              window.location.search.includes('debug=true') ||
                              window.location.search.includes('perf=true'));
        
        if (isDevelopment && window.performanceMonitor) {
            // Reduce reporting frequency to minimize overhead
            window.performanceMonitor.startReporting(120000); // Every 2 minutes
        }
        
        return () => {
            if (window.performanceMonitor) {
                window.performanceMonitor.stopReporting();
            }
        };
    }, []);
    
    // Enhanced API abstractions with performance tracking
    const handleSelectFeed = useCallback(async (feed) => {
        const startTime = isDevelopmentMode ? performance.now() : 0;
        
        dispatch({ type: 'SELECT_FEED', payload: feed });
        try {
            const fetchedArticles = await window.ApiService.getArticles(feed.id);
            dispatch({ type: 'SET_ARTICLES', payload: fetchedArticles });
            
            if (isDevelopmentMode) {
                const duration = performance.now() - startTime;
                recordInteraction('feed-selection', duration, { feedId: feed.id, articleCount: fetchedArticles.length });
            }
        } catch (error) {
            console.error("Failed to fetch articles:", error);
            dispatch({ type: 'SET_ARTICLES', payload: [] });
            
            if (isDevelopmentMode) {
                const duration = performance.now() - startTime;
                recordInteraction('feed-selection-failed', duration, { feedId: feed.id, error: error.message });
            }
        }
    }, [dispatch, recordInteraction, isDevelopmentMode]);

    const handleSelectArticle = useCallback((article) => {
        const startTime = isDevelopmentMode ? performance.now() : 0;
        
        if (!article.isRead) {
            window.ApiService.markArticleAsRead(article.id).catch(err => console.error("Failed to mark as read:", err));
        }
        dispatch({ type: 'SELECT_ARTICLE', payload: article });
        
        if (isDevelopmentMode) {
            const duration = performance.now() - startTime;
            recordInteraction('article-selection', duration, { articleId: article.id });
        }
    }, [dispatch, recordInteraction, isDevelopmentMode]);

    const handleAddFeed = useCallback(async (url) => {
        const startTime = isDevelopmentMode ? performance.now() : 0;
        
        try {
            const newFeed = await window.ApiService.addFeed(url);
            dispatch({ type: 'ADD_FEED', payload: newFeed });
            
            if (isDevelopmentMode) {
                const duration = performance.now() - startTime;
                recordInteraction('add-feed', duration, { feedUrl: url, success: true });
            }
        } catch (error) {
            if (isDevelopmentMode) {
                const duration = performance.now() - startTime;
                recordInteraction('add-feed', duration, { feedUrl: url, success: false, error: error.message });
            }
            throw error;
        }
    }, [dispatch, recordInteraction, isDevelopmentMode]);

    const handleDeleteFeed = useCallback(async (id) => {
        const startTime = isDevelopmentMode ? performance.now() : 0;
        
        try {
            await window.ApiService.deleteFeed(id);
            dispatch({ type: 'DELETE_FEED', payload: id });
            
            if (isDevelopmentMode) {
                const duration = performance.now() - startTime;
                recordInteraction('delete-feed', duration, { feedId: id });
            }
        } catch (error) {
            if (isDevelopmentMode) {
                const duration = performance.now() - startTime;
                recordInteraction('delete-feed-failed', duration, { feedId: id, error: error.message });
            }
            throw error;
        }
    }, [dispatch, recordInteraction, isDevelopmentMode]);

    const handleUpdateFeedName = useCallback(async (feedId, displayName) => {
        await window.ApiService.updateFeedDisplayName(feedId, displayName);
        dispatch({ type: 'UPDATE_FEED_DISPLAY_NAME', payload: { feedId, displayName } });
    }, [dispatch]);

    const handleCreateFolder = useCallback(async (folderName) => {
        const newFolder = await window.ApiService.createFolder(folderName);
        dispatch({ type: 'ADD_FOLDER', payload: newFolder });
    }, [dispatch]);

    const handleDeleteFolder = useCallback(async (id) => {
        await window.ApiService.deleteFolder(id);
        dispatch({ type: 'DELETE_FOLDER', payload: id });
    }, [dispatch]);

    const handleMoveFeedToFolder = useCallback(async (feedId, folderId) => {
        await window.ApiService.moveFeedToFolder(feedId, folderId);
        dispatch({ type: 'MOVE_FEED_TO_FOLDER', payload: { feedId, folderId } });
    }, [dispatch]);

    const handleRetrySummarization = useCallback(async (articleId) => {
        const startTime = isDevelopmentMode ? performance.now() : 0;
        
        try {
            await window.ApiService.retrySummarization(articleId);
            if (isDevelopmentMode) {
                const duration = performance.now() - startTime;
                recordInteraction('retry-summarization', duration, { articleId });
            }
        } catch (error) {
            if (isDevelopmentMode) {
                const duration = performance.now() - startTime;
                recordInteraction('retry-summarization-failed', duration, { articleId, error: error.message });
            }
        }
    }, [recordInteraction, isDevelopmentMode]);

    // Search handlers
    const handleToggleSearch = useCallback(() => {
        dispatch({ type: 'TOGGLE_SEARCH' });
        recordInteraction('toggle-search', 0, { isSearchVisible });
    }, [dispatch, recordInteraction, isSearchVisible]);

    const handleSearchResults = useCallback((results) => {
        dispatch({ type: 'SET_SEARCH_RESULTS', payload: results });
        if (results.length > 0) {
            // Auto-select first result if no article is selected
            if (!selectedArticle || !isSearchVisible) {
                dispatch({ type: 'SELECT_ARTICLE', payload: results[0] });
            }
        }
    }, [dispatch, selectedArticle, isSearchVisible]);

    const handleSearchArticleSelect = useCallback((article) => {
        dispatch({ type: 'SELECT_ARTICLE', payload: article });
        recordInteraction('select-search-result', 0, { articleId: article.id });
    }, [dispatch, recordInteraction]);

    // Drag and drop handlers (optimized)
    const handleToggleFolder = useCallback((folderId) => {
        dispatch({ type: 'TOGGLE_FOLDER', payload: folderId });
    }, [dispatch]);

    const handleDragStart = useCallback((e, item) => {
        e.dataTransfer.effectAllowed = 'move';
        dispatch({ type: 'SET_DRAGGED_ITEM', payload: item });
    }, [dispatch]);

    const handleDragOver = useCallback((e, item) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        dispatch({ type: 'SET_DRAG_OVER_ITEM', payload: item });
    }, [dispatch]);

    const handleDragEnd = useCallback(() => {
        dispatch({ type: 'SET_DRAGGED_ITEM', payload: null });
        dispatch({ type: 'SET_DRAG_OVER_ITEM', payload: null });
    }, [dispatch]);

    const handleDrop = useCallback(async (e, dropTarget) => {
        e.preventDefault();
        if (!draggedItem || !dropTarget) return;

        try {
            if (draggedItem.type === 'feed' && dropTarget.type === 'folder') {
                await window.ApiService.moveFeedToFolder(draggedItem.id, dropTarget.id);
                dispatch({ type: 'MOVE_FEED_TO_FOLDER', payload: { feedId: draggedItem.id, folderId: dropTarget.id } });
            }
            else if (draggedItem.type === 'feed' && dropTarget.type === 'feed') {
                const targetIndex = feeds.findIndex(f => f.id === dropTarget.id);
                await window.ApiService.reorderFeeds(draggedItem.id, targetIndex, dropTarget.folderId);
                
                const allFeeds = await window.ApiService.getFeeds();
                dispatch({ type: 'SET_FEEDS', payload: allFeeds });
            }
            else if (draggedItem.type === 'folder' && dropTarget.type === 'folder') {
                const targetIndex = folders.findIndex(f => f.id === dropTarget.id);
                await window.ApiService.reorderFolders(draggedItem.id, targetIndex);
                
                const allFolders = await window.ApiService.getFolders();
                dispatch({ type: 'SET_FOLDERS', payload: allFolders });
            }
        } catch (error) {
            console.error('Drag and drop error:', error);
        }

        handleDragEnd();
    }, [draggedItem, feeds, folders, dispatch, handleDragEnd]);

    // Load initial data
    useEffect(() => {
        const loadInitialData = async () => {
            const startTime = isDevelopmentMode ? performance.now() : 0;
            
            try {
                const [allFeeds, allFolders] = await Promise.all([
                    window.ApiService.getFeeds(),
                    window.ApiService.getFolders()
                ]);
                
                dispatch({ type: 'SET_FEEDS', payload: allFeeds });
                dispatch({ type: 'SET_FOLDERS', payload: allFolders });
                
                if (isDevelopmentMode) {
                    const duration = performance.now() - startTime;
                    recordInteraction('initial-load', duration, { 
                        feedCount: allFeeds.length, 
                        folderCount: allFolders.length 
                    });
                }
            } catch (error) {
                console.error('Failed to load initial data:', error);
                if (isDevelopmentMode) {
                    const duration = performance.now() - startTime;
                    recordInteraction('initial-load-failed', duration, { error: error.message });
                }
            }
        };
        
        loadInitialData();
    }, [dispatch, recordInteraction, isDevelopmentMode]);
    
    // Real-time updates
    useEffect(() => {
        const cleanupArticles = window.ApiService.onArticlesUpdated(({ feedId }) => {
            if (selectedFeed?.id === feedId) {
                handleSelectFeed(selectedFeed);
            }
        });

        const cleanupStatus = window.ApiService.onArticleStatusUpdated((payload) => {
            dispatch({ type: 'UPDATE_ARTICLE_STATUS', payload });
        });

        return () => {
            cleanupArticles();
            cleanupStatus();
        };
    }, [selectedFeed, handleSelectFeed, dispatch]);

    // Performance debug panel
    const renderPerformanceDebug = () => {
        if (!showPerformanceStats) return null;
        
        const report = getReport();
        if (!report) return null;
        
        return React.createElement('div', {
            className: "fixed top-4 right-4 bg-black/80 text-green-400 p-4 rounded-lg font-mono text-xs z-50 max-w-sm"
        },
            React.createElement('div', { className: "flex justify-between items-center mb-2" },
                React.createElement('h3', { className: "font-bold" }, "Performance"),
                React.createElement('button', {
                    onClick: () => setShowPerformanceStats(false),
                    className: "text-red-400 hover:text-red-300"
                }, "×")
            ),
            React.createElement('div', null, `Render: ${report.rendering.averageRenderTime}ms`),
            React.createElement('div', null, `Interactions: ${report.interactions.averageInteractionTime}ms`),
            React.createElement('div', null, `Memory: ${report.memory.current}`),
            React.createElement('div', null, `Score: ${report.summary.score}/100`)
        );
    };

    // Settings panel for performance options
    const renderPerformanceSettings = () => {
        return React.createElement('div', { className: "flex items-center gap-4 text-sm" },
            React.createElement('label', { className: "flex items-center gap-2" },
                React.createElement('input', {
                    type: 'checkbox',
                    checked: useVirtualization,
                    onChange: (e) => setUseVirtualization(e.target.checked),
                    className: "rounded"
                }),
                "Virtualization"
            ),
            React.createElement('label', { className: "flex items-center gap-2" },
                React.createElement('input', {
                    type: 'checkbox',
                    checked: useLazyContent,
                    onChange: (e) => setUseLazyContent(e.target.checked),
                    className: "rounded"
                }),
                "Lazy Loading"
            ),
            React.createElement('button', {
                onClick: () => setShowPerformanceStats(!showPerformanceStats),
                className: "px-2 py-1 bg-gray-700 rounded hover:bg-gray-600"
            }, "Stats")
        );
    };

    // Error state
    if (!window.api) {
        return React.createElement('div', { 
            className: "h-screen w-screen flex items-center justify-center bg-gray-900 text-white p-8" 
        },
            React.createElement('div', { className: "text-center bg-red-800 rounded-lg p-6 shadow-2xl max-w-2xl" },
                React.createElement('h1', { className: "text-3xl font-bold mb-4" },
                    React.createElement('i', { className: "fas fa-exclamation-triangle mr-3" }),
                    "Fatal Error"
                ),
                React.createElement('p', { className: "text-lg" }, 
                    "The application's backend API (`window.api`) failed to load."
                ),
                React.createElement('p', { className: "mt-2 text-gray-300" }, 
                    "This is a common setup issue. Please open the Developer Tools and check the Console for errors."
                )
            )
        );
    }

    // Main application render
    return React.createElement(window.ErrorBoundary, null,
        React.createElement('div', { className: "h-screen w-screen flex flex-col" },
            // Performance settings bar (dev mode)
            (window.browserEnv ? window.browserEnv.isDevelopment : 
             (window.location.hostname === 'localhost' || window.location.search.includes('debug=true'))) && 
            React.createElement('div', {
                className: "bg-gray-800 border-b border-gray-700 p-2"
            }, renderPerformanceSettings()),
            
            // Main content with search integration
            React.createElement('div', { className: "flex-1 flex overflow-hidden" },
                // Search Panel (conditionally rendered)
                isSearchVisible && React.createElement(window.SearchPanel, {
                    feeds,
                    onSearchResults: handleSearchResults,
                    isVisible: isSearchVisible,
                    onToggle: handleToggleSearch
                }),
                
                // Search Results Panel (when search is active)
                isSearchVisible && searchResults.length > 0 && React.createElement(window.SearchResultsPanel, {
                    searchResults,
                    selectedArticle,
                    onArticleSelect: handleSearchArticleSelect,
                    isVisible: isSearchVisible
                }),
                
                // Main content area
                React.createElement('div', { 
                    className: `flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden ${
                        isSearchVisible ? 'opacity-75' : ''
                    }` 
                },
                    // Feeds panel
                    React.createElement('div', { className: "col-span-12 md:col-span-3 lg:col-span-2 overflow-hidden" },
                        React.createElement(window.FeedsPanel, {
                            feeds,
                            folders,
                            selectedFeed,
                            expandedFolders,
                            draggedItem,
                            dragOverItem,
                            onSelectFeed: handleSelectFeed,
                            onShowSettings: () => dispatch({ type: 'SHOW_SETTINGS' }),
                            onToggleSearch: handleToggleSearch,
                            onToggleFolder: handleToggleFolder,
                            onDragStart: handleDragStart,
                            onDragOver: handleDragOver,
                            onDragEnd: handleDragEnd,
                            onDrop: handleDrop
                        })
                    ),
                    
                    // Articles panel (enhanced or standard) - hide when search is active
                    !isSearchVisible && React.createElement('div', { className: "col-span-12 md:col-span-4 lg:col-span-3 overflow-hidden" },
                        useVirtualization ? 
                            React.createElement(window.EnhancedArticlesPanel, {
                                articles,
                                selectedArticle,
                                onSelectArticle: handleSelectArticle,
                                isLoading: isLoadingArticles,
                                enableVirtualization: true
                            }) :
                            React.createElement(window.ArticlesPanel, {
                                articles,
                                selectedArticle,
                                onSelectArticle: handleSelectArticle,
                                isLoading: isLoadingArticles
                            })
                    ),
                    
                    // Content panel (lazy or standard)
                    React.createElement('div', { 
                        className: `col-span-12 ${isSearchVisible ? 'md:col-span-9 lg:col-span-10' : 'md:col-span-5 lg:col-span-7'} overflow-hidden` 
                    },
                    useLazyContent ?
                        React.createElement(window.LazyContentPanel, {
                            article: selectedArticle,
                            onRetrySummarization: handleRetrySummarization
                        }) :
                        React.createElement(window.ContentPanel, {
                            article: selectedArticle,
                            onRetrySummarization: handleRetrySummarization
                        })
                    )
                )
            ),
            
            // Settings modal
            React.createElement(window.SettingsModal, {
                feeds,
                folders,
                isVisible: isSettingsVisible,
                onClose: () => dispatch({ type: 'HIDE_SETTINGS' }),
                onAddFeed: handleAddFeed,
                onDeleteFeed: handleDeleteFeed,
                onUpdateFeedName: handleUpdateFeedName,
                onCreateFolder: handleCreateFolder,
                onDeleteFolder: handleDeleteFolder,
                onMoveFeedToFolder: handleMoveFeedToFolder
            }),
            
            // Performance debug panel
            renderPerformanceDebug()
        )
    );
}

window.EnhancedApp = EnhancedApp;