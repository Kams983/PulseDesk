const mongoose = require('mongoose');
const { ZodError } = require('zod');
const AppError = require('../utils/AppError');
const { sendError } = require('../utils/response');
const env = require('../config/env');

// the single place a thrown error becomes a response. next is unused, but Express needs four arguments.
// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  const mapped = mapError(error);

  // the log gets the real error, but expected 4xx noise stays out of the test output
  if (mapped.status >= 500 || env.nodeEnv === 'development') {
    console.error(error);
  }

  return sendError(res, mapped);
}

// each error we expect gets a status and a stable code, anything unknown is a 500
function mapError(error) {
  if (error instanceof AppError) {
    return { status: error.statusCode, code: error.code, message: error.message, details: error.details };
  }

  if (error instanceof ZodError) {
    return fromZodError(error);
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return fromMongooseValidationError(error);
  }

  if (error instanceof mongoose.Error.CastError) {
    return { status: 400, code: 'INVALID_ID', message: `Invalid value for ${error.path}` };
  }

  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    return { status: 401, code: 'INVALID_TOKEN', message: 'Session is no longer valid, sign in again' };
  }

  // services catch their own duplicate key, this is the backstop so a race never surfaces as a 500
  if (error.code === 11000) {
    return { status: 409, code: 'DUPLICATE_KEY', message: 'Record already exists' };
  }

  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: env.isProduction ? 'Something went wrong' : error.message,
  };
}

// the field path is what lets a form put the message beside the input it belongs to
function fromZodError(error) {
  const details = error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));

  return { status: 400, code: 'VALIDATION_ERROR', message: 'Validation failed', details };
}

function fromMongooseValidationError(error) {
  const details = Object.values(error.errors).map((fieldError) => ({
    field: fieldError.path,
    message: fieldError.message,
  }));

  return { status: 400, code: 'VALIDATION_ERROR', message: 'Validation failed', details };
}

module.exports = errorHandler;
