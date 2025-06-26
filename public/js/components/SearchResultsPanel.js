/**
 * SearchResultsPanel Component
 * Displays search results with highlighting and filtering options
 */

const SearchResultsPanel = ({ searchResults, selectedArticle, onArticleSelect, isVisible }) => {
    const [sortBy, setSortBy] = React.useState('relevance');
    const [showSnippets, setShowSnippets] = React.useState(true);

    if (!isVisible || searchResults.length === 0) {
        return null;
    }

    // Sort results based on selected criteria
    const sortedResults = React.useMemo(() => {
        const results = [...searchResults];
        
        switch (sortBy) {
            case 'relevance':
                return results.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
            case 'date':
                return results.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
            case 'title':
                return results.sort((a, b) => a.title.localeCompare(b.title));
            case 'feed':
                return results.sort((a, b) => (a.feedNameDisplay || '').localeCompare(b.feedNameDisplay || ''));
            default:
                return results;
        }
    }, [searchResults, sortBy]);

    const formatDate = (dateString) => {
        if (!dateString) return '';
        try {
            return new Date(dateString).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return dateString;
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'summarized': return 'text-green-600';
            case 'summarizing': return 'text-blue-600';
            case 'failed': return 'text-red-600';
            case 'new': return 'text-yellow-600';
            default: return 'text-gray-600';
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'summarized':
                return React.createElement('svg', { className: "w-4 h-4", fill: "currentColor", viewBox: "0 0 20 20" },
                    React.createElement('path', { fillRule: "evenodd", d: "M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z", clipRule: "evenodd" })
                );
            case 'summarizing':
                return React.createElement('svg', { className: "w-4 h-4 animate-spin", fill: "none", viewBox: "0 0 24 24" },
                    React.createElement('circle', { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }),
                    React.createElement('path', { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" })
                );
            case 'failed':
                return React.createElement('svg', { className: "w-4 h-4", fill: "currentColor", viewBox: "0 0 20 20" },
                    React.createElement('path', { fillRule: "evenodd", d: "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z", clipRule: "evenodd" })
                );
            case 'new':
                return React.createElement('svg', { className: "w-4 h-4", fill: "currentColor", viewBox: "0 0 20 20" },
                    React.createElement('path', { fillRule: "evenodd", d: "M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z", clipRule: "evenodd" })
                );
            default:
                return null;
        }
    };

    return React.createElement('div', { className: "flex flex-col h-full bg-white border-r border-gray-200 w-96" },
        // Header
        React.createElement('div', { className: "p-4 border-b border-gray-200" },
            React.createElement('div', { className: "flex items-center justify-between mb-3" },
                React.createElement('h3', { className: "text-lg font-semibold text-gray-800" },
                    `Search Results (${sortedResults.length})`
                ),
                React.createElement('div', { className: "flex items-center space-x-2" },
                    React.createElement('button', {
                        onClick: () => setShowSnippets(!showSnippets),
                        className: `px-2 py-1 text-xs rounded ${
                            showSnippets 
                                ? 'bg-blue-100 text-blue-700' 
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`,
                        title: "Toggle snippets"
                    }, "Snippets")
                )
            ),

            // Sort Options
            React.createElement('div', { className: "flex items-center space-x-2" },
                React.createElement('label', { className: "text-sm text-gray-600" }, "Sort by:"),
                React.createElement('select', {
                    value: sortBy,
                    onChange: (e) => setSortBy(e.target.value),
                    className: "text-sm border border-gray-300 rounded px-2 py-1"
                },
                    React.createElement('option', { value: "relevance" }, "Relevance"),
                    React.createElement('option', { value: "date" }, "Date"),
                    React.createElement('option', { value: "title" }, "Title"),
                    React.createElement('option', { value: "feed" }, "Feed")
                )
            )
        ),

        // Results List
        React.createElement('div', { className: "flex-1 overflow-y-auto" },
            sortedResults.map((article) =>
                React.createElement('div', {
                    key: article.id,
                    onClick: () => onArticleSelect(article),
                    className: `p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                        selectedArticle?.id === article.id ? 'bg-blue-50 border-blue-200' : ''
                    }`
                },
                    // Article Header
                    React.createElement('div', { className: "flex items-start justify-between mb-2" },
                        React.createElement('div', { className: "flex-1 pr-2" },
                            React.createElement('h4', { 
                                className: "text-sm font-medium text-gray-900 leading-tight mb-1",
                                dangerouslySetInnerHTML: { 
                                    __html: article.titleSnippet || article.title 
                                }
                            }),
                            React.createElement('div', { className: "flex items-center text-xs text-gray-500 space-x-2" },
                                React.createElement('span', { className: "truncate" },
                                    article.feedNameDisplay
                                ),
                                React.createElement('span', null, "•"),
                                React.createElement('span', null, formatDate(article.pubDate)),
                                article.relevance && React.createElement(React.Fragment, null,
                                    React.createElement('span', null, "•"),
                                    React.createElement('span', { title: "Relevance Score" },
                                        Math.round(article.relevance * 100) / 100
                                    )
                                )
                            )
                        ),
                        
                        // Status Icon
                        React.createElement('div', { className: `flex items-center ml-2 ${getStatusColor(article.status)}` },
                            getStatusIcon(article.status)
                        )
                    ),

                    // Snippets
                    showSnippets && React.createElement('div', { className: "space-y-1" },
                        article.summarySnippet && React.createElement('div', { className: "text-xs text-gray-700" },
                            React.createElement('span', { className: "font-medium text-gray-500" }, "Summary: "),
                            React.createElement('span', { dangerouslySetInnerHTML: { __html: article.summarySnippet } })
                        ),
                        article.contentSnippet && React.createElement('div', { className: "text-xs text-gray-600" },
                            React.createElement('span', { className: "font-medium text-gray-500" }, "Content: "),
                            React.createElement('span', { dangerouslySetInnerHTML: { __html: article.contentSnippet } })
                        )
                    ),

                    // Read Status Indicator
                    !article.isRead && React.createElement('div', { className: "mt-2" },
                        React.createElement('span', { className: "inline-block w-2 h-2 bg-blue-500 rounded-full" })
                    )
                )
            )
        ),

        // Footer with search statistics
        React.createElement('div', { className: "p-3 border-t border-gray-200 bg-gray-50" },
            React.createElement('div', { className: "text-xs text-gray-600" },
                sortedResults.length > 0 && React.createElement('div', { className: "flex justify-between items-center" },
                    React.createElement('span', null,
                        `Showing ${sortedResults.length} result${sortedResults.length !== 1 ? 's' : ''}`
                    ),
                    React.createElement('span', null,
                        `${sortedResults.filter(a => !a.isRead).length} unread`
                    )
                )
            )
        )
    );
};

window.SearchResultsPanel = SearchResultsPanel;