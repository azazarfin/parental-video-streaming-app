const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Video = require('../models/Video');
const PlaybackProgress = require('../models/PlaybackProgress');

async function authenticateSession(req, res) {
  const userId = req.query.userId || req.body.userId;
  const sessionToken = req.query.sessionToken || req.body.sessionToken;

  if (!userId || !sessionToken) {
    res.status(400).json({ error: 'userId and sessionToken are required.' });
    return null;
  }

  const user = await User.findById(userId);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return null;
  }

  if (user.activeSessionToken !== sessionToken) {
    res.status(403).json({
      error: 'Session expired. Another device has logged in.',
      kicked: true,
    });
    return null;
  }

  return user;
}

function normalizeEntry(entry) {
  if (!entry || !entry.googleDriveFileId) return null;

  const positionSeconds = Number(entry.positionSeconds);
  if (!Number.isFinite(positionSeconds) || positionSeconds <= 0) return null;

  const watchedAt = entry.watchedAt ? new Date(entry.watchedAt) : new Date();
  if (Number.isNaN(watchedAt.getTime())) return null;

  return {
    googleDriveFileId: String(entry.googleDriveFileId).trim(),
    title: typeof entry.title === 'string' ? entry.title.trim() : '',
    episodeNumber:
      entry.episodeNumber === null || entry.episodeNumber === undefined
        ? null
        : Number(entry.episodeNumber),
    positionSeconds,
    watchedAt,
  };
}

function serializeProgress(doc) {
  return {
    googleDriveFileId: doc.googleDriveFileId,
    title: doc.title,
    episodeNumber: doc.episodeNumber,
    positionSeconds: doc.positionSeconds,
    watchedAt: doc.watchedAt,
    updatedAt: doc.updatedAt,
  };
}

router.get('/', async (req, res) => {
  try {
    const user = await authenticateSession(req, res);
    if (!user) return;

    const progress = await PlaybackProgress.find({ user: user._id })
      .sort({ watchedAt: -1, updatedAt: -1 })
      .lean();

    return res.json({
      progress: progress.map(serializeProgress),
    });
  } catch (err) {
    console.error('Progress fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch playback progress.' });
  }
});

router.post('/sync', async (req, res) => {
  try {
    const user = await authenticateSession(req, res);
    if (!user) return;

    const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
    if (entries.length === 0) {
      return res.json({ syncedCount: 0, progress: [] });
    }

    const results = [];

    for (const rawEntry of entries) {
      const entry = normalizeEntry(rawEntry);
      if (!entry) continue;

      const videoDoc = await Video.findOne({ googleDriveFileId: entry.googleDriveFileId })
        .select('_id title episodeNumber')
        .lean();

      const existing = await PlaybackProgress.findOne({
        user: user._id,
        googleDriveFileId: entry.googleDriveFileId,
      });

      if (existing && existing.watchedAt && existing.watchedAt.getTime() > entry.watchedAt.getTime()) {
        results.push(serializeProgress(existing));
        continue;
      }

      const payload = {
        title: entry.title || videoDoc?.title || existing?.title || '',
        episodeNumber:
          entry.episodeNumber !== null && !Number.isNaN(entry.episodeNumber)
            ? entry.episodeNumber
            : videoDoc?.episodeNumber ?? existing?.episodeNumber ?? null,
        positionSeconds: entry.positionSeconds,
        watchedAt: entry.watchedAt,
      };

      if (videoDoc?._id) {
        payload.video = videoDoc._id;
      }

      const doc = await PlaybackProgress.findOneAndUpdate(
        {
          user: user._id,
          googleDriveFileId: entry.googleDriveFileId,
        },
        {
          $set: payload,
          $setOnInsert: {
            user: user._id,
            googleDriveFileId: entry.googleDriveFileId,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      ).lean();

      results.push(serializeProgress(doc));
    }

    return res.json({
      syncedCount: results.length,
      progress: results,
    });
  } catch (err) {
    console.error('Progress sync error:', err);
    return res.status(500).json({ error: 'Failed to sync playback progress.' });
  }
});

module.exports = router;
