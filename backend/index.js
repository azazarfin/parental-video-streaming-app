require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Configure CORS to accept requests from any origin for now
app.use(cors());
app.use(express.json());

// Set up MongoDB connection
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('MONGODB_URI is not defined in environment variables');
      process.exit(1);
    }
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected successfully');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

connectDB();

// Routes
const authRoutes = require('./routes/auth');
const streamRoutes = require('./routes/stream');
const heartbeatRoutes = require('./routes/heartbeat');
const usersRoutes = require('./routes/users');
const videosRoutes = require('./routes/videos');
const analyticsRoutes = require('./routes/analytics');
const driveRoutes = require('./routes/drive');

app.use('/api/auth', authRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/heartbeat', heartbeatRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/videos', videosRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/drive', driveRoutes);

// Cron jobs
const { startVideoPublisher } = require('./cron/videoPublisher');
startVideoPublisher();

app.get('/', (req, res) => {
  res.send('Video Streaming Platform Backend API is running.');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
