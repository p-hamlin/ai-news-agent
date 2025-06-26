// main.js

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./database.js');
const { DatabaseService } = require('./src/services/database/index.js');
const dbService = DatabaseService(db);
const Parser = require('rss-parser');
const parser = new Parser();
const { generateSummary } = require('./aiService.js');

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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  startAgents();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    dbService.close();
    app.quit();
  }
});

// --- Agent System ---

const AGENT_CYCLE_INTERVAL = 5 * 60 * 1000; // 5 minutes

async function runFetcherAgent() {
    console.log('[Fetcher Agent] Running...');
    const feeds = await new Promise((resolve, reject) => {
        db.all("SELECT * FROM feeds", [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });

    for (const feed of feeds) {
        try {
            const parsedFeed = await parser.parseURL(feed.url);
            const newArticles = await dbService.articles.insertNew(feed.id, parsedFeed.items);

            if (newArticles.length > 0) {
                console.log(`[Fetcher Agent] Found ${newArticles.length} new articles for ${feed.name}`);
                if (mainWindow) mainWindow.webContents.send('articles-updated', { feedId: feed.id });
            }

        } catch (error) {
            console.error(`[Fetcher Agent] Error fetching feed ${feed.url}:`, error.message);
        }
    }
    console.log('[Fetcher Agent] Finished.');
}

async function runSummarizerAgent() {
    console.log('[Summarizer Agent] Running...');
    let articlesToSummarize;

    do {
        articlesToSummarize = await dbService.articles.getToSummarize(5);

        if (articlesToSummarize.length > 0) {
            console.log(`[Summarizer Agent] Found a batch of ${articlesToSummarize.length} articles to summarize.`);
        }

        for (const article of articlesToSummarize) {
            try {
                await updateArticleStatus(article.id, 'summarizing');
                const summary = await generateSummary(article.content);
                await updateArticleStatus(article.id, 'summarized', summary);
                console.log(`[Summarizer Agent] Successfully summarized article ${article.id}`);
            } catch (error) {
                console.error(`[Summarizer Agent] Error summarizing article ${article.id}:`, error.message);
                await updateArticleStatus(article.id, 'failed');
            }
        }
    } while (articlesToSummarize.length > 0);

    console.log('[Summarizer Agent] Finished.');
}

async function runAgentCycle() {
    console.log('[Agent Cycle] Starting... ');
    await runFetcherAgent();
    await runSummarizerAgent();
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