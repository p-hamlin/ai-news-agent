// articleOperations.js - Optimized database operations for articles
const ArticleOperations = (dbConnection) => {
    return {
        // Get articles for a specific feed - now uses prepared statement and index
        async getByFeedId(feedId) {
            return await dbConnection.allPrepared('articles.getByFeedId', [feedId]);
        },

        // Insert new articles from feed parsing - optimized with transaction
        async insertNew(feedId, articles) {
            if (articles.length === 0) return [];

            const newArticles = [];
            
            // Use transaction for better performance with multiple inserts
            await dbConnection.transaction(async () => {
                for (const item of articles) {
                    const result = await dbConnection.runPrepared('articles.insertNew', [
                        feedId,
                        item.title,
                        item.link,
                        item.isoDate || new Date().toISOString(),
                        item.contentSnippet || item.content || '',
                        'new'
                    ]);
                    
                    if (result.changes > 0) {
                        newArticles.push(item.title);
                    }
                }
            });

            return newArticles;
        },

        // Mark article as read - uses prepared statement
        async markAsRead(articleId) {
            const result = await dbConnection.runPrepared('articles.markAsRead', [articleId]);
            return { success: result.changes > 0 };
        },

        // Update article status and summary - optimized
        async updateStatus(articleId, status, summary = null) {
            const result = await dbConnection.runPrepared('articles.updateStatus', [
                status,
                summary,
                articleId
            ]);
            return { success: result.changes > 0 };
        },

        // Get articles to summarize (batch processing) - uses index on status
        async getToSummarize(limit = 100) {
            return await dbConnection.allPrepared('articles.getToSummarize', ['new', limit]);
        },

        // Get article by ID - uses prepared statement
        async getById(articleId) {
            return await dbConnection.getPrepared('articles.getById', [articleId]);
        },

        // Clean up old articles (optimized with index and transaction)
        async cleanup(retentionDays = 30) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
            
            const result = await dbConnection.run(
                "DELETE FROM articles WHERE createdAt < ? AND isRead = 1", 
                [cutoffDate.toISOString()]
            );
            
            return { deletedCount: result.changes };
        },

        // Batch update status for multiple articles - new optimized method
        async batchUpdateStatus(articleIds, status) {
            if (articleIds.length === 0) return { success: true, updatedCount: 0 };

            let updatedCount = 0;
            await dbConnection.transaction(async () => {
                for (const articleId of articleIds) {
                    const result = await dbConnection.runPrepared('articles.updateStatus', [
                        status,
                        null,
                        articleId
                    ]);
                    updatedCount += result.changes;
                }
            });

            return { success: true, updatedCount };
        },

        // Get articles by status with pagination - new optimized method
        async getByStatus(status, limit = 50, offset = 0) {
            return await dbConnection.all(
                'SELECT * FROM articles WHERE status = ? ORDER BY pubDate DESC LIMIT ? OFFSET ?',
                [status, limit, offset]
            );
        },

        // Get article count by feed - new analytics method
        async getCountByFeed(feedId) {
            const result = await dbConnection.get(
                'SELECT COUNT(*) as count FROM articles WHERE feedId = ?',
                [feedId]
            );
            return result.count;
        },

        // Get unread count by feed - new optimized method using index
        async getUnreadCountByFeed(feedId) {
            const result = await dbConnection.get(
                'SELECT COUNT(*) as count FROM articles WHERE feedId = ? AND isRead = 0',
                [feedId]
            );
            return result.count;
        },

        // Search articles by title or content - new search method
        async search(query, limit = 50) {
            const searchTerm = `%${query}%`;
            return await dbConnection.all(
                'SELECT * FROM articles WHERE title LIKE ? OR content LIKE ? ORDER BY pubDate DESC LIMIT ?',
                [searchTerm, searchTerm, limit]
            );
        },

        // Get recent articles across all feeds - optimized with index
        async getRecent(limit = 20) {
            return await dbConnection.all(
                'SELECT * FROM articles ORDER BY pubDate DESC LIMIT ?',
                [limit]
            );
        },

        // Get existing article links for a feed (for diff processing)
        async getExistingLinks(feedId) {
            const results = await dbConnection.all(
                'SELECT link FROM articles WHERE feedId = ?',
                [feedId]
            );
            return new Set(results.map(row => row.link));
        },

        // Get most recent article date for a feed (for optimization)
        async getMostRecentDate(feedId) {
            const result = await dbConnection.get(
                'SELECT MAX(pubDate) as lastDate FROM articles WHERE feedId = ?',
                [feedId]
            );
            return result.lastDate;
        },

        // Insert new articles with diff optimization
        async insertNewOptimized(feedId, articles, existingLinks = null) {
            if (articles.length === 0) return [];

            // Get existing links if not provided
            if (!existingLinks) {
                existingLinks = await this.getExistingLinks(feedId);
            }

            // Filter out articles that already exist
            const newArticleItems = articles.filter(item => !existingLinks.has(item.link));
            
            if (newArticleItems.length === 0) {
                return [];
            }

            const newArticles = [];
            
            // Use transaction for better performance with multiple inserts
            await dbConnection.transaction(async () => {
                for (const item of newArticleItems) {
                    const result = await dbConnection.runPrepared('articles.insertNew', [
                        feedId,
                        item.title,
                        item.link,
                        item.isoDate || new Date().toISOString(),
                        item.contentSnippet || item.content || '',
                        'new'
                    ]);
                    
                    if (result.changes > 0) {
                        newArticles.push(item.title);
                    }
                }
            });

            return newArticles;
        }
    };
};

module.exports = { ArticleOperations };