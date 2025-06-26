// articleOperations.js - Database operations for articles
const ArticleOperations = (db) => {
    return {
        // Get articles for a specific feed
        async getByFeedId(feedId) {
            return new Promise((resolve, reject) => {
                const sql = "SELECT id, feedId, title, link, pubDate, isRead, summary, status FROM articles WHERE feedId = ? ORDER BY pubDate DESC";
                db.all(sql, [feedId], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        },

        // Insert new articles from feed parsing
        async insertNew(feedId, articles) {
            return new Promise((resolve, reject) => {
                const stmt = db.prepare("INSERT OR IGNORE INTO articles (feedId, title, link, pubDate, content, status) VALUES (?, ?, ?, ?, ?, 'new')");
                
                let newArticles = [];
                let processedCount = 0;
                
                articles.forEach(item => {
                    stmt.run(feedId, item.title, item.link, item.isoDate || new Date().toISOString(), item.contentSnippet || item.content || '', function(err) {
                        if (err) return reject(err);
                        if (this.changes > 0) newArticles.push(item.title);
                        
                        processedCount++;
                        if (processedCount === articles.length) {
                            stmt.finalize(() => {
                                resolve(newArticles);
                            });
                        }
                    });
                });
                
                if (articles.length === 0) {
                    stmt.finalize();
                    resolve([]);
                }
            });
        },

        // Mark article as read
        async markAsRead(articleId) {
            return new Promise((resolve, reject) => {
                db.run("UPDATE articles SET isRead = 1 WHERE id = ?", [articleId], (err) => {
                    if (err) reject(err);
                    else resolve({ success: true });
                });
            });
        },

        // Update article status and summary
        async updateStatus(articleId, status, summary = null) {
            return new Promise((resolve, reject) => {
                const query = summary 
                    ? "UPDATE articles SET status = ?, summary = ? WHERE id = ?"
                    : "UPDATE articles SET status = ? WHERE id = ?";
                const params = summary ? [status, summary, articleId] : [status, articleId];

                db.run(query, params, (err) => {
                    if (err) reject(err);
                    else resolve({ success: true });
                });
            });
        },

        // Get articles to summarize (batch processing)
        async getToSummarize(limit = 5) {
            return new Promise((resolve, reject) => {
                db.all("SELECT * FROM articles WHERE status = 'new' LIMIT ?", [limit], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        },

        // Get article by ID
        async getById(articleId) {
            return new Promise((resolve, reject) => {
                db.get("SELECT * FROM articles WHERE id = ?", [articleId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        },

        // Clean up old articles (for future archiving feature)
        async cleanup(retentionDays = 30) {
            return new Promise((resolve, reject) => {
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
                
                db.run("DELETE FROM articles WHERE createdAt < ? AND isRead = 1", [cutoffDate.toISOString()], function(err) {
                    if (err) reject(err);
                    else resolve({ deletedCount: this.changes });
                });
            });
        }
    };
};

module.exports = { ArticleOperations };