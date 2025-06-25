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
        db.all("SELECT *, COALESCE(displayName, name) as name FROM feeds ORDER BY orderIndex ASC, name ASC", [], (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });
});

ipcMain.handle('get-folders', async () => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM folders ORDER BY orderIndex ASC, name ASC", [], (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });
});

ipcMain.handle('create-folder', async (event, folderName) => {
    return new Promise((resolve, reject) => {
        // Get the next order index
        db.get("SELECT MAX(orderIndex) as maxOrder FROM folders", [], (err, row) => {
            if (err) return reject(err);
            const nextOrder = (row.maxOrder || 0) + 1;
            
            const stmt = db.prepare("INSERT INTO folders (name, orderIndex) VALUES (?, ?)");
            stmt.run(folderName, nextOrder, function (err) {
                if (err) return reject(new Error("Failed to create folder."));
                resolve({ id: this.lastID, name: folderName, orderIndex: nextOrder });
            });
            stmt.finalize();
        });
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

ipcMain.handle('reorder-feeds', async (event, { feedId, newIndex, targetFolderId }) => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // First, update the feed's folder if it changed
            if (targetFolderId !== undefined) {
                db.run("UPDATE feeds SET folderId = ? WHERE id = ?", [targetFolderId, feedId]);
            }
            
            // Get all feeds in the target folder
            const folderCondition = targetFolderId ? "folderId = ?" : "folderId IS NULL";
            const params = targetFolderId ? [targetFolderId] : [];
            
            db.all(`SELECT id, orderIndex FROM feeds WHERE ${folderCondition} ORDER BY orderIndex ASC`, params, (err, feeds) => {
                if (err) return reject(err);
                
                // Remove the dragged feed from the array
                const draggedFeed = feeds.find(f => f.id === feedId);
                const filteredFeeds = feeds.filter(f => f.id !== feedId);
                
                // Insert at new position
                filteredFeeds.splice(newIndex, 0, draggedFeed);
                
                // Update order indices
                const stmt = db.prepare("UPDATE feeds SET orderIndex = ? WHERE id = ?");
                filteredFeeds.forEach((feed, index) => {
                    stmt.run(index, feed.id);
                });
                stmt.finalize((err) => {
                    if (err) reject(err);
                    else resolve({ success: true });
                });
            });
        });
    });
});

ipcMain.handle('reorder-folders', async (event, { folderId, newIndex }) => {
    return new Promise((resolve, reject) => {
        db.all("SELECT id, orderIndex FROM folders ORDER BY orderIndex ASC", [], (err, folders) => {
            if (err) return reject(err);
            
            // Remove the dragged folder from the array
            const draggedFolder = folders.find(f => f.id === folderId);
            const filteredFolders = folders.filter(f => f.id !== folderId);
            
            // Insert at new position
            filteredFolders.splice(newIndex, 0, draggedFolder);
            
            // Update order indices
            const stmt = db.prepare("UPDATE folders SET orderIndex = ? WHERE id = ?");
            filteredFolders.forEach((folder, index) => {
                stmt.run(index, folder.id);
            });
            stmt.finalize((err) => {
                if (err) reject(err);
                else resolve({ success: true });
            });
        });
    });
});

ipcMain.handle('add-feed', async (event, feedUrl) => {
    try {
        const feed = await parser.parseURL(feedUrl);
        const feedName = feed.title;
        const newFeedId = await new Promise((resolve, reject) => {
            // Get the next order index
            db.get("SELECT MAX(orderIndex) as maxOrder FROM feeds", [], (err, row) => {
                if (err) return reject(err);
                const nextOrder = (row.maxOrder || 0) + 1;
                
                const stmt = db.prepare("INSERT INTO feeds (name, url, orderIndex) VALUES (?, ?, ?)");
                stmt.run(feedName, feedUrl, nextOrder, function (err) {
                    if (err) return reject(new Error("Failed to add feed. It may already exist."));
                    resolve(this.lastID);
                });
                stmt.finalize();
            });
        });
        const newFeed = { id: newFeedId, name: feedName, url: feedUrl, orderIndex: (await new Promise(resolve => db.get("SELECT MAX(orderIndex) as maxOrder FROM feeds", [], (err, row) => resolve(row.maxOrder)))) };
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