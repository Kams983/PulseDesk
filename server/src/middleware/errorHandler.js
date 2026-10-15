const mongoose = require('mongoose');
const { ZodError } = require('zod');
const AppError = require('../utils/AppError');
const { sendError } = require('../utils/apiResponse');
const env = require('../config/env');

// anything reaching this missed every route, so it is a 404 in the standard envelope
function notFound(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));
}

// last stop for every thrown error, keeps stack traces and driver internals out of the response
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return sendError(res, { status: err.status, message: err.message, code: err.code, details: err.details });
  }

  if (err instanceof ZodError) {
    return sendError(res, { status: 400, message: 'Validation failed', code: 'VALIDATION_ERROR', details: err.issues });
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((fieldError) => fieldError.message);
    return sendError(res, { status: 400, message: 'Validation failed', code: 'VALIDATION_ERROR', details });
  }

  // a service should catch its own duplicate key, this is the backstop so a race never surfaces as a 500
  if (err.code === 11000) {
    return sendError(res, { status: 409, message: 'Record already exists', code: 'DUPLICATE_KEY', details: err.keyValue });
  }

  if (env.nodeEnv !== 'test') {
    console.error(err);
  }

  return sendError(res, { status: 500, message: 'Something went wrong', code: 'INTERNAL_ERROR' });
}

module.exports = { notFound, errorHandler };
