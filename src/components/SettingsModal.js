// SettingsModal.js
function SettingsModal({ feeds, folders, isVisible, onClose, onAddFeed, onDeleteFeed, onUpdateFeedName, onCreateFolder, onDeleteFolder, onMoveFeedToFolder }) {
    if (!isVisible) return null;
    
    const { useState } = React;
    const [url, setUrl] = useState('');
    const [error, setError] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [editingFeedId, setEditingFeedId] = useState(null);
    const [editingName, setEditingName] = useState('');
    const [newFolderName, setNewFolderName] = useState('');
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);

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

    const handleEdit = (feed) => {
        setEditingFeedId(feed.id);
        setEditingName(feed.name);
    };

    const handleCancelEdit = () => {
        setEditingFeedId(null);
        setEditingName('');
    };

    const handleSaveEdit = async (feedId) => {
        await onUpdateFeedName(feedId, editingName);
        handleCancelEdit();
    };

    const handleCreateFolder = async (e) => {
        e.preventDefault();
        if (!newFolderName.trim()) return;
        setIsCreatingFolder(true);
        try {
            await onCreateFolder(newFolderName.trim());
            setNewFolderName('');
        } catch (err) {
            console.error('Failed to create folder:', err);
        } finally {
            setIsCreatingFolder(false);
        }
    };

    const handleMoveFeedToFolder = async (feedId, folderId) => {
        try {
            await onMoveFeedToFolder(feedId, folderId);
        } catch (err) {
            console.error('Failed to move feed:', err);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-2xl p-8 w-full max-w-2xl text-white">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">Manage Feeds</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-2xl">&times;</button>
                </div>
                <div className="mb-8">
                    <h3 className="text-xl font-semibold mb-3">Add New RSS Feed</h3>
                    <form className="flex space-x-2" onSubmit={handleAddSubmit}>
                        <input 
                            type="text" 
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="e.g., https://www.theverge.com/rss/index.xml" 
                            className="flex-grow p-2 rounded-md bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        />
                        <button type="submit" disabled={isAdding} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed">
                            {isAdding ? <i className="fas fa-spinner fa-spin"></i> : 'Add'}
                        </button>
                    </form>
                    {error && <p className="text-red-400 mt-2">{error}</p>}
                </div>
                <div className="mb-8">
                    <h3 className="text-xl font-semibold mb-3">Create Folder</h3>
                    <form className="flex space-x-2" onSubmit={handleCreateFolder}>
                        <input 
                            type="text" 
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            placeholder="Folder name" 
                            className="flex-grow p-2 rounded-md bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        />
                        <button type="submit" disabled={isCreatingFolder} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed">
                            {isCreatingFolder ? <i className="fas fa-spinner fa-spin"></i> : 'Create'}
                        </button>
                    </form>
                </div>
                <div className="mb-8">
                    <h3 className="text-xl font-semibold mb-3">Folders</h3>
                    <ul className="space-y-2 max-h-40 overflow-y-auto pr-2">
                        {folders.map(folder => (
                            <li key={folder.id} className="bg-gray-700 p-3 rounded-md flex justify-between items-center">
                                <div className="flex items-center">
                                    <i className="fas fa-folder text-yellow-500 mr-2"></i>
                                    <span className="truncate">{folder.name}</span>
                                </div>
                                <button onClick={() => onDeleteFolder(folder.id)} className="text-red-500 hover:text-red-400">
                                    <i className="fas fa-trash-alt"></i>
                                </button>
                            </li>
                        ))}
                        {folders.length === 0 && (
                            <div className="text-center text-gray-500 py-4">No folders created yet.</div>
                        )}
                    </ul>
                </div>
                <div>
                    <h3 className="text-xl font-semibold mb-3">Current Feeds</h3>
                    <ul className="space-y-2 max-h-60 overflow-y-auto pr-2">
                        {feeds.map(feed => (
                            <li key={feed.id} className="bg-gray-700 p-3 rounded-md">
                                <div className="flex justify-between items-center mb-2">
                                    {editingFeedId === feed.id ? (
                                        <input 
                                            type="text"
                                            value={editingName}
                                            onChange={(e) => setEditingName(e.target.value)}
                                            className="flex-grow p-1 rounded-md bg-gray-600 border border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    ) : (
                                        <span className="truncate">{feed.name}</span>
                                    )}
                                    <div className="flex items-center space-x-2">
                                        {editingFeedId === feed.id ? (
                                            <>
                                                <button onClick={() => handleSaveEdit(feed.id)} className="text-green-500 hover:text-green-400"><i className="fas fa-check"></i></button>
                                                <button onClick={handleCancelEdit} className="text-gray-500 hover:text-gray-400"><i className="fas fa-times"></i></button>
                                            </>
                                        ) : (
                                            <button onClick={() => handleEdit(feed)} className="text-gray-400 hover:text-white"><i className="fas fa-pencil-alt"></i></button>
                                        )}
                                        <button onClick={() => onDeleteFeed(feed.id)} className="text-red-500 hover:text-red-400"><i className="fas fa-trash-alt"></i></button>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <span className="text-sm text-gray-400">Folder:</span>
                                    <select 
                                        value={feed.folderId || ''}
                                        onChange={(e) => handleMoveFeedToFolder(feed.id, e.target.value || null)}
                                        className="bg-gray-600 border border-gray-500 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">No folder</option>
                                        {folders.map(folder => (
                                            <option key={folder.id} value={folder.id}>{folder.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}

window.SettingsModal = SettingsModal;