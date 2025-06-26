// connection.js - Enhanced database connection with performance optimizations
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { promisify } = require('util');

class DatabaseConnection {
    constructor() {
        this.db = null;
        this.isInitialized = false;
        this.preparedStatements = new Map();
        this.dbPath = path.join(__dirname, '../../../news-aggregator.db');
    }

    async initialize() {
        if (this.isInitialized) return;

        return new Promise((resolve, reject) => {
            // Enable WAL mode for better concurrency
            this.db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, async (err) => {
                if (err) {
                    console.error('Error opening database:', err.message);
                    reject(err);
                    return;
                }

                console.log('Connected to SQLite database with performance optimizations.');
                
                try {
                    await this.enablePerformanceOptimizations();
                    await this.createTables();
                    await this.createIndexes();
                    await this.prepareCachedStatements();
                    
                    this.isInitialized = true;
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    async enablePerformanceOptimizations() {
        const settings = [
            'PRAGMA journal_mode = WAL',           // Better concurrency
            'PRAGMA synchronous = NORMAL',         // Faster writes, still safe
            'PRAGMA cache_size = -64000',          // 64MB cache
            'PRAGMA temp_store = MEMORY',          // Store temp tables in memory
            'PRAGMA mmap_size = 268435456',        // 256MB memory map
            'PRAGMA optimize'                      // Auto-optimize queries
        ];

        for (const setting of settings) {
            await this.run(setting);
        }
        console.log('Database performance optimizations enabled.');
    }

    async createTables() {
        await this.run(`CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            parentId INTEGER,
            orderIndex INTEGER DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (parentId) REFERENCES folders (id) ON DELETE CASCADE
        )`);

        await this.run(`CREATE TABLE IF NOT EXISTS feeds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            url TEXT NOT NULL UNIQUE,
            displayName TEXT,
            folderId INTEGER,
            orderIndex INTEGER DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (folderId) REFERENCES folders (id) ON DELETE SET NULL
        )`);

        await this.run(`CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            feedId INTEGER NOT NULL,
            title TEXT NOT NULL,
            link TEXT NOT NULL UNIQUE,
            pubDate TEXT,
            content TEXT,
            summary TEXT,
            isRead BOOLEAN DEFAULT 0,
            status TEXT DEFAULT 'new',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (feedId) REFERENCES feeds (id) ON DELETE CASCADE
        )`);

        await this.run(`CREATE TABLE IF NOT EXISTS feed_metadata (
            feedId INTEGER PRIMARY KEY,
            lastFetchTime DATETIME,
            lastSuccessfulFetch DATETIME,
            lastErrorTime DATETIME,
            lastErrorMessage TEXT,
            consecutiveFailures INTEGER DEFAULT 0,
            etag TEXT,
            lastModified TEXT,
            averageArticleCount INTEGER DEFAULT 0,
            FOREIGN KEY (feedId) REFERENCES feeds (id) ON DELETE CASCADE
        )`);

        // Add missing columns if they don't exist
        await this.addMissingColumns();
    }

    async addMissingColumns() {
        const addColumnIfMissing = async (table, column, definition) => {
            const columns = await this.all(`PRAGMA table_info(${table})`);
            if (!columns.find(c => c.name === column)) {
                console.log(`Adding "${column}" column to ${table} table.`);
                await this.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
            }
        };

        await addColumnIfMissing('articles', 'status', 'TEXT DEFAULT "new"');
        await addColumnIfMissing('feeds', 'displayName', 'TEXT');
        await addColumnIfMissing('feeds', 'folderId', 'INTEGER');
        await addColumnIfMissing('feeds', 'orderIndex', 'INTEGER DEFAULT 0');
        await addColumnIfMissing('folders', 'orderIndex', 'INTEGER DEFAULT 0');
    }

    async createIndexes() {
        const indexes = [
            // Articles indexes - most frequently queried
            'CREATE INDEX IF NOT EXISTS idx_articles_feedId ON articles(feedId)',
            'CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status)',
            'CREATE INDEX IF NOT EXISTS idx_articles_pubDate ON articles(pubDate DESC)',
            'CREATE INDEX IF NOT EXISTS idx_articles_isRead ON articles(isRead)',
            'CREATE INDEX IF NOT EXISTS idx_articles_link ON articles(link)',
            
            // Composite indexes for common query patterns
            'CREATE INDEX IF NOT EXISTS idx_articles_feed_status ON articles(feedId, status)',
            'CREATE INDEX IF NOT EXISTS idx_articles_feed_date ON articles(feedId, pubDate DESC)',
            
            // Feeds indexes
            'CREATE INDEX IF NOT EXISTS idx_feeds_folderId ON feeds(folderId)',
            'CREATE INDEX IF NOT EXISTS idx_feeds_orderIndex ON feeds(orderIndex)',
            'CREATE INDEX IF NOT EXISTS idx_feeds_url ON feeds(url)',
            
            // Folders indexes
            'CREATE INDEX IF NOT EXISTS idx_folders_orderIndex ON folders(orderIndex)',
            'CREATE INDEX IF NOT EXISTS idx_folders_parentId ON folders(parentId)',
            
            // Feed metadata indexes
            'CREATE INDEX IF NOT EXISTS idx_feed_metadata_lastFetch ON feed_metadata(lastFetchTime)',
            'CREATE INDEX IF NOT EXISTS idx_feed_metadata_lastSuccess ON feed_metadata(lastSuccessfulFetch)'
        ];

        for (const indexSql of indexes) {
            await this.run(indexSql);
        }
        console.log('Database indexes created for optimal query performance.');
    }

    async prepareCachedStatements() {
        const statements = {
            // Article operations
            'articles.getByFeedId': 'SELECT id, feedId, title, link, pubDate, isRead, summary, status FROM articles WHERE feedId = ? ORDER BY pubDate DESC',
            'articles.getToSummarize': 'SELECT * FROM articles WHERE status = ? LIMIT ?',
            'articles.insertNew': 'INSERT OR IGNORE INTO articles (feedId, title, link, pubDate, content, status) VALUES (?, ?, ?, ?, ?, ?)',
            'articles.updateStatus': 'UPDATE articles SET status = ?, summary = ? WHERE id = ?',
            'articles.markAsRead': 'UPDATE articles SET isRead = 1 WHERE id = ?',
            'articles.getById': 'SELECT * FROM articles WHERE id = ?',
            
            // Feed operations
            'feeds.getAll': 'SELECT *, COALESCE(displayName, name) as name FROM feeds ORDER BY orderIndex ASC, name ASC',
            'feeds.insert': 'INSERT INTO feeds (name, url, orderIndex) VALUES (?, ?, ?)',
            'feeds.delete': 'DELETE FROM feeds WHERE id = ?',
            'feeds.updateDisplayName': 'UPDATE feeds SET displayName = ? WHERE id = ?',
            'feeds.moveToFolder': 'UPDATE feeds SET folderId = ? WHERE id = ?',
            'feeds.updateOrder': 'UPDATE feeds SET orderIndex = ? WHERE id = ?',
            
            // Folder operations
            'folders.getAll': 'SELECT * FROM folders ORDER BY orderIndex ASC, name ASC',
            'folders.insert': 'INSERT INTO folders (name, orderIndex) VALUES (?, ?)',
            'folders.delete': 'DELETE FROM folders WHERE id = ?',
            'folders.updateName': 'UPDATE folders SET name = ? WHERE id = ?',
            'folders.updateOrder': 'UPDATE folders SET orderIndex = ? WHERE id = ?',
            
            // Feed metadata operations
            'feedMetadata.get': 'SELECT * FROM feed_metadata WHERE feedId = ?',
            'feedMetadata.upsert': 'INSERT OR REPLACE INTO feed_metadata (feedId, lastFetchTime, lastSuccessfulFetch, lastErrorTime, lastErrorMessage, consecutiveFailures, etag, lastModified, averageArticleCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            'feedMetadata.updateSuccess': 'INSERT OR REPLACE INTO feed_metadata (feedId, lastFetchTime, lastSuccessfulFetch, consecutiveFailures, etag, lastModified, averageArticleCount) VALUES (?, ?, ?, 0, ?, ?, ?)',
            'feedMetadata.updateFailure': 'INSERT OR REPLACE INTO feed_metadata (feedId, lastFetchTime, lastErrorTime, lastErrorMessage, consecutiveFailures) VALUES (?, ?, ?, ?, COALESCE((SELECT consecutiveFailures FROM feed_metadata WHERE feedId = ?), 0) + 1)'
        };

        for (const [key, sql] of Object.entries(statements)) {
            this.preparedStatements.set(key, this.db.prepare(sql));
        }
        console.log('Prepared statements cached for optimal performance.');
    }

    // Promisified database operations
    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    async get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // Enhanced prepared statement execution
    async runPrepared(statementKey, params = []) {
        const stmt = this.preparedStatements.get(statementKey);
        if (!stmt) {
            throw new Error(`Prepared statement not found: ${statementKey}`);
        }

        return new Promise((resolve, reject) => {
            stmt.run(params, function(err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    async getPrepared(statementKey, params = []) {
        const stmt = this.preparedStatements.get(statementKey);
        if (!stmt) {
            throw new Error(`Prepared statement not found: ${statementKey}`);
        }

        return new Promise((resolve, reject) => {
            stmt.get(params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async allPrepared(statementKey, params = []) {
        const stmt = this.preparedStatements.get(statementKey);
        if (!stmt) {
            throw new Error(`Prepared statement not found: ${statementKey}`);
        }

        return new Promise((resolve, reject) => {
            stmt.all(params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // Transaction support
    async transaction(operation) {
        await this.run('BEGIN TRANSACTION');
        try {
            const result = await operation();
            await this.run('COMMIT');
            return result;
        } catch (error) {
            await this.run('ROLLBACK');
            throw error;
        }
    }

    async close() {
        return new Promise((resolve) => {
            // Finalize all prepared statements
            for (const stmt of this.preparedStatements.values()) {
                stmt.finalize();
            }
            this.preparedStatements.clear();

            this.db.close((err) => {
                if (err) console.error('Error closing database:', err);
                this.isInitialized = false;
                resolve();
            });
        });
    }

    // Database statistics and health checks
    async getStats() {
        const stats = await this.get(`
            SELECT 
                (SELECT COUNT(*) FROM feeds) as feedCount,
                (SELECT COUNT(*) FROM folders) as folderCount,
                (SELECT COUNT(*) FROM articles) as articleCount,
                (SELECT COUNT(*) FROM articles WHERE status = 'summarized') as summarizedCount,
                (SELECT COUNT(*) FROM articles WHERE isRead = 1) as readCount
        `);
        return stats;
    }

    async analyze() {
        await this.run('ANALYZE');
        console.log('Database statistics updated for query optimization.');
    }
}

// Singleton instance
const dbConnection = new DatabaseConnection();

module.exports = { DatabaseConnection, dbConnection };