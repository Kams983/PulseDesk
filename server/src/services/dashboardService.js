const { APPOINTMENT_STATUS, ROLES } = require('../config/constants');
const Appointment = require('../models/appointment.model');
const Doctor = require('../models/doctor.model');
const AppError = require('../utils/AppError');
const { nowInClinicTz } = require('../utils/time');
const doctorService = require('./doctorService');

const DEFAULT_TREND_DAYS = 7;

function emptyCounts() {
  return {
    total: 0,
    [APPOINTMENT_STATUS.SCHEDULED]: 0,
    [APPOINTMENT_STATUS.ARRIVED]: 0,
    [APPOINTMENT_STATUS.COMPLETED]: 0,
    [APPOINTMENT_STATUS.CANCELLED]: 0,
  };
}

// `today` is the clinic's calendar date, which is the only clock the client is allowed to trust: a
// browser in another timezone would otherwise disagree with the server about what is past.
async function getDashboard(user) {
  const today = nowInClinicTz().toISODate();

  if (user.role === ROLES.DOCTOR) {
    return doctorDashboard(user, today);
  }

  return clinicDashboard(today, user.role === ROLES.SUPER_ADMIN);
}

async function clinicDashboard(today, includeDoctorCount) {
  const counts = shapeCounts(await groupByStatus({ date: today }, today), true);
  const doctors = includeDoctorCount ? await Doctor.countDocuments({}) : undefined;

  return {
    scope: 'clinic',
    today,
    counts: { today: counts },
    ...(includeDoctorCount ? { doctors } : {}),
  };
}

async function doctorDashboard(user, today) {
  const own = await ownDoctor(user);

  // today and everything still ahead come back from one pass, split by a flag inside the group key
  const rows = await groupByStatus({ doctorId: own._id, date: { $gte: today } }, today);

  return {
    scope: 'own',
    today,
    doctor: { id: own._id.toString(), name: own.name },
    counts: {
      today: shapeCounts(rows, true),
      upcoming: shapeCounts(rows, false),
    },
  };
}

// one aggregation groups the board by status. Six separate count queries would be six round trips for
// numbers that only add up if they all describe the same moment.
function groupByStatus(match, today) {
  return Appointment.aggregate([
    { $match: match },
    { $group: { _id: { status: '$status', isToday: { $eq: ['$date', today] } }, count: { $sum: 1 } } },
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

// One entry per day, oldest first, ending today. The database only has rows for days that actually
// saw an appointment, so the empty days are filled in code after a single grouped query.
async function getTrend(days, user) {
  const clinicNow = nowInClinicTz();
  const today = clinicNow.toISODate();
  const from = clinicNow.minus({ days: days - 1 }).toISODate();
  const match = { date: { $gte: from, $lte: today } };

  if (user.role === ROLES.DOCTOR) {
    const own = await ownDoctor(user);
    match.doctorId = own._id;
  }

  const rows = await Appointment.aggregate([
    { $match: match },
    { $group: { _id: { date: '$date', status: '$status' }, count: { $sum: 1 } } },
  ]);

  const byDate = new Map();

  for (const row of rows) {
    const counts = byDate.get(row._id.date) || emptyCounts();

    counts[row._id.status] = (counts[row._id.status] || 0) + row.count;
    counts.total += row.count;
    byDate.set(row._id.date, counts);
  }

  const trend = [];

  // the range is rebuilt from the clinic clock rather than from the rows, so a gap shows as a zero
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = clinicNow.minus({ days: offset }).toISODate();
    trend.push({ date, ...(byDate.get(date) || emptyCounts()) });
  }

  return {
    scope: user.role === ROLES.DOCTOR ? 'own' : 'clinic',
    today,
    days,
    trend,
  };
}

async function ownDoctor(user) {
  const own = await doctorService.findOwnDoctorProfile(user.id);

  if (!own) {
    throw AppError.forbidden('No doctor profile is linked to this account');
  }

  return own;
}

module.exports = { DEFAULT_TREND_DAYS, getDashboard, getTrend };
