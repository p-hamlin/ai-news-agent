// SettingsModal.js
function SettingsModal({ feeds, folders, isVisible, onClose, onAddFeed, onDeleteFeed, onUpdateFeedName, onCreateFolder, onDeleteFolder, onMoveFeedToFolder }) {
    if (!isVisible) return null;
    
    const { useState } = React;
    const [url, setUrl] = useState('');
    const [error, setError] = useState('');
    const [isAdding, setIsAdding] = useState(false);

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

    return React.createElement('div', { 
        className: "fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50" 
    },
        React.createElement('div', { 
            className: "bg-gray-800 rounded-lg shadow-2xl p-8 w-full max-w-2xl text-white" 
        },
            React.createElement('div', { className: "flex justify-between items-center mb-6" },
                React.createElement('h2', { className: "text-2xl font-bold" }, "Manage Feeds"),
                React.createElement('button', { 
                    onClick: onClose, 
                    className: "text-gray-400 hover:text-white transition-colors text-2xl" 
                }, "×")
            ),
            React.createElement('div', { className: "mb-8" },
                React.createElement('h3', { className: "text-xl font-semibold mb-3" }, "Add New RSS Feed"),
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
                ),
                error && React.createElement('p', { className: "text-red-400 mt-2" }, error)
            ),
            React.createElement('div', { className: "mb-8" },
                React.createElement('h3', { className: "text-xl font-semibold mb-3" }, "Current Feeds"),
                React.createElement('ul', { className: "space-y-2 max-h-60 overflow-y-auto pr-2" },
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
}

window.SettingsModal = SettingsModal;