const dotenv = require('dotenv');

// quiet, otherwise dotenv prints a banner on every test run
dotenv.config({ quiet: true });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/emr',
  clinicTimezone: process.env.CLINIC_TIMEZONE || 'Africa/Lagos',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
};

module.exports = env;
