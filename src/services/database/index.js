// index.js - Database service aggregator
const { FeedOperations } = require('./feedOperations');
const { FolderOperations } = require('./folderOperations');
const { ArticleOperations } = require('./articleOperations');

const DatabaseService = (db) => {
    return {
        feeds: FeedOperations(db),
        folders: FolderOperations(db),
        articles: ArticleOperations(db),
        
        // Database utility functions
        async close() {
            return new Promise((resolve) => {
                db.close((err) => {
                    if (err) console.error('Error closing database:', err);
                    resolve();
                });
            });
        },
        
        async getStats() {
            return new Promise((resolve, reject) => {
                const stats = {};
                
                db.get("SELECT COUNT(*) as count FROM feeds", [], (err, row) => {
                    if (err) return reject(err);
                    stats.feedCount = row.count;
                    
                    db.get("SELECT COUNT(*) as count FROM folders", [], (err, row) => {
                        if (err) return reject(err);
                        stats.folderCount = row.count;
                        
                        db.get("SELECT COUNT(*) as count FROM articles", [], (err, row) => {
                            if (err) return reject(err);
                            stats.articleCount = row.count;
                            
                            db.get("SELECT COUNT(*) as count FROM articles WHERE status = 'summarized'", [], (err, row) => {
                                if (err) return reject(err);
                                stats.summarizedCount = row.count;
                                resolve(stats);
                            });
                        });
                    });
                });
            });
        }
    };
};

module.exports = { DatabaseService };