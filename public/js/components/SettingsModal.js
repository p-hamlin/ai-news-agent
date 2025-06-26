// SettingsModal.js - Comprehensive Settings and Management Interface
function SettingsModal({ feeds, folders, isVisible, onClose, onAddFeed, onDeleteFeed, onUpdateFeedName, onCreateFolder, onDeleteFolder, onMoveFeedToFolder }) {
    if (!isVisible) return null;
    
    const { useState, useEffect } = React;
    const [activeTab, setActiveTab] = useState('feeds');
    const [url, setUrl] = useState('');
    const [error, setError] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [settings, setSettings] = useState(null);
    const [exportOptions, setExportOptions] = useState({
        format: 'markdown',
        includeArchived: false,
        dateRange: null
    });
    const [opmlFile, setOpmlFile] = useState(null);
    const [recommendations, setRecommendations] = useState([]);
    const [archiveStats, setArchiveStats] = useState(null);
    const [duplicateStats, setDuplicateStats] = useState(null);

    // Load settings and statistics when modal opens
    useEffect(() => {
        if (isVisible) {
            loadSettingsData();
            loadArchiveStats();
            loadDuplicateStats();
        }
    }, [isVisible]);

    const loadSettingsData = async () => {
        try {
            const settingsData = await window.api.settingsGet();
            setSettings(settingsData);
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    };

    const loadArchiveStats = async () => {
        try {
            const stats = await window.api.archiveGetStatistics();
            setArchiveStats(stats);
        } catch (error) {
            console.error('Failed to load archive stats:', error);
        }
    };

    const loadDuplicateStats = async () => {
        try {
            const stats = await window.api.duplicatesGetStatistics();
            setDuplicateStats(stats);
        } catch (error) {
            console.error('Failed to load duplicate stats:', error);
        }
    };

    const loadRecommendations = async () => {
        try {
            setIsLoading(true);
            const result = await window.api.recommendationsGet({ maxResults: 10 });
            if (result.success) {
                setRecommendations(result.recommendations);
            }
        } catch (error) {
            console.error('Failed to load recommendations:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddSubmit = async (e) => {
        e.preventDefault();
        if (!url) return;
        setIsAdding(true);
        setError('');
        try {
            await onAddFeed(url);
            setUrl('');
        } catch (err) {
            setError(err.message);
        } finally {
            setIsAdding(false);
        }
    };

    const handleExport = async () => {
        try {
            setIsLoading(true);
            const result = await window.api.exportArticles(exportOptions);
            if (result.success) {
                // Create download link
                const blob = new Blob([result.content], { type: result.mimeType });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = result.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            setError('Export failed: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpmlExport = async () => {
        try {
            const result = await window.api.opmlExport({ includeMetadata: true });
            if (result.success) {
                const blob = new Blob([result.opmlContent], { type: 'application/xml' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'feeds.opml';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            setError('OPML export failed: ' + error.message);
        }
    };

    const handleOpmlImport = async () => {
        if (!opmlFile) return;
        try {
            setIsLoading(true);
            const content = await opmlFile.text();
            const result = await window.api.opmlImport(content, { 
                skipDuplicates: true,
                validateFeeds: true 
            });
            if (result.success) {
                setError('');
                // Refresh feeds
                window.location.reload();
            } else {
                setError('OPML import failed: ' + result.error);
            }
        } catch (error) {
            setError('OPML import failed: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleArchiveCleanup = async () => {
        try {
            setIsLoading(true);
            const result = await window.api.archiveRunAuto();
            if (result.success) {
                await loadArchiveStats();
            }
        } catch (error) {
            setError('Archive cleanup failed: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDuplicateDetection = async () => {
        try {
            setIsLoading(true);
            const result = await window.api.duplicatesFind({ threshold: 0.85 });
            if (result.success) {
                await loadDuplicateStats();
            }
        } catch (error) {
            setError('Duplicate detection failed: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const renderTabButton = (tabId, label, icon) => {
        return React.createElement('button', {
            onClick: () => setActiveTab(tabId),
            className: `flex items-center px-4 py-2 rounded-md transition-colors ${
                activeTab === tabId ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`
        },
            React.createElement('i', { className: `fas ${icon} mr-2` }),
            label
        );
    };

    const renderFeedsTab = () => {
        return React.createElement('div', { className: "space-y-6" },
            // Add Feed Section
            React.createElement('div', null,
                React.createElement('h3', { className: "text-lg font-semibold mb-3" }, "Add New RSS Feed"),
                React.createElement('form', { className: "flex space-x-2", onSubmit: handleAddSubmit },
                    React.createElement('input', { 
                        type: "text",
                        value: url,
                        onChange: (e) => setUrl(e.target.value),
                        placeholder: "e.g., https://www.theverge.com/rss/index.xml",
                        className: "flex-grow p-2 rounded-md bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    }),
                    React.createElement('button', { 
                        type: "submit", 
                        disabled: isAdding,
                        className: "bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
                    },
                        isAdding ? React.createElement('i', { className: "fas fa-spinner fa-spin" }) : "Add"
                    )
                )
            ),
            
            // OPML Import/Export
            React.createElement('div', null,
                React.createElement('h3', { className: "text-lg font-semibold mb-3" }, "OPML Import/Export"),
                React.createElement('div', { className: "flex space-x-2 mb-2" },
                    React.createElement('input', {
                        type: "file",
                        accept: ".opml,.xml",
                        onChange: (e) => setOpmlFile(e.target.files[0]),
                        className: "flex-grow p-2 rounded-md bg-gray-700 border border-gray-600 text-white"
                    }),
                    React.createElement('button', {
                        onClick: handleOpmlImport,
                        disabled: !opmlFile || isLoading,
                        className: "bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md disabled:bg-gray-500"
                    }, "Import")
                ),
                React.createElement('button', {
                    onClick: handleOpmlExport,
                    className: "bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
                }, "Export OPML")
            ),
            
            // Current Feeds
            React.createElement('div', null,
                React.createElement('h3', { className: "text-lg font-semibold mb-3" }, "Current Feeds"),
                React.createElement('div', { className: "max-h-60 overflow-y-auto pr-2" },
                    React.createElement('ul', { className: "space-y-2" },
                        feeds.map(feed => 
                            React.createElement('li', { 
                                key: feed.id, 
                                className: "bg-gray-700 p-3 rounded-md flex justify-between items-center" 
                            },
                                React.createElement('span', { className: "truncate" }, feed.name),
                                React.createElement('button', { 
                                    onClick: () => onDeleteFeed(feed.id),
                                    className: "text-red-500 hover:text-red-400"
                                },
                                    React.createElement('i', { className: "fas fa-trash-alt" })
                                )
                            )
                        )
                    )
                )
            )
        );
    };

    const renderExportTab = () => {
        return React.createElement('div', { className: "space-y-6" },
            React.createElement('h3', { className: "text-lg font-semibold mb-3" }, "Export Articles"),
            
            // Export Format Selection
            React.createElement('div', null,
                React.createElement('label', { className: "block text-sm font-medium mb-2" }, "Export Format"),
                React.createElement('select', {
                    value: exportOptions.format,
                    onChange: (e) => setExportOptions({ ...exportOptions, format: e.target.value }),
                    className: "w-full p-2 rounded-md bg-gray-700 border border-gray-600 text-white"
                },
                    React.createElement('option', { value: 'markdown' }, "Markdown"),
                    React.createElement('option', { value: 'html' }, "HTML"),
                    React.createElement('option', { value: 'json' }, "JSON"),
                    React.createElement('option', { value: 'epub' }, "EPUB"),
                    React.createElement('option', { value: 'pdf' }, "PDF")
                )
            ),
            
            // Export Options
            React.createElement('div', null,
                React.createElement('label', { className: "flex items-center space-x-2" },
                    React.createElement('input', {
                        type: 'checkbox',
                        checked: exportOptions.includeArchived,
                        onChange: (e) => setExportOptions({ ...exportOptions, includeArchived: e.target.checked }),
                        className: "rounded"
                    }),
                    React.createElement('span', null, "Include archived articles")
                )
            ),
            
            React.createElement('button', {
                onClick: handleExport,
                disabled: isLoading,
                className: "bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md disabled:bg-gray-500 flex items-center"
            },
                isLoading && React.createElement('i', { className: "fas fa-spinner fa-spin mr-2" }),
                "Export Articles"
            )
        );
    };

    const renderMaintenanceTab = () => {
        return React.createElement('div', { className: "space-y-6" },
            React.createElement('h3', { className: "text-lg font-semibold mb-3" }, "Database Maintenance"),
            
            // Archive Statistics
            archiveStats && React.createElement('div', { className: "bg-gray-700 p-4 rounded-md" },
                React.createElement('h4', { className: "font-medium mb-2" }, "Archive Statistics"),
                React.createElement('div', { className: "grid grid-cols-2 gap-4 text-sm" },
                    React.createElement('div', null, `Archived Articles: ${archiveStats.totalArchived || 0}`),
                    React.createElement('div', null, `Active Articles: ${archiveStats.totalActive || 0}`),
                    React.createElement('div', null, `Database Size: ${archiveStats.databaseSizeMB || 0} MB`)
                )
            ),
            
            // Duplicate Statistics
            duplicateStats && React.createElement('div', { className: "bg-gray-700 p-4 rounded-md" },
                React.createElement('h4', { className: "font-medium mb-2" }, "Duplicate Detection"),
                React.createElement('div', { className: "grid grid-cols-2 gap-4 text-sm" },
                    React.createElement('div', null, `Potential Duplicates: ${duplicateStats.duplicateGroups || 0}`),
                    React.createElement('div', null, `Total Articles Analyzed: ${duplicateStats.totalArticles || 0}`)
                )
            ),
            
            // Maintenance Actions
            React.createElement('div', { className: "space-y-3" },
                React.createElement('button', {
                    onClick: handleArchiveCleanup,
                    disabled: isLoading,
                    className: "w-full bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-md disabled:bg-gray-500 flex items-center justify-center"
                },
                    isLoading && React.createElement('i', { className: "fas fa-spinner fa-spin mr-2" }),
                    "Run Archive Cleanup"
                ),
                React.createElement('button', {
                    onClick: handleDuplicateDetection,
                    disabled: isLoading,
                    className: "w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md disabled:bg-gray-500 flex items-center justify-center"
                },
                    isLoading && React.createElement('i', { className: "fas fa-spinner fa-spin mr-2" }),
                    "Detect Duplicates"
                ),
                React.createElement('button', {
                    onClick: async () => {
                        try {
                            setIsLoading(true);
                            await window.api.cleanupOptimizeDatabase();
                            await loadArchiveStats();
                        } catch (error) {
                            setError('Database optimization failed: ' + error.message);
                        } finally {
                            setIsLoading(false);
                        }
                    },
                    disabled: isLoading,
                    className: "w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md disabled:bg-gray-500 flex items-center justify-center"
                },
                    isLoading && React.createElement('i', { className: "fas fa-spinner fa-spin mr-2" }),
                    "Optimize Database"
                )
            )
        );
    };

    const renderRecommendationsTab = () => {
        return React.createElement('div', { className: "space-y-6" },
            React.createElement('div', { className: "flex justify-between items-center" },
                React.createElement('h3', { className: "text-lg font-semibold" }, "Feed Recommendations"),
                React.createElement('button', {
                    onClick: loadRecommendations,
                    disabled: isLoading,
                    className: "bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md disabled:bg-gray-500"
                }, "Get Recommendations")
            ),
            
            recommendations.length > 0 && React.createElement('div', { className: "space-y-3" },
                recommendations.map((rec, index) => 
                    React.createElement('div', {
                        key: index,
                        className: "bg-gray-700 p-4 rounded-md flex justify-between items-start"
                    },
                        React.createElement('div', { className: "flex-1" },
                            React.createElement('h4', { className: "font-medium text-white" }, rec.name),
                            React.createElement('p', { className: "text-sm text-gray-300 mt-1" }, rec.reason),
                            React.createElement('span', { className: "text-xs text-blue-400" }, rec.category)
                        ),
                        React.createElement('button', {
                            onClick: async () => {
                                try {
                                    await onAddFeed(rec.url);
                                } catch (error) {
                                    setError('Failed to add feed: ' + error.message);
                                }
                            },
                            className: "bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm"
                        }, "Add")
                    )
                )
            )
        );
    };

    const renderActiveTabContent = () => {
        switch (activeTab) {
            case 'feeds': return renderFeedsTab();
            case 'export': return renderExportTab();
            case 'maintenance': return renderMaintenanceTab();
            case 'recommendations': return renderRecommendationsTab();
            default: return renderFeedsTab();
        }
    };

    return React.createElement('div', { 
        className: "fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4" 
    },
        React.createElement('div', { 
            className: "bg-gray-800 rounded-lg shadow-2xl w-full max-w-6xl h-full max-h-[90vh] text-white flex flex-col" 
        },
            // Header
            React.createElement('div', { className: "flex justify-between items-center p-6 border-b border-gray-700" },
                React.createElement('h2', { className: "text-2xl font-bold" }, "Settings & Management"),
                React.createElement('button', { 
                    onClick: onClose, 
                    className: "text-gray-400 hover:text-white transition-colors text-2xl" 
                }, "×")
            ),
            
            // Tab Navigation
            React.createElement('div', { className: "flex space-x-2 p-6 pb-0" },
                renderTabButton('feeds', 'Feeds', 'fa-rss'),
                renderTabButton('export', 'Export', 'fa-download'),
                renderTabButton('maintenance', 'Maintenance', 'fa-tools'),
                renderTabButton('recommendations', 'Discover', 'fa-lightbulb')
            ),
            
            // Content Area
            React.createElement('div', { className: "flex-1 overflow-y-auto p-6" },
                renderActiveTabContent()
            ),
            
            // Error Display
            error && React.createElement('div', { className: "px-6 pb-4" },
                React.createElement('p', { className: "text-red-400 bg-red-900 bg-opacity-20 p-3 rounded-md" }, error)
            )
        )
    );
}

window.SettingsModal = SettingsModal;