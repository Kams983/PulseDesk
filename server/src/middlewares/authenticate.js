const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/user.model');
const AppError = require('../utils/AppError');

// verifies the access token, then re-reads the user so a deactivated account loses access immediately
async function authenticate(req, res, next) {
  const token = readAccessToken(req);

  if (!token) {
    return next(AppError.unauthorized());
  }

  let payload;

  try {
    payload = jwt.verify(token, env.jwtAccessSecret);
  } catch (err) {
    // expired and tampered tokens both become a 401 in the error middleware
    return next(err);
  }

  const user = await User.findById(payload.sub).lean();

  if (!user || !user.isActive) {
    return next(AppError.unauthorized('Account is no longer active'));
  }

  req.user = { id: user._id.toString(), role: user.role, name: user.name, email: user.email };

  return next();
}

function readAccessToken(req) {
  const header = req.headers.authorization;

  if (header && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length);
  }

  return undefined;
}

module.exports = authenticate;
