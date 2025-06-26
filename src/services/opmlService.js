// opmlService.js - OPML import/export service for RSS feed management
const fs = require('fs').promises;
const path = require('path');

class OpmlService {
    constructor(dbService) {
        this.dbService = dbService;
    }

    // Export feeds to OPML format
    async exportToOpml(options = {}) {
        const {
            includeAllFeeds = true,
            feedIds = [],
            folderIds = [],
            filename = null,
            outputPath = null,
            includeMetadata = true
        } = options;

        console.log('[OpmlService] Exporting feeds to OPML format...');
        const startTime = Date.now();

        try {
            await this.dbService.initialize();

            // Get feeds and folders based on criteria
            const { feeds, folders } = await this.getFeedsForExport({
                includeAllFeeds,
                feedIds,
                folderIds
            });

            if (feeds.length === 0) {
                return {
                    success: false,
                    error: 'No feeds found matching export criteria',
                    feedCount: 0
                };
            }

            // Generate OPML content
            const opmlContent = this.generateOpmlContent(feeds, folders, includeMetadata);

            // Save to file if path specified
            let savedPath = null;
            if (outputPath) {
                const finalFilename = filename || `feeds_export_${Date.now()}.opml`;
                savedPath = path.join(outputPath, finalFilename);
                await fs.writeFile(savedPath, opmlContent, 'utf8');
                console.log(`[OpmlService] OPML export saved to: ${savedPath}`);
            }

            const duration = Date.now() - startTime;

            return {
                success: true,
                feedCount: feeds.length,
                folderCount: folders.length,
                dataSize: opmlContent.length,
                duration,
                savedPath,
                data: outputPath ? null : opmlContent,
                mimeType: 'text/x-opml'
            };

        } catch (error) {
            console.error('[OpmlService] Export failed:', error);
            return {
                success: false,
                error: error.message,
                duration: Date.now() - startTime
            };
        }
    }

    // Import feeds from OPML format
    async importFromOpml(opmlContent, options = {}) {
        const {
            validateFeeds = true,
            createFolders = true,
            skipDuplicates = true,
            dryRun = false
        } = options;

        console.log('[OpmlService] Importing feeds from OPML...');
        const startTime = Date.now();

        try {
            await this.dbService.initialize();

            // Parse OPML content
            const { feeds: feedsToImport, folders: foldersToImport } = await this.parseOpmlContent(opmlContent);

            if (feedsToImport.length === 0) {
                return {
                    success: false,
                    error: 'No valid feeds found in OPML content',
                    feedCount: 0
                };
            }

            // Get existing feeds to check for duplicates
            const existingFeeds = await this.dbService.feeds.getAll();
            const existingUrls = new Set(existingFeeds.map(f => f.url));

            // Filter out duplicates if requested
            let validFeeds = feedsToImport;
            if (skipDuplicates) {
                validFeeds = feedsToImport.filter(feed => !existingUrls.has(feed.url));
            }

            // Validate feeds if requested
            let validatedFeeds = validFeeds;
            if (validateFeeds && !dryRun) {
                validatedFeeds = await this.validateFeeds(validFeeds);
            }

            if (dryRun) {
                return {
                    success: true,
                    dryRun: true,
                    totalFeeds: feedsToImport.length,
                    validFeeds: validFeeds.length,
                    duplicates: feedsToImport.length - validFeeds.length,
                    foldersToCreate: foldersToImport.length,
                    duration: Date.now() - startTime
                };
            }

            // Import folders first
            const folderMapping = {};
            let createdFolders = 0;
            
            if (createFolders) {
                for (const folder of foldersToImport) {
                    try {
                        const result = await this.dbService.folders.create(folder.name);
                        folderMapping[folder.originalId] = result.id;
                        createdFolders++;
                    } catch (error) {
                        console.warn(`[OpmlService] Failed to create folder ${folder.name}:`, error.message);
                    }
                }
            }

            // Import feeds
            let importedFeeds = 0;
            let failedFeeds = 0;
            const errors = [];

            for (const feed of validatedFeeds) {
                try {
                    // Map folder ID if folder was created
                    let folderId = null;
                    if (feed.folderId && folderMapping[feed.folderId]) {
                        folderId = folderMapping[feed.folderId];
                    }

                    const result = await this.dbService.feeds.add(feed.title, feed.url);
                    
                    // Update display name and folder if needed
                    if (feed.title !== feed.url) {
                        await this.dbService.feeds.updateDisplayName(result, feed.title);
                    }
                    
                    if (folderId) {
                        await this.dbService.feeds.moveToFolder(result, folderId);
                    }

                    importedFeeds++;
                } catch (error) {
                    console.warn(`[OpmlService] Failed to import feed ${feed.title}:`, error.message);
                    failedFeeds++;
                    errors.push({
                        feedTitle: feed.title,
                        feedUrl: feed.url,
                        error: error.message
                    });
                }
            }

            const duration = Date.now() - startTime;

            return {
                success: errors.length === 0,
                importedFeeds,
                createdFolders,
                failedFeeds,
                duplicatesSkipped: feedsToImport.length - validFeeds.length,
                totalProcessed: feedsToImport.length,
                duration,
                errors: errors.length > 0 ? errors : undefined
            };

        } catch (error) {
            console.error('[OpmlService] Import failed:', error);
            return {
                success: false,
                error: error.message,
                duration: Date.now() - startTime
            };
        }
    }

    // Get feeds for export based on criteria
    async getFeedsForExport(criteria) {
        const { includeAllFeeds, feedIds, folderIds } = criteria;
        let feeds = [];
        let folders = [];

        if (includeAllFeeds) {
            feeds = await this.dbService.feeds.getAll();
            folders = await this.dbService.folders.getAll();
        } else {
            // Get specific feeds
            if (feedIds && feedIds.length > 0) {
                for (const feedId of feedIds) {
                    const feed = await this.dbService.feeds.getById ? 
                        await this.dbService.feeds.getById(feedId) : null;
                    if (feed) feeds.push(feed);
                }
            }

            // Get feeds from specific folders
            if (folderIds && folderIds.length > 0) {
                const allFeeds = await this.dbService.feeds.getAll();
                const folderFeeds = allFeeds.filter(feed => 
                    feed.folderId && folderIds.includes(feed.folderId)
                );
                feeds.push(...folderFeeds);

                // Get the folders too
                const allFolders = await this.dbService.folders.getAll();
                folders = allFolders.filter(folder => folderIds.includes(folder.id));
            }
        }

        // Remove duplicates
        const uniqueFeeds = feeds.filter((feed, index, self) => 
            index === self.findIndex(f => f.id === feed.id)
        );

        return { feeds: uniqueFeeds, folders };
    }

    // Generate OPML XML content
    generateOpmlContent(feeds, folders, includeMetadata) {
        const now = new Date().toUTCString();
        const appName = 'AI News Aggregator';
        const version = '2.0';

        let opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
    <head>
        <title>AI News Aggregator Feed Export</title>
        <dateCreated>${now}</dateCreated>
        <dateModified>${now}</dateModified>
        <ownerName>${appName}</ownerName>
        <ownerEmail>export@ai-news-aggregator.local</ownerEmail>
        <docs>http://opml.org/spec2.opml</docs>
        <generator>${appName} ${version}</generator>`;

        if (includeMetadata) {
            opml += `
        <feedCount>${feeds.length}</feedCount>
        <folderCount>${folders.length}</folderCount>`;
        }

        opml += `
    </head>
    <body>`;

        // Create folder map for organizing feeds
        const folderMap = new Map();
        folders.forEach(folder => {
            folderMap.set(folder.id, {
                ...folder,
                feeds: []
            });
        });

        // Organize feeds by folder
        const unorganizedFeeds = [];
        feeds.forEach(feed => {
            if (feed.folderId && folderMap.has(feed.folderId)) {
                folderMap.get(feed.folderId).feeds.push(feed);
            } else {
                unorganizedFeeds.push(feed);
            }
        });

        // Add organized feeds (within folders)
        folderMap.forEach(folder => {
            if (folder.feeds.length > 0) {
                opml += `
        <outline text="${this.escapeXml(folder.name)}" title="${this.escapeXml(folder.name)}" type="folder">`;
                
                folder.feeds.forEach(feed => {
                    const displayName = feed.displayName || feed.name;
                    opml += `
            <outline text="${this.escapeXml(displayName)}" title="${this.escapeXml(displayName)}" type="rss" xmlUrl="${this.escapeXml(feed.url)}" htmlUrl="${this.escapeXml(feed.url)}"`;
                    
                    if (includeMetadata && feed.createdAt) {
                        opml += ` dateCreated="${new Date(feed.createdAt).toUTCString()}"`;
                    }
                    
                    opml += ` />`;
                });
                
                opml += `
        </outline>`;
            }
        });

        // Add unorganized feeds
        unorganizedFeeds.forEach(feed => {
            const displayName = feed.displayName || feed.name;
            opml += `
        <outline text="${this.escapeXml(displayName)}" title="${this.escapeXml(displayName)}" type="rss" xmlUrl="${this.escapeXml(feed.url)}" htmlUrl="${this.escapeXml(feed.url)}"`;
            
            if (includeMetadata && feed.createdAt) {
                opml += ` dateCreated="${new Date(feed.createdAt).toUTCString()}"`;
            }
            
            opml += ` />`;
        });

        opml += `
    </body>
</opml>`;

        return opml;
    }

    // Parse OPML content to extract feeds and folders
    async parseOpmlContent(opmlContent) {
        const feeds = [];
        const folders = [];
        let folderId = 1; // Simple ID counter for folders

        try {
            // Simple XML parsing (could be enhanced with a proper XML parser)
            const outlineRegex = /<outline\s+([^>]+)>/g;
            let match;
            let currentFolder = null;

            while ((match = outlineRegex.exec(opmlContent)) !== null) {
                const attributes = this.parseXmlAttributes(match[1]);
                
                if (attributes.type === 'folder') {
                    // This is a folder
                    currentFolder = {
                        originalId: folderId++,
                        name: attributes.text || attributes.title || 'Untitled Folder'
                    };
                    folders.push(currentFolder);
                } else if (attributes.type === 'rss' || attributes.xmlUrl) {
                    // This is a feed
                    const feed = {
                        title: attributes.text || attributes.title || 'Untitled Feed',
                        url: attributes.xmlUrl,
                        htmlUrl: attributes.htmlUrl,
                        folderId: currentFolder ? currentFolder.originalId : null
                    };

                    if (feed.url) {
                        feeds.push(feed);
                    }
                } else if (attributes.text && !attributes.type) {
                    // Check if this might be closing a folder
                    if (match[0].includes('</outline>')) {
                        currentFolder = null;
                    }
                }
            }

            return { feeds, folders };

        } catch (error) {
            throw new Error(`Failed to parse OPML content: ${error.message}`);
        }
    }

    // Parse XML attributes from a string
    parseXmlAttributes(attributeString) {
        const attributes = {};
        const regex = /(\w+)=["']([^"']+)["']/g;
        let match;

        while ((match = regex.exec(attributeString)) !== null) {
            attributes[match[1]] = match[2];
        }

        return attributes;
    }

    // Validate feeds by attempting to fetch them
    async validateFeeds(feeds) {
        const validFeeds = [];
        const Parser = require('rss-parser');
        const parser = new Parser();

        for (const feed of feeds) {
            try {
                await parser.parseURL(feed.url);
                validFeeds.push(feed);
            } catch (error) {
                console.warn(`[OpmlService] Feed validation failed for ${feed.url}:`, error.message);
            }
        }

        return validFeeds;
    }

    // Escape XML special characters
    escapeXml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    // Get OPML import/export statistics
    async getOpmlStatistics() {
        try {
            await this.dbService.initialize();
            
            const feeds = await this.dbService.feeds.getAll();
            const folders = await this.dbService.folders.getAll();
            
            // Analyze feed organization
            const organizedFeeds = feeds.filter(f => f.folderId).length;
            const unorganizedFeeds = feeds.length - organizedFeeds;
            
            return {
                totalFeeds: feeds.length,
                totalFolders: folders.length,
                organizedFeeds,
                unorganizedFeeds,
                organizationRate: feeds.length > 0 ? 
                    Math.round((organizedFeeds / feeds.length) * 100) : 0,
                lastUpdate: new Date().toISOString()
            };
        } catch (error) {
            return { error: error.message };
        }
    }
}

module.exports = { OpmlService };