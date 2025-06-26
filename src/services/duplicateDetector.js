// duplicateDetector.js - Service for detecting and managing duplicate articles
class DuplicateDetector {
    constructor(dbService) {
        this.dbService = dbService;
        this.similarityThreshold = 0.85; // 85% similarity threshold
        this.titleSimilarityThreshold = 0.9; // 90% for title similarity
        this.urlDomainWeight = 0.3; // Weight for same domain URLs
    }

    // Find duplicate articles across all feeds
    async findDuplicates(options = {}) {
        const {
            feedIds = null,
            similarity = this.similarityThreshold,
            includeArchived = false,
            maxAge = null // Days to look back
        } = options;

        console.log('[DuplicateDetector] Scanning for duplicate articles...');
        const startTime = Date.now();

        try {
            await this.dbService.initialize();
            
            // Get articles to analyze
            const articles = await this.getArticlesForAnalysis({ feedIds, includeArchived, maxAge });
            
            if (articles.length < 2) {
                return {
                    success: true,
                    duplicateGroups: [],
                    totalArticles: articles.length,
                    duplicatesFound: 0,
                    duration: Date.now() - startTime
                };
            }

            console.log(`[DuplicateDetector] Analyzing ${articles.length} articles for duplicates...`);

            // Find duplicate groups
            const duplicateGroups = await this.findDuplicateGroups(articles, similarity);
            const totalDuplicates = duplicateGroups.reduce((sum, group) => sum + group.articles.length - 1, 0);

            console.log(`[DuplicateDetector] Found ${duplicateGroups.length} duplicate groups with ${totalDuplicates} duplicates`);

            return {
                success: true,
                duplicateGroups: duplicateGroups.map(group => ({
                    ...group,
                    articles: group.articles.map(article => ({
                        id: article.id,
                        title: article.title,
                        link: article.link,
                        feedName: article.feedName,
                        pubDate: article.pubDate,
                        similarity: article.similarity,
                        isPrimary: article.isPrimary,
                        duplicateReasons: article.duplicateReasons
                    }))
                })),
                totalArticles: articles.length,
                duplicatesFound: totalDuplicates,
                duration: Date.now() - startTime,
                threshold: similarity
            };

        } catch (error) {
            console.error('[DuplicateDetector] Error finding duplicates:', error);
            return {
                success: false,
                error: error.message,
                duration: Date.now() - startTime
            };
        }
    }

    // Get articles for duplicate analysis
    async getArticlesForAnalysis(options) {
        const { feedIds, includeArchived, maxAge } = options;
        let articles = [];

        // Get main articles
        if (feedIds && feedIds.length > 0) {
            for (const feedId of feedIds) {
                const feedArticles = await this.dbService.articles.getByFeedId(feedId);
                const feed = await this.getFeedInfo(feedId);
                feedArticles.forEach(article => {
                    article.feedName = feed.name || feed.displayName || 'Unknown Feed';
                    articles.push(article);
                });
            }
        } else {
            // Get all articles from all feeds
            const allFeeds = await this.dbService.feeds.getAll();
            for (const feed of allFeeds) {
                const feedArticles = await this.dbService.articles.getByFeedId(feed.id);
                feedArticles.forEach(article => {
                    article.feedName = feed.name || feed.displayName || 'Unknown Feed';
                    articles.push(article);
                });
            }
        }

        // Include archived articles if requested
        if (includeArchived && this.dbService.archive) {
            const archived = await this.dbService.archive.getArchivedArticles(10000, 0); // Get all archived
            if (archived.articles) {
                archived.articles.forEach(article => {
                    article.feedName = article.feedName || 'Archived';
                    article.isArchived = true;
                    articles.push(article);
                });
            }
        }

        // Filter by age if specified
        if (maxAge) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - maxAge);
            articles = articles.filter(article => {
                const articleDate = new Date(article.pubDate || article.createdAt);
                return articleDate >= cutoffDate;
            });
        }

        // Filter out articles without titles or content
        articles = articles.filter(article => 
            article.title && article.title.trim().length > 0
        );

        return articles;
    }

    // Find duplicate groups using multiple algorithms
    async findDuplicateGroups(articles, threshold) {
        const groups = [];
        const processed = new Set();

        for (let i = 0; i < articles.length; i++) {
            if (processed.has(articles[i].id)) continue;

            const baseArticle = articles[i];
            const duplicates = [baseArticle];
            
            for (let j = i + 1; j < articles.length; j++) {
                if (processed.has(articles[j].id)) continue;

                const compareArticle = articles[j];
                const similarity = this.calculateSimilarity(baseArticle, compareArticle);

                if (similarity.overall >= threshold) {
                    compareArticle.similarity = similarity.overall;
                    compareArticle.duplicateReasons = similarity.reasons;
                    duplicates.push(compareArticle);
                    processed.add(compareArticle.id);
                }
            }

            if (duplicates.length > 1) {
                // Mark the primary article (usually the oldest or from most reliable source)
                const primary = this.selectPrimaryArticle(duplicates);
                duplicates.forEach(article => {
                    article.isPrimary = article.id === primary.id;
                });

                groups.push({
                    groupId: `group_${i}_${Date.now()}`,
                    primaryArticle: primary,
                    articles: duplicates,
                    duplicateCount: duplicates.length - 1,
                    averageSimilarity: duplicates.reduce((sum, a) => sum + (a.similarity || 1), 0) / duplicates.length,
                    detectionMethod: 'similarity_analysis'
                });

                processed.add(baseArticle.id);
            }
        }

        return groups;
    }

    // Calculate similarity between two articles
    calculateSimilarity(article1, article2) {
        const reasons = [];
        let scores = [];

        // 1. Exact URL match (100% similarity)
        if (article1.link && article2.link && article1.link === article2.link) {
            return {
                overall: 1.0,
                reasons: ['exact_url_match'],
                scores: { url: 1.0 }
            };
        }

        // 2. Title similarity
        const titleSim = this.calculateTextSimilarity(
            this.normalizeText(article1.title),
            this.normalizeText(article2.title)
        );
        scores.push({ weight: 0.4, score: titleSim });
        if (titleSim >= this.titleSimilarityThreshold) {
            reasons.push('similar_title');
        }

        // 3. Content similarity (if available)
        let contentSim = 0;
        if (article1.content && article2.content) {
            contentSim = this.calculateTextSimilarity(
                this.normalizeText(article1.content),
                this.normalizeText(article2.content)
            );
            scores.push({ weight: 0.3, score: contentSim });
            if (contentSim >= 0.8) {
                reasons.push('similar_content');
            }
        }

        // 4. Summary similarity (if available)
        let summarySim = 0;
        if (article1.summary && article2.summary) {
            summarySim = this.calculateTextSimilarity(
                this.normalizeText(article1.summary),
                this.normalizeText(article2.summary)
            );
            scores.push({ weight: 0.2, score: summarySim });
            if (summarySim >= 0.8) {
                reasons.push('similar_summary');
            }
        }

        // 5. URL domain similarity
        let domainSim = 0;
        if (article1.link && article2.link) {
            const domain1 = this.extractDomain(article1.link);
            const domain2 = this.extractDomain(article2.link);
            domainSim = domain1 === domain2 ? 1.0 : 0.0;
            scores.push({ weight: this.urlDomainWeight, score: domainSim });
            if (domainSim === 1.0) {
                reasons.push('same_domain');
            }
        }

        // 6. Publication date proximity
        let dateSim = 0;
        if (article1.pubDate && article2.pubDate) {
            const date1 = new Date(article1.pubDate);
            const date2 = new Date(article2.pubDate);
            const daysDiff = Math.abs(date1 - date2) / (1000 * 60 * 60 * 24);
            dateSim = Math.max(0, 1 - daysDiff / 7); // 7-day window
            scores.push({ weight: 0.1, score: dateSim });
            if (daysDiff <= 1) {
                reasons.push('similar_date');
            }
        }

        // Calculate weighted average
        const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
        const weightedScore = scores.reduce((sum, s) => sum + (s.score * s.weight), 0) / totalWeight;

        return {
            overall: Math.round(weightedScore * 100) / 100,
            reasons,
            scores: {
                title: titleSim,
                content: contentSim,
                summary: summarySim,
                domain: domainSim,
                date: dateSim
            }
        };
    }

    // Calculate text similarity using simple algorithm
    calculateTextSimilarity(text1, text2) {
        if (!text1 || !text2) return 0;
        
        // Simple word-based similarity
        const words1 = new Set(text1.toLowerCase().split(/\s+/));
        const words2 = new Set(text2.toLowerCase().split(/\s+/));
        
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        
        return intersection.size / union.size;
    }

    // Normalize text for comparison
    normalizeText(text) {
        if (!text) return '';
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Extract domain from URL
    extractDomain(url) {
        try {
            return new URL(url).hostname.replace(/^www\./, '');
        } catch {
            return '';
        }
    }

    // Select primary article from duplicates
    selectPrimaryArticle(duplicates) {
        // Priority: oldest article, then most content, then best summary
        return duplicates.reduce((primary, current) => {
            const primaryDate = new Date(primary.pubDate || primary.createdAt || 0);
            const currentDate = new Date(current.pubDate || current.createdAt || 0);
            
            // Prefer older articles
            if (currentDate < primaryDate) return current;
            if (currentDate > primaryDate) return primary;
            
            // If same date, prefer more content
            const primaryContent = (primary.content || '').length + (primary.summary || '').length;
            const currentContent = (current.content || '').length + (current.summary || '').length;
            
            return currentContent > primaryContent ? current : primary;
        });
    }

    // Merge duplicate articles
    async mergeDuplicates(groupId, keepArticleId, deleteArticleIds, mergeOptions = {}) {
        const {
            mergeSummaries = true,
            mergeContent = false,
            preserveReadStatus = true
        } = mergeOptions;

        console.log(`[DuplicateDetector] Merging duplicates for group ${groupId}...`);
        
        try {
            await this.dbService.initialize();
            
            const keepArticle = await this.dbService.articles.getById(keepArticleId);
            if (!keepArticle) {
                throw new Error('Primary article not found');
            }

            let mergedContent = keepArticle.content || '';
            let mergedSummary = keepArticle.summary || '';
            let wasRead = keepArticle.isRead;

            // Merge content from duplicates
            for (const deleteId of deleteArticleIds) {
                const duplicate = await this.dbService.articles.getById(deleteId);
                if (!duplicate) continue;

                if (mergeContent && duplicate.content && !mergedContent.includes(duplicate.content)) {
                    mergedContent += '\n\n---\n\n' + duplicate.content;
                }

                if (mergeSummaries && duplicate.summary && !mergedSummary.includes(duplicate.summary)) {
                    if (mergedSummary) {
                        mergedSummary += '\n\n' + duplicate.summary;
                    } else {
                        mergedSummary = duplicate.summary;
                    }
                }

                if (preserveReadStatus && duplicate.isRead) {
                    wasRead = true;
                }
            }

            // Update the primary article with merged content
            const updateData = {};
            if (mergeContent && mergedContent !== keepArticle.content) {
                updateData.content = mergedContent;
            }
            if (mergeSummaries && mergedSummary !== keepArticle.summary) {
                updateData.summary = mergedSummary;
            }
            if (preserveReadStatus && wasRead !== keepArticle.isRead) {
                updateData.isRead = wasRead;
            }

            if (Object.keys(updateData).length > 0) {
                // Update article using available methods
                if (updateData.summary) {
                    await this.dbService.articles.updateStatus(keepArticleId, keepArticle.status, updateData.summary);
                }
                if (updateData.isRead) {
                    await this.dbService.articles.markAsRead(keepArticleId);
                }
            }

            // Archive or delete the duplicates
            const archiveResult = await this.dbService.archive.archiveArticles(deleteArticleIds, 'duplicate_merge');

            return {
                success: true,
                mergedArticleId: keepArticleId,
                deletedCount: archiveResult.archivedCount,
                mergedData: updateData,
                groupId
            };

        } catch (error) {
            console.error('[DuplicateDetector] Merge failed:', error);
            return {
                success: false,
                error: error.message,
                groupId
            };
        }
    }

    // Auto-merge obvious duplicates
    async autoMergeDuplicates(options = {}) {
        const {
            maxAge = 7, // Only auto-merge articles from last 7 days
            confidence = 0.95, // High confidence threshold for auto-merge
            dryRun = false
        } = options;

        console.log('[DuplicateDetector] Running auto-merge for obvious duplicates...');
        
        const duplicateResult = await this.findDuplicates({ 
            similarity: confidence, 
            maxAge 
        });

        if (!duplicateResult.success) {
            return duplicateResult;
        }

        const autoMergeGroups = duplicateResult.duplicateGroups.filter(group => 
            group.averageSimilarity >= confidence && 
            group.articles.some(a => a.duplicateReasons.includes('exact_url_match') || 
                                   a.duplicateReasons.includes('similar_title'))
        );

        if (dryRun) {
            return {
                success: true,
                dryRun: true,
                candidateGroups: autoMergeGroups.length,
                totalDuplicates: autoMergeGroups.reduce((sum, g) => sum + g.duplicateCount, 0)
            };
        }

        let mergedGroups = 0;
        let totalMerged = 0;
        const errors = [];

        for (const group of autoMergeGroups) {
            const primaryId = group.primaryArticle.id;
            const duplicateIds = group.articles.filter(a => !a.isPrimary).map(a => a.id);
            
            const mergeResult = await this.mergeDuplicates(group.groupId, primaryId, duplicateIds, {
                mergeSummaries: true,
                mergeContent: false,
                preserveReadStatus: true
            });

            if (mergeResult.success) {
                mergedGroups++;
                totalMerged += duplicateIds.length;
            } else {
                errors.push({
                    groupId: group.groupId,
                    error: mergeResult.error
                });
            }
        }

        return {
            success: errors.length === 0,
            mergedGroups,
            totalMerged,
            errors: errors.length > 0 ? errors : undefined,
            candidateGroups: autoMergeGroups.length
        };
    }

    // Utility method to get feed info
    async getFeedInfo(feedId) {
        try {
            if (this.dbService.feeds.getById) {
                return await this.dbService.feeds.getById(feedId);
            } else {
                const allFeeds = await this.dbService.feeds.getAll();
                return allFeeds.find(f => f.id === feedId) || { name: 'Unknown Feed' };
            }
        } catch {
            return { name: 'Unknown Feed' };
        }
    }

    // Get duplicate detection statistics
    async getStatistics() {
        try {
            await this.dbService.initialize();
            
            // Get recent duplicates scan
            const recentDuplicates = await this.findDuplicates({ maxAge: 30 });
            
            const stats = await this.dbService.getStats();
            
            return {
                ...recentDuplicates,
                totalArticles: stats.articleCount,
                duplicatePercentage: stats.articleCount > 0 ? 
                    Math.round((recentDuplicates.duplicatesFound / stats.articleCount) * 100) : 0,
                configuration: {
                    similarityThreshold: this.similarityThreshold,
                    titleSimilarityThreshold: this.titleSimilarityThreshold,
                    urlDomainWeight: this.urlDomainWeight
                }
            };
        } catch (error) {
            return { error: error.message };
        }
    }
}

module.exports = { DuplicateDetector };