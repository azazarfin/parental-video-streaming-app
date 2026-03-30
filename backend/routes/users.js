const express = require('express');
const router = express.Router();
const User = require('../models/User');
const WatchHistory = require('../models/WatchHistory');
const { getTodayLimit, isNewDayBD } = require('../utils/bdTime');

/**
 * GET /api/users
 * Returns a list of all users with their watch schedules and status.
 */
router.get('/', async (req, res) => {
  try {
    // Batch-reset users whose last watch was on a previous day (BD time)
    // Calculate today's start in UTC (midnight BD = 18:00 UTC previous day)
    const bdNow = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const todayStr = bdNow.toISOString().slice(0, 10);
    const todayStartUTC = new Date(`${todayStr}T00:00:00+06:00`);

    await User.updateMany(
      { totalWatchedToday: { $gt: 0 }, lastWatchedDate: { $lt: todayStartUTC } },
      { $set: { totalWatchedToday: 0 } }
    );

    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * GET /api/users/:id
 * Returns a single user with computed todayLimit for real-time polling.
 */
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Proactively reset if last watched was yesterday
    if (isNewDayBD(user.lastWatchedDate) && user.totalWatchedToday > 0) {
      user.totalWatchedToday = 0;
      await user.save();
    }

    res.json({
      ...user.toObject(),
      todayLimit: getTodayLimit(user.watchSchedule),
    });
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

/**
 * PUT /api/users/:id
 * Updates user settings (watchSchedule, etc.)
 */
router.put('/:id', async (req, res) => {
  try {
    const { watchSchedule } = req.body;

    const updates = {};
    if (watchSchedule) {
      if (watchSchedule.weekday !== undefined) {
        updates['watchSchedule.weekday'] = Number(watchSchedule.weekday);
      }
      if (watchSchedule.weekend !== undefined) {
        updates['watchSchedule.weekend'] = Number(watchSchedule.weekend);
      }
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { returnDocument: 'after' }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * POST /api/users/:id/reset
 * Resets a user's daily watch time to 0.
 */
router.post('/:id/reset', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.totalWatchedToday = 0;
    await user.save();

    res.json({ message: 'Watch time reset.', user });
  } catch (err) {
    console.error('Error resetting user:', err);
    res.status(500).json({ error: 'Failed to reset user' });
  }
});

/**
 * POST /api/users/:id/reset-all
 * Full stats reset: clears watch time, watch history, and session.
 * Does NOT touch video/publishing data.
 */
router.post('/:id/reset-all', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Reset user stats
    user.totalWatchedToday = 0;
    user.lastWatchedDate = new Date();
    user.activeSessionToken = null;
    user.lastStatsReset = new Date();
    await user.save();

    // Delete all watch history records for this user
    const deleted = await WatchHistory.deleteMany({ user: user._id });

    res.json({
      message: 'Full stats reset completed.',
      watchHistoryDeleted: deleted.deletedCount,
      user,
    });
  } catch (err) {
    console.error('Error in full reset:', err);
    res.status(500).json({ error: 'Failed to reset stats' });
  }
});

module.exports = router;
