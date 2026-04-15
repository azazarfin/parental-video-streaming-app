const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  // Session token for single-device enforcement
  activeSessionToken: {
    type: String,
    default: null,
  },
  // Weekday/Weekend watch limits in minutes (Bangladesh: Fri-Sat = weekend)
  watchSchedule: {
    weekday: { type: Number, default: 60 },  // Sun-Thu
    weekend: { type: Number, default: 120 }, // Fri-Sat
  },
  // total watched today in minutes
  totalWatchedToday: {
    type: Number,
    required: true,
    default: 0,
  },
  // Date tracker for resetting daily limit (stored in UTC, interpreted as GMT+6)
  lastWatchedDate: {
    type: Date,
    default: Date.now,
  },
  // Timestamp of last full stats reset (used by mobile app to clear local resume data)
  lastStatsReset: {
    type: Date,
    default: null,
  }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
module.exports = User;
