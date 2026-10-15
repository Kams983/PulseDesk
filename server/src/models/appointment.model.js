const mongoose = require('mongoose');
const { APPOINTMENT_STATUS, ACTIVE_STATUSES } = require('../config/constants');

const patientSnapshotSchema = new mongoose.Schema(
  { name: String, nameLower: String, mobile: String, patientCode: String },
  { _id: false }
);

const doctorSnapshotSchema = new mongoose.Schema({ name: String, nameLower: String }, { _id: false });

const appointmentSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    // appointment time is stored as YYYY-MM-DD and HH:mm strings, never as a Date
    date: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    status: { type: String, enum: Object.values(APPOINTMENT_STATUS), default: APPOINTMENT_STATUS.SCHEDULED },
    purpose: { type: String, trim: true },
    notes: { type: String, trim: true },
    // snapshots carry what the list page searches and shows, so it never joins for display
    patientSnapshot: { type: patientSnapshotSchema, default: {} },
    doctorSnapshot: { type: doctorSnapshotSchema, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    arrivedAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    cancelReason: { type: String, trim: true },
  },
  { timestamps: true }
);

// two receptionists can hit book at the same time, this partial unique index is what actually protects us
appointmentSchema.index(
  { doctorId: 1, date: 1, startTime: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ACTIVE_STATUSES } } }
);
// doctor day view and slot lookup
appointmentSchema.index({ doctorId: 1, date: 1, status: 1 });
// department queue for a day
appointmentSchema.index({ departmentId: 1, date: 1 });
// default listing order
appointmentSchema.index({ date: 1, startTime: 1 });
// patient search from the list filters
appointmentSchema.index({ 'patientSnapshot.mobile': 1 });
appointmentSchema.index({ 'patientSnapshot.nameLower': 1 });
// a patient's own history
appointmentSchema.index({ patientId: 1, date: -1 });

module.exports = mongoose.model('Appointment', appointmentSchema);
