// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// --- Expose protected methods that allow the renderer process to use the ipcRenderer ---
contextBridge.exposeInMainWorld('api', {
  // Feed-related functions
  getFeeds: () => ipcRenderer.invoke('get-feeds'),
  addFeed: (url) => ipcRenderer.invoke('add-feed', url),
  deleteFeed: (id) => ipcRenderer.invoke('delete-feed', id),
  updateFeedDisplayName: (feedId, displayName) => ipcRenderer.invoke('update-feed-display-name', { feedId, displayName }),
  moveFeedToFolder: (feedId, folderId) => ipcRenderer.invoke('move-feed-to-folder', { feedId, folderId }),

  // Folder-related functions
  getFolders: () => ipcRenderer.invoke('get-folders'),
  createFolder: (name) => ipcRenderer.invoke('create-folder', name),
  deleteFolder: (id) => ipcRenderer.invoke('delete-folder', id),
  renameFolder: (folderId, newName) => ipcRenderer.invoke('rename-folder', { folderId, newName }),
  reorderFolders: (folderId, newIndex) => ipcRenderer.invoke('reorder-folders', { folderId, newIndex }),
  reorderFeeds: (feedId, newIndex, targetFolderId) => ipcRenderer.invoke('reorder-feeds', { feedId, newIndex, targetFolderId }),

  // Article-related functions
  getArticles: (feedId) => ipcRenderer.invoke('get-articles', feedId),
  markArticleAsRead: (articleId) => ipcRenderer.invoke('mark-article-as-read', articleId),
  retrySummarization: (articleId) => ipcRenderer.invoke('retry-summarization', articleId),

  // Search functions
  searchArticles: (query, options) => ipcRenderer.invoke('search-articles', { query, options }),
  searchArticlesWithFilters: (query, filters) => ipcRenderer.invoke('search-articles-with-filters', { query, filters }),
  getSearchSuggestions: (partialQuery, limit) => ipcRenderer.invoke('get-search-suggestions', { partialQuery, limit }),

  // Listener for real-time updates from the main process
  onArticlesUpdated: (callback) => {
    const listener = (event, ...args) => callback(...args);
    ipcRenderer.on('articles-updated', listener);
    return () => ipcRenderer.removeListener('articles-updated', listener);
  },
  onArticleStatusUpdated: (callback) => {
    const listener = (event, ...args) => callback(...args);
    ipcRenderer.on('article-status-updated', listener);
    return () => ipcRenderer.removeListener('article-status-updated', listener);
  },
});