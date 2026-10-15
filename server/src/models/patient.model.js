const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema(
  {
    // sequential code from the counters collection, formatted as PT-000001
    patientCode: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    nameLower: { type: String, required: true, lowercase: true, trim: true },
    mobile: { type: String, required: true, unique: true, trim: true },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    // date of birth stays a plain string for the same reason appointment dates do
    dateOfBirth: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

patientSchema.index({ nameLower: 1 });

module.exports = mongoose.model('Patient', patientSchema);
