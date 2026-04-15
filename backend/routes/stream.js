const express = require('express');
const router = express.Router();
const { getDriveClient, resetDriveClient } = require('../services/googleDrive');
const checkWatchLimit = require('../middleware/watchLimit');
const checkAppVersion = require('../middleware/versionCheck');

/**
 * GET /api/stream/:videoId
 *
 * Returns a short-lived Google Drive media URL and token.
 * The mobile app streams directly from Google Drive to avoid
 * backend bandwidth costs on free hosting.
 */
router.get('/:videoId', checkAppVersion, checkWatchLimit, async (req, res) => {
  const { videoId } = req.params;

  try {
    if (req.query.forceRefresh === 'true') {
      resetDriveClient();
    }

    const { authClient } = getDriveClient();
    const authResponse = await authClient.getAccessToken();
    const token = typeof authResponse === 'string' ? authResponse : authResponse?.token;

    if (!token) {
      throw new Error('Failed to obtain a Google Drive access token.');
    }

    return res.json({
      url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(videoId)}?alt=media&supportsAllDrives=true`,
      token,
    });
  } catch (err) {
    console.error('Stream error:', err.message);

    const status = err.code || err.response?.status;

    if (status === 404) {
      return res.status(404).json({ error: 'Video not found on Google Drive.' });
    }

    if (status === 403) {
      return res.status(403).json({
        error:
          'Access denied. The service account may not have access to this file, or the API rate limit has been exceeded.',
      });
    }

    if (status === 429) {
      return res.status(429).json({
        error: 'Google Drive API rate limit exceeded. Please try again later.',
      });
    }

    return res.status(500).json({ error: 'Internal server error while streaming video.' });
  }
});

module.exports = router;
