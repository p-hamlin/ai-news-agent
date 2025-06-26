// FeedsPanel.js
function FeedsPanel({ feeds, folders, selectedFeed, expandedFolders, draggedItem, dragOverItem, onSelectFeed, onShowSettings, onShowExport, onToggleSearch, onToggleFolder, onDragStart, onDragOver, onDragEnd, onDrop }) {
    const [editingFeed, setEditingFeed] = React.useState(null);
    const [editValue, setEditValue] = React.useState('');

    // Organize feeds by folder
    const feedsByFolder = feeds.reduce((acc, feed) => {
        const folderId = feed.folderId || 'uncategorized';
        if (!acc[folderId]) acc[folderId] = [];
        acc[folderId].push(feed);
        return acc;
    }, {});

    const handleEditFeed = (feed, e) => {
        e.stopPropagation();
        setEditingFeed(feed.id);
        setEditValue(feed.name);
    };

    const handleSaveEdit = async (feedId) => {
        if (editValue.trim() && editValue !== feeds.find(f => f.id === feedId)?.name) {
            try {
                await window.api.updateFeedDisplayName(feedId, editValue.trim());
                // Trigger refresh of feeds
                window.location.reload();
            } catch (error) {
                console.error('Failed to update feed name:', error);
            }
        }
        setEditingFeed(null);
        setEditValue('');
    };

    const handleCancelEdit = () => {
        setEditingFeed(null);
        setEditValue('');
    };

    const handleKeyPress = (e, feedId) => {
        if (e.key === 'Enter') {
            handleSaveEdit(feedId);
        } else if (e.key === 'Escape') {
            handleCancelEdit();
        }
    };

    const renderFeed = (feed, folderContext = null) => {
        const isDragging = draggedItem?.type === 'feed' && draggedItem?.id === feed.id;
        const isDragOver = dragOverItem?.type === 'feed' && dragOverItem?.id === feed.id;
        const isEditing = editingFeed === feed.id;
        
        return React.createElement('li', {
            key: feed.id,
            draggable: !isEditing,
            className: `p-2 rounded-md mb-1 ml-4 transition-all duration-200 ${
                selectedFeed?.id === feed.id ? 'bg-blue-600' : 'hover:bg-gray-700'
            } ${isDragging ? 'opacity-50 scale-95' : ''} ${
                isDragOver ? 'border-2 border-blue-400 border-dashed' : ''
            } ${isEditing ? 'bg-gray-700' : 'cursor-pointer'}`,
            onClick: isEditing ? undefined : () => onSelectFeed(feed),
            onDragStart: isEditing ? undefined : (e) => onDragStart(e, { type: 'feed', id: feed.id, data: feed }),
            onDragOver: isEditing ? undefined : (e) => onDragOver(e, { type: 'feed', id: feed.id, folderContext }),
            onDragEnd: isEditing ? undefined : onDragEnd,
            onDrop: isEditing ? undefined : (e) => onDrop(e, { type: 'feed', id: feed.id, folderContext })
        },
            React.createElement('div', { className: "flex items-center justify-between group" },
                React.createElement('div', { className: "flex items-center flex-1" },
                    React.createElement('i', { className: "fas fa-grip-vertical text-xs mr-2 text-gray-500" }),
                    React.createElement('i', { className: "fas fa-rss text-xs mr-2 text-gray-400" }),
                    isEditing ? 
                        React.createElement('input', {
                            type: 'text',
                            value: editValue,
                            onChange: (e) => setEditValue(e.target.value),
                            onKeyDown: (e) => handleKeyPress(e, feed.id),
                            onBlur: () => handleSaveEdit(feed.id),
                            className: "bg-gray-600 text-white text-sm px-2 py-1 rounded border-none outline-none flex-1",
                            autoFocus: true
                        }) :
                        React.createElement('span', { className: "flex-1" }, feed.name)
                ),
                !isEditing && React.createElement('div', { className: "opacity-0 group-hover:opacity-100 flex items-center" },
                    React.createElement('button', {
                        onClick: (e) => handleEditFeed(feed, e),
                        className: "text-gray-400 hover:text-white text-xs ml-2 p-1",
                        title: "Rename feed"
                    },
                        React.createElement('i', { className: "fas fa-edit" })
                    )
                )
            )
        );
    };

    const renderFolder = (folder) => {
        const isExpanded = expandedFolders.has(folder.id);
        const folderFeeds = feedsByFolder[folder.id] || [];
        const isDragging = draggedItem?.type === 'folder' && draggedItem?.id === folder.id;
        const isDragOver = dragOverItem?.type === 'folder' && dragOverItem?.id === folder.id;
        
        return React.createElement('div', { key: folder.id, className: "mb-2" },
            React.createElement('div', {
                draggable: true,
                className: `flex items-center p-2 rounded-md cursor-pointer hover:bg-gray-700 transition-all duration-200 ${
                    isDragging ? 'opacity-50 scale-95' : ''
                } ${isDragOver ? 'border-2 border-blue-400 border-dashed' : ''}`,
                onClick: () => onToggleFolder(folder.id),
                onDragStart: (e) => onDragStart(e, { type: 'folder', id: folder.id, data: folder }),
                onDragOver: (e) => onDragOver(e, { type: 'folder', id: folder.id }),
                onDragEnd: onDragEnd,
                onDrop: (e) => onDrop(e, { type: 'folder', id: folder.id })
            },
                React.createElement('i', { className: "fas fa-grip-vertical text-xs mr-2 text-gray-500" }),
                React.createElement('i', { className: `fas ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'} text-xs mr-2 text-gray-400` }),
                React.createElement('i', { className: "fas fa-folder text-yellow-500 mr-2" }),
                React.createElement('span', null, folder.name),
                React.createElement('span', { className: "ml-auto text-xs text-gray-500" }, `(${folderFeeds.length})`)
            ),
            isExpanded && React.createElement('ul', {
                onDragOver: (e) => onDragOver(e, { type: 'folder-content', id: folder.id }),
                onDrop: (e) => onDrop(e, { type: 'folder-content', id: folder.id }),
                className: "min-h-4"
            },
                folderFeeds.map(feed => renderFeed(feed, folder.id)),
                folderFeeds.length === 0 && dragOverItem?.type === 'folder-content' && dragOverItem?.id === folder.id && 
                    React.createElement('li', { className: "p-2 ml-4 text-gray-500 border-2 border-blue-400 border-dashed rounded-md" },
                        "Drop feed here"
                    )
            )
        );
    };

    return React.createElement('div', { className: "bg-gray-800 h-full flex flex-col p-4" },
        React.createElement('div', { className: "flex justify-between items-center mb-4" },
            React.createElement('h2', { className: "text-xl font-bold" }, "Feeds"),
            React.createElement('div', { className: "flex space-x-2" },
                React.createElement('button', { 
                    onClick: onToggleSearch, 
                    className: "text-gray-400 hover:text-white transition-colors",
                    title: "Search Articles"
                },
                    React.createElement('svg', { 
                        className: "w-5 h-5",
                        fill: "none",
                        stroke: "currentColor",
                        viewBox: "0 0 24 24"
                    },
                        React.createElement('path', {
                            strokeLinecap: "round",
                            strokeLinejoin: "round",
                            strokeWidth: 2,
                            d: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        })
                    )
                ),
                React.createElement('button', { 
                    onClick: onShowExport, 
                    className: "text-gray-400 hover:text-white transition-colors",
                    title: "Export Articles"
                },
                    React.createElement('i', { className: "fas fa-download" })
                ),
                React.createElement('button', { 
                    onClick: onShowSettings, 
                    className: "text-gray-400 hover:text-white transition-colors",
                    title: "Settings"
                },
                    React.createElement('i', { className: "fas fa-cog" })
                )
            )
        ),
        React.createElement('div', { className: "flex-grow overflow-y-auto" },
            folders.length > 0 || feeds.length > 0 ? 
                React.createElement('div', null,
                    folders.map(renderFolder),
                    feedsByFolder.uncategorized && feedsByFolder.uncategorized.length > 0 && 
                        React.createElement('div', { className: "mt-4 pt-4 border-t border-gray-700" },
                            React.createElement('div', { className: "text-sm text-gray-400 mb-2 px-2" }, "Uncategorized"),
                            React.createElement('ul', {
                                onDragOver: (e) => onDragOver(e, { type: 'uncategorized' }),
                                onDrop: (e) => onDrop(e, { type: 'uncategorized' }),
                                className: "min-h-4"
                            },
                                feedsByFolder.uncategorized.map(feed => renderFeed(feed, null))
                            )
                        ),
                    (!feedsByFolder.uncategorized || feedsByFolder.uncategorized.length === 0) && dragOverItem?.type === 'uncategorized' && 
                        React.createElement('div', { className: "mt-4 pt-4 border-t border-gray-700" },
                            React.createElement('div', { className: "text-sm text-gray-400 mb-2 px-2" }, "Uncategorized"),
                            React.createElement('ul', { className: "min-h-4" },
                                React.createElement('li', { className: "p-2 ml-4 text-gray-500 border-2 border-blue-400 border-dashed rounded-md" },
                                    "Drop feed here to remove from folder"
                                )
                            )
                        )
                ) : 
                React.createElement('div', { className: "text-center text-gray-500 mt-10" },
                    "Click the ",
                    React.createElement('i', { className: "fas fa-cog mx-1" }),
                    " to add a feed."
                )
        )
    );
}

window.FeedsPanel = FeedsPanel;