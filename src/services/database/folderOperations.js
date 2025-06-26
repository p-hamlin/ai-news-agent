// folderOperations.js - Database operations for folders
const FolderOperations = (db) => {
    return {
        // Get all folders
        async getAll() {
            return new Promise((resolve, reject) => {
                db.all("SELECT * FROM folders ORDER BY orderIndex ASC, name ASC", [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        },

        // Create a new folder
        async create(folderName) {
            return new Promise((resolve, reject) => {
                // Get the next order index
                db.get("SELECT MAX(orderIndex) as maxOrder FROM folders", [], (err, row) => {
                    if (err) return reject(err);
                    const nextOrder = (row.maxOrder || 0) + 1;
                    
                    const stmt = db.prepare("INSERT INTO folders (name, orderIndex) VALUES (?, ?)");
                    stmt.run(folderName, nextOrder, function (err) {
                        if (err) return reject(new Error("Failed to create folder."));
                        resolve({ id: this.lastID, name: folderName, orderIndex: nextOrder });
                    });
                    stmt.finalize();
                });
            });
        },

        // Delete a folder
        async delete(folderId) {
            return new Promise((resolve, reject) => {
                // First move all feeds out of this folder
                db.run("UPDATE feeds SET folderId = NULL WHERE folderId = ?", [folderId], (err) => {
                    if (err) return reject(err);
                    // Then delete the folder
                    db.run("DELETE FROM folders WHERE id = ?", [folderId], (err) => {
                        if (err) return reject(err);
                        resolve({ success: true, id: folderId });
                    });
                });
            });
        },

        // Rename a folder
        async rename(folderId, newName) {
            return new Promise((resolve, reject) => {
                db.run("UPDATE folders SET name = ? WHERE id = ?", [newName, folderId], (err) => {
                    if (err) reject(err);
                    else resolve({ success: true });
                });
            });
        },

        // Reorder folders
        async reorder(folderId, newIndex) {
            return new Promise((resolve, reject) => {
                db.all("SELECT id, orderIndex FROM folders ORDER BY orderIndex ASC", [], (err, folders) => {
                    if (err) return reject(err);
                    
                    // Remove the dragged folder from the array
                    const draggedFolder = folders.find(f => f.id === folderId);
                    const filteredFolders = folders.filter(f => f.id !== folderId);
                    
                    // Insert at new position
                    filteredFolders.splice(newIndex, 0, draggedFolder);
                    
                    // Update order indices
                    const stmt = db.prepare("UPDATE folders SET orderIndex = ? WHERE id = ?");
                    filteredFolders.forEach((folder, index) => {
                        stmt.run(index, folder.id);
                    });
                    stmt.finalize((err) => {
                        if (err) reject(err);
                        else resolve({ success: true });
                    });
                });
            });
        }
    };
};

module.exports = { FolderOperations };