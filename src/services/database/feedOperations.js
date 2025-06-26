// feedOperations.js - Database operations for feeds
const FeedOperations = (db) => {
    return {
        // Get all feeds with their display names
        async getAll() {
            return new Promise((resolve, reject) => {
                db.all("SELECT *, COALESCE(displayName, name) as name FROM feeds ORDER BY orderIndex ASC, name ASC", [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        },

        // Add a new feed
        async add(feedName, feedUrl) {
            return new Promise((resolve, reject) => {
                // Get the next order index
                db.get("SELECT MAX(orderIndex) as maxOrder FROM feeds", [], (err, row) => {
                    if (err) return reject(err);
                    const nextOrder = (row.maxOrder || 0) + 1;
                    
                    const stmt = db.prepare("INSERT INTO feeds (name, url, orderIndex) VALUES (?, ?, ?)");
                    stmt.run(feedName, feedUrl, nextOrder, function (err) {
                        if (err) return reject(new Error("Failed to add feed. It may already exist."));
                        resolve(this.lastID);
                    });
                    stmt.finalize();
                });
            });
        },

        // Delete a feed
        async delete(feedId) {
            return new Promise((resolve, reject) => {
                db.run("DELETE FROM feeds WHERE id = ?", [feedId], (err) => {
                    if (err) reject(err);
                    else resolve({ success: true, id: feedId });
                });
            });
        },

        // Update feed display name
        async updateDisplayName(feedId, displayName) {
            return new Promise((resolve, reject) => {
                db.run("UPDATE feeds SET displayName = ? WHERE id = ?", [displayName, feedId], (err) => {
                    if (err) reject(err);
                    else resolve({ success: true });
                });
            });
        },

        // Move feed to folder
        async moveToFolder(feedId, folderId) {
            return new Promise((resolve, reject) => {
                db.run("UPDATE feeds SET folderId = ? WHERE id = ?", [folderId, feedId], (err) => {
                    if (err) reject(err);
                    else resolve({ success: true });
                });
            });
        },

        // Reorder feeds
        async reorder(feedId, newIndex, targetFolderId) {
            return new Promise((resolve, reject) => {
                db.serialize(() => {
                    // First, update the feed's folder if it changed
                    if (targetFolderId !== undefined) {
                        db.run("UPDATE feeds SET folderId = ? WHERE id = ?", [targetFolderId, feedId]);
                    }
                    
                    // Get all feeds in the target folder
                    const folderCondition = targetFolderId ? "folderId = ?" : "folderId IS NULL";
                    const params = targetFolderId ? [targetFolderId] : [];
                    
                    db.all(`SELECT id, orderIndex FROM feeds WHERE ${folderCondition} ORDER BY orderIndex ASC`, params, (err, feeds) => {
                        if (err) return reject(err);
                        
                        // Remove the dragged feed from the array
                        const draggedFeed = feeds.find(f => f.id === feedId);
                        const filteredFeeds = feeds.filter(f => f.id !== feedId);
                        
                        // Insert at new position
                        filteredFeeds.splice(newIndex, 0, draggedFeed);
                        
                        // Update order indices
                        const stmt = db.prepare("UPDATE feeds SET orderIndex = ? WHERE id = ?");
                        filteredFeeds.forEach((feed, index) => {
                            stmt.run(index, feed.id);
                        });
                        stmt.finalize((err) => {
                            if (err) reject(err);
                            else resolve({ success: true });
                        });
                    });
                });
            });
        }
    };
};

module.exports = { FeedOperations };