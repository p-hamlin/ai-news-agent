// ExportModal.js - Dedicated Export Interface
function ExportModal({ isVisible, onClose, feeds }) {
    if (!isVisible) return null;
    
    const { useState, useEffect } = React;
    const [exportOptions, setExportOptions] = useState({
        format: 'markdown',
        includeArchived: false,
        feedIds: [],
        dateRange: {
            start: '',
            end: ''
        }
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [exportEstimate, setExportEstimate] = useState(null);
    const [availableFormats, setAvailableFormats] = useState([]);

    // Load available formats when modal opens
    useEffect(() => {
        if (isVisible) {
            loadAvailableFormats();
            updateExportEstimate();
        }
    }, [isVisible]);

    // Update estimate when options change
    useEffect(() => {
        if (isVisible) {
            updateExportEstimate();
        }
    }, [exportOptions, isVisible]);

    const loadAvailableFormats = async () => {
        try {
            const formats = await window.api.exportGetFormats();
            setAvailableFormats(formats);
        } catch (error) {
            console.error('Failed to load export formats:', error);
        }
    };

    const updateExportEstimate = async () => {
        try {
            const estimate = await window.api.exportEstimateSize(exportOptions);
            setExportEstimate(estimate);
        } catch (error) {
            console.error('Failed to get export estimate:', error);
        }
    };

    const handleExport = async () => {
        try {
            setIsLoading(true);
            setError('');
            
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
                
                onClose();
            } else {
                setError(result.error || 'Export failed');
            }
        } catch (error) {
            setError('Export failed: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFeedSelection = (feedId, selected) => {
        if (selected) {
            setExportOptions({
                ...exportOptions,
                feedIds: [...exportOptions.feedIds, feedId]
            });
        } else {
            setExportOptions({
                ...exportOptions,
                feedIds: exportOptions.feedIds.filter(id => id !== feedId)
            });
        }
    };

    const formatOptions = [
        { value: 'markdown', label: 'Markdown (.md)', description: 'Human-readable text format' },
        { value: 'html', label: 'HTML (.html)', description: 'Web page format with styling' },
        { value: 'json', label: 'JSON (.json)', description: 'Structured data format' },
        { value: 'epub', label: 'EPUB (.epub)', description: 'E-book format' },
        { value: 'pdf', label: 'PDF (.pdf)', description: 'Portable document format' }
    ];

    return React.createElement('div', { 
        className: "fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4" 
    },
        React.createElement('div', { 
            className: "bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] text-white flex flex-col" 
        },
            // Header
            React.createElement('div', { className: "flex justify-between items-center p-6 border-b border-gray-700" },
                React.createElement('h2', { className: "text-2xl font-bold flex items-center" },
                    React.createElement('i', { className: "fas fa-download mr-3 text-blue-400" }),
                    "Export Articles"
                ),
                React.createElement('button', { 
                    onClick: onClose, 
                    className: "text-gray-400 hover:text-white transition-colors text-2xl" 
                }, "×")
            ),
            
            // Content
            React.createElement('div', { className: "flex-1 overflow-y-auto p-6 space-y-6" },
                // Export Format Selection
                React.createElement('div', null,
                    React.createElement('h3', { className: "text-lg font-semibold mb-3" }, "Export Format"),
                    React.createElement('div', { className: "grid grid-cols-1 md:grid-cols-2 gap-3" },
                        formatOptions.map(format => 
                            React.createElement('label', {
                                key: format.value,
                                className: `flex items-center p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                                    exportOptions.format === format.value 
                                        ? 'border-blue-500 bg-blue-900 bg-opacity-20' 
                                        : 'border-gray-600 hover:border-gray-500'
                                }`
                            },
                                React.createElement('input', {
                                    type: 'radio',
                                    name: 'format',
                                    value: format.value,
                                    checked: exportOptions.format === format.value,
                                    onChange: (e) => setExportOptions({ ...exportOptions, format: e.target.value }),
                                    className: "mr-3"
                                }),
                                React.createElement('div', null,
                                    React.createElement('div', { className: "font-medium" }, format.label),
                                    React.createElement('div', { className: "text-sm text-gray-400" }, format.description)
                                )
                            )
                        )
                    )
                ),
                
                // Feed Selection
                React.createElement('div', null,
                    React.createElement('h3', { className: "text-lg font-semibold mb-3" }, "Select Feeds"),
                    React.createElement('div', { className: "flex items-center mb-3 space-x-4" },
                        React.createElement('button', {
                            onClick: () => setExportOptions({ 
                                ...exportOptions, 
                                feedIds: feeds.map(f => f.id) 
                            }),
                            className: "text-blue-400 hover:text-blue-300 text-sm"
                        }, "Select All"),
                        React.createElement('button', {
                            onClick: () => setExportOptions({ ...exportOptions, feedIds: [] }),
                            className: "text-blue-400 hover:text-blue-300 text-sm"
                        }, "Select None")
                    ),
                    React.createElement('div', { className: "grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-2 bg-gray-700 rounded" },
                        feeds.map(feed => 
                            React.createElement('label', {
                                key: feed.id,
                                className: "flex items-center p-2 hover:bg-gray-600 rounded cursor-pointer"
                            },
                                React.createElement('input', {
                                    type: 'checkbox',
                                    checked: exportOptions.feedIds.includes(feed.id),
                                    onChange: (e) => handleFeedSelection(feed.id, e.target.checked),
                                    className: "mr-3"
                                }),
                                React.createElement('span', { className: "text-sm" }, feed.name)
                            )
                        )
                    )
                ),
                
                // Date Range
                React.createElement('div', null,
                    React.createElement('h3', { className: "text-lg font-semibold mb-3" }, "Date Range (Optional)"),
                    React.createElement('div', { className: "grid grid-cols-1 md:grid-cols-2 gap-4" },
                        React.createElement('div', null,
                            React.createElement('label', { className: "block text-sm font-medium mb-2" }, "Start Date"),
                            React.createElement('input', {
                                type: 'date',
                                value: exportOptions.dateRange.start,
                                onChange: (e) => setExportOptions({
                                    ...exportOptions,
                                    dateRange: { ...exportOptions.dateRange, start: e.target.value }
                                }),
                                className: "w-full p-2 rounded-md bg-gray-700 border border-gray-600 text-white"
                            })
                        ),
                        React.createElement('div', null,
                            React.createElement('label', { className: "block text-sm font-medium mb-2" }, "End Date"),
                            React.createElement('input', {
                                type: 'date',
                                value: exportOptions.dateRange.end,
                                onChange: (e) => setExportOptions({
                                    ...exportOptions,
                                    dateRange: { ...exportOptions.dateRange, end: e.target.value }
                                }),
                                className: "w-full p-2 rounded-md bg-gray-700 border border-gray-600 text-white"
                            })
                        )
                    )
                ),
                
                // Additional Options
                React.createElement('div', null,
                    React.createElement('h3', { className: "text-lg font-semibold mb-3" }, "Additional Options"),
                    React.createElement('div', { className: "space-y-2" },
                        React.createElement('label', { className: "flex items-center space-x-2" },
                            React.createElement('input', {
                                type: 'checkbox',
                                checked: exportOptions.includeArchived,
                                onChange: (e) => setExportOptions({ 
                                    ...exportOptions, 
                                    includeArchived: e.target.checked 
                                }),
                                className: "rounded"
                            }),
                            React.createElement('span', null, "Include archived articles")
                        )
                    )
                ),
                
                // Export Estimate
                exportEstimate && React.createElement('div', { className: "bg-gray-700 p-4 rounded-lg" },
                    React.createElement('h4', { className: "font-medium mb-2 flex items-center" },
                        React.createElement('i', { className: "fas fa-chart-bar mr-2 text-green-400" }),
                        "Export Preview"
                    ),
                    React.createElement('div', { className: "grid grid-cols-2 gap-4 text-sm" },
                        React.createElement('div', null, 
                            React.createElement('span', { className: "text-gray-300" }, "Articles: "),
                            React.createElement('span', { className: "font-medium" }, exportEstimate.articleCount || 0)
                        ),
                        React.createElement('div', null,
                            React.createElement('span', { className: "text-gray-300" }, "Est. Size: "),
                            React.createElement('span', { className: "font-medium" }, 
                                exportEstimate.estimatedSizeMB ? `${exportEstimate.estimatedSizeMB} MB` : 'Unknown'
                            )
                        )
                    )
                )
            ),
            
            // Footer with Actions
            React.createElement('div', { className: "flex justify-between items-center p-6 border-t border-gray-700" },
                React.createElement('div', null,
                    error && React.createElement('p', { className: "text-red-400 text-sm" }, error)
                ),
                React.createElement('div', { className: "flex space-x-3" },
                    React.createElement('button', {
                        onClick: onClose,
                        className: "px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
                    }, "Cancel"),
                    React.createElement('button', {
                        onClick: handleExport,
                        disabled: isLoading || (exportOptions.feedIds.length === 0 && !exportOptions.includeArchived),
                        className: "px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center transition-colors"
                    },
                        isLoading && React.createElement('i', { className: "fas fa-spinner fa-spin mr-2" }),
                        isLoading ? "Exporting..." : "Export"
                    )
                )
            )
        )
    );
}

window.ExportModal = ExportModal;