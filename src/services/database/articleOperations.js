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

        // Search articles using full-text search
        async search(query, options = {}) {
            const limit = options.limit || 50;
            const sanitizedQuery = query.trim().replace(/['"]/g, '');
            
            if (!sanitizedQuery) {
                return [];
            }

            // Build FTS5 query - supports phrase queries, AND/OR operators
            let ftsQuery = sanitizedQuery;
            
            // If it contains multiple words without operators, treat as phrase search
            if (sanitizedQuery.includes(' ') && !sanitizedQuery.match(/\b(AND|OR|NOT)\b/i)) {
                ftsQuery = `"${sanitizedQuery}"`;
            }

            try {
                return await dbConnection.allPrepared('articles.search', [ftsQuery, limit]);
            } catch (error) {
                console.error('Search error:', error.message);
                // Fallback to simple term search if phrase search fails
                try {
                    const termQuery = sanitizedQuery.split(' ').join(' AND ');
                    return await dbConnection.allPrepared('articles.search', [termQuery, limit]);
                } catch (fallbackError) {
                    console.error('Fallback search error:', fallbackError.message);
                    return [];
                }
            }
        },

        // Advanced search with filters
        async searchWithFilters(query, filters = {}) {
            const limit = filters.limit || 50;
            const sanitizedQuery = query ? query.trim().replace(/['"]/g, '') : '';
            
            let sql, params;
            
            if (sanitizedQuery) {
                // Full-text search with filters
                let ftsQuery = sanitizedQuery;
                if (sanitizedQuery.includes(' ') && !sanitizedQuery.match(/\b(AND|OR|NOT)\b/i)) {
                    ftsQuery = `"${sanitizedQuery}"`;
                }
                
                sql = `SELECT a.*, f.name as feedName, f.displayName as feedDisplayName,
                       COALESCE(f.displayName, f.name) as feedNameDisplay,
                       snippet(articles_fts, 1, '<mark>', '</mark>', '...', 32) as titleSnippet,
                       snippet(articles_fts, 2, '<mark>', '</mark>', '...', 64) as contentSnippet,
                       snippet(articles_fts, 3, '<mark>', '</mark>', '...', 32) as summarySnippet,
                       bm25(articles_fts) as relevance
                       FROM articles_fts 
                       JOIN articles a ON a.id = articles_fts.article_id
                       JOIN feeds f ON f.id = a.feedId
                       WHERE articles_fts MATCH ?`;
                params = [ftsQuery];
            } else {
                // Filter-only search
                sql = `SELECT a.*, f.name as feedName, f.displayName as feedDisplayName,
                       COALESCE(f.displayName, f.name) as feedNameDisplay,
                       null as titleSnippet, null as contentSnippet, null as summarySnippet,
                       0 as relevance
                       FROM articles a
                       JOIN feeds f ON f.id = a.feedId
                       WHERE 1=1`;
                params = [];
            }

            // Add filters
            if (filters.feedIds && filters.feedIds.length > 0) {
                const placeholders = filters.feedIds.map(() => '?').join(',');
                sql += ` AND a.feedId IN (${placeholders})`;
                params.push(...filters.feedIds);
            }

            if (filters.isRead !== undefined) {
                sql += ` AND a.isRead = ?`;
                params.push(filters.isRead ? 1 : 0);
            }

            if (filters.status) {
                sql += ` AND a.status = ?`;
                params.push(filters.status);
            }

            if (filters.dateFrom) {
                sql += ` AND a.pubDate >= ?`;
                params.push(filters.dateFrom);
            }

            if (filters.dateTo) {
                sql += ` AND a.pubDate <= ?`;
                params.push(filters.dateTo);
            }

            // Add ordering
            if (sanitizedQuery) {
                sql += ` ORDER BY relevance, a.pubDate DESC`;
            } else {
                sql += ` ORDER BY a.pubDate DESC`;
            }

            sql += ` LIMIT ?`;
            params.push(limit);

            try {
                return await dbConnection.all(sql, params);
            } catch (error) {
                console.error('Advanced search error:', error.message);
                return [];
            }
        },

        // Get search suggestions based on article titles and feed names
        async getSearchSuggestions(partialQuery, limit = 10) {
            if (!partialQuery || partialQuery.length < 2) {
                return [];
            }

            const query = `${partialQuery}*`; // Prefix search
            
            try {
                const results = await dbConnection.all(`
                    SELECT DISTINCT 
                        CASE 
                            WHEN title LIKE ? THEN title
                            WHEN feed_name LIKE ? THEN feed_name
                            ELSE substr(title, 1, 50) || '...'
                        END as suggestion,
                        'article' as type
                    FROM articles_fts 
                    WHERE articles_fts MATCH ?
                    LIMIT ?
                `, [`%${partialQuery}%`, `%${partialQuery}%`, query, limit]);
                
                return results;
            } catch (error) {
                console.error('Search suggestions error:', error.message);
                return [];
            }
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