const AppError = require('../utils/AppError');

// role guard that always runs after authenticate, routes list the roles so the policy is readable
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(AppError.unauthorized());
    }

    if (!roles.includes(req.user.role)) {
      return next(AppError.forbidden());
    }

    return next();
  };
}

module.exports = authorize;
