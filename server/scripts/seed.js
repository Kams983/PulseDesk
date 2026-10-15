const mongoose = require('mongoose');
const connectDb = require('../src/config/db');

// demo data arrives in a later phase, for now this only proves the script wiring works
async function seed() {
  await connectDb();
  console.log('seed: nothing to create yet');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('seed failed:', err.message);
  process.exit(1);
});
