// tests read no .env file, but config/env.js still validates, so give it real looking values
process.env.NODE_ENV = 'test';
process.env.PORT = '5001';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/emr-test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-chars';
process.env.ACCESS_TOKEN_TTL = '15m';
process.env.REFRESH_TOKEN_TTL_DAYS = '7';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.CLINIC_TIMEZONE = 'Africa/Lagos';
