const rateLimit = require('express-rate-limit');
const env = require('../config/env');

// a test suite fires far more requests than a person, so the limiters would only make it fight itself
const skipInTest = () => env.isTest;

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
});

// guessing passwords is the one thing worth slowing down hard
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    success: false,
    message: 'Too many attempts, try again in a few minutes',
    data: null,
    meta: { code: 'RATE_LIMITED' },
  },
});

module.exports = { generalLimiter, loginLimiter };
