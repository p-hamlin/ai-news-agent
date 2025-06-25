// database.js

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// --- Define the path to the database file ---
// It will be created in the same directory as your main app files.
// Using app.getPath('userData') is often a better practice for production apps,
// but for this project, keeping it local is simpler.
const dbPath = path.join(__dirname, 'news-aggregator.db');

// --- Connect to (or create) the database ---
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // --- Create tables if they don't exist ---
        db.serialize(() => {
            // Feeds table: stores the RSS feed URLs and their names
            db.run(`CREATE TABLE IF NOT EXISTS feeds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                url TEXT NOT NULL UNIQUE,
                displayName TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Articles table: stores articles fetched from feeds
            db.run(`CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                feedId INTEGER NOT NULL,
                title TEXT NOT NULL,
                link TEXT NOT NULL UNIQUE,
                pubDate TEXT,
                content TEXT,
                summary TEXT,
                isRead BOOLEAN DEFAULT 0,
                status TEXT DEFAULT 'new', -- new, summarizing, summarized, failed
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (feedId) REFERENCES feeds (id) ON DELETE CASCADE
            )`);

            // --- NEW: Add status column to existing tables if it doesn't exist ---
            db.all("PRAGMA table_info(articles)", (err, columns) => {
                if (err) return;
                if (!columns.find(c => c.name === 'status')) {
                    console.log('Adding "status" column to articles table.');
                    db.run("ALTER TABLE articles ADD COLUMN status TEXT DEFAULT 'new'");
                }
            });

            db.all("PRAGMA table_info(feeds)", (err, columns) => {
                if (err) return;
                if (!columns.find(c => c.name === 'displayName')) {
                    console.log('Adding "displayName" column to feeds table.');
                    db.run("ALTER TABLE feeds ADD COLUMN displayName TEXT");
                }
            });
        });
    }
});

// --- Export the database object to be used in other files ---
module.exports = db;
