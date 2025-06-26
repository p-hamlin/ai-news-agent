// archiveManager.js - Service for managing content archiving and retention policies
const { DatabaseService } = require('./database/index.js');

class ArchiveManager {
    constructor() {
        this.dbService = DatabaseService();
        this.config = {
            // Default retention policies (in days)
            articleRetentionDays: 30,      // Archive articles after 30 days
            archiveRetentionDays: 365,     // Permanently delete archives after 1 year
            maxBatchSize: 1000,            // Maximum articles to process in one batch
            autoArchiveEnabled: true,      // Enable automatic archiving
            archiveReadArticles: true,     // Archive read articles
            archiveFailedArticles: true,   // Archive failed articles
            
            // Advanced configuration
            preserveSummarizedArticles: false,  // Keep summarized articles longer
            preserveSummaryRetentionDays: 90,   // Extended retention for summarized articles
            enableOrphanCleanup: true,          // Clean up orphaned archives
            enableCompression: false,           // Future: compress archived content
        };
        
        this.stats = {
            lastRunTime: null,
            totalArchived: 0,
            lastBatchSize: 0,
            errors: []
        };
    }

    // Update archive configuration
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('[ArchiveManager] Configuration updated:', this.config);
    }

    // Get current configuration
    getConfig() {
        return { ...this.config };
    }

    // Run automatic archiving based on retention policy
    async runAutoArchive() {
        if (!this.config.autoArchiveEnabled) {
            console.log('[ArchiveManager] Auto-archive is disabled');
            return { success: true, message: 'Auto-archive disabled', archivedCount: 0 };
        }

        console.log('[ArchiveManager] Starting automatic archiving...');
        const startTime = Date.now();

        try {
            // Initialize database if needed
            await this.dbService.initialize();

            // Run the archiving process
            const result = await this.dbService.archive.autoArchiveByRetention(
                this.config.articleRetentionDays,
                this.config.maxBatchSize
            );

            // Update statistics
            this.stats.lastRunTime = new Date().toISOString();
            this.stats.totalArchived += result.archivedCount;
            this.stats.lastBatchSize = result.archivedCount;
            
            if (result.errors && result.errors.length > 0) {
                this.stats.errors = result.errors.slice(-10); // Keep last 10 errors
            }

            const duration = Date.now() - startTime;
            console.log(`[ArchiveManager] Auto-archive completed in ${duration}ms:`, {
                archived: result.archivedCount,
                remaining: result.remaining,
                total: result.totalToArchive
            });

            // Clean up old archives if enabled
            if (this.config.archiveRetentionDays > 0) {
                const cleanupResult = await this.cleanupOldArchives();
                result.cleanup = cleanupResult;
            }

            // Clean up orphaned archives if enabled
            if (this.config.enableOrphanCleanup) {
                const orphanResult = await this.dbService.archive.cleanupOrphanedArchives();
                result.orphanCleanup = orphanResult;
            }

            return {
                ...result,
                duration,
                config: this.config
            };

        } catch (error) {
            console.error('[ArchiveManager] Auto-archive failed:', error);
            this.stats.errors.push({
                timestamp: new Date().toISOString(),
                error: error.message
            });
            
            return {
                success: false,
                error: error.message,
                duration: Date.now() - startTime
            };
        }
    }

    // Archive specific articles by IDs
    async archiveArticles(articleIds, reason = 'manual') {
        console.log(`[ArchiveManager] Archiving ${articleIds.length} articles manually...`);
        
        try {
            await this.dbService.initialize();
            const result = await this.dbService.archive.archiveArticles(articleIds, reason);
            
            this.stats.totalArchived += result.archivedCount;
            console.log(`[ArchiveManager] Manual archive completed: ${result.archivedCount} articles`);
            
            return result;
        } catch (error) {
            console.error('[ArchiveManager] Manual archive failed:', error);
            return { success: false, error: error.message };
        }
    }

    // Archive articles by feed
    async archiveByFeed(feedId, retentionDays = null) {
        const retention = retentionDays || this.config.articleRetentionDays;
        console.log(`[ArchiveManager] Archiving articles for feed ${feedId} older than ${retention} days...`);
        
        try {
            await this.dbService.initialize();
            
            // Get articles for the specific feed that meet retention criteria
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retention);
            
            const articles = await this.dbService.articles.getByStatus('new'); // This would need to be enhanced
            const feedArticles = articles.filter(article => 
                article.feedId === feedId && 
                new Date(article.createdAt) < cutoffDate &&
                (article.isRead || article.status === 'failed')
            );
            
            if (feedArticles.length === 0) {
                return { success: true, archivedCount: 0, message: 'No articles found for archival' };
            }
            
            const articleIds = feedArticles.map(a => a.id);
            return await this.archiveArticles(articleIds, 'feed_policy');
            
        } catch (error) {
            console.error('[ArchiveManager] Feed archive failed:', error);
            return { success: false, error: error.message };
        }
    }

    // Clean up old archived articles
    async cleanupOldArchives() {
        if (this.config.archiveRetentionDays <= 0) {
            return { success: true, deletedCount: 0, message: 'Archive cleanup disabled' };
        }

        console.log(`[ArchiveManager] Cleaning up archives older than ${this.config.archiveRetentionDays} days...`);
        
        try {
            await this.dbService.initialize();
            const result = await this.dbService.archive.deleteOldArchivedArticles(this.config.archiveRetentionDays);
            
            console.log(`[ArchiveManager] Archive cleanup completed: ${result.deletedCount} archives deleted`);
            return result;
        } catch (error) {
            console.error('[ArchiveManager] Archive cleanup failed:', error);
            return { success: false, error: error.message };
        }
    }

    // Restore archived article
    async restoreArticle(archivedArticleId) {
        console.log(`[ArchiveManager] Restoring archived article ${archivedArticleId}...`);
        
        try {
            await this.dbService.initialize();
            const result = await this.dbService.archive.restoreArticle(archivedArticleId);
            
            console.log(`[ArchiveManager] Article restore ${result.success ? 'completed' : 'failed'}`);
            return result;
        } catch (error) {
            console.error('[ArchiveManager] Article restore failed:', error);
            return { success: false, error: error.message };
        }
    }

    // Get comprehensive archive statistics
    async getArchiveStatistics() {
        try {
            await this.dbService.initialize();
            
            const archiveStats = await this.dbService.archive.getArchiveStats();
            const archiveSize = await this.dbService.archive.getArchiveSize();
            
            return {
                ...archiveStats,
                storage: archiveSize,
                manager: {
                    config: this.config,
                    stats: this.stats
                },
                health: {
                    autoArchiveEnabled: this.config.autoArchiveEnabled,
                    lastRun: this.stats.lastRunTime,
                    recentErrors: this.stats.errors.slice(-5)
                }
            };
        } catch (error) {
            console.error('[ArchiveManager] Failed to get statistics:', error);
            return { error: error.message };
        }
    }

    // Get archived articles with pagination
    async getArchivedArticles(options = {}) {
        const { limit = 50, offset = 0, feedId = null } = options;
        
        try {
            await this.dbService.initialize();
            
            if (feedId) {
                return await this.dbService.archive.getArchivedArticlesByFeed(feedId, limit, offset);
            } else {
                return await this.dbService.archive.getArchivedArticles(limit, offset);
            }
        } catch (error) {
            console.error('[ArchiveManager] Failed to get archived articles:', error);
            return { error: error.message };
        }
    }

    // Search archived articles
    async searchArchives(query, options = {}) {
        const { limit = 50, offset = 0 } = options;
        
        try {
            await this.dbService.initialize();
            return await this.dbService.archive.searchArchivedArticles(query, limit, offset);
        } catch (error) {
            console.error('[ArchiveManager] Archive search failed:', error);
            return { error: error.message };
        }
    }

    // Validate and estimate archiving impact
    async estimateArchiveImpact(retentionDays = null) {
        const retention = retentionDays || this.config.articleRetentionDays;
        
        try {
            await this.dbService.initialize();
            
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retention);
            const cutoffISO = cutoffDate.toISOString();
            
            const countResult = await this.dbService.articles.countForArchival 
                ? await this.dbService.articles.countForArchival(cutoffISO)
                : await this.dbService.connection.getPrepared('articles.countForArchival', [cutoffISO]);
                
            return {
                retentionDays: retention,
                cutoffDate: cutoffISO,
                articlesAffected: countResult.count,
                estimatedFreeSpace: countResult.count * 2048, // Rough estimate: 2KB per article
                config: this.config
            };
        } catch (error) {
            console.error('[ArchiveManager] Impact estimation failed:', error);
            return { error: error.message };
        }
    }

    // Schedule-friendly method for periodic execution
    async runScheduledMaintenance() {
        console.log('[ArchiveManager] Running scheduled maintenance...');
        
        const results = {
            timestamp: new Date().toISOString(),
            archive: null,
            cleanup: null,
            orphan: null
        };
        
        try {
            // Run auto-archive
            results.archive = await this.runAutoArchive();
            
            // Additional maintenance tasks can be added here
            console.log('[ArchiveManager] Scheduled maintenance completed');
            
        } catch (error) {
            console.error('[ArchiveManager] Scheduled maintenance failed:', error);
            results.error = error.message;
        }
        
        return results;
    }

    // Get current status and health
    getStatus() {
        return {
            enabled: this.config.autoArchiveEnabled,
            config: this.config,
            stats: this.stats,
            nextScheduledRun: null, // This would be populated by the scheduler
            health: this.stats.errors.length === 0 ? 'healthy' : 'has_errors'
        };
    }
}

// Create singleton instance
const archiveManager = new ArchiveManager();

module.exports = { ArchiveManager, archiveManager };