const express = require('express');
const router = express.Router();
const { getDriveClient } = require('../services/googleDrive');

/**
 * GET /api/drive/folder/:folderId
 * Lists all video files in a Google Drive folder.
 * The folder must be shared with the service account.
 */
router.get('/folder/:folderId', async (req, res) => {
  try {
    const { folderId } = req.params;
    const { drive } = getDriveClient();

    // Query for files inside the folder
    let allFiles = [];
    let pageToken = null;

    do {
      const listRes = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, size, createdTime)',
        orderBy: 'name',
        pageSize: 1000,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        pageToken: pageToken,
      });

      allFiles = allFiles.concat(listRes.data.files || []);
      pageToken = listRes.data.nextPageToken;
    } while (pageToken);

    const files = allFiles.map((f) => ({
      fileId: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size ? `${(parseInt(f.size) / (1024 * 1024)).toFixed(1)} MB` : 'Unknown',
      createdTime: f.createdTime,
    }));

    return res.json({
      folderId,
      fileCount: files.length,
      files,
    });
  } catch (err) {
    console.error('Drive folder error:', err.message);
    if (err.code === 404) {
      return res.status(404).json({ error: 'Folder not found. Make sure it is shared with the service account.' });
    }
    return res.status(500).json({ error: 'Failed to list folder contents. ' + err.message });
  }
});

module.exports = router;
