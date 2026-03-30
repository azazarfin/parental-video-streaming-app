const express = require('express');
const router = express.Router();
const WatchHistory = require('../models/WatchHistory');
const User = require('../models/User');
const { getBangladeshDayName, getTodayLimit, getBangladeshDateString, isNewDayBD } = require('../utils/bdTime');

/**
 * GET /api/analytics
 * Returns aggregated analytics: daily totals, per-video breakdown, current status.
 */
router.get('/', async (req, res) => {
  try {
    const users = await User.find();

    // Get watch history for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const history = await WatchHistory.find({
      watchedAt: { $gte: thirtyDaysAgo },
    }).sort({ watchedAt: -1 });

    // Aggregate by date (Bangladesh time)
    const dailyTotals = {};
    const perVideo = {};
    const dayOfWeekTotals = {
      Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0,
      Thursday: 0, Friday: 0, Saturday: 0,
    };

    history.forEach((h) => {
      // Convert to BD time for date grouping
      const bdTime = new Date(new Date(h.watchedAt).getTime() + 6 * 60 * 60 * 1000);
      const dateStr = bdTime.toISOString().slice(0, 10);
      const minutes = h.durationSeconds / 60;

      // Daily totals
      if (!dailyTotals[dateStr]) {
        dailyTotals[dateStr] = { date: dateStr, totalMinutes: 0, sessions: 0 };
      }
      dailyTotals[dateStr].totalMinutes += minutes;
      dailyTotals[dateStr].sessions += 1;

      // Per video
      const title = h.videoTitle || 'Unknown';
      if (!perVideo[title]) {
        perVideo[title] = { title, totalMinutes: 0, sessions: 0 };
      }
      perVideo[title].totalMinutes += minutes;
      perVideo[title].sessions += 1;

      // Day of week totals
      if (h.dayOfWeek && dayOfWeekTotals[h.dayOfWeek] !== undefined) {
        dayOfWeekTotals[h.dayOfWeek] += minutes;
      }
    });

    // Current status
    const todayStr = getBangladeshDateString();
    const dayName = getBangladeshDayName();
    const currentStatus = users.map((u) => {
      // Reset the displayed timer if the last time they watched was yesterday
      let watchedToday = u.totalWatchedToday;
      if (isNewDayBD(u.lastWatchedDate)) {
        watchedToday = 0;
      }

      // User must have an active session AND a heartbeat within the last 5 minutes to be "Online"
      const hasRecentHeartbeat = u.lastWatchedDate && (Date.now() - new Date(u.lastWatchedDate).getTime() < 5 * 60 * 1000);
      const isActuallyOnline = !!u.activeSessionToken && hasRecentHeartbeat;

      return {
        username: u.username,
        totalWatchedToday: Math.round(watchedToday * 100) / 100,
        todayLimit: getTodayLimit(u.watchSchedule),
        dayOfWeek: dayName,
        isOnline: isActuallyOnline,
      };
    });

    return res.json({
      currentStatus,
      dailyTotals: Object.values(dailyTotals).sort((a, b) => a.date.localeCompare(b.date)),
      perVideo: Object.values(perVideo).sort((a, b) => b.totalMinutes - a.totalMinutes),
      dayOfWeekTotals,
      today: todayStr,
      dayName,
    });
  } catch (err) {
    console.error('Analytics error:', err);
    return res.status(500).json({ error: 'Failed to fetch analytics.' });
  }
});

/**
 * GET /api/analytics/sessions
 * Returns recent watch sessions with details.
 */
router.get('/sessions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const sessions = await WatchHistory.find()
      .sort({ watchedAt: -1 })
      .limit(limit)
      .populate('user', 'username')
      .populate('video', 'title episodeNumber');

    const formatted = sessions.map((s) => ({
      _id: s._id,
      username: s.user?.username || 'Unknown',
      videoTitle: s.videoTitle,
      durationSeconds: s.durationSeconds,
      watchedAt: s.watchedAt,
      dayOfWeek: s.dayOfWeek,
    }));

    return res.json(formatted);
  } catch (err) {
    console.error('Sessions error:', err);
    return res.status(500).json({ error: 'Failed to fetch sessions.' });
  }
});

/**
 * GET /api/analytics/hourly
 * Returns hourly watch time breakdown for a specific date (YYYY-MM-DD).
 */
router.get('/hourly', async (req, res) => {
  try {
    const targetDate = req.query.date;
    if (!targetDate) return res.status(400).json({ error: 'date query parameter required (YYYY-MM-DD)' });

    // Initialize 24-hour array
    const hourlyData = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${i.toString().padStart(2, '0')}:00`,
      minutes: 0,
      sessions: 0,
    }));

    // Calculate precise UTC window for the target BD date (GMT+6)
    // BD date 2024-01-15 00:00:00+06 = UTC 2024-01-14 18:00:00
    // BD date 2024-01-15 23:59:59+06 = UTC 2024-01-15 17:59:59
    const startUTC = new Date(`${targetDate}T00:00:00+06:00`);
    const endUTC = new Date(`${targetDate}T23:59:59.999+06:00`);

    const history = await WatchHistory.find({
      watchedAt: { $gte: startUTC, $lte: endUTC },
    });

    history.forEach((h) => {
      const bdTime = new Date(new Date(h.watchedAt).getTime() + 6 * 60 * 60 * 1000);
      const hour = bdTime.getUTCHours();
      hourlyData[hour].minutes += (h.durationSeconds / 60);
      hourlyData[hour].sessions += 1;
    });

    return res.json(hourlyData);
  } catch (err) {
    console.error('Hourly analytics error:', err);
    return res.status(500).json({ error: 'Failed to fetch hourly analytics.' });
  }
});

module.exports = router;
