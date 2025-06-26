// feedOperations.js - Optimized database operations for feeds
const FeedOperations = (dbConnection) => {
    return {
        // Get all feeds with their display names - uses prepared statement and index
        async getAll() {
            return await dbConnection.allPrepared('feeds.getAll');
        },

        // Add a new feed - optimized with transaction
        async add(feedName, feedUrl) {
            // Get the next order index in a transaction
            const result = await dbConnection.transaction(async () => {
                const maxOrder = await dbConnection.get("SELECT MAX(orderIndex) as maxOrder FROM feeds");
                const nextOrder = (maxOrder.maxOrder || 0) + 1;
                
                return await dbConnection.runPrepared('feeds.insert', [feedName, feedUrl, nextOrder]);
            });

            return result.lastID;
        },

        // Delete a feed - uses prepared statement
        async delete(feedId) {
            const result = await dbConnection.runPrepared('feeds.delete', [feedId]);
            return { success: result.changes > 0, id: feedId };
        },

        // Update feed display name - uses prepared statement
        async updateDisplayName(feedId, displayName) {
            const result = await dbConnection.runPrepared('feeds.updateDisplayName', [displayName, feedId]);
            return { success: result.changes > 0 };
        },

        // Move feed to folder - uses prepared statement
        async moveToFolder(feedId, folderId) {
            const result = await dbConnection.runPrepared('feeds.moveToFolder', [folderId, feedId]);
            return { success: result.changes > 0 };
        },

        // Reorder feeds - optimized with transaction
        async reorder(feedId, newIndex, targetFolderId) {
            await dbConnection.transaction(async () => {
                // First, update the feed's folder if it changed
                if (targetFolderId !== undefined) {
                    await dbConnection.runPrepared('feeds.moveToFolder', [targetFolderId, feedId]);
                }
                
                // Get all feeds in the target folder
                const folderCondition = targetFolderId ? "folderId = ?" : "folderId IS NULL";
                const params = targetFolderId ? [targetFolderId] : [];
                
                const feeds = await dbConnection.all(
                    `SELECT id, orderIndex FROM feeds WHERE ${folderCondition} ORDER BY orderIndex ASC`, 
                    params
                );
                
                // Remove the dragged feed from the array
                const draggedFeed = feeds.find(f => f.id === feedId);
                const filteredFeeds = feeds.filter(f => f.id !== feedId);
                
                // Insert at new position
                filteredFeeds.splice(newIndex, 0, draggedFeed);
                
                // Update order indices using prepared statement
                for (let i = 0; i < filteredFeeds.length; i++) {
                    await dbConnection.runPrepared('feeds.updateOrder', [i, filteredFeeds[i].id]);
                }
            });

            return { success: true };
        },

        // Get feeds by folder - new optimized method
        async getByFolder(folderId) {
            const condition = folderId ? "folderId = ?" : "folderId IS NULL";
            const params = folderId ? [folderId] : [];
            
            return await dbConnection.all(
                `SELECT *, COALESCE(displayName, name) as name FROM feeds WHERE ${condition} ORDER BY orderIndex ASC`,
                params
            );
        },

        // Get feed by URL - optimized with index
        async getByUrl(url) {
            return await dbConnection.get('SELECT * FROM feeds WHERE url = ?', [url]);
        },

        // Get feed statistics - new analytics method
        async getStats(feedId) {
            return await dbConnection.get(`
                SELECT 
                    f.id,
                    f.name,
                    f.url,
                    COUNT(a.id) as totalArticles,
                    SUM(CASE WHEN a.isRead = 1 THEN 1 ELSE 0 END) as readArticles,
                    SUM(CASE WHEN a.status = 'summarized' THEN 1 ELSE 0 END) as summarizedArticles,
                    MAX(a.pubDate) as lastArticleDate
                FROM feeds f
                LEFT JOIN articles a ON f.id = a.feedId
                WHERE f.id = ?
                GROUP BY f.id
            `, [feedId]);
        },

        // Batch operations for multiple feeds
        async batchUpdateFolder(feedIds, folderId) {
            if (feedIds.length === 0) return { success: true, updatedCount: 0 };

            let updatedCount = 0;
            await dbConnection.transaction(async () => {
                for (const feedId of feedIds) {
                    const result = await dbConnection.runPrepared('feeds.moveToFolder', [folderId, feedId]);
                    updatedCount += result.changes;
                }
            });

            return { success: true, updatedCount };
        },

        // Validate feed URL - helper method
        async validateUrl(url) {
            try {
                new URL(url);
                const existing = await this.getByUrl(url);
                return { valid: true, exists: !!existing };
            } catch {
                return { valid: false, exists: false };
            }
        },

        // Get feeds with article counts - optimized join
        async getAllWithCounts() {
            return await dbConnection.all(`
                SELECT 
                    f.*,
                    COALESCE(f.displayName, f.name) as name,
                    COUNT(a.id) as articleCount,
                    SUM(CASE WHEN a.isRead = 0 THEN 1 ELSE 0 END) as unreadCount
                FROM feeds f
                LEFT JOIN articles a ON f.id = a.feedId
                GROUP BY f.id
                ORDER BY f.orderIndex ASC, f.name ASC
            `);
        }
    };
};

module.exports = { FeedOperations };