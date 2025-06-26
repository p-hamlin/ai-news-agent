// archiveOperations.js - Database operations for article archiving and content management
const ArchiveOperations = (dbConnection) => {
    return {
        // Archive a single article by ID
        async archiveArticle(articleId, reason = 'manual') {
            const result = await dbConnection.transaction(async () => {
                // First, copy the article to archive table
                const archiveResult = await dbConnection.runPrepared('articles.archiveById', [reason, articleId]);
                
                if (archiveResult.changes > 0) {
                    // Then delete from main articles table
                    const deleteResult = await dbConnection.runPrepared('articles.deleteAfterArchive', [articleId]);
                    return { success: deleteResult.changes > 0, archivedId: archiveResult.lastID };
                }
                
                return { success: false, error: 'Failed to archive article' };
            });
            
            return result;
        },

        // Archive multiple articles by IDs
        async archiveArticles(articleIds, reason = 'batch_archive') {
            if (articleIds.length === 0) return { success: true, archivedCount: 0 };

            let archivedCount = 0;
            const errors = [];

            await dbConnection.transaction(async () => {
                for (const articleId of articleIds) {
                    try {
                        const archiveResult = await dbConnection.runPrepared('articles.archiveById', [reason, articleId]);
                        
                        if (archiveResult.changes > 0) {
                            const deleteResult = await dbConnection.runPrepared('articles.deleteAfterArchive', [articleId]);
                            if (deleteResult.changes > 0) {
                                archivedCount++;
                            }
                        }
                    } catch (error) {
                        errors.push({ articleId, error: error.message });
                    }
                }
            });

            return { 
                success: errors.length === 0, 
                archivedCount, 
                errors: errors.length > 0 ? errors : undefined 
            };
        },

        // Auto-archive articles based on retention policy
        async autoArchiveByRetention(retentionDays = 30, maxBatchSize = 1000) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
            const cutoffISO = cutoffDate.toISOString();

            // First, get count of articles to archive
            const countResult = await dbConnection.getPrepared('articles.countForArchival', [cutoffISO]);
            const totalToArchive = countResult.count;

            if (totalToArchive === 0) {
                return { 
                    success: true, 
                    archivedCount: 0, 
                    totalToArchive: 0,
                    message: 'No articles found for archival' 
                };
            }

            // Get articles to archive in batches
            const articlesToArchive = await dbConnection.allPrepared('articles.getForArchival', [cutoffISO]);
            const batchesToProcess = Math.min(articlesToArchive.length, maxBatchSize);
            
            let archivedCount = 0;
            const errors = [];

            // Process in transaction for consistency
            await dbConnection.transaction(async () => {
                for (let i = 0; i < batchesToProcess; i++) {
                    const article = articlesToArchive[i];
                    try {
                        const archiveResult = await dbConnection.runPrepared('articles.archiveById', ['retention_policy', article.id]);
                        
                        if (archiveResult.changes > 0) {
                            const deleteResult = await dbConnection.runPrepared('articles.deleteAfterArchive', [article.id]);
                            if (deleteResult.changes > 0) {
                                archivedCount++;
                            }
                        }
                    } catch (error) {
                        errors.push({ articleId: article.id, title: article.title, error: error.message });
                    }
                }
            });

            return {
                success: errors.length === 0,
                archivedCount,
                totalToArchive,
                processed: batchesToProcess,
                remaining: totalToArchive - batchesToProcess,
                errors: errors.length > 0 ? errors : undefined,
                retentionDays,
                cutoffDate: cutoffISO
            };
        },

        // Get archived articles with pagination
        async getArchivedArticles(limit = 50, offset = 0) {
            const articles = await dbConnection.allPrepared('archived_articles.getAll', [limit, offset]);
            const totalCount = await dbConnection.getPrepared('archived_articles.count', []);
            
            return {
                articles,
                pagination: {
                    limit,
                    offset,
                    total: totalCount.count,
                    hasMore: offset + limit < totalCount.count
                }
            };
        },

        // Get archived articles for a specific feed
        async getArchivedArticlesByFeed(feedId, limit = 50, offset = 0) {
            const articles = await dbConnection.allPrepared('archived_articles.getByFeed', [feedId, limit, offset]);
            const totalCount = await dbConnection.getPrepared('archived_articles.countByFeed', [feedId]);
            
            return {
                articles,
                pagination: {
                    limit,
                    offset,
                    total: totalCount.count,
                    hasMore: offset + limit < totalCount.count
                }
            };
        },

        // Restore an archived article back to the main articles table
        async restoreArticle(archivedArticleId) {
            const result = await dbConnection.transaction(async () => {
                // First, restore the article to main table
                const restoreResult = await dbConnection.runPrepared('archived_articles.restore', [archivedArticleId]);
                
                if (restoreResult.changes > 0) {
                    // Then delete from archive table
                    const deleteResult = await dbConnection.runPrepared('archived_articles.deleteAfterRestore', [archivedArticleId]);
                    return { success: deleteResult.changes > 0, restoredId: restoreResult.lastID };
                }
                
                return { success: false, error: 'Failed to restore article - may already exist in main table' };
            });
            
            return result;
        },

        // Permanently delete old archived articles
        async deleteOldArchivedArticles(archiveRetentionDays = 365) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - archiveRetentionDays);
            const cutoffISO = cutoffDate.toISOString();

            const result = await dbConnection.runPrepared('archived_articles.deleteOld', [cutoffISO]);
            
            return {
                success: true,
                deletedCount: result.changes,
                archiveRetentionDays,
                cutoffDate: cutoffISO
            };
        },

        // Get archive statistics
        async getArchiveStats() {
            const stats = await dbConnection.get(`
                SELECT 
                    (SELECT COUNT(*) FROM archived_articles) as totalArchived,
                    (SELECT COUNT(*) FROM archived_articles WHERE archiveReason = 'retention_policy') as autoArchived,
                    (SELECT COUNT(*) FROM archived_articles WHERE archiveReason = 'manual') as manuallyArchived,
                    (SELECT COUNT(*) FROM archived_articles WHERE archiveReason = 'batch_archive') as batchArchived,
                    (SELECT COUNT(*) FROM archived_articles WHERE archivedAt > datetime('now', '-7 days')) as archivedLastWeek,
                    (SELECT COUNT(*) FROM archived_articles WHERE archivedAt > datetime('now', '-30 days')) as archivedLastMonth,
                    (SELECT MIN(archivedAt) FROM archived_articles) as oldestArchive,
                    (SELECT MAX(archivedAt) FROM archived_articles) as newestArchive
            `);
            
            // Get archive size by feed
            const feedStats = await dbConnection.all(`
                SELECT 
                    feedId,
                    COUNT(*) as archivedCount,
                    MIN(archivedAt) as oldestArchived,
                    MAX(archivedAt) as newestArchived
                FROM archived_articles 
                GROUP BY feedId 
                ORDER BY archivedCount DESC
            `);
            
            return {
                ...stats,
                feedBreakdown: feedStats
            };
        },

        // Clean up orphaned archives (archives for feeds that no longer exist)
        async cleanupOrphanedArchives() {
            const result = await dbConnection.run(`
                DELETE FROM archived_articles 
                WHERE feedId NOT IN (SELECT id FROM feeds)
            `);
            
            return {
                success: true,
                deletedCount: result.changes
            };
        },

        // Search archived articles
        async searchArchivedArticles(query, limit = 50, offset = 0) {
            const searchTerm = `%${query}%`;
            
            const articles = await dbConnection.all(`
                SELECT * FROM archived_articles 
                WHERE title LIKE ? OR content LIKE ? OR summary LIKE ?
                ORDER BY archivedAt DESC 
                LIMIT ? OFFSET ?
            `, [searchTerm, searchTerm, searchTerm, limit, offset]);
            
            const totalCount = await dbConnection.get(`
                SELECT COUNT(*) as count FROM archived_articles 
                WHERE title LIKE ? OR content LIKE ? OR summary LIKE ?
            `, [searchTerm, searchTerm, searchTerm]);
            
            return {
                articles,
                query,
                pagination: {
                    limit,
                    offset,
                    total: totalCount.count,
                    hasMore: offset + limit < totalCount.count
                }
            };
        },

        // Get archive size and storage information
        async getArchiveSize() {
            const result = await dbConnection.get(`
                SELECT 
                    COUNT(*) as articleCount,
                    SUM(LENGTH(content)) as totalContentSize,
                    SUM(LENGTH(summary)) as totalSummarySize,
                    AVG(LENGTH(content)) as avgContentSize,
                    AVG(LENGTH(summary)) as avgSummarySize
                FROM archived_articles
            `);
            
            return {
                ...result,
                totalSizeBytes: (result.totalContentSize || 0) + (result.totalSummarySize || 0),
                estimatedSizeMB: Math.round(((result.totalContentSize || 0) + (result.totalSummarySize || 0)) / 1024 / 1024 * 100) / 100
            };
        },

        // Advanced cleanup utilities

        // Clean up articles by status and age
        async cleanupByStatus(status, ageDays, maxItems = 1000) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - ageDays);
            const cutoffISO = cutoffDate.toISOString();

            const result = await dbConnection.run(`
                DELETE FROM articles 
                WHERE status = ? AND createdAt < ?
                LIMIT ?
            `, [status, cutoffISO, maxItems]);
            
            return {
                success: true,
                deletedCount: result.changes,
                status,
                ageDays,
                cutoffDate: cutoffISO
            };
        },

        // Clean up failed articles older than specified days
        async cleanupFailedArticles(ageDays = 7) {
            return await this.cleanupByStatus('failed', ageDays);
        },

        // Clean up articles with empty or minimal content
        async cleanupEmptyContent(dryRun = false) {
            const query = `
                SELECT id, title, content, summary 
                FROM articles 
                WHERE (content IS NULL OR LENGTH(TRIM(content)) < 50) 
                AND (summary IS NULL OR LENGTH(TRIM(summary)) < 20)
                AND createdAt < datetime('now', '-7 days')
                LIMIT 1000
            `;

            const emptyArticles = await dbConnection.all(query);
            
            if (dryRun) {
                return {
                    success: true,
                    dryRun: true,
                    candidatesFound: emptyArticles.length,
                    estimatedCleanup: emptyArticles.length
                };
            }

            if (emptyArticles.length === 0) {
                return {
                    success: true,
                    deletedCount: 0,
                    message: 'No empty content articles found'
                };
            }

            const articleIds = emptyArticles.map(a => a.id);
            const result = await this.archiveArticles(articleIds, 'empty_content_cleanup');
            
            return {
                success: result.success,
                archivedCount: result.archivedCount,
                reason: 'empty_content_cleanup',
                candidatesFound: emptyArticles.length
            };
        },

        // Clean up duplicate archived articles (same URL)
        async cleanupDuplicateArchives(dryRun = false) {
            const duplicatesQuery = `
                SELECT link, COUNT(*) as count, GROUP_CONCAT(id) as ids
                FROM archived_articles 
                WHERE link IS NOT NULL AND link != ''
                GROUP BY link 
                HAVING count > 1
                ORDER BY count DESC
            `;

            const duplicateGroups = await dbConnection.all(duplicatesQuery);
            
            if (dryRun) {
                const totalDuplicates = duplicateGroups.reduce((sum, group) => sum + group.count - 1, 0);
                return {
                    success: true,
                    dryRun: true,
                    duplicateGroups: duplicateGroups.length,
                    totalDuplicates
                };
            }

            let deletedCount = 0;
            
            for (const group of duplicateGroups) {
                const ids = group.ids.split(',').map(id => parseInt(id));
                // Keep the first (oldest) and delete the rest
                const toDelete = ids.slice(1);
                
                if (toDelete.length > 0) {
                    const result = await dbConnection.run(`
                        DELETE FROM archived_articles 
                        WHERE id IN (${toDelete.map(() => '?').join(',')})
                    `, toDelete);
                    
                    deletedCount += result.changes;
                }
            }
            
            return {
                success: true,
                deletedCount,
                duplicateGroups: duplicateGroups.length,
                reason: 'duplicate_cleanup'
            };
        },

        // Comprehensive database vacuum and optimization
        async optimizeDatabase() {
            const startTime = Date.now();
            
            try {
                // Get size before optimization
                const sizeBefore = await this.getDatabaseSize();
                
                // Run VACUUM to reclaim space
                await dbConnection.run('VACUUM');
                
                // Update statistics
                await dbConnection.run('ANALYZE');
                
                // Rebuild indexes
                await dbConnection.run('REINDEX');
                
                // Get size after optimization
                const sizeAfter = await this.getDatabaseSize();
                
                return {
                    success: true,
                    duration: Date.now() - startTime,
                    sizeBefore,
                    sizeAfter,
                    spaceReclaimed: sizeBefore - sizeAfter,
                    operations: ['vacuum', 'analyze', 'reindex']
                };
            } catch (error) {
                return {
                    success: false,
                    error: error.message,
                    duration: Date.now() - startTime
                };
            }
        },

        // Get database file size
        async getDatabaseSize() {
            try {
                const fs = require('fs');
                const path = require('path');
                const dbPath = path.join(__dirname, '../../../news-aggregator.db');
                const stats = fs.statSync(dbPath);
                return stats.size;
            } catch {
                return 0;
            }
        },

        // Clean up old feed metadata for deleted feeds
        async cleanupOrphanedMetadata() {
            const result = await dbConnection.run(`
                DELETE FROM feed_metadata 
                WHERE feedId NOT IN (SELECT id FROM feeds)
            `);
            
            return {
                success: true,
                deletedCount: result.changes,
                reason: 'orphaned_metadata_cleanup'
            };
        },

        // Comprehensive cleanup with multiple strategies
        async runComprehensiveCleanup(options = {}) {
            const {
                includeFailedArticles = true,
                includeEmptyContent = true,
                includeDuplicateArchives = true,
                includeOrphanedMetadata = true,
                includeDbOptimization = true,
                failedArticleAge = 7,
                dryRun = false
            } = options;

            const results = {
                timestamp: new Date().toISOString(),
                dryRun,
                operations: []
            };

            try {
                // Clean up failed articles
                if (includeFailedArticles) {
                    const failedResult = await this.cleanupFailedArticles(failedArticleAge);
                    results.operations.push({
                        type: 'failed_articles',
                        ...failedResult
                    });
                }

                // Clean up empty content
                if (includeEmptyContent) {
                    const emptyResult = await this.cleanupEmptyContent(dryRun);
                    results.operations.push({
                        type: 'empty_content',
                        ...emptyResult
                    });
                }

                // Clean up duplicate archives
                if (includeDuplicateArchives) {
                    const duplicateResult = await this.cleanupDuplicateArchives(dryRun);
                    results.operations.push({
                        type: 'duplicate_archives',
                        ...duplicateResult
                    });
                }

                // Clean up orphaned metadata
                if (includeOrphanedMetadata && !dryRun) {
                    const metadataResult = await this.cleanupOrphanedMetadata();
                    results.operations.push({
                        type: 'orphaned_metadata',
                        ...metadataResult
                    });
                }

                // Optimize database
                if (includeDbOptimization && !dryRun) {
                    const optimizeResult = await this.optimizeDatabase();
                    results.operations.push({
                        type: 'database_optimization',
                        ...optimizeResult
                    });
                }

                // Calculate totals
                results.summary = {
                    totalOperations: results.operations.length,
                    totalDeleted: results.operations.reduce((sum, op) => sum + (op.deletedCount || op.archivedCount || 0), 0),
                    totalErrors: results.operations.filter(op => !op.success).length,
                    spaceReclaimed: results.operations.find(op => op.type === 'database_optimization')?.spaceReclaimed || 0
                };

                results.success = results.summary.totalErrors === 0;

            } catch (error) {
                results.success = false;
                results.error = error.message;
            }

            return results;
        }
    };
};

module.exports = { ArchiveOperations };