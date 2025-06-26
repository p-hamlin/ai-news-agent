// api.js - Centralized API service for managing backend calls
const ApiService = {
    // Feed-related operations
    async getFeeds() {
        return await window.api.getFeeds();
    },

    async addFeed(url) {
        return await window.api.addFeed(url);
    },

    async deleteFeed(id) {
        return await window.api.deleteFeed(id);
    },

    async updateFeedDisplayName(feedId, displayName) {
        return await window.api.updateFeedDisplayName(feedId, displayName);
    },

    async moveFeedToFolder(feedId, folderId) {
        return await window.api.moveFeedToFolder(feedId, folderId);
    },

    async reorderFeeds(feedId, newIndex, targetFolderId) {
        return await window.api.reorderFeeds(feedId, newIndex, targetFolderId);
    },

    // Folder-related operations
    async getFolders() {
        return await window.api.getFolders();
    },

    async createFolder(name) {
        return await window.api.createFolder(name);
    },

    async deleteFolder(id) {
        return await window.api.deleteFolder(id);
    },

    async renameFolder(folderId, newName) {
        return await window.api.renameFolder(folderId, newName);
    },

    async reorderFolders(folderId, newIndex) {
        return await window.api.reorderFolders(folderId, newIndex);
    },

    // Article-related operations
    async getArticles(feedId) {
        return await window.api.getArticles(feedId);
    },

    async markArticleAsRead(articleId) {
        return await window.api.markArticleAsRead(articleId);
    },

    async retrySummarization(articleId) {
        return await window.api.retrySummarization(articleId);
    },

    // Event listeners
    onArticlesUpdated(callback) {
        return window.api.onArticlesUpdated(callback);
    },

    onArticleStatusUpdated(callback) {
        return window.api.onArticleStatusUpdated(callback);
    }
};

window.ApiService = ApiService;