// main.js

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./database.js');
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
    db.close();
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
            const stmt = db.prepare("INSERT OR IGNORE INTO articles (feedId, title, link, pubDate, content, status) VALUES (?, ?, ?, ?, ?, 'new')");
            
            let newArticles = [];
            for (const item of parsedFeed.items) {
                const wasInserted = await new Promise((resolve, reject) => {
                    stmt.run(feed.id, item.title, item.link, item.isoDate || new Date().toISOString(), item.contentSnippet || item.content || '', function(err) {
                        if (err) return reject(err);
                        resolve(this.changes > 0);
                    });
                });
                if (wasInserted) newArticles.push(item.title);
            }

            await new Promise(resolve => stmt.finalize(resolve));

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
        articlesToSummarize = await new Promise((resolve, reject) => {
            db.all("SELECT * FROM articles WHERE status = 'new' LIMIT 5", [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });

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
    return new Promise((resolve, reject) => {
        const query = summary 
            ? "UPDATE articles SET status = ?, summary = ? WHERE id = ?"
            : "UPDATE articles SET status = ? WHERE id = ?";
        const params = summary ? [status, summary, articleId] : [status, articleId];

        db.run(query, params, (err) => {
            if (err) return reject(err);
            if (mainWindow) mainWindow.webContents.send('article-status-updated', { articleId, status, summary });
            resolve();
        });
    });
}

// --- IPC Handlers ---

ipcMain.handle('get-feeds', async () => {
    return new Promise((resolve, reject) => {
        db.all("SELECT *, COALESCE(displayName, name) as name FROM feeds ORDER BY name", [], (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });
});

ipcMain.handle('get-folders', async () => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM folders ORDER BY name", [], (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });
});

ipcMain.handle('create-folder', async (event, folderName) => {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare("INSERT INTO folders (name) VALUES (?)");
        stmt.run(folderName, function (err) {
            if (err) return reject(new Error("Failed to create folder."));
            resolve({ id: this.lastID, name: folderName });
        });
        stmt.finalize();
    });
});

ipcMain.handle('delete-folder', async (event, folderId) => {
    return new Promise((resolve, reject) => {
        // First move all feeds out of this folder
        db.run("UPDATE feeds SET folderId = NULL WHERE folderId = ?", [folderId], (err) => {
            if (err) return reject(err);
            // Then delete the folder
            db.run("DELETE FROM folders WHERE id = ?", [folderId], (err) => {
                if (err) return reject(err);
                resolve({ success: true, id: folderId });
            });
        });
    });
});

ipcMain.handle('rename-folder', async (event, { folderId, newName }) => {
    return new Promise((resolve, reject) => {
        db.run("UPDATE folders SET name = ? WHERE id = ?", [newName, folderId], (err) => {
            if (err) reject(err);
            resolve({ success: true });
        });
    });
});

ipcMain.handle('move-feed-to-folder', async (event, { feedId, folderId }) => {
    return new Promise((resolve, reject) => {
        db.run("UPDATE feeds SET folderId = ? WHERE id = ?", [folderId, feedId], (err) => {
            if (err) reject(err);
            resolve({ success: true });
        });
    });
});

ipcMain.handle('add-feed', async (event, feedUrl) => {
    try {
        const feed = await parser.parseURL(feedUrl);
        const feedName = feed.title;
        const newFeedId = await new Promise((resolve, reject) => {
            const stmt = db.prepare("INSERT INTO feeds (name, url) VALUES (?, ?)");
            stmt.run(feedName, feedUrl, function (err) {
                if (err) return reject(new Error("Failed to add feed. It may already exist."));
                resolve(this.lastID);
            });
            stmt.finalize();
        });
        const newFeed = { id: newFeedId, name: feedName, url: feedUrl };
        runAgentCycle();
        return newFeed;
    } catch (error) {
        throw new Error("Invalid or unreachable RSS feed URL.");
    }
});

ipcMain.handle('delete-feed', async (event, feedId) => {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM feeds WHERE id = ?", [feedId], (err) => {
            if (err) reject(err);
            resolve({ success: true, id: feedId });
        });
    });
});

ipcMain.handle('update-feed-display-name', async (event, { feedId, displayName }) => {
    return new Promise((resolve, reject) => {
        db.run("UPDATE feeds SET displayName = ? WHERE id = ?", [displayName, feedId], (err) => {
            if (err) reject(err);
            resolve({ success: true });
        });
    });
});

ipcMain.handle('get-articles', async (event, feedId) => {
    return new Promise((resolve, reject) => {
        const sql = "SELECT id, feedId, title, link, pubDate, isRead, summary, status FROM articles WHERE feedId = ? ORDER BY pubDate DESC";
        db.all(sql, [feedId], (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });
});

ipcMain.handle('mark-article-as-read', async (event, articleId) => {
    return new Promise((resolve, reject) => {
        db.run("UPDATE articles SET isRead = 1 WHERE id = ?", [articleId], (err) => {
            if (err) reject(err);
            resolve({ success: true });
        });
    });
});

ipcMain.handle('retry-summarization', async (event, articleId) => {
    await updateArticleStatus(articleId, 'new');
    runSummarizerAgent();
    return { success: true };
});