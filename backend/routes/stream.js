const express = require('express');
const router = express.Router();
const { getDriveClient } = require('../services/googleDrive');
const checkWatchLimit = require('../middleware/watchLimit');

/**
 * GET /api/stream/:videoId
 *
 * Proxies a video file from Google Drive to the client.
 * Supports HTTP Range headers so the player can seek & buffer.
 * The checkWatchLimit middleware runs first to enforce parental controls.
 */
router.get('/:videoId', checkWatchLimit, async (req, res) => {
  const { videoId } = req.params;

  try {
    const { authClient } = getDriveClient();
    
    // 1. Fetch a short-lived access token from the Service Account
    const authResponse = await authClient.getAccessToken();
    const token = authResponse.token;

    // 2. Send the token and the direct Google Drive media link back to the client.
    // The mobile app will stream DIRECTLY from Google Drive, saving 100% of our backend bandwidth!
    return res.json({
      url: `https://www.googleapis.com/drive/v3/files/${videoId}?alt=media&supportsAllDrives=true`,
      token
    });
  } catch (err) {
    console.error('Stream error:', err.message);

    // Google API error responses have a `code` field
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
