const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/AppError');

// access tokens are short lived, the refresh cookie is what keeps a session alive across reloads
function authenticate(req, res, next) {
  const token = readAccessToken(req);

  if (!token) {
    return next(AppError.unauthorized());
  }

  try {
    const payload = jwt.verify(token, env.jwtAccessSecret);
    req.user = { id: payload.sub, role: payload.role, name: payload.name, email: payload.email };

    return next();
  } catch (err) {
    // expired and tampered tokens both land in the error middleware as a 401
    return next(err);
  }
}

// the header is for api clients, the cookie is what the browser client uses
function readAccessToken(req) {
  const header = req.headers.authorization;

  if (header && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length);
  }

  return req.cookies && req.cookies.access_token;
}

module.exports = authenticate;
