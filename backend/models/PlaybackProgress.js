const mongoose = require('mongoose');

const playbackProgressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    googleDriveFileId: {
      type: String,
      required: true,
      trim: true,
    },
    video: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Video',
      default: null,
    },
    title: {
      type: String,
      default: '',
      trim: true,
    },
    episodeNumber: {
      type: Number,
      default: null,
    },
    positionSeconds: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    watchedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

playbackProgressSchema.index({ user: 1, googleDriveFileId: 1 }, { unique: true });
playbackProgressSchema.index({ user: 1, watchedAt: -1 });

const PlaybackProgress = mongoose.model('PlaybackProgress', playbackProgressSchema);
module.exports = PlaybackProgress;
