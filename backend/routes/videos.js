const express = require('express');
const router = express.Router();
const Video = require('../models/Video');

/**
 * GET /api/videos
 * Returns videos with pagination and search support.
 *
 * Query params:
 *   available=true   → only published videos
 *   page=1           → page number (1-indexed)
 *   limit=30         → items per page (default 30, max 100)
 *   q=naruto         → search by title or episode number
 *
 * Response: { videos: [...], page, totalPages, totalCount, hasMore }
 */
router.get('/', async (req, res) => {
  try {
    const filter = req.query.available === 'true' ? { isAvailable: true } : {};

    // Search support
    const q = (req.query.q || '').trim();
    if (q) {
      const epNum = Number(q);
      if (!isNaN(epNum) && String(epNum) === q) {
        // Exact episode number search
        filter.episodeNumber = epNum;
      } else {
        // Title text search (case-insensitive)
        filter.title = { $regex: q, $options: 'i' };
      }
    }

    // Pagination
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const skip = (page - 1) * limit;

    const [videos, totalCount] = await Promise.all([
      Video.find(filter).sort({ episodeNumber: 1 }).skip(skip).limit(limit),
      Video.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      videos,
      page,
      totalPages,
      totalCount,
      hasMore: page < totalPages,
    });
  } catch (err) {
    console.error('Error fetching videos:', err);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

/**
 * POST /api/videos
 * Adds a new video to the queue.
 */
router.post('/', async (req, res) => {
  try {
    const { googleDriveFileId, title, episodeNumber } = req.body;

    if (!googleDriveFileId || !title || episodeNumber === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const video = new Video({
      googleDriveFileId,
      title,
      episodeNumber: Number(episodeNumber),
      publishAt: new Date(),
      isAvailable: false,
    });

    await video.save();
    res.status(201).json(video);
  } catch (err) {
    console.error('Error creating video:', err);
    res.status(500).json({ error: 'Failed to add video to queue' });
  }
});

/**
 * POST /api/videos/import
 * Bulk import videos from a list of Drive files.
 * Body: { files: [{ fileId, name }], startEpisode: number }
 */
router.post('/import', async (req, res) => {
  try {
    const { files, startEpisode } = req.body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'files array is required.' });
    }

    const start = Number(startEpisode) || 1;
    const created = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];

      try {
        const video = new Video({
          googleDriveFileId: f.fileId,
          title: f.name.replace(/\.[^/.]+$/, ''), // strip file extension
          episodeNumber: start + i,
          publishAt: new Date(),
          isAvailable: false,
        });
        await video.save();
        created.push(video);
      } catch (saveErr) {
        if (saveErr.code === 11000) {
          // duplicate key error ignored safely
          continue;
        }
        throw saveErr;
      }
    }

    res.status(201).json({
      message: `Imported ${created.length} video(s). ${files.length - created.length} skipped (duplicates).`,
      videos: created,
    });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: 'Failed to import videos.' });
  }
});

/**
 * PUT /api/videos/:id/publish
 * Toggle publish status of a video.
 */
router.put('/:id/publish', async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    video.isAvailable = !video.isAvailable;
    if (video.isAvailable) {
      video.publishAt = new Date();
    }
    await video.save();

    res.json({ message: `Video ${video.isAvailable ? 'published' : 'unpublished'}.`, video });
  } catch (err) {
    console.error('Publish toggle error:', err);
    res.status(500).json({ error: 'Failed to update video.' });
  }
});

/**
 * DELETE /api/videos/:id
 * Remove a video from the system.
 */
router.delete('/:id', async (req, res) => {
  try {
    const video = await Video.findByIdAndDelete(req.params.id);
    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }
    res.json({ message: 'Video deleted.', video });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Failed to delete video.' });
  }
});

/**
 * PATCH /api/videos/bulk
 * Perform bulk actions on videos
 * Body: { action: 'publish' | 'unpublish' | 'delete', videoIds: [String] }
 */
router.patch('/bulk', async (req, res) => {
  try {
    const { action, videoIds } = req.body;
    if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty videoIds array.' });
    }

    if (action === 'delete') {
      await Video.deleteMany({ _id: { $in: videoIds } });
    } else if (action === 'publish' || action === 'unpublish') {
      const isAvailable = action === 'publish';
      await Video.updateMany(
        { _id: { $in: videoIds } },
        { $set: { isAvailable, ...(isAvailable && { publishAt: new Date() }) } }
      );
    } else {
      return res.status(400).json({ error: 'Invalid action.' });
    }

    res.json({ message: `Bulk action '${action}' completed successfully.` });
  } catch (err) {
    console.error('Bulk action error:', err);
    res.status(500).json({ error: 'Failed to perform bulk action.' });
  }
});

module.exports = router;
