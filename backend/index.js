require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Configure CORS to accept requests from specific origin
const allowedOrigins = ['https://streamingapp-admin.netlify.app', 'http://localhost:5173', 'http://localhost:3000'];
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
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
const progressRoutes = require('./routes/progress');

app.use('/api/auth', authRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/heartbeat', heartbeatRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/videos', videosRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/progress', progressRoutes);

// Cron jobs
const { startVideoPublisher } = require('./cron/videoPublisher');
startVideoPublisher();

app.get('/', (req, res) => {
  res.send('Video Streaming Platform Backend API is running.');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
