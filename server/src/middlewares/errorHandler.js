const mongoose = require('mongoose');
const { ZodError } = require('zod');
const AppError = require('../utils/AppError');
const { sendError } = require('../utils/response');
const env = require('../config/env');

// the single place a thrown error becomes a response, next is unused but Express needs the 4th argument
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const mapped = mapError(err);

  // the log gets the real error, but expected 4xx noise stays out of the test output
  if (mapped.status >= 500 || env.nodeEnv === 'development') {
    console.error(err);
  }

  return sendError(res, mapped);
}

// each expected error type gets a status and a stable code, anything unknown is a 500
function mapError(err) {
  if (err instanceof AppError) {
    return { status: err.statusCode, code: err.code, message: err.message, details: err.details };
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));
    return { status: 400, code: 'VALIDATION_ERROR', message: 'Validation failed', details };
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((fieldError) => ({
      field: fieldError.path,
      message: fieldError.message,
    }));
    return { status: 400, code: 'VALIDATION_ERROR', message: 'Validation failed', details };
  }

  if (err instanceof mongoose.Error.CastError) {
    return { status: 400, code: 'INVALID_ID', message: `Invalid value for ${err.path}` };
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return { status: 401, code: 'INVALID_TOKEN', message: 'Session is no longer valid, sign in again' };
  }

  // a service catches its own duplicate key, this is the backstop so a race never surfaces as a 500
  if (err.code === 11000) {
    return { status: 409, code: 'DUPLICATE_KEY', message: 'Record already exists' };
  }

  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: env.isProduction ? 'Something went wrong' : err.message,
  };
}

module.exports = errorHandler;
