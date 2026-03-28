const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');

/**
 * POST /api/auth/login
 * No password needed. Looks up user by username, generates a new session token.
 * Any previous session is invalidated (single-device enforcement).
 */
router.post('/login', async (req, res) => {
  try {
    const { username } = req.body;

    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'username is required.' });
    }

    const user = await User.findOne({ username: username.trim().toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: 'User not found. Contact admin.' });
    }

    // Generate a new session token — invalidates any old session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    user.activeSessionToken = sessionToken;
    await user.save();

    return res.json({
      message: 'Login successful.',
      user: {
        _id: user._id,
        username: user.username,
        watchSchedule: user.watchSchedule,
        totalWatchedToday: user.totalWatchedToday,
        lastWatchedDate: user.lastWatchedDate,
      },
      sessionToken,
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/auth/verify
 * Verify that a session token is still valid (not kicked by another login).
 */
router.post('/verify', async (req, res) => {
  try {
    const { userId, sessionToken } = req.body;

    if (!userId || !sessionToken) {
      return res.status(400).json({ valid: false, error: 'userId and sessionToken required.' });
    }

    const user = await User.findById(userId);
    if (!user || user.activeSessionToken !== sessionToken) {
      return res.json({ valid: false, error: 'Session expired. Another device logged in.' });
    }

    return res.json({ valid: true, user });
  } catch (err) {
    console.error('Verify error:', err);
    return res.status(500).json({ valid: false, error: 'Internal server error.' });
  }
});

module.exports = router;
