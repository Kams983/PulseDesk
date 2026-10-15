const mongoose = require('mongoose');

// sessions and breaks share a shape: a named window of the day held as HH:mm strings
const timeWindowSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    start: { type: String, required: true },
    end: { type: String, required: true },
  },
  { _id: false }
);

const workingDaySchema = new mongoose.Schema(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 }, // 0 is Sunday
    sessions: { type: [timeWindowSchema], default: [] },
    breaks: { type: [timeWindowSchema], default: [] },
  },
  { _id: false }
);

const doctorSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    // name and nameLower are copies of the user values, so doctor lists can search without a join
    name: { type: String, required: true, trim: true },
    nameLower: { type: String, required: true, lowercase: true, trim: true },
    specialization: { type: String, trim: true },
    slotDurationMinutes: { type: Number, default: 15, min: 5, max: 120 },
    schedule: { type: [workingDaySchema], default: [] },
  },
  { timestamps: true }
);

doctorSchema.index({ departmentId: 1 });
doctorSchema.index({ nameLower: 1 });

module.exports = mongoose.model('Doctor', doctorSchema);
