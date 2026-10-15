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
