const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
// the client sends its refresh cookie, so the origin has to be named, not a wildcard
app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    // the test suite fires many requests from the same ip, so the limiter would only add noise
    skip: () => env.nodeEnv === 'test',
  })
);

app.use('/api/v1', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
