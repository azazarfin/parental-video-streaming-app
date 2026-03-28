const User = require('../models/User');
const { getTodayLimit, isNewDayBD } = require('../utils/bdTime');

/**
 * Middleware: checkWatchLimit
 *
 * Runs before the video stream handler on /api/stream/:videoId.
 * Validates session token and checks Bangladesh-time weekday/weekend limits.
 */
async function checkWatchLimit(req, res, next) {
  try {
    const userId = req.query.userId || req.headers['x-user-id'];
    const sessionToken = req.query.sessionToken || req.headers['x-session-token'];

    if (!userId) {
      return res.status(400).json({ error: 'userId is required (query param or x-user-id header).' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Single-device enforcement
    if (!sessionToken || user.activeSessionToken !== sessionToken) {
      return res.status(403).json({
        error: 'Session expired. Another device has logged in.',
        kicked: true,
      });
    }

    // Reset counter if it's a new day in Bangladesh time
    if (isNewDayBD(user.lastWatchedDate)) {
      user.totalWatchedToday = 0;
      user.lastWatchedDate = new Date();
      await user.save();
    }

    // Get today's limit based on weekday/weekend schedule
    const todayLimit = getTodayLimit(user.watchSchedule);

    if (user.totalWatchedToday >= todayLimit) {
      return res.status(403).json({
        error: 'Daily watch limit reached. Please come back tomorrow!',
        totalWatchedToday: user.totalWatchedToday,
        dailyWatchLimit: todayLimit,
      });
    }

    // Attach user to the request
    req.user = user;
    next();
  } catch (err) {
    console.error('Watch limit middleware error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

module.exports = checkWatchLimit;
