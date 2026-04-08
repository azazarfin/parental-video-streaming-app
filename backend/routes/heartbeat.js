const express = require('express');
const router = express.Router();
const User = require('../models/User');
const WatchHistory = require('../models/WatchHistory');
const Video = require('../models/Video');
const { getBangladeshDayName, getTodayLimit, isNewDayBD } = require('../utils/bdTime');
const checkAppVersion = require('../middleware/versionCheck');

/**
 * POST /api/heartbeat
 *
 * Called by the mobile app every ~10 seconds while a video is playing.
 * Validates session token for single-device enforcement.
 * Uses Bangladesh time (GMT+6) for day resets and weekday/weekend limits.
 *
 * Expected body:
 *   { userId: string, duration: number, sessionToken: string, videoId?: string }
 */
router.post('/', checkAppVersion, async (req, res) => {
  try {
    const { userId, duration, sessionToken, videoId } = req.body;

    if (!userId || duration == null) {
      return res.status(400).json({ error: 'userId and duration are required.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Single-device enforcement: check session token
    if (!sessionToken || user.activeSessionToken !== sessionToken) {
      return res.status(403).json({
        error: 'Session expired. Another device has logged in.',
        kicked: true,
      });
    }

    const durationInMinutes = Number(duration) / 60;

    // Reset totalWatchedToday if it's a new day in Bangladesh time
    if (isNewDayBD(user.lastWatchedDate)) {
      user.totalWatchedToday = 0;
    }

    user.totalWatchedToday += durationInMinutes;
    user.lastWatchedDate = new Date();
    await user.save();

    // Get today's limit based on weekday/weekend
    const todayLimit = getTodayLimit(user.watchSchedule);
    const dayName = getBangladeshDayName();

    // Record watch history for analytics (Upsert to avoid creating millions of tiny documents)
    try {
      const videoDoc = videoId ? await Video.findOne({ googleDriveFileId: videoId }) : null;
      
      // Update existing session document instead of creating a new one every 10s
      await WatchHistory.findOneAndUpdate(
        { 
          user: user._id, 
          video: videoDoc ? videoDoc._id : null, 
          sessionToken // Groups by the active login session
        },
        { 
          $inc: { durationSeconds: Number(duration) },
          $setOnInsert: { 
            videoTitle: videoDoc ? videoDoc.title : 'Unknown',
            watchedAt: new Date(),
            dayOfWeek: dayName,
          }
        },
        { upsert: true, returnDocument: 'after' }
      );
    } catch (histErr) {
      console.error('Failed to record watch history:', histErr);
      // Don't block the heartbeat response
    }

    return res.json({
      message: 'Heartbeat recorded.',
      totalWatchedToday: user.totalWatchedToday,
      dailyWatchLimit: todayLimit,
      dayOfWeek: dayName,
      limitReached: user.totalWatchedToday >= todayLimit,
    });
  } catch (err) {
    console.error('Heartbeat error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
