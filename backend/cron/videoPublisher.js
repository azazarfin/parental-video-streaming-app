const cron = require('node-cron');
const Video = require('../models/Video');

/**
 * Scheduled job: runs every day at 10:00 AM server time.
 *
 * Finds the next 5 pending videos (isAvailable === false),
 * ordered by episodeNumber ascending, and publishes them
 * by setting isAvailable to true.
 */
function startVideoPublisher() {
  // cron expression: minute hour day-of-month month day-of-week
  // '0 10 * * *' → every day at 10:00 AM
  cron.schedule('0 10 * * *', async () => {
    console.log('[CRON] Running daily video publisher job…');

    try {
      const pendingVideos = await Video.find({ isAvailable: false })
        .sort({ episodeNumber: 1 })
        .limit(5);

      if (pendingVideos.length === 0) {
        console.log('[CRON] No pending videos to publish.');
        return;
      }

      const ids = pendingVideos.map((v) => v._id);

      await Video.updateMany(
        { _id: { $in: ids } },
        { $set: { isAvailable: true, publishAt: new Date() } }
      );

      console.log(
        `[CRON] Published ${ids.length} video(s):`,
        pendingVideos.map((v) => `Ep ${v.episodeNumber} – ${v.title}`).join(', ')
      );
    } catch (err) {
      console.error('[CRON] Video publisher error:', err);
    }
  });

  console.log('[CRON] Video publisher scheduled (daily at 10:00 AM).');
}

module.exports = { startVideoPublisher };
