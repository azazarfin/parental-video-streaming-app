/**
 * seed.js — Run once to create the initial user.
 * Usage: node seed.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function seed() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI not set in .env');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.');

  const username = 'murshed007';

  const existing = await User.findOne({ username });
  if (existing) {
    console.log(`User "${username}" already exists (ID: ${existing._id}). Skipping.`);
  } else {
    const user = new User({
      username,
      watchSchedule: {
        weekday: 60,   // 60 min on Sun–Thu
        weekend: 120,  // 120 min on Fri–Sat
      },
    });
    await user.save();
    console.log(`Created user "${username}" (ID: ${user._id})`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
