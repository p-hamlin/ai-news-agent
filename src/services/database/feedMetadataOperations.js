// feedMetadataOperations.js - Feed metadata operations for optimization and tracking
const FeedMetadataOperations = (dbConnection) => {
    return {
        // Get metadata for a specific feed
        async get(feedId) {
            return await dbConnection.getPrepared('feedMetadata.get', [feedId]);
        },

        // Update metadata after successful fetch
        async updateSuccess(feedId, articleCount, etag = null, lastModified = null) {
            const now = new Date().toISOString();
            return await dbConnection.runPrepared('feedMetadata.updateSuccess', [
                feedId,
                now,  // lastFetchTime
                now,  // lastSuccessfulFetch
                etag,
                lastModified,
                articleCount
            ]);
        },

        // Update metadata after failed fetch
        async updateFailure(feedId, errorMessage) {
            const now = new Date().toISOString();
            return await dbConnection.runPrepared('feedMetadata.updateFailure', [
                feedId,
                now,  // lastFetchTime
                now,  // lastErrorTime
                errorMessage,
                feedId  // for consecutive failures count
            ]);
        },

        // Get feeds that haven't been fetched recently (for prioritization)
        async getStaleFeedIds(maxAge = 60 * 60 * 1000) { // Default 1 hour
            const cutoffTime = new Date(Date.now() - maxAge).toISOString();
            const results = await dbConnection.all(`
                SELECT f.id, f.name, f.url, 
                       fm.lastSuccessfulFetch, 
                       fm.consecutiveFailures
                FROM feeds f
                LEFT JOIN feed_metadata fm ON f.id = fm.feedId
                WHERE fm.lastSuccessfulFetch IS NULL 
                   OR fm.lastSuccessfulFetch < ?
                ORDER BY 
                    CASE WHEN fm.lastSuccessfulFetch IS NULL THEN 0 ELSE 1 END,
                    fm.lastSuccessfulFetch ASC
            `, [cutoffTime]);
            
            return results;
        },

        // Get feed health statistics
        async getHealthStats() {
            const stats = await dbConnection.get(`
                SELECT 
                    COUNT(*) as totalFeeds,
                    COUNT(fm.feedId) as trackedFeeds,
                    SUM(CASE WHEN fm.consecutiveFailures = 0 THEN 1 ELSE 0 END) as healthyFeeds,
                    SUM(CASE WHEN fm.consecutiveFailures > 0 THEN 1 ELSE 0 END) as failingFeeds,
                    SUM(CASE WHEN fm.consecutiveFailures > 5 THEN 1 ELSE 0 END) as criticalFeeds,
                    AVG(fm.averageArticleCount) as avgArticlesPerFeed
                FROM feeds f
                LEFT JOIN feed_metadata fm ON f.id = fm.feedId
            `);
            
            return stats;
        },

        // Clean up old metadata (for feeds that no longer exist)
        async cleanup() {
            const result = await dbConnection.run(`
                DELETE FROM feed_metadata 
                WHERE feedId NOT IN (SELECT id FROM feeds)
            `);
            
            return { deletedCount: result.changes };
        },

        // Reset consecutive failures for a feed (for manual recovery)
        async resetFailures(feedId) {
            const now = new Date().toISOString();
            return await dbConnection.run(
                'UPDATE feed_metadata SET consecutiveFailures = 0 WHERE feedId = ?',
                [feedId]
            );
        },

        // Get feeds by failure status for monitoring
        async getByFailureStatus(minFailures = 1) {
            return await dbConnection.all(`
                SELECT f.id, f.name, f.url,
                       fm.consecutiveFailures,
                       fm.lastErrorTime,
                       fm.lastErrorMessage,
                       fm.lastSuccessfulFetch
                FROM feeds f
                INNER JOIN feed_metadata fm ON f.id = fm.feedId
                WHERE fm.consecutiveFailures >= ?
                ORDER BY fm.consecutiveFailures DESC, fm.lastErrorTime DESC
            `, [minFailures]);
        },

        // Check if feed supports conditional requests (ETag/Last-Modified)
        async getConditionalRequestInfo(feedId) {
            const metadata = await this.get(feedId);
            if (!metadata) return null;
            
            return {
                etag: metadata.etag,
                lastModified: metadata.lastModified,
                supportsConditional: !!(metadata.etag || metadata.lastModified)
            };
        },

        // Update average article count (rolling average)
        async updateAverageArticleCount(feedId, newCount) {
            const metadata = await this.get(feedId);
            const currentAvg = metadata?.averageArticleCount || 0;
            
            // Simple rolling average with 10% weight for new value
            const newAvg = currentAvg === 0 ? newCount : Math.round(currentAvg * 0.9 + newCount * 0.1);
            
            return await dbConnection.run(
                'UPDATE feed_metadata SET averageArticleCount = ? WHERE feedId = ?',
                [newAvg, feedId]
            );
        }
    };
};

module.exports = { FeedMetadataOperations };