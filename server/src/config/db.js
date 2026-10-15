const mongoose = require('mongoose');
const env = require('./env');

// one pooled connection for the whole process, tests connect to an in-memory server instead
async function connectDb(uri = env.mongoUri) {
  mongoose.connection.on('error', (err) => console.error('mongo connection error:', err.message));

  await mongoose.connect(uri);
  console.log('mongo connected');
}

module.exports = connectDb;
