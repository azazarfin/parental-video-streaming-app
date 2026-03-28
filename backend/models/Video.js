const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  googleDriveFileId: {
    type: String,
    required: true,
    unique: true,
  },
  title: {
    type: String,
    required: true,
  },
  episodeNumber: {
    type: Number,
    required: true,
  },
  publishAt: {
    type: Date,
    required: true,
  },
  isAvailable: {
    type: Boolean,
    required: true,
    default: false,
  }
}, { timestamps: true });

const Video = mongoose.model('Video', videoSchema);
module.exports = Video;
