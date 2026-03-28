const mongoose = require('mongoose');

const watchHistorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  video: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Video',
    default: null,
  },
  videoTitle: {
    type: String,
    default: 'Unknown',
  },
  // Duration of this heartbeat interval in seconds
  durationSeconds: {
    type: Number,
    required: true,
    default: 10,
  },
  // When this watch event happened (stored in UTC)
  watchedAt: {
    type: Date,
    default: Date.now,
  },
  // Day of week in Bangladesh time when this was recorded
  dayOfWeek: {
    type: String,
    enum: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  },
  // Session token that was active during this watch
  sessionToken: {
    type: String,
  },
}, { timestamps: true });

// Index for efficient analytics queries
watchHistorySchema.index({ user: 1, watchedAt: -1 });
watchHistorySchema.index({ watchedAt: -1 });

const WatchHistory = mongoose.model('WatchHistory', watchHistorySchema);
module.exports = WatchHistory;
