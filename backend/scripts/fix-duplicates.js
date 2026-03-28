const mongoose = require('mongoose');
require('dotenv').config({ path: __dirname + '/../.env' });
const Video = require('../models/Video');

async function fixDuplicates() {
  try {
    console.log('Connecting to MongoDB...', process.env.MONGODB_URI);
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected.');

    const allVideos = await Video.find({}).sort({ createdAt: 1 });
    console.log(`Found ${allVideos.length} total videos.`);

    const seen = new Set();
    let deletedCount = 0;

    for (const video of allVideos) {
      if (seen.has(video.googleDriveFileId)) {
        // duplicate found
        await Video.findByIdAndDelete(video._id);
        deletedCount++;
        console.log(`Deleted duplicate: ${video.title} (ID: ${video.googleDriveFileId})`);
      } else {
        seen.add(video.googleDriveFileId);
      }
    }

    console.log(`\nCleanup complete. Deleted ${deletedCount} duplicate videos.`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

fixDuplicates();
