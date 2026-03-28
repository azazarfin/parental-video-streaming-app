const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { getTodayLimit, isNewDayBD } = require('../utils/bdTime');

/**
 * GET /api/users
 * Returns a list of all users with their watch schedules and status.
 */
router.get('/', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    
    // Proactively reset any users if their last watch time was on a previous day (BD time)
    for (let u of users) {
      if (isNewDayBD(u.lastWatchedDate) && u.totalWatchedToday > 0) {
        u.totalWatchedToday = 0;
        await u.save();
      }
    }

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
      { new: true }
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

module.exports = router;
