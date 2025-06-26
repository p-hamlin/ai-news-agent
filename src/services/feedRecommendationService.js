// feedRecommendationService.js - Feed recommendation system based on content analysis
class FeedRecommendationService {
    constructor(dbService) {
        this.dbService = dbService;
        this.similarityThreshold = 0.3; // Minimum similarity for recommendations
        this.maxRecommendations = 10; // Maximum recommendations to return
        
        // Common news feed suggestions (high-quality sources)
        this.suggestedFeeds = [
            { name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'Technology' },
            { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'Technology' },
            { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', category: 'Technology' },
            { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/topnews.rss', category: 'Technology' },
            { name: 'Wired', url: 'https://www.wired.com/feed/rss', category: 'Technology' },
            { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'Technology' },
            { name: 'BBC News - Technology', url: 'http://feeds.bbci.co.uk/news/technology/rss.xml', category: 'Technology' },
            { name: 'Reuters - Technology', url: 'https://feeds.reuters.com/reuters/technologyNews', category: 'Technology' },
            { name: 'BBC News', url: 'http://feeds.bbci.co.uk/news/rss.xml', category: 'General News' },
            { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', category: 'General News' },
            { name: 'Reuters', url: 'https://feeds.reuters.com/reuters/topNews', category: 'General News' },
            { name: 'Associated Press', url: 'https://feeds.apnews.com/ApNews/World', category: 'General News' },
            { name: 'Scientific American', url: 'https://rss.sciam.com/ScientificAmerican-Global', category: 'Science' },
            { name: 'Nature News', url: 'https://www.nature.com/nature.rss', category: 'Science' },
            { name: 'Science Magazine', url: 'https://www.science.org/rss/news_current.xml', category: 'Science' },
            { name: 'New Scientist', url: 'https://www.newscientist.com/feed/home/', category: 'Science' }
        ];
    }

    // Get feed recommendations based on existing content
    async getRecommendations(options = {}) {
        const {
            basedOnFeeds = [], // Specific feeds to base recommendations on
            excludeExisting = true, // Exclude feeds already subscribed
            includePopular = true, // Include popular feed suggestions
            maxResults = this.maxRecommendations
        } = options;

        console.log('[FeedRecommendation] Generating feed recommendations...');
        const startTime = Date.now();

        try {
            await this.dbService.initialize();

            const recommendations = [];

            // Get content-based recommendations
            if (basedOnFeeds.length > 0 || basedOnFeeds.length === 0) {
                const contentRecs = await this.getContentBasedRecommendations(basedOnFeeds);
                recommendations.push(...contentRecs);
            }

            // Add popular/suggested feeds
            if (includePopular) {
                const popularRecs = await this.getPopularFeedSuggestions(excludeExisting);
                recommendations.push(...popularRecs);
            }

            // Remove duplicates and existing feeds if requested
            let filteredRecs = this.removeDuplicateRecommendations(recommendations);

            if (excludeExisting) {
                filteredRecs = await this.filterExistingFeeds(filteredRecs);
            }

            // Sort by relevance score and limit results
            const sortedRecs = filteredRecs
                .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
                .slice(0, maxResults);

            return {
                success: true,
                recommendations: sortedRecs,
                totalFound: filteredRecs.length,
                duration: Date.now() - startTime,
                basedOnFeeds: basedOnFeeds.length,
                criteria: {
                    excludeExisting,
                    includePopular,
                    maxResults
                }
            };

        } catch (error) {
            console.error('[FeedRecommendation] Error generating recommendations:', error);
            return {
                success: false,
                error: error.message,
                duration: Date.now() - startTime
            };
        }
    }

    // Get content-based recommendations using article analysis
    async getContentBasedRecommendations(feedIds = []) {
        const recommendations = [];

        try {
            // Get articles from specified feeds or all feeds
            let articlesToAnalyze = [];
            
            if (feedIds.length > 0) {
                for (const feedId of feedIds) {
                    const articles = await this.dbService.articles.getByFeedId(feedId);
                    articlesToAnalyze.push(...articles);
                }
            } else {
                // Analyze recent articles from all feeds
                const recentArticles = await this.dbService.articles.getRecent(100);
                articlesToAnalyze = recentArticles;
            }

            if (articlesToAnalyze.length === 0) {
                return [];
            }

            // Extract keywords and topics from articles
            const contentProfile = this.analyzeContentProfile(articlesToAnalyze);

            // Generate recommendations based on content profile
            const contentBasedRecs = this.generateContentBasedSuggestions(contentProfile);
            
            recommendations.push(...contentBasedRecs);

        } catch (error) {
            console.warn('[FeedRecommendation] Content analysis failed:', error.message);
        }

        return recommendations;
    }

    // Analyze content to create a profile of interests
    analyzeContentProfile(articles) {
        const keywords = new Map();
        const topics = new Map();
        let totalWords = 0;

        articles.forEach(article => {
            // Analyze title and summary for keywords
            const text = `${article.title || ''} ${article.summary || ''}`.toLowerCase();
            const words = text.match(/\b\w{3,}\b/g) || [];
            
            words.forEach(word => {
                if (!this.isStopWord(word)) {
                    keywords.set(word, (keywords.get(word) || 0) + 1);
                    totalWords++;
                }
            });

            // Identify topics based on common patterns
            const articleTopics = this.identifyTopics(text);
            articleTopics.forEach(topic => {
                topics.set(topic, (topics.get(topic) || 0) + 1);
            });
        });

        // Calculate keyword weights
        const keywordProfile = Array.from(keywords.entries())
            .map(([word, count]) => ({
                word,
                weight: count / totalWords,
                frequency: count
            }))
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 20); // Top 20 keywords

        const topicProfile = Array.from(topics.entries())
            .map(([topic, count]) => ({
                topic,
                weight: count / articles.length,
                frequency: count
            }))
            .sort((a, b) => b.weight - a.weight);

        return {
            keywords: keywordProfile,
            topics: topicProfile,
            articleCount: articles.length
        };
    }

    // Generate feed suggestions based on content profile
    generateContentBasedSuggestions(contentProfile) {
        const suggestions = [];

        // Match suggested feeds to content profile
        this.suggestedFeeds.forEach(feed => {
            let relevanceScore = 0;

            // Check topic relevance
            contentProfile.topics.forEach(({ topic, weight }) => {
                if (this.feedMatchesTopic(feed, topic)) {
                    relevanceScore += weight * 0.7; // Topic match is highly weighted
                }
            });

            // Check keyword relevance
            contentProfile.keywords.slice(0, 10).forEach(({ word, weight }) => {
                if (this.feedMatchesKeyword(feed, word)) {
                    relevanceScore += weight * 0.3; // Keyword match is moderately weighted
                }
            });

            if (relevanceScore > this.similarityThreshold) {
                suggestions.push({
                    ...feed,
                    relevanceScore,
                    recommendationType: 'content-based',
                    matchingTopics: contentProfile.topics
                        .filter(({ topic }) => this.feedMatchesTopic(feed, topic))
                        .map(({ topic }) => topic),
                    reason: `Based on your interest in ${contentProfile.topics[0]?.topic || 'current content'}`
                });
            }
        });

        return suggestions;
    }

    // Check if a feed matches a topic
    feedMatchesTopic(feed, topic) {
        const feedText = `${feed.name} ${feed.category}`.toLowerCase();
        const topicWords = topic.split(' ');
        
        return topicWords.some(word => 
            feedText.includes(word) || 
            this.getTopicSynonyms(word).some(synonym => feedText.includes(synonym))
        );
    }

    // Check if a feed matches a keyword
    feedMatchesKeyword(feed, keyword) {
        const feedText = `${feed.name} ${feed.category}`.toLowerCase();
        return feedText.includes(keyword) || 
               this.getKeywordSynonyms(keyword).some(synonym => feedText.includes(synonym));
    }

    // Identify topics from text content
    identifyTopics(text) {
        const topics = [];
        
        const topicPatterns = {
            'technology': /\b(tech|technology|software|hardware|computer|digital|ai|artificial intelligence|programming|code|developer)\b/i,
            'science': /\b(science|research|study|discovery|experiment|scientific|laboratory|physics|chemistry|biology)\b/i,
            'business': /\b(business|economy|finance|market|company|startup|investment|entrepreneur|corporate)\b/i,
            'politics': /\b(politics|government|election|policy|political|congress|senate|president|minister)\b/i,
            'health': /\b(health|medical|medicine|doctor|hospital|patient|treatment|disease|healthcare)\b/i,
            'environment': /\b(environment|climate|green|sustainability|renewable|carbon|pollution|ecology)\b/i,
            'sports': /\b(sports|game|team|player|match|championship|league|tournament|athletic)\b/i,
            'entertainment': /\b(entertainment|movie|film|music|celebrity|show|television|streaming|gaming)\b/i
        };

        Object.entries(topicPatterns).forEach(([topic, pattern]) => {
            if (pattern.test(text)) {
                topics.push(topic);
            }
        });

        return topics;
    }

    // Get popular feed suggestions
    async getPopularFeedSuggestions(excludeExisting = true) {
        const suggestions = this.suggestedFeeds.map(feed => ({
            ...feed,
            relevanceScore: 0.5, // Base popularity score
            recommendationType: 'popular',
            reason: `Popular ${feed.category} feed`
        }));

        return suggestions;
    }

    // Remove duplicate recommendations
    removeDuplicateRecommendations(recommendations) {
        const seen = new Set();
        return recommendations.filter(rec => {
            const key = rec.url;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    // Filter out feeds that are already subscribed
    async filterExistingFeeds(recommendations) {
        try {
            const existingFeeds = await this.dbService.feeds.getAll();
            const existingUrls = new Set(existingFeeds.map(f => f.url));
            
            return recommendations.filter(rec => !existingUrls.has(rec.url));
        } catch (error) {
            console.warn('[FeedRecommendation] Failed to filter existing feeds:', error.message);
            return recommendations;
        }
    }

    // Check if a word is a stop word
    isStopWord(word) {
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
            'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
            'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
            'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'
        ]);
        return stopWords.has(word);
    }

    // Get synonyms for topics
    getTopicSynonyms(topic) {
        const synonyms = {
            'tech': ['technology', 'digital', 'computer'],
            'technology': ['tech', 'digital', 'innovation'],
            'ai': ['artificial intelligence', 'machine learning', 'ml'],
            'science': ['research', 'scientific', 'study'],
            'business': ['finance', 'economy', 'corporate'],
            'politics': ['government', 'political', 'policy']
        };
        return synonyms[topic] || [];
    }

    // Get synonyms for keywords
    getKeywordSynonyms(keyword) {
        // Basic synonym mapping
        const synonyms = {
            'programming': ['coding', 'development', 'software'],
            'coding': ['programming', 'development', 'software'],
            'ai': ['artificial intelligence', 'machine learning'],
            'ml': ['machine learning', 'artificial intelligence'],
            'startup': ['company', 'business', 'entrepreneur'],
            'climate': ['environment', 'green', 'sustainability']
        };
        return synonyms[keyword] || [];
    }

    // Get recommendation statistics
    async getRecommendationStatistics() {
        try {
            await this.dbService.initialize();
            
            const existingFeeds = await this.dbService.feeds.getAll();
            const availableSuggestions = this.suggestedFeeds.length;
            const alreadySubscribed = this.suggestedFeeds.filter(suggested => 
                existingFeeds.some(existing => existing.url === suggested.url)
            ).length;

            // Analyze content diversity
            const categories = this.suggestedFeeds.reduce((acc, feed) => {
                acc[feed.category] = (acc[feed.category] || 0) + 1;
                return acc;
            }, {});

            return {
                totalSuggestions: availableSuggestions,
                alreadySubscribed,
                remainingSuggestions: availableSuggestions - alreadySubscribed,
                categories,
                existingFeedCount: existingFeeds.length,
                coverageRate: existingFeeds.length > 0 ? 
                    Math.round((alreadySubscribed / availableSuggestions) * 100) : 0
            };
        } catch (error) {
            return { error: error.message };
        }
    }

    // Update similarity threshold
    updateSimilarityThreshold(threshold) {
        this.similarityThreshold = Math.max(0, Math.min(1, threshold));
        console.log(`[FeedRecommendation] Similarity threshold updated to ${this.similarityThreshold}`);
    }

    // Get feed categories
    getAvailableCategories() {
        const categories = [...new Set(this.suggestedFeeds.map(f => f.category))];
        return categories.sort();
    }

    // Get feeds by category
    getFeedsByCategory(category) {
        return this.suggestedFeeds.filter(f => f.category === category);
    }
}

module.exports = { FeedRecommendationService };