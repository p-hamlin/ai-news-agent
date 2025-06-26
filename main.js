// main.js

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { DatabaseService } = require('./src/services/database/index.js');
const dbService = DatabaseService();
const Parser = require('rss-parser');
const parser = new Parser();
const { FeedProcessor } = require('./src/services/feedProcessor.js');
const { AIWorkerPool } = require('./src/services/aiWorkerPool.js');
const { archiveManager } = require('./src/services/archiveManager.js');
const { ExportService } = require('./src/services/exportService.js');
const { DuplicateDetector } = require('./src/services/duplicateDetector.js');
const { OpmlService } = require('./src/services/opmlService.js');
const { FeedRecommendationService } = require('./src/services/feedRecommendationService.js');
const { settingsManager } = require('./src/services/settingsManager.js');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'public/index.html'));
  mainWindow.webContents.openDevTools();
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  // Initialize optimized database connection
  await dbService.initialize();
  console.log('Database optimizations enabled and ready.');
  
  // Initialize AI worker pool
  await aiWorkerPool.initialize();
  console.log('AI worker pool initialized and ready.');
  
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  startAgents();
});

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    await aiWorkerPool.shutdown();
    await dbService.close();
    app.quit();
  }
});

// --- Agent System ---

const AGENT_CYCLE_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Initialize concurrent feed processor with configuration
const feedProcessor = new FeedProcessor({
    concurrencyLimit: 5,
    requestTimeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
    dbService: dbService
});

// Initialize export service
const exportService = new ExportService(dbService);

// Initialize duplicate detector
const duplicateDetector = new DuplicateDetector(dbService);

// Initialize OPML service
const opmlService = new OpmlService(dbService);

// Initialize feed recommendation service
const feedRecommendationService = new FeedRecommendationService(dbService);

// Initialize AI worker pool with multiple Ollama instance support
const aiWorkerPool = new AIWorkerPool({
    poolSize: 2,
    maxQueueSize: 50,
    workerTimeout: 60000,
    aiConfig: {
        instances: [
            { url: 'http://localhost:11434', model: 'phi3:mini', weight: 1 },
            // Additional instances can be configured here:
            // { url: 'http://localhost:11435', model: 'phi3:mini', weight: 1 },
            // { url: 'http://localhost:11436', model: 'llama2:7b', weight: 0.8 },
        ],
        requestTimeout: 60000,
        retryAttempts: 2,
        healthCheckInterval: 5 * 60 * 1000
    }
});

async function runFetcherAgent() {
    console.log('[Fetcher Agent] Running with concurrent processing...');
    const feeds = await dbService.feeds.getAll();
    
    if (feeds.length === 0) {
        console.log('[Fetcher Agent] No feeds configured.');
        return;
    }

    const startTime = Date.now();
    let totalNewArticles = 0;
    let successfulFeeds = 0;
    let failedFeeds = 0;

    // Process feeds concurrently
    const results = await feedProcessor.processFeeds(feeds, async (feed, result) => {
        if (result.success && !result.skipped) {
            try {
                if (result.notModified) {
                    console.log(`[Fetcher Agent] Feed ${feed.name} not modified (304)`);
                    successfulFeeds++;
                    return;
                }

                // Use optimized insertion method with diff
                const newArticles = await dbService.articles.insertNewOptimized(feed.id, result.articles);
                totalNewArticles += newArticles.length;
                successfulFeeds++;

                if (newArticles.length > 0) {
                    console.log(`[Fetcher Agent] Found ${newArticles.length} new articles for ${feed.name} (${result.wasConditional ? 'conditional' : 'full'} fetch)`);
                    if (mainWindow) mainWindow.webContents.send('articles-updated', { feedId: feed.id });
                } else {
                    console.log(`[Fetcher Agent] No new articles for ${feed.name} (${result.articles.length} total articles)`);
                }
            } catch (dbError) {
                console.error(`[Fetcher Agent] Database error for feed ${feed.name}:`, dbError.message);
                failedFeeds++;
            }
        } else if (result.skipped) {
            console.log(`[Fetcher Agent] Skipped feed ${feed.name}: ${result.reason}`);
        } else {
            console.error(`[Fetcher Agent] Failed to fetch feed ${feed.name}: ${result.error}`);
            failedFeeds++;
        }
    });

    const processingTime = Date.now() - startTime;
    const stats = feedProcessor.getStatistics();
    
    console.log(`[Fetcher Agent] Finished in ${processingTime}ms. ` +
                `${successfulFeeds} successful, ${failedFeeds} failed. ` +
                `Total new articles: ${totalNewArticles}. ` +
                `Feeds in backoff: ${stats.feedsInBackoff}`);
}

async function runSummarizerAgent() {
    console.log('[Summarizer Agent] Running with worker pool...');
    let articlesToSummarize;
    const startTime = Date.now();
    let totalProcessed = 0;
    let successCount = 0;
    let errorCount = 0;

    do {
        articlesToSummarize = await dbService.articles.getToSummarize(100); // Process up to 100 articles at once

        if (articlesToSummarize.length > 0) {
            console.log(`[Summarizer Agent] Found a batch of ${articlesToSummarize.length} articles to summarize.`);
        }

        // Process articles concurrently using worker pool
        const processingPromises = articlesToSummarize.map(async (article) => {
            try {
                await updateArticleStatus(article.id, 'summarizing');
                
                const result = await aiWorkerPool.summarizeArticle({
                    articleId: article.id,
                    content: article.content,
                    title: article.title,
                    url: article.link
                });
                
                await updateArticleStatus(article.id, 'summarized', result.summary);
                console.log(`[Summarizer Agent] Successfully summarized article ${article.id} in ${result.processingTime}ms`);
                successCount++;
                
                return { success: true, articleId: article.id, processingTime: result.processingTime };
                
            } catch (error) {
                console.error(`[Summarizer Agent] Error summarizing article ${article.id}:`, error.message);
                await updateArticleStatus(article.id, 'failed');
                errorCount++;
                
                return { success: false, articleId: article.id, error: error.message };
            }
        });

        // Wait for all articles in current batch to complete
        const results = await Promise.allSettled(processingPromises);
        totalProcessed += articlesToSummarize.length;
        
        // Log batch completion
        const batchSuccessful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
        const batchErrors = results.length - batchSuccessful;
        console.log(`[Summarizer Agent] Batch completed: ${batchSuccessful} successful, ${batchErrors} errors`);
        
    } while (articlesToSummarize.length > 0);

    const totalTime = Date.now() - startTime;
    const poolStats = aiWorkerPool.getStatistics();
    
    console.log(`[Summarizer Agent] Finished in ${totalTime}ms. ` +
                `Processed: ${totalProcessed}, Success: ${successCount}, Errors: ${errorCount}. ` +
                `Pool stats: ${poolStats.busyWorkers}/${poolStats.activeWorkers} workers busy, ` +
                `${poolStats.queueSize} queued, avg processing: ${Math.round(poolStats.averageProcessingTime)}ms`);
}

async function runAgentCycle() {
    console.log('[Agent Cycle] Starting... ');
    await runFetcherAgent();
    await runSummarizerAgent();
    
    // Run archive maintenance periodically (every 6th cycle = ~30 minutes)
    if (!runAgentCycle.archiveCounter) runAgentCycle.archiveCounter = 0;
    runAgentCycle.archiveCounter++;
    
    if (runAgentCycle.archiveCounter >= 6) {
        console.log('[Agent Cycle] Running archive maintenance...');
        try {
            const archiveResult = await archiveManager.runScheduledMaintenance();
            if (archiveResult.archive && archiveResult.archive.archivedCount > 0) {
                console.log(`[Agent Cycle] Archived ${archiveResult.archive.archivedCount} articles`);
                if (mainWindow) mainWindow.webContents.send('archive-maintenance-completed', archiveResult);
            }
        } catch (error) {
            console.error('[Agent Cycle] Archive maintenance failed:', error);
        }
        runAgentCycle.archiveCounter = 0;
    }
    
    console.log('[Agent Cycle] Finished.');
}

function startAgents() {
    setTimeout(runAgentCycle, 2000);
    setInterval(runAgentCycle, AGENT_CYCLE_INTERVAL);
}

async function updateArticleStatus(articleId, status, summary = null) {
    await dbService.articles.updateStatus(articleId, status, summary);
    if (mainWindow) mainWindow.webContents.send('article-status-updated', { articleId, status, summary });
}

// --- IPC Handlers ---

ipcMain.handle('get-feeds', async () => {
    return await dbService.feeds.getAll();
});

ipcMain.handle('get-folders', async () => {
    return await dbService.folders.getAll();
});

ipcMain.handle('create-folder', async (event, folderName) => {
    return await dbService.folders.create(folderName);
});

ipcMain.handle('delete-folder', async (event, folderId) => {
    return await dbService.folders.delete(folderId);
});

ipcMain.handle('rename-folder', async (event, { folderId, newName }) => {
    return await dbService.folders.rename(folderId, newName);
});

ipcMain.handle('move-feed-to-folder', async (event, { feedId, folderId }) => {
    return await dbService.feeds.moveToFolder(feedId, folderId);
});

ipcMain.handle('reorder-feeds', async (event, { feedId, newIndex, targetFolderId }) => {
    return await dbService.feeds.reorder(feedId, newIndex, targetFolderId);
});

ipcMain.handle('reorder-folders', async (event, { folderId, newIndex }) => {
    return await dbService.folders.reorder(folderId, newIndex);
});

ipcMain.handle('add-feed', async (event, feedUrl) => {
    try {
        const feed = await parser.parseURL(feedUrl);
        const feedName = feed.title;
        const newFeedId = await dbService.feeds.add(feedName, feedUrl);
        const newFeed = { id: newFeedId, name: feedName, url: feedUrl, orderIndex: 0 };
        runAgentCycle();
        return newFeed;
    } catch (error) {
        throw new Error("Invalid or unreachable RSS feed URL.");
    }
});

ipcMain.handle('delete-feed', async (event, feedId) => {
    return await dbService.feeds.delete(feedId);
});

ipcMain.handle('update-feed-display-name', async (event, { feedId, displayName }) => {
    return await dbService.feeds.updateDisplayName(feedId, displayName);
});

ipcMain.handle('get-articles', async (event, feedId) => {
    return await dbService.articles.getByFeedId(feedId);
});

ipcMain.handle('mark-article-as-read', async (event, articleId) => {
    return await dbService.articles.markAsRead(articleId);
});

ipcMain.handle('retry-summarization', async (event, articleId) => {
    await dbService.articles.updateStatus(articleId, 'new');
    runSummarizerAgent();
    return { success: true };
});

ipcMain.handle('get-feed-statistics', async () => {
    return feedProcessor.getStatistics();
});

ipcMain.handle('clear-feed-failure-tracking', async (event, { feedId, feedUrl }) => {
    feedProcessor.clearFailureTracking(feedId, feedUrl);
    return { success: true };
});

ipcMain.handle('search-articles', async (event, { query, options = {} }) => {
    try {
        return await dbService.articles.search(query, options);
    } catch (error) {
        console.error('Search error:', error.message);
        return [];
    }
});

ipcMain.handle('search-articles-with-filters', async (event, { query, filters = {} }) => {
    try {
        return await dbService.articles.searchWithFilters(query, filters);
    } catch (error) {
        console.error('Advanced search error:', error.message);
        return [];
    }
});

ipcMain.handle('get-search-suggestions', async (event, { partialQuery, limit = 10 }) => {
    try {
        return await dbService.articles.getSearchSuggestions(partialQuery, limit);
    } catch (error) {
        console.error('Search suggestions error:', error.message);
        return [];
    }
});

ipcMain.handle('force-feed-refresh', async () => {
    console.log('[Manual Refresh] Starting forced feed refresh...');
    await runFetcherAgent();
    return { success: true };
});

ipcMain.handle('get-ai-worker-stats', async () => {
    return aiWorkerPool.getStatistics();
});

ipcMain.handle('ai-worker-health-check', async () => {
    return await aiWorkerPool.healthCheck();
});

ipcMain.handle('force-summarization', async () => {
    console.log('[Manual Summarization] Starting forced summarization...');
    await runSummarizerAgent();
    return { success: true };
});

ipcMain.handle('get-ai-load-balancer-stats', async () => {
    // Get stats from first worker (they all share the same config)
    if (aiWorkerPool.workers.length > 0) {
        return new Promise((resolve) => {
            const worker = aiWorkerPool.workers[0];
            const requestId = `stats-${Date.now()}`;
            
            worker.once('message', (message) => {
                if (message.id === requestId) {
                    resolve(message.result || { error: 'No stats available' });
                }
            });
            
            worker.postMessage({
                id: requestId,
                type: 'GET_LOAD_BALANCER_STATS',
                data: {}
            });
            
            setTimeout(() => {
                resolve({ error: 'Timeout getting load balancer stats' });
            }, 5000);
        });
    } else {
        return { error: 'No AI workers available' };
    }
});

ipcMain.handle('configure-ai-instances', async (event, { instances }) => {
    // This would require restarting workers with new configuration
    console.log('[AI Config] Configuring AI instances:', instances);
    return { success: true, message: 'AI instance configuration updated (restart required)' };
});

// --- Archive Management IPC Handlers ---

ipcMain.handle('archive-run-auto', async () => {
    console.log('[Archive] Running automatic archiving...');
    return await archiveManager.runAutoArchive();
});

ipcMain.handle('archive-articles', async (event, { articleIds, reason = 'manual' }) => {
    console.log(`[Archive] Archiving ${articleIds.length} articles manually...`);
    return await archiveManager.archiveArticles(articleIds, reason);
});

ipcMain.handle('archive-by-feed', async (event, { feedId, retentionDays = null }) => {
    console.log(`[Archive] Archiving articles for feed ${feedId}...`);
    return await archiveManager.archiveByFeed(feedId, retentionDays);
});

ipcMain.handle('archive-cleanup-old', async () => {
    console.log('[Archive] Cleaning up old archives...');
    return await archiveManager.cleanupOldArchives();
});

ipcMain.handle('archive-restore', async (event, { archivedArticleId }) => {
    console.log(`[Archive] Restoring archived article ${archivedArticleId}...`);
    return await archiveManager.restoreArticle(archivedArticleId);
});

ipcMain.handle('archive-get-statistics', async () => {
    return await archiveManager.getArchiveStatistics();
});

ipcMain.handle('archive-get-articles', async (event, { limit = 50, offset = 0, feedId = null }) => {
    return await archiveManager.getArchivedArticles({ limit, offset, feedId });
});

ipcMain.handle('archive-search', async (event, { query, limit = 50, offset = 0 }) => {
    return await archiveManager.searchArchives(query, { limit, offset });
});

ipcMain.handle('archive-estimate-impact', async (event, { retentionDays = null }) => {
    return await archiveManager.estimateArchiveImpact(retentionDays);
});

ipcMain.handle('archive-get-config', async () => {
    return archiveManager.getConfig();
});

ipcMain.handle('archive-update-config', async (event, { config }) => {
    archiveManager.updateConfig(config);
    return { success: true, config: archiveManager.getConfig() };
});

ipcMain.handle('archive-get-status', async () => {
    return archiveManager.getStatus();
});

ipcMain.handle('archive-run-maintenance', async () => {
    console.log('[Archive] Running scheduled maintenance...');
    return await archiveManager.runScheduledMaintenance();
});

// --- Export IPC Handlers ---

ipcMain.handle('export-articles', async (event, options = {}) => {
    console.log(`[Export] Exporting articles in ${options.format || 'markdown'} format...`);
    return await exportService.exportArticles(options);
});

ipcMain.handle('export-get-formats', async () => {
    return exportService.getAvailableFormats();
});

ipcMain.handle('export-estimate-size', async (event, options = {}) => {
    // Get articles without actually exporting to estimate size
    try {
        await dbService.initialize();
        const articles = await exportService.getArticlesForExport({
            articleIds: options.articleIds,
            feedIds: options.feedIds,
            includeArchived: options.includeArchived,
            dateRange: options.dateRange
        });
        
        const estimatedSize = articles.reduce((total, article) => {
            return total + (article.title?.length || 0) + (article.content?.length || 0) + (article.summary?.length || 0);
        }, 0);
        
        return {
            articleCount: articles.length,
            estimatedSizeBytes: estimatedSize,
            estimatedSizeMB: Math.round(estimatedSize / 1024 / 1024 * 100) / 100
        };
    } catch (error) {
        return { error: error.message };
    }
});

// --- Duplicate Detection IPC Handlers ---

ipcMain.handle('duplicates-find', async (event, options = {}) => {
    console.log('[Duplicates] Scanning for duplicate articles...');
    return await duplicateDetector.findDuplicates(options);
});

ipcMain.handle('duplicates-merge', async (event, { groupId, keepArticleId, deleteArticleIds, mergeOptions = {} }) => {
    console.log(`[Duplicates] Merging duplicate group ${groupId}...`);
    return await duplicateDetector.mergeDuplicates(groupId, keepArticleId, deleteArticleIds, mergeOptions);
});

ipcMain.handle('duplicates-auto-merge', async (event, options = {}) => {
    console.log('[Duplicates] Running auto-merge for obvious duplicates...');
    return await duplicateDetector.autoMergeDuplicates(options);
});

ipcMain.handle('duplicates-get-statistics', async () => {
    return await duplicateDetector.getStatistics();
});

// --- Content Cleanup IPC Handlers ---

ipcMain.handle('cleanup-failed-articles', async (event, { ageDays = 7 } = {}) => {
    console.log(`[Cleanup] Cleaning up failed articles older than ${ageDays} days...`);
    return await dbService.archive.cleanupFailedArticles(ageDays);
});

ipcMain.handle('cleanup-empty-content', async (event, { dryRun = false } = {}) => {
    console.log(`[Cleanup] ${dryRun ? 'Analyzing' : 'Cleaning up'} articles with empty content...`);
    return await dbService.archive.cleanupEmptyContent(dryRun);
});

ipcMain.handle('cleanup-duplicate-archives', async (event, { dryRun = false } = {}) => {
    console.log(`[Cleanup] ${dryRun ? 'Analyzing' : 'Cleaning up'} duplicate archived articles...`);
    return await dbService.archive.cleanupDuplicateArchives(dryRun);
});

ipcMain.handle('cleanup-orphaned-metadata', async () => {
    console.log('[Cleanup] Cleaning up orphaned feed metadata...');
    return await dbService.archive.cleanupOrphanedMetadata();
});

ipcMain.handle('cleanup-optimize-database', async () => {
    console.log('[Cleanup] Optimizing database (VACUUM, ANALYZE, REINDEX)...');
    return await dbService.archive.optimizeDatabase();
});

ipcMain.handle('cleanup-comprehensive', async (event, options = {}) => {
    console.log('[Cleanup] Running comprehensive cleanup...');
    return await dbService.archive.runComprehensiveCleanup(options);
});

ipcMain.handle('cleanup-get-database-size', async () => {
    return await dbService.archive.getDatabaseSize();
});

// --- OPML Import/Export IPC Handlers ---

ipcMain.handle('opml-export', async (event, options = {}) => {
    console.log('[OPML] Exporting feeds to OPML format...');
    return await opmlService.exportToOpml(options);
});

ipcMain.handle('opml-import', async (event, { opmlContent, options = {} }) => {
    console.log('[OPML] Importing feeds from OPML content...');
    return await opmlService.importFromOpml(opmlContent, options);
});

ipcMain.handle('opml-import-file', async (event, { filePath, options = {} }) => {
    console.log(`[OPML] Importing feeds from OPML file: ${filePath}`);
    try {
        const fs = require('fs').promises;
        const opmlContent = await fs.readFile(filePath, 'utf8');
        return await opmlService.importFromOpml(opmlContent, options);
    } catch (error) {
        return { success: false, error: `Failed to read OPML file: ${error.message}` };
    }
});

ipcMain.handle('opml-get-statistics', async () => {
    return await opmlService.getOpmlStatistics();
});

ipcMain.handle('opml-validate-content', async (event, { opmlContent }) => {
    console.log('[OPML] Validating OPML content...');
    try {
        const { feeds, folders } = await opmlService.parseOpmlContent(opmlContent);
        return {
            success: true,
            feedCount: feeds.length,
            folderCount: folders.length,
            feeds: feeds.slice(0, 10), // Preview first 10 feeds
            folders: folders.slice(0, 10) // Preview first 10 folders
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// --- Feed Recommendation IPC Handlers ---

ipcMain.handle('recommendations-get', async (event, options = {}) => {
    console.log('[Recommendations] Getting feed recommendations...');
    return await feedRecommendationService.getRecommendations(options);
});

ipcMain.handle('recommendations-get-statistics', async () => {
    return await feedRecommendationService.getRecommendationStatistics();
});

ipcMain.handle('recommendations-get-categories', async () => {
    return feedRecommendationService.getAvailableCategories();
});

ipcMain.handle('recommendations-get-by-category', async (event, { category }) => {
    return feedRecommendationService.getFeedsByCategory(category);
});

ipcMain.handle('recommendations-update-threshold', async (event, { threshold }) => {
    feedRecommendationService.updateSimilarityThreshold(threshold);
    return { success: true, threshold: feedRecommendationService.similarityThreshold };
});

// --- Settings Management IPC Handlers ---

ipcMain.handle('settings-load', async () => {
    console.log('[Settings] Loading application settings...');
    return await settingsManager.loadSettings();
});

ipcMain.handle('settings-save', async () => {
    console.log('[Settings] Saving application settings...');
    return await settingsManager.saveSettings();
});

ipcMain.handle('settings-get', async () => {
    return settingsManager.getSettings();
});

ipcMain.handle('settings-get-category', async (event, { category }) => {
    return settingsManager.getCategorySettings(category);
});

ipcMain.handle('settings-update', async (event, { updates }) => {
    console.log('[Settings] Updating settings:', Object.keys(updates));
    return await settingsManager.updateSettings(updates);
});

ipcMain.handle('settings-reset', async (event, { categories = null }) => {
    console.log('[Settings] Resetting settings:', categories ? categories : 'all');
    return await settingsManager.resetSettings(categories);
});

ipcMain.handle('settings-export', async (event, { filePath }) => {
    console.log(`[Settings] Exporting settings to: ${filePath}`);
    return await settingsManager.exportSettings(filePath);
});

ipcMain.handle('settings-import', async (event, { filePath, mergeMode = true }) => {
    console.log(`[Settings] Importing settings from: ${filePath}`);
    return await settingsManager.importSettings(filePath, mergeMode);
});

ipcMain.handle('settings-validate', async (event, { settings }) => {
    return settingsManager.validateSettings(settings);
});

ipcMain.handle('settings-get-schema', async () => {
    return settingsManager.getSettingsSchema();
});

ipcMain.handle('settings-get-path', async () => {
    return settingsManager.getSettingsPath();
});

ipcMain.handle('settings-file-exists', async () => {
    return await settingsManager.settingsFileExists();
});