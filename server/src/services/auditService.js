const AuditLog = require('../models/auditLog.model');

// a caller has either the request actor, which authenticate attaches as a plain object with an id, or
// a document it loaded itself with an _id, so both shapes resolve to the same stored reference
function actorId(user) {
  if (!user) {
    return undefined;
  }

  return user._id || user.id;
}

// audit writes must never break the request that triggered them, so failures only reach the log
async function logAction({ user, action, entity, entityId, metadata, ip }) {
  try {
    await AuditLog.create({
      userId: actorId(user),
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
