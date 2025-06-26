// folderOperations.js - Optimized database operations for folders
const FolderOperations = (dbConnection) => {
    return {
        // Get all folders - uses prepared statement and index
        async getAll() {
            return await dbConnection.allPrepared('folders.getAll');
        },

        // Create a new folder - optimized with transaction
        async create(folderName) {
            const result = await dbConnection.transaction(async () => {
                const maxOrder = await dbConnection.get("SELECT MAX(orderIndex) as maxOrder FROM folders");
                const nextOrder = (maxOrder.maxOrder || 0) + 1;
                
                return await dbConnection.runPrepared('folders.insert', [folderName, nextOrder]);
            });

            return { 
                id: result.lastID, 
                name: folderName, 
                orderIndex: (await dbConnection.get("SELECT MAX(orderIndex) as maxOrder FROM folders")).maxOrder 
            };
        },

        // Delete a folder - optimized with transaction
        async delete(folderId) {
            await dbConnection.transaction(async () => {
                // First move all feeds out of this folder
                await dbConnection.run("UPDATE feeds SET folderId = NULL WHERE folderId = ?", [folderId]);
                // Then delete the folder
                await dbConnection.runPrepared('folders.delete', [folderId]);
            });

            return { success: true, id: folderId };
        },

        // Rename a folder - uses prepared statement
        async rename(folderId, newName) {
            const result = await dbConnection.runPrepared('folders.updateName', [newName, folderId]);
            return { success: result.changes > 0 };
        },

        // Reorder folders - optimized with transaction
        async reorder(folderId, newIndex) {
            await dbConnection.transaction(async () => {
                const folders = await dbConnection.all("SELECT id, orderIndex FROM folders ORDER BY orderIndex ASC");
                
                // Remove the dragged folder from the array
                const draggedFolder = folders.find(f => f.id === folderId);
                const filteredFolders = folders.filter(f => f.id !== folderId);
                
                // Insert at new position
                filteredFolders.splice(newIndex, 0, draggedFolder);
                
                // Update order indices using prepared statement
                for (let i = 0; i < filteredFolders.length; i++) {
                    await dbConnection.runPrepared('folders.updateOrder', [i, filteredFolders[i].id]);
                }
            });

            return { success: true };
        },

        // Get folder with feed count - optimized join
        async getWithFeedCount(folderId) {
            return await dbConnection.get(`
                SELECT 
                    f.*,
                    COUNT(feeds.id) as feedCount
                FROM folders f
                LEFT JOIN feeds ON f.id = feeds.folderId
                WHERE f.id = ?
                GROUP BY f.id
            `, [folderId]);
        },

        // Get all folders with feed counts - optimized join
        async getAllWithCounts() {
            return await dbConnection.all(`
                SELECT 
                    f.*,
                    COUNT(feeds.id) as feedCount
                FROM folders f
                LEFT JOIN feeds ON f.id = feeds.folderId
                GROUP BY f.id
                ORDER BY f.orderIndex ASC, f.name ASC
            `);
        },

        // Get folder hierarchy - for future nested folder support
        async getHierarchy() {
            const folders = await this.getAll();
            
            // Build hierarchy tree (currently flat, but prepared for nesting)
            const folderMap = new Map();
            const roots = [];

            folders.forEach(folder => {
                folderMap.set(folder.id, { ...folder, children: [] });
            });

            folders.forEach(folder => {
                const folderNode = folderMap.get(folder.id);
                if (folder.parentId && folderMap.has(folder.parentId)) {
                    folderMap.get(folder.parentId).children.push(folderNode);
                } else {
                    roots.push(folderNode);
                }
            });

            return roots;
        },

        // Validate folder name - helper method
        async validateName(name, excludeFolderId = null) {
            let query = "SELECT COUNT(*) as count FROM folders WHERE name = ?";
            let params = [name];
            
            if (excludeFolderId) {
                query += " AND id != ?";
                params.push(excludeFolderId);
            }
            
            const result = await dbConnection.get(query, params);
            return { valid: result.count === 0, exists: result.count > 0 };
        },

        // Get folder statistics - analytics method
        async getStats(folderId) {
            return await dbConnection.get(`
                SELECT 
                    f.id,
                    f.name,
                    COUNT(DISTINCT feeds.id) as feedCount,
                    COUNT(articles.id) as totalArticles,
                    SUM(CASE WHEN articles.isRead = 0 THEN 1 ELSE 0 END) as unreadArticles,
                    SUM(CASE WHEN articles.status = 'summarized' THEN 1 ELSE 0 END) as summarizedArticles
                FROM folders f
                LEFT JOIN feeds ON f.id = feeds.folderId
                LEFT JOIN articles ON feeds.id = articles.feedId
                WHERE f.id = ?
                GROUP BY f.id
            `, [folderId]);
        },

        // Batch delete folders - with cascade handling
        async batchDelete(folderIds) {
            if (folderIds.length === 0) return { success: true, deletedCount: 0 };

            let deletedCount = 0;
            await dbConnection.transaction(async () => {
                for (const folderId of folderIds) {
                    // Move feeds out of folders first
                    await dbConnection.run("UPDATE feeds SET folderId = NULL WHERE folderId = ?", [folderId]);
                    // Delete folder
                    const result = await dbConnection.runPrepared('folders.delete', [folderId]);
                    deletedCount += result.changes;
                }
            });

            return { success: true, deletedCount };
        }
    };
};

module.exports = { FolderOperations };