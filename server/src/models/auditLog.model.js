const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, trim: true },
    action: { type: String, required: true, trim: true },
    entity: { type: String, required: true, trim: true },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    metadata: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String, trim: true },
  },
  { timestamps: true }
);

// the audit list is always newest first
auditLogSchema.index({ createdAt: -1 });
// trailing an appointment back to who touched it
auditLogSchema.index({ entity: 1, entityId: 1 });
// everything one user did, newest first
auditLogSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
