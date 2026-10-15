const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const RefreshToken = require('../models/refreshToken.model');
const User = require('../models/user.model');
const { logAction } = require('./auditService');

const BCRYPT_ROUNDS = 10;

// hashing lives here, so the seed script and any later user route cannot disagree about the cost
function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

// a random 64 byte token has enough entropy that a fast hash is the right call, bcrypt would only
// add latency to every refresh for no security gain on a value nobody can guess
function hashRefreshToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// checks the credentials and hands back a fresh pair, the caller never learns which half was wrong
async function login(email, password, ip) {
  const user = await User.findOne({ email: String(email).toLowerCase(), isActive: true }).select('+passwordHash');
  const passwordMatches = user ? await bcrypt.compare(password, user.passwordHash) : false;

  if (!user || !passwordMatches) {
    await logAction({ action: 'LOGIN_FAILED', entity: 'User', metadata: { email }, ip });
    throw AppError.unauthorized('Invalid email or password');
  }

  const tokens = await issueTokens(user);
  await logAction({ user, action: 'LOGIN', entity: 'User', entityId: user._id, ip });

  return { ...tokens, user };
}

// rotation: the stored row is deleted the moment it is used, so a stolen refresh token is only
// useful until the real client next refreshes, and then the thief's copy is the dead one
async function refresh(rawToken) {
  if (!rawToken) {
    throw AppError.unauthorized('Refresh token missing');
  }

  const stored = await RefreshToken.findOne({ tokenHash: hashRefreshToken(rawToken) });

  if (!stored || stored.expiresAt <= new Date()) {
    throw AppError.unauthorized('Session expired, sign in again');
  }

  await RefreshToken.deleteOne({ _id: stored._id });

  const user = await User.findById(stored.userId);

  if (!user || !user.isActive) {
    throw AppError.unauthorized('Account is no longer active');
  }

  return { ...(await issueTokens(user)), user };
}

// always succeeds, so a client that believes it is signed in can always clear its own session
async function logout(rawToken) {
  if (!rawToken) {
    return;
  }

  const stored = await RefreshToken.findOneAndDelete({ tokenHash: hashRefreshToken(rawToken) });

  if (!stored) {
    return;
  }

  const user = await User.findById(stored.userId).lean();
  await logAction({ user, action: 'LOGOUT', entity: 'User', entityId: stored.userId });
}

// short lived jwt for the api and an opaque random string for the long lived half
async function issueTokens(user) {
  const accessToken = jwt.sign({ role: user.role }, env.jwtAccessSecret, {
    subject: user._id.toString(),
    expiresIn: env.accessTokenTtl,
  });
  const refreshToken = crypto.randomBytes(64).toString('hex');

  await RefreshToken.create({
    userId: user._id,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000),
  });

  return { accessToken, refreshToken };
}

module.exports = { hashPassword, login, logout, refresh };
