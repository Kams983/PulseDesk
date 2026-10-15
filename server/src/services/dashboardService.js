const { APPOINTMENT_STATUS, ROLES } = require('../config/constants');
const Appointment = require('../models/appointment.model');
const Doctor = require('../models/doctor.model');
const AppError = require('../utils/AppError');
const { nowInClinicTz } = require('../utils/time');
const doctorService = require('./doctorService');

function emptyCounts() {
  return {
    total: 0,
    [APPOINTMENT_STATUS.SCHEDULED]: 0,
    [APPOINTMENT_STATUS.ARRIVED]: 0,
    [APPOINTMENT_STATUS.COMPLETED]: 0,
    [APPOINTMENT_STATUS.CANCELLED]: 0,
  };
}

async function getDashboard(user) {
  const date = nowInClinicTz().toISODate();

  if (user.role === ROLES.DOCTOR) {
    return doctorDashboard(user, date);
  }

  return clinicDashboard(date, user.role === ROLES.SUPER_ADMIN);
}

async function clinicDashboard(date, includeDoctorCount) {
  const counts = shapeCounts(await groupByStatus({ date }, date), true);
  const doctors = includeDoctorCount ? await Doctor.countDocuments({}) : undefined;

  return { scope: 'clinic', date, today: counts, ...(includeDoctorCount ? { doctors } : {}) };
}

async function doctorDashboard(user, date) {
  const own = await doctorService.findOwnDoctorProfile(user.id);

  if (!own) {
    throw AppError.forbidden('No doctor profile is linked to this account');
  }

  // today and everything still ahead come back from one pass, split by a flag inside the group key
  const rows = await groupByStatus({ doctorId: own._id, date: { $gte: date } }, date);

  return {
    scope: 'own',
    date,
    doctor: { id: own._id.toString(), name: own.name },
    today: shapeCounts(rows, true),
    upcoming: shapeCounts(rows, false),
  };
}

// one aggregation groups the board by status. Six separate count queries would be six round trips for
// numbers that only add up if they all describe the same moment.
function groupByStatus(match, date) {
  return Appointment.aggregate([
    { $match: match },
    { $group: { _id: { status: '$status', isToday: { $eq: ['$date', date] } }, count: { $sum: 1 } } },
  ]);
}

function shapeCounts(rows, isToday) {
  const counts = emptyCounts();

  for (const row of rows) {
    if (row._id.isToday !== isToday) {
      continue;
    }

    // a cancelled visit is part of today's board but it is not something still coming up
    if (!isToday && row._id.status === APPOINTMENT_STATUS.CANCELLED) {
      continue;
    }

    counts[row._id.status] = (counts[row._id.status] || 0) + row.count;
    counts.total += row.count;
  }

  return counts;
}

module.exports = { getDashboard };
