const AppError = require('../utils/AppError');

// anything reaching this missed every route
function notFound(req, res, next) {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

module.exports = notFound;
