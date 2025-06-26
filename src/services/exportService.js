// exportService.js - Service for exporting articles to various formats
const fs = require('fs').promises;
const path = require('path');
const { marked } = require('marked');
const JSZip = require('jszip');
const sanitizeHtml = require('sanitize-html');

class ExportService {
    constructor(dbService) {
        this.dbService = dbService;
        this.exportFormats = ['pdf', 'epub', 'markdown', 'html', 'json'];
        
        // Configure marked for better markdown output
        marked.setOptions({
            breaks: true,
            gfm: true,
            headerIds: false,
            mangle: false
        });
    }

    // Export articles to various formats
    async exportArticles(options = {}) {
        const {
            format = 'markdown',
            articleIds = [],
            feedIds = [],
            includeArchived = false,
            dateRange = null,
            outputPath = null,
            filename = null
        } = options;

        if (!this.exportFormats.includes(format)) {
            throw new Error(`Unsupported export format: ${format}. Supported formats: ${this.exportFormats.join(', ')}`);
        }

        console.log(`[ExportService] Exporting articles in ${format} format...`);
        const startTime = Date.now();

        try {
            await this.dbService.initialize();
            
            // Get articles based on criteria
            const articles = await this.getArticlesForExport({
                articleIds,
                feedIds,
                includeArchived,
                dateRange
            });

            if (articles.length === 0) {
                return {
                    success: false,
                    error: 'No articles found matching the export criteria',
                    articleCount: 0
                };
            }

            // Generate export based on format
            let exportData;
            let fileExtension;
            let mimeType;

            switch (format) {
                case 'markdown':
                    exportData = await this.exportToMarkdown(articles);
                    fileExtension = 'md';
                    mimeType = 'text/markdown';
                    break;
                case 'html':
                    exportData = await this.exportToHtml(articles);
                    fileExtension = 'html';
                    mimeType = 'text/html';
                    break;
                case 'json':
                    exportData = await this.exportToJson(articles);
                    fileExtension = 'json';
                    mimeType = 'application/json';
                    break;
                case 'epub':
                    exportData = await this.exportToEpub(articles);
                    fileExtension = 'epub';
                    mimeType = 'application/epub+zip';
                    break;
                case 'pdf':
                    exportData = await this.exportToPdf(articles);
                    fileExtension = 'pdf';
                    mimeType = 'application/pdf';
                    break;
                default:
                    throw new Error(`Export format ${format} not implemented`);
            }

            // Save to file if path specified
            let savedPath = null;
            if (outputPath) {
                const finalFilename = filename || `articles_export_${Date.now()}.${fileExtension}`;
                savedPath = path.join(outputPath, finalFilename);
                
                if (typeof exportData === 'string') {
                    await fs.writeFile(savedPath, exportData, 'utf8');
                } else {
                    await fs.writeFile(savedPath, exportData);
                }
                
                console.log(`[ExportService] Export saved to: ${savedPath}`);
            }

            const duration = Date.now() - startTime;
            
            return {
                success: true,
                format,
                articleCount: articles.length,
                dataSize: exportData.length || exportData.byteLength || 0,
                duration,
                savedPath,
                mimeType,
                data: outputPath ? null : exportData // Only return data if not saved to file
            };

        } catch (error) {
            console.error('[ExportService] Export failed:', error);
            return {
                success: false,
                error: error.message,
                duration: Date.now() - startTime
            };
        }
    }

    // Get articles for export based on criteria
    async getArticlesForExport(criteria) {
        const { articleIds, feedIds, includeArchived, dateRange } = criteria;
        let articles = [];

        if (articleIds && articleIds.length > 0) {
            // Export specific articles
            for (const articleId of articleIds) {
                const article = await this.dbService.articles.getById(articleId);
                if (article) {
                    const feed = await this.dbService.feeds.getById ? 
                        await this.dbService.feeds.getById(article.feedId) : 
                        { name: 'Unknown Feed' };
                    article.feedName = feed.name || feed.displayName || 'Unknown Feed';
                    articles.push(article);
                }
            }
        } else {
            // Export by other criteria
            if (feedIds && feedIds.length > 0) {
                for (const feedId of feedIds) {
                    const feedArticles = await this.dbService.articles.getByFeedId(feedId);
                    const feed = await this.dbService.feeds.getById ? 
                        await this.dbService.feeds.getById(feedId) : 
                        { name: 'Unknown Feed' };
                    
                    feedArticles.forEach(article => {
                        article.feedName = feed.name || feed.displayName || 'Unknown Feed';
                        articles.push(article);
                    });
                }
            } else {
                // Export all articles (with potential date filtering)
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
                const archived = await this.dbService.archive.getArchivedArticles(1000, 0);
                if (archived.articles) {
                    archived.articles.forEach(article => {
                        article.feedName = article.feedName || 'Archived Feed';
                        article.isArchived = true;
                        articles.push(article);
                    });
                }
            }

            // Apply date range filter
            if (dateRange && dateRange.from) {
                articles = articles.filter(article => {
                    const articleDate = new Date(article.pubDate || article.createdAt);
                    const fromDate = new Date(dateRange.from);
                    const toDate = dateRange.to ? new Date(dateRange.to) : new Date();
                    return articleDate >= fromDate && articleDate <= toDate;
                });
            }
        }

        // Sort by publication date (newest first)
        articles.sort((a, b) => {
            const dateA = new Date(a.pubDate || a.createdAt || 0);
            const dateB = new Date(b.pubDate || b.createdAt || 0);
            return dateB - dateA;
        });

        return articles;
    }

    // Export to Markdown format
    async exportToMarkdown(articles) {
        const exportDate = new Date().toISOString().split('T')[0];
        let markdown = `# AI News Aggregator Export\n\n`;
        markdown += `**Export Date:** ${exportDate}\n`;
        markdown += `**Article Count:** ${articles.length}\n\n`;
        markdown += `---\n\n`;

        const feedGroups = this.groupArticlesByFeed(articles);

        for (const [feedName, feedArticles] of Object.entries(feedGroups)) {
            markdown += `## ${feedName}\n\n`;
            
            for (const article of feedArticles) {
                markdown += `### ${article.title}\n\n`;
                if (article.link) {
                    markdown += `**Source:** [${article.link}](${article.link})\n`;
                }
                if (article.pubDate) {
                    markdown += `**Published:** ${new Date(article.pubDate).toLocaleDateString()}\n`;
                }
                if (article.isArchived) {
                    markdown += `**Status:** Archived\n`;
                }
                markdown += `\n`;
                
                if (article.summary) {
                    markdown += `**Summary:**\n${article.summary}\n\n`;
                }
                
                if (article.content) {
                    const cleanContent = sanitizeHtml(article.content, {
                        allowedTags: [],
                        allowedAttributes: {}
                    });
                    markdown += `**Content:**\n${cleanContent}\n\n`;
                }
                
                markdown += `---\n\n`;
            }
        }

        return markdown;
    }

    // Export to HTML format
    async exportToHtml(articles) {
        const exportDate = new Date().toISOString().split('T')[0];
        const feedGroups = this.groupArticlesByFeed(articles);

        let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI News Aggregator Export</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; border-bottom: 2px solid #ccc; padding-bottom: 20px; margin-bottom: 30px; }
        .feed-section { margin-bottom: 40px; }
        .feed-title { color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        .article { margin-bottom: 30px; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
        .article-title { color: #34495e; margin-bottom: 10px; }
        .article-meta { color: #7f8c8d; font-size: 0.9em; margin-bottom: 15px; }
        .article-summary { background-color: #f8f9fa; padding: 15px; border-left: 4px solid #3498db; margin-bottom: 15px; }
        .article-content { line-height: 1.6; }
        .archived-badge { background-color: #e74c3c; color: white; padding: 2px 8px; border-radius: 3px; font-size: 0.8em; }
    </style>
</head>
<body>
    <div class="header">
        <h1>AI News Aggregator Export</h1>
        <p><strong>Export Date:</strong> ${exportDate}</p>
        <p><strong>Article Count:</strong> ${articles.length}</p>
    </div>
`;

        for (const [feedName, feedArticles] of Object.entries(feedGroups)) {
            html += `    <div class="feed-section">
        <h2 class="feed-title">${this.escapeHtml(feedName)}</h2>
`;
            
            for (const article of feedArticles) {
                html += `        <div class="article">
            <h3 class="article-title">${this.escapeHtml(article.title)}</h3>
            <div class="article-meta">
`;
                if (article.link) {
                    html += `                <a href="${article.link}" target="_blank">View Original</a> | `;
                }
                if (article.pubDate) {
                    html += `Published: ${new Date(article.pubDate).toLocaleDateString()} | `;
                }
                if (article.isArchived) {
                    html += `<span class="archived-badge">Archived</span>`;
                }
                html += `
            </div>
`;
                
                if (article.summary) {
                    html += `            <div class="article-summary">
                <strong>Summary:</strong><br>
                ${this.escapeHtml(article.summary)}
            </div>
`;
                }
                
                if (article.content) {
                    const cleanContent = sanitizeHtml(article.content, {
                        allowedTags: ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li'],
                        allowedAttributes: { a: ['href', 'target'] }
                    });
                    html += `            <div class="article-content">
                ${cleanContent}
            </div>
`;
                }
                
                html += `        </div>
`;
            }
            html += `    </div>
`;
        }

        html += `</body>
</html>`;

        return html;
    }

    // Export to JSON format
    async exportToJson(articles) {
        const exportData = {
            exportDate: new Date().toISOString(),
            exportType: 'ai-news-aggregator',
            version: '1.0',
            articleCount: articles.length,
            articles: articles.map(article => ({
                id: article.id,
                title: article.title,
                link: article.link,
                pubDate: article.pubDate,
                content: article.content,
                summary: article.summary,
                feedName: article.feedName,
                feedId: article.feedId,
                isRead: article.isRead,
                status: article.status,
                isArchived: article.isArchived || false,
                createdAt: article.createdAt,
                archivedAt: article.archivedAt
            }))
        };

        return JSON.stringify(exportData, null, 2);
    }

    // Export to EPUB format (basic implementation)
    async exportToEpub(articles) {
        const zip = new JSZip();
        const exportDate = new Date().toISOString().split('T')[0];
        
        // EPUB structure
        zip.file('mimetype', 'application/epub+zip');
        
        // META-INF
        const metaInf = zip.folder('META-INF');
        metaInf.file('container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
    <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
    </rootfiles>
</container>`);

        // OEBPS
        const oebps = zip.folder('OEBPS');
        
        // Content.opf
        oebps.file('content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>AI News Aggregator Export</dc:title>
        <dc:creator>AI News Aggregator</dc:creator>
        <dc:date>${exportDate}</dc:date>
        <dc:identifier id="bookid">${Date.now()}</dc:identifier>
        <dc:language>en</dc:language>
    </metadata>
    <manifest>
        <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
        <item id="content" href="content.html" media-type="application/xhtml+xml"/>
    </manifest>
    <spine toc="ncx">
        <itemref idref="content"/>
    </spine>
</package>`);

        // Table of Contents
        oebps.file('toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
    <head>
        <meta name="dtb:uid" content="${Date.now()}"/>
        <meta name="dtb:depth" content="1"/>
    </head>
    <docTitle>
        <text>AI News Aggregator Export</text>
    </docTitle>
    <navMap>
        <navPoint id="content">
            <navLabel><text>Articles</text></navLabel>
            <content src="content.html"/>
        </navPoint>
    </navMap>
</ncx>`);

        // Content HTML
        const htmlContent = await this.exportToHtml(articles);
        oebps.file('content.html', htmlContent);

        return zip.generateAsync({ type: 'nodebuffer' });
    }

    // Export to PDF format (requires additional setup)
    async exportToPdf(articles) {
        // For now, return HTML that can be converted to PDF
        // A full PDF implementation would require puppeteer or similar
        const htmlContent = await this.exportToHtml(articles);
        
        try {
            // If puppeteer is available and properly configured
            const puppeteer = require('puppeteer');
            const browser = await puppeteer.launch({ 
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();
            await page.setContent(htmlContent);
            const pdf = await page.pdf({ 
                format: 'A4',
                margin: { top: '1in', bottom: '1in', left: '1in', right: '1in' }
            });
            await browser.close();
            return pdf;
        } catch (error) {
            console.warn('[ExportService] PDF generation failed, falling back to HTML:', error.message);
            throw new Error('PDF export requires additional setup. Please use HTML export instead.');
        }
    }

    // Utility functions
    groupArticlesByFeed(articles) {
        const groups = {};
        articles.forEach(article => {
            const feedName = article.feedName || 'Unknown Feed';
            if (!groups[feedName]) {
                groups[feedName] = [];
            }
            groups[feedName].push(article);
        });
        return groups;
    }

    escapeHtml(text) {
        if (!text) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    // Get available export formats
    getAvailableFormats() {
        return this.exportFormats.map(format => ({
            format,
            name: format.toUpperCase(),
            description: this.getFormatDescription(format)
        }));
    }

    getFormatDescription(format) {
        const descriptions = {
            markdown: 'Markdown text format - great for documentation and editing',
            html: 'HTML web format - viewable in any browser',
            json: 'JSON data format - for programmatic access and backup',
            epub: 'EPUB e-book format - for e-readers and mobile devices',
            pdf: 'PDF document format - for printing and sharing'
        };
        return descriptions[format] || 'Export format';
    }
}

module.exports = { ExportService };