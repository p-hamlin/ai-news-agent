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

  // Archive functions
  archiveRunAuto: () => ipcRenderer.invoke('archive-run-auto'),
  archiveArticles: (articleIds, reason) => ipcRenderer.invoke('archive-articles', { articleIds, reason }),
  archiveByFeed: (feedId, retentionDays) => ipcRenderer.invoke('archive-by-feed', { feedId, retentionDays }),
  archiveCleanupOld: () => ipcRenderer.invoke('archive-cleanup-old'),
  archiveRestore: (archivedArticleId) => ipcRenderer.invoke('archive-restore', { archivedArticleId }),
  archiveGetStatistics: () => ipcRenderer.invoke('archive-get-statistics'),
  archiveGetArticles: (limit, offset, feedId) => ipcRenderer.invoke('archive-get-articles', { limit, offset, feedId }),
  archiveSearch: (query, limit, offset) => ipcRenderer.invoke('archive-search', { query, limit, offset }),
  archiveEstimateImpact: (retentionDays) => ipcRenderer.invoke('archive-estimate-impact', { retentionDays }),
  archiveGetConfig: () => ipcRenderer.invoke('archive-get-config'),
  archiveUpdateConfig: (config) => ipcRenderer.invoke('archive-update-config', { config }),
  archiveGetStatus: () => ipcRenderer.invoke('archive-get-status'),
  archiveRunMaintenance: () => ipcRenderer.invoke('archive-run-maintenance'),

  // Export functions
  exportArticles: (options) => ipcRenderer.invoke('export-articles', options),
  exportGetFormats: () => ipcRenderer.invoke('export-get-formats'),
  exportEstimateSize: (options) => ipcRenderer.invoke('export-estimate-size', options),

  // Duplicate detection functions
  duplicatesFind: (options) => ipcRenderer.invoke('duplicates-find', options),
  duplicatesMerge: (groupId, keepArticleId, deleteArticleIds, mergeOptions) => ipcRenderer.invoke('duplicates-merge', { groupId, keepArticleId, deleteArticleIds, mergeOptions }),
  duplicatesAutoMerge: (options) => ipcRenderer.invoke('duplicates-auto-merge', options),
  duplicatesGetStatistics: () => ipcRenderer.invoke('duplicates-get-statistics'),

  // Content cleanup functions
  cleanupFailedArticles: (ageDays) => ipcRenderer.invoke('cleanup-failed-articles', { ageDays }),
  cleanupEmptyContent: (dryRun) => ipcRenderer.invoke('cleanup-empty-content', { dryRun }),
  cleanupDuplicateArchives: (dryRun) => ipcRenderer.invoke('cleanup-duplicate-archives', { dryRun }),
  cleanupOrphanedMetadata: () => ipcRenderer.invoke('cleanup-orphaned-metadata'),
  cleanupOptimizeDatabase: () => ipcRenderer.invoke('cleanup-optimize-database'),
  cleanupComprehensive: (options) => ipcRenderer.invoke('cleanup-comprehensive', options),
  cleanupGetDatabaseSize: () => ipcRenderer.invoke('cleanup-get-database-size'),

  // OPML import/export functions
  opmlExport: (options) => ipcRenderer.invoke('opml-export', options),
  opmlImport: (opmlContent, options) => ipcRenderer.invoke('opml-import', { opmlContent, options }),
  opmlImportFile: (filePath, options) => ipcRenderer.invoke('opml-import-file', { filePath, options }),
  opmlGetStatistics: () => ipcRenderer.invoke('opml-get-statistics'),
  opmlValidateContent: (opmlContent) => ipcRenderer.invoke('opml-validate-content', { opmlContent }),

  // Feed recommendation functions
  recommendationsGet: (options) => ipcRenderer.invoke('recommendations-get', options),
  recommendationsGetStatistics: () => ipcRenderer.invoke('recommendations-get-statistics'),
  recommendationsGetCategories: () => ipcRenderer.invoke('recommendations-get-categories'),
  recommendationsGetByCategory: (category) => ipcRenderer.invoke('recommendations-get-by-category', { category }),
  recommendationsUpdateThreshold: (threshold) => ipcRenderer.invoke('recommendations-update-threshold', { threshold }),

  // Settings management functions
  settingsLoad: () => ipcRenderer.invoke('settings-load'),
  settingsSave: () => ipcRenderer.invoke('settings-save'),
  settingsGet: () => ipcRenderer.invoke('settings-get'),
  settingsGetCategory: (category) => ipcRenderer.invoke('settings-get-category', { category }),
  settingsUpdate: (updates) => ipcRenderer.invoke('settings-update', { updates }),
  settingsReset: (categories) => ipcRenderer.invoke('settings-reset', { categories }),
  settingsExport: (filePath) => ipcRenderer.invoke('settings-export', { filePath }),
  settingsImport: (filePath, mergeMode) => ipcRenderer.invoke('settings-import', { filePath, mergeMode }),
  settingsValidate: (settings) => ipcRenderer.invoke('settings-validate', { settings }),
  settingsGetSchema: () => ipcRenderer.invoke('settings-get-schema'),
  settingsGetPath: () => ipcRenderer.invoke('settings-get-path'),
  settingsFileExists: () => ipcRenderer.invoke('settings-file-exists'),

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
  onArchiveMaintenanceCompleted: (callback) => {
    const listener = (event, ...args) => callback(...args);
    ipcRenderer.on('archive-maintenance-completed', listener);
    return () => ipcRenderer.removeListener('archive-maintenance-completed', listener);
  },
});