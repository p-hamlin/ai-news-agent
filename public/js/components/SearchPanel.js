/**
 * SearchPanel Component
 * Provides search functionality with filters and real-time suggestions
 */

const SearchPanel = ({ feeds, onSearchResults, isVisible, onToggle }) => {
    const [searchQuery, setSearchQuery] = React.useState('');
    const [searchResults, setSearchResults] = React.useState([]);
    const [suggestions, setSuggestions] = React.useState([]);
    const [showSuggestions, setShowSuggestions] = React.useState(false);
    const [isSearching, setIsSearching] = React.useState(false);
    const [searchFilters, setSearchFilters] = React.useState({
        feedIds: [],
        isRead: undefined,
        status: '',
        dateFrom: '',
        dateTo: '',
        limit: 50
    });
    const [showAdvancedFilters, setShowAdvancedFilters] = React.useState(false);

    // Debounced search function
    const debouncedSearch = React.useCallback(
        debounce(async (query, filters) => {
            const queryStr = query || '';
            if (!queryStr.trim() && Object.values(filters).every(v => !v || (Array.isArray(v) && v.length === 0))) {
                setSearchResults([]);
                onSearchResults([]);
                return;
            }

            setIsSearching(true);
            try {
                const results = await window.api.searchArticlesWithFilters(queryStr, filters);
                setSearchResults(results);
                onSearchResults(results);
            } catch (error) {
                console.error('Search error:', error);
                setSearchResults([]);
                onSearchResults([]);
            } finally {
                setIsSearching(false);
            }
        }, 300),
        [onSearchResults]
    );

    // Debounced suggestions function
    const debouncedSuggestions = React.useCallback(
        debounce(async (query) => {
            const queryStr = query || '';
            if (queryStr.length < 2) {
                setSuggestions([]);
                return;
            }

            try {
                const results = await window.api.getSearchSuggestions(queryStr, 5);
                setSuggestions(results);
            } catch (error) {
                console.error('Suggestions error:', error);
                setSuggestions([]);
            }
        }, 200),
        []
    );

    // Handle search input change
    const handleSearchChange = (e) => {
        const query = e.target.value || '';
        setSearchQuery(query);
        
        if (query.trim()) {
            debouncedSuggestions(query);
            setShowSuggestions(true);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
        
        debouncedSearch(query, searchFilters);
    };

    // Handle filter changes
    const handleFilterChange = (filterKey, value) => {
        const newFilters = { ...searchFilters, [filterKey]: value };
        setSearchFilters(newFilters);
        debouncedSearch(searchQuery, newFilters);
    };

    // Handle suggestion selection
    const handleSuggestionSelect = (suggestion) => {
        const suggestionText = suggestion.suggestion || '';
        setSearchQuery(suggestionText);
        setShowSuggestions(false);
        debouncedSearch(suggestionText, searchFilters);
    };

    // Clear search
    const clearSearch = () => {
        setSearchQuery('');
        setSearchResults([]);
        setSuggestions([]);
        setShowSuggestions(false);
        setSearchFilters({
            feedIds: [],
            isRead: undefined,
            status: '',
            dateFrom: '',
            dateTo: '',
            limit: 50
        });
        onSearchResults([]);
    };

    // Handle key events
    const handleKeyPress = (e) => {
        if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    };

    if (!isVisible) {
        return null;
    }

    return React.createElement('div', { className: "bg-white border-r border-gray-200 w-80 flex flex-col h-full" },
        // Header
        React.createElement('div', { className: "p-4 border-b border-gray-200" },
            React.createElement('div', { className: "flex items-center justify-between mb-3" },
                React.createElement('h2', { className: "text-lg font-semibold text-gray-800" }, "Search Articles"),
                React.createElement('button', {
                    onClick: onToggle,
                    className: "text-gray-500 hover:text-gray-700 p-1",
                    title: "Close Search"
                },
                    React.createElement('svg', { className: "w-5 h-5", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" },
                        React.createElement('path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M6 18L18 6M6 6l12 12" })
                    )
                )
            ),

            // Search Input
            React.createElement('div', { className: "relative" },
                React.createElement('div', { className: "relative" },
                    React.createElement('input', {
                        type: "text",
                        value: searchQuery || '',
                        onChange: handleSearchChange,
                        onKeyPress: handleKeyPress,
                        placeholder: "Search articles, summaries, feeds...",
                        className: "w-full px-3 py-2 pr-8 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    }),
                    searchQuery && React.createElement('button', {
                        onClick: clearSearch,
                        className: "absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                    },
                        React.createElement('svg', { className: "w-4 h-4", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" },
                            React.createElement('path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M6 18L18 6M6 6l12 12" })
                        )
                    )
                ),

                // Search Suggestions
                showSuggestions && suggestions.length > 0 && React.createElement('div', { className: "absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto" },
                    suggestions.map((suggestion, index) =>
                        React.createElement('button', {
                            key: index,
                            onClick: () => handleSuggestionSelect(suggestion),
                            className: "w-full px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none border-b border-gray-100 last:border-b-0"
                        },
                            React.createElement('div', { className: "text-sm text-gray-800 truncate" }, suggestion.suggestion),
                            React.createElement('div', { className: "text-xs text-gray-500 capitalize" }, suggestion.type)
                        )
                    )
                )
            ),

            // Search Status
            isSearching && React.createElement('div', { className: "mt-2 text-sm text-blue-600 flex items-center" },
                React.createElement('svg', { className: "animate-spin -ml-1 mr-2 h-4 w-4 text-blue-600", xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24" },
                    React.createElement('circle', { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }),
                    React.createElement('path', { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" })
                ),
                "Searching..."
            ),

            searchResults.length > 0 && !isSearching && React.createElement('div', { className: "mt-2 text-sm text-gray-600" },
                `Found ${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`
            )
        ),

        // Advanced Filters Toggle
        React.createElement('div', { className: "p-4 border-b border-gray-200" },
            React.createElement('button', {
                onClick: () => setShowAdvancedFilters(!showAdvancedFilters),
                className: "flex items-center justify-between w-full text-sm text-gray-700 hover:text-gray-900"
            },
                React.createElement('span', null, "Advanced Filters"),
                React.createElement('svg', {
                    className: `w-4 h-4 transform transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`,
                    fill: "none",
                    stroke: "currentColor",
                    viewBox: "0 0 24 24"
                },
                    React.createElement('path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M19 9l-7 7-7-7" })
                )
            ),

            // Advanced Filters
            showAdvancedFilters && React.createElement('div', { className: "mt-3 space-y-3" },
                // Feed Filter
                React.createElement('div', null,
                    React.createElement('label', { className: "block text-xs font-medium text-gray-700 mb-1" }, "Feeds"),
                    React.createElement('select', {
                        multiple: true,
                        value: searchFilters.feedIds || [],
                        onChange: (e) => {
                            const values = Array.from(e.target.selectedOptions, option => parseInt(option.value));
                            handleFilterChange('feedIds', values);
                        },
                        className: "w-full text-xs border border-gray-300 rounded px-2 py-1 max-h-20 overflow-y-auto"
                    },
                        (feeds || []).map(feed =>
                            React.createElement('option', { key: feed.id, value: feed.id },
                                feed.displayName || feed.name
                            )
                        )
                    )
                ),

                // Read Status Filter
                React.createElement('div', null,
                    React.createElement('label', { className: "block text-xs font-medium text-gray-700 mb-1" }, "Read Status"),
                    React.createElement('select', {
                        value: searchFilters.isRead === undefined ? '' : searchFilters.isRead.toString(),
                        onChange: (e) => {
                            const value = e.target.value === '' ? undefined : e.target.value === 'true';
                            handleFilterChange('isRead', value);
                        },
                        className: "w-full text-xs border border-gray-300 rounded px-2 py-1"
                    },
                        React.createElement('option', { value: "" }, "All"),
                        React.createElement('option', { value: "false" }, "Unread"),
                        React.createElement('option', { value: "true" }, "Read")
                    )
                ),

                // Article Status Filter
                React.createElement('div', null,
                    React.createElement('label', { className: "block text-xs font-medium text-gray-700 mb-1" }, "Status"),
                    React.createElement('select', {
                        value: searchFilters.status || '',
                        onChange: (e) => handleFilterChange('status', e.target.value),
                        className: "w-full text-xs border border-gray-300 rounded px-2 py-1"
                    },
                        React.createElement('option', { value: "" }, "All"),
                        React.createElement('option', { value: "new" }, "New"),
                        React.createElement('option', { value: "summarizing" }, "Summarizing"),
                        React.createElement('option', { value: "summarized" }, "Summarized"),
                        React.createElement('option', { value: "failed" }, "Failed")
                    )
                ),

                // Date Range
                React.createElement('div', { className: "grid grid-cols-2 gap-2" },
                    React.createElement('div', null,
                        React.createElement('label', { className: "block text-xs font-medium text-gray-700 mb-1" }, "From"),
                        React.createElement('input', {
                            type: "date",
                            value: searchFilters.dateFrom || '',
                            onChange: (e) => handleFilterChange('dateFrom', e.target.value),
                            className: "w-full text-xs border border-gray-300 rounded px-2 py-1"
                        })
                    ),
                    React.createElement('div', null,
                        React.createElement('label', { className: "block text-xs font-medium text-gray-700 mb-1" }, "To"),
                        React.createElement('input', {
                            type: "date",
                            value: searchFilters.dateTo || '',
                            onChange: (e) => handleFilterChange('dateTo', e.target.value),
                            className: "w-full text-xs border border-gray-300 rounded px-2 py-1"
                        })
                    )
                )
            )
        ),

        // Search Tips
        React.createElement('div', { className: "p-4 text-xs text-gray-500" },
            React.createElement('div', { className: "mb-2 font-medium" }, "Search Tips:"),
            React.createElement('ul', { className: "space-y-1" },
                React.createElement('li', null, '• Use quotes for exact phrases: "climate change"'),
                React.createElement('li', null, '• Use AND/OR for complex queries'),
                React.createElement('li', null, '• Search across titles, content, and summaries'),
                React.createElement('li', null, '• Results ranked by relevance')
            )
        )
    );
};

// Utility function for debouncing
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

window.SearchPanel = SearchPanel;