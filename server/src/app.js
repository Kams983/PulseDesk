const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const routes = require('./routes');
const { generalLimiter } = require('./middlewares/rateLimiters');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// Render terminates TLS and forwards the request, so one proxy sits in front of the app in production and
// trusting exactly that one makes req.ip the real client instead of the proxy, which is what the rate
// limiters key on. Locally nothing sits in front, so it stays off.
if (env.isProduction) {
  app.set('trust proxy', 1);
}

app.use(helmet());
// the browser client sends cookies, so the origin has to be named, not a wildcard
app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(generalLimiter);

// everything under one versioned path, so a later v2 can sit next to it
app.use('/api/v1', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
