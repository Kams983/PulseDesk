const AuditLog = require('../models/auditLog.model');

// audit writes must never break the request that triggered them, so failures only reach the log
async function logAction({ user, action, entity, entityId, metadata, ip }) {
  try {
    await AuditLog.create({
      userId: user ? user._id : undefined,
      role: user ? user.role : undefined,
      action,
      entity,
      entityId,
      metadata,
      ip,
    });
  } catch (err) {
    console.error('audit write failed:', err.message);
  }
}

module.exports = { logAction };
