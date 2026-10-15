const env = require('../config/env');
const authService = require('../services/authService');
const { sendSuccess } = require('../utils/response');

const REFRESH_COOKIE = 'refresh_token';
// the path is narrow on purpose, the cookie is only sent to the routes that need it
const REFRESH_COOKIE_PATH = '/api/v1/auth';

// the refresh token only ever travels in an httpOnly cookie, the access token goes in the body
async function login(req, res) {
  const { email, password } = req.body;
  const { accessToken, refreshToken, user } = await authService.login(email, password, req.ip);

  setRefreshCookie(res, refreshToken);

  return sendSuccess(res, { message: 'Signed in', data: { accessToken, user: toSafeUser(user) } });
}

async function refresh(req, res) {
  const { accessToken, refreshToken, user } = await authService.refresh(req.cookies[REFRESH_COOKIE]);

  setRefreshCookie(res, refreshToken);

  return sendSuccess(res, { message: 'Token refreshed', data: { accessToken, user: toSafeUser(user) } });
}

async function logout(req, res) {
  await authService.logout(req.cookies[REFRESH_COOKIE]);

  res.clearCookie(REFRESH_COOKIE, cookieOptions());

  return sendSuccess(res, { message: 'Signed out' });
}

function me(req, res) {
  return sendSuccess(res, { data: { user: req.user } });
}

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, { ...cookieOptions(), maxAge: env.refreshTokenTtlDays * 24 * 60 * 60 * 1000 });
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    path: REFRESH_COOKIE_PATH,
  };
}

// only the safe fields reach the client, the document never goes out whole
function toSafeUser(user) {
  return { id: user._id.toString(), name: user.name, email: user.email, role: user.role };
}

module.exports = { login, logout, me, refresh };
