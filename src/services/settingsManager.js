// settingsManager.js - Comprehensive settings management system
const fs = require('fs').promises;
const path = require('path');

class SettingsManager {
    constructor() {
        this.settingsPath = path.join(__dirname, '../../settings.json');
        this.settings = this.getDefaultSettings();
        this.listeners = new Map();
    }

    // Default settings configuration
    getDefaultSettings() {
        return {
            // Application settings
            app: {
                version: '2.0.0',
                autoStart: false,
                minimizeToTray: false,
                startMinimized: false,
                enableNotifications: true,
                updateCheckEnabled: true,
                theme: 'light', // light, dark, auto
                language: 'en'
            },

            // Performance settings
            performance: {
                concurrentFeeds: 5,
                aiWorkerPoolSize: 2,
                maxQueueSize: 50,
                workerTimeout: 60000,
                enableVirtualization: true,
                enableLazyLoading: true,
                enableMemoryOptimization: true,
                enablePerformanceMonitoring: true,
                databaseCacheSize: 64, // MB
                maxArticlesPerFeed: 1000
            },

            // Feed management settings
            feeds: {
                refreshInterval: 5, // minutes
                requestTimeout: 30000, // ms
                retryAttempts: 3,
                retryDelay: 1000, // ms
                enableConditionalRequests: true,
                validateSslCertificates: true,
                maxRedirects: 5,
                userAgent: 'AI News Aggregator 2.0',
                enableFeedHealth: true,
                failureThreshold: 3
            },

            // AI processing settings
            ai: {
                instances: [
                    { url: 'http://localhost:11434', model: 'phi3:mini', weight: 1, enabled: true }
                ],
                requestTimeout: 60000,
                retryAttempts: 2,
                healthCheckInterval: 300000, // 5 minutes
                enableLoadBalancing: true,
                maxConcurrentRequests: 10,
                enableQueueManagement: true,
                summaryMaxLength: 500,
                enableCustomPrompts: false,
                customPromptTemplate: 'Summarize this article in 2-3 sentences:'
            },

            // Content management settings
            content: {
                archiving: {
                    enabled: true,
                    retentionDays: 30,
                    maxBatchSize: 1000,
                    archiveReadArticles: true,
                    archiveFailedArticles: true,
                    preserveSummarizedArticles: false,
                    extendedRetentionDays: 90
                },
                cleanup: {
                    enableAutoCleanup: true,
                    cleanupInterval: 1440, // minutes (24 hours)
                    enableFailedCleanup: true,
                    enableEmptyContentCleanup: true,
                    enableDuplicateCleanup: true,
                    enableOrphanedMetadataCleanup: true,
                    enableDatabaseOptimization: true
                },
                export: {
                    defaultFormat: 'markdown',
                    includeMetadata: true,
                    includeArchived: false,
                    defaultOutputPath: null,
                    enableSizeEstimation: true
                },
                duplicates: {
                    similarityThreshold: 0.85,
                    titleSimilarityThreshold: 0.9,
                    enableAutoMerge: false,
                    autoMergeThreshold: 0.95,
                    enableDuplicateDetection: true
                }
            },

            // UI settings
            ui: {
                layout: {
                    feedsPanelWidth: 300,
                    articlesPanelWidth: 400,
                    showArticleCount: true,
                    showReadStatus: true,
                    showFeedHealth: true,
                    compactMode: false
                },
                display: {
                    fontSize: 14,
                    fontFamily: 'system-ui',
                    lineHeight: 1.5,
                    enableAnimations: true,
                    enableTransitions: true,
                    showTooltips: true,
                    enableKeyboardShortcuts: false
                },
                search: {
                    enableRealTimeSearch: true,
                    searchDebounceTime: 300,
                    suggestionsDebounceTime: 200,
                    maxSuggestions: 10,
                    enableSearchHighlighting: true,
                    enableAdvancedFilters: true
                }
            },

            // Privacy and security settings
            privacy: {
                enableTelemetry: false,
                enableErrorReporting: true,
                enableUsageAnalytics: false,
                clearHistoryOnExit: false,
                enableDataCompression: true,
                enableEncryption: false
            },

            // Development settings
            development: {
                enableDebugMode: false,
                enableVerboseLogging: false,
                enableDevTools: false,
                enablePerformanceLogging: false,
                enableApiLogging: false,
                logLevel: 'info' // debug, info, warn, error
            }
        };
    }

    // Load settings from file
    async loadSettings() {
        try {
            const data = await fs.readFile(this.settingsPath, 'utf8');
            const loadedSettings = JSON.parse(data);
            
            // Merge with defaults to handle new settings
            this.settings = this.mergeSettings(this.getDefaultSettings(), loadedSettings);
            
            console.log('[SettingsManager] Settings loaded successfully');
            this.notifyListeners('settingsLoaded', this.settings);
            
            return { success: true, settings: this.settings };
        } catch (error) {
            if (error.code === 'ENOENT') {
                // Settings file doesn't exist, create with defaults
                console.log('[SettingsManager] Creating default settings file');
                await this.saveSettings();
                return { success: true, settings: this.settings, created: true };
            } else {
                console.error('[SettingsManager] Error loading settings:', error);
                return { success: false, error: error.message };
            }
        }
    }

    // Save settings to file
    async saveSettings() {
        try {
            await fs.writeFile(this.settingsPath, JSON.stringify(this.settings, null, 2));
            console.log('[SettingsManager] Settings saved successfully');
            this.notifyListeners('settingsSaved', this.settings);
            return { success: true };
        } catch (error) {
            console.error('[SettingsManager] Error saving settings:', error);
            return { success: false, error: error.message };
        }
    }

    // Get all settings
    getSettings() {
        return { ...this.settings };
    }

    // Get settings for a specific category
    getCategorySettings(category) {
        return this.settings[category] ? { ...this.settings[category] } : null;
    }

    // Update settings (partial update)
    async updateSettings(updates) {
        try {
            const oldSettings = { ...this.settings };
            this.settings = this.mergeSettings(this.settings, updates);
            
            // Validate settings
            const validation = this.validateSettings(this.settings);
            if (!validation.valid) {
                // Revert changes
                this.settings = oldSettings;
                return { success: false, error: 'Invalid settings', validation };
            }

            await this.saveSettings();
            this.notifyListeners('settingsUpdated', { old: oldSettings, new: this.settings, updates });
            
            return { success: true, settings: this.settings };
        } catch (error) {
            console.error('[SettingsManager] Error updating settings:', error);
            return { success: false, error: error.message };
        }
    }

    // Reset settings to defaults
    async resetSettings(categories = null) {
        try {
            const oldSettings = { ...this.settings };
            
            if (categories) {
                // Reset specific categories
                const defaults = this.getDefaultSettings();
                categories.forEach(category => {
                    if (defaults[category]) {
                        this.settings[category] = { ...defaults[category] };
                    }
                });
            } else {
                // Reset all settings
                this.settings = this.getDefaultSettings();
            }

            await this.saveSettings();
            this.notifyListeners('settingsReset', { old: oldSettings, new: this.settings, categories });
            
            return { success: true, settings: this.settings };
        } catch (error) {
            console.error('[SettingsManager] Error resetting settings:', error);
            return { success: false, error: error.message };
        }
    }

    // Validate settings
    validateSettings(settings) {
        const errors = [];

        // Validate performance settings
        if (settings.performance) {
            const p = settings.performance;
            if (p.concurrentFeeds < 1 || p.concurrentFeeds > 20) {
                errors.push('Concurrent feeds must be between 1 and 20');
            }
            if (p.aiWorkerPoolSize < 1 || p.aiWorkerPoolSize > 10) {
                errors.push('AI worker pool size must be between 1 and 10');
            }
            if (p.databaseCacheSize < 8 || p.databaseCacheSize > 512) {
                errors.push('Database cache size must be between 8MB and 512MB');
            }
        }

        // Validate feed settings
        if (settings.feeds) {
            const f = settings.feeds;
            if (f.refreshInterval < 1 || f.refreshInterval > 1440) {
                errors.push('Refresh interval must be between 1 and 1440 minutes');
            }
            if (f.requestTimeout < 5000 || f.requestTimeout > 300000) {
                errors.push('Request timeout must be between 5 and 300 seconds');
            }
        }

        // Validate AI settings
        if (settings.ai && settings.ai.instances) {
            settings.ai.instances.forEach((instance, index) => {
                if (!instance.url || !instance.url.startsWith('http')) {
                    errors.push(`AI instance ${index + 1}: Invalid URL`);
                }
                if (!instance.model || instance.model.trim().length === 0) {
                    errors.push(`AI instance ${index + 1}: Model name required`);
                }
                if (instance.weight < 0 || instance.weight > 10) {
                    errors.push(`AI instance ${index + 1}: Weight must be between 0 and 10`);
                }
            });
        }

        // Validate content settings
        if (settings.content) {
            const c = settings.content;
            if (c.archiving && (c.archiving.retentionDays < 1 || c.archiving.retentionDays > 3650)) {
                errors.push('Archive retention days must be between 1 and 3650');
            }
            if (c.duplicates && (c.duplicates.similarityThreshold < 0.1 || c.duplicates.similarityThreshold > 1.0)) {
                errors.push('Duplicate similarity threshold must be between 0.1 and 1.0');
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    // Merge settings objects (deep merge)
    mergeSettings(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    result[key] = this.mergeSettings(target[key] || {}, source[key]);
                } else {
                    result[key] = source[key];
                }
            }
        }
        
        return result;
    }

    // Export settings to file
    async exportSettings(filePath) {
        try {
            const exportData = {
                exported: new Date().toISOString(),
                version: this.settings.app.version,
                settings: this.settings
            };
            
            await fs.writeFile(filePath, JSON.stringify(exportData, null, 2));
            return { success: true, path: filePath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Import settings from file
    async importSettings(filePath, mergeMode = true) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const importData = JSON.parse(data);
            
            let newSettings;
            if (mergeMode) {
                newSettings = this.mergeSettings(this.settings, importData.settings || importData);
            } else {
                newSettings = importData.settings || importData;
            }
            
            // Validate imported settings
            const validation = this.validateSettings(newSettings);
            if (!validation.valid) {
                return { success: false, error: 'Invalid imported settings', validation };
            }

            const oldSettings = { ...this.settings };
            this.settings = newSettings;
            await this.saveSettings();
            
            this.notifyListeners('settingsImported', { old: oldSettings, new: this.settings, source: filePath });
            
            return { success: true, settings: this.settings };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Get settings schema for UI generation
    getSettingsSchema() {
        return {
            app: {
                title: 'Application Settings',
                description: 'General application behavior and preferences',
                fields: {
                    autoStart: { type: 'boolean', title: 'Auto-start with system', description: 'Start the application when the system boots' },
                    minimizeToTray: { type: 'boolean', title: 'Minimize to system tray', description: 'Minimize to tray instead of taskbar' },
                    startMinimized: { type: 'boolean', title: 'Start minimized', description: 'Start the application minimized' },
                    enableNotifications: { type: 'boolean', title: 'Enable notifications', description: 'Show system notifications for updates' },
                    theme: { type: 'select', title: 'Theme', options: ['light', 'dark', 'auto'], description: 'Application color theme' }
                }
            },
            performance: {
                title: 'Performance Settings',
                description: 'Configure application performance and resource usage',
                fields: {
                    concurrentFeeds: { type: 'number', title: 'Concurrent feeds', min: 1, max: 20, description: 'Number of feeds to process simultaneously' },
                    aiWorkerPoolSize: { type: 'number', title: 'AI worker pool size', min: 1, max: 10, description: 'Number of AI processing workers' },
                    enableVirtualization: { type: 'boolean', title: 'Enable virtualization', description: 'Use virtual scrolling for large lists' },
                    enableMemoryOptimization: { type: 'boolean', title: 'Enable memory optimization', description: 'Optimize memory usage for large datasets' }
                }
            },
            feeds: {
                title: 'Feed Management',
                description: 'RSS feed processing and update settings',
                fields: {
                    refreshInterval: { type: 'number', title: 'Refresh interval (minutes)', min: 1, max: 1440, description: 'How often to check for new articles' },
                    requestTimeout: { type: 'number', title: 'Request timeout (ms)', min: 5000, max: 300000, description: 'Timeout for feed requests' },
                    enableConditionalRequests: { type: 'boolean', title: 'Enable conditional requests', description: 'Use ETag/Last-Modified headers to save bandwidth' }
                }
            },
            content: {
                title: 'Content Management',
                description: 'Article archiving, cleanup, and export settings',
                fields: {
                    'archiving.enabled': { type: 'boolean', title: 'Enable archiving', description: 'Automatically archive old articles' },
                    'archiving.retentionDays': { type: 'number', title: 'Retention days', min: 1, max: 3650, description: 'Days to keep articles before archiving' },
                    'duplicates.similarityThreshold': { type: 'number', title: 'Duplicate similarity threshold', min: 0.1, max: 1.0, step: 0.05, description: 'Minimum similarity to consider articles duplicates' }
                }
            }
        };
    }

    // Event listener management
    addListener(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    removeListener(event, callback) {
        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    notifyListeners(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[SettingsManager] Listener error for ${event}:`, error);
                }
            });
        }
    }

    // Get settings file path
    getSettingsPath() {
        return this.settingsPath;
    }

    // Check if settings file exists
    async settingsFileExists() {
        try {
            await fs.access(this.settingsPath);
            return true;
        } catch {
            return false;
        }
    }
}

// Create singleton instance
const settingsManager = new SettingsManager();

module.exports = { SettingsManager, settingsManager };