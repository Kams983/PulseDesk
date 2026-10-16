const { DateTime } = require('luxon');
const { APPOINTMENT_STATUS, ROLES } = require('../config/constants');
const Appointment = require('../models/appointment.model');
const Doctor = require('../models/doctor.model');
const AppError = require('../utils/AppError');
const { nowInClinicTz } = require('../utils/time');
const doctorService = require('./doctorService');

const DEFAULT_TREND_DAYS = 7;
// a doctor's diary is a day, so the next patient is always inside the first handful of live rows
const NEXT_PATIENT_SCAN = 50;

// `today` is the clinic's calendar date and the only clock the client trusts, so a browser in another
// timezone cannot disagree with the server about what is past.
async function getDashboard(user) {
  const clinicNow = nowInClinicTz();
  const today = clinicNow.toISODate();

  if (user.role === ROLES.DOCTOR) {
    return doctorDashboard(user, today, clinicNow);
  }

  return clinicDashboard(today, user.role);
}

// the desk board is today's counts, plus the register broken down per doctor for a super admin
async function clinicDashboard(today, role) {
  const counts = shapeCounts(await groupByStatus({ date: today }, today), true);
  const board = { scope: 'clinic', today, counts: { today: counts } };

  if (role !== ROLES.SUPER_ADMIN) {
    return board;
  }

  const [doctors, byDoctor] = await Promise.all([Doctor.countDocuments({}), doctorBreakdown(today)]);

  return { ...board, doctors, byDoctor };
}

async function doctorDashboard(user, today, clinicNow) {
  const own = await ownDoctor(user);

  // today and everything still ahead come back from one pass, split by a flag inside the group key
  const rows = await groupByStatus({ doctorId: own._id, date: { $gte: today } }, today);
  const next = await nextAppointment(own._id, today, clinicNow);

  return {
    scope: 'own',
    today,
    doctor: { id: own._id.toString(), name: own.name },
    counts: {
      today: shapeCounts(rows, true),
      upcoming: shapeCounts(rows, false),
    },
    next: next ? toNextPatientDto(next) : null,
  };
}

// one line per doctor, every doctor included, so a free day reads as a zero rather than as missing
async function doctorBreakdown(today) {
  const [rows, doctors] = await Promise.all([
    Appointment.aggregate([{ $match: { date: today } }, { $group: { _id: { doctorId: '$doctorId', status: '$status' }, count: { $sum: 1 } } }]),
    Doctor.find({}).select('name').sort({ nameLower: 1 }).lean(),
  ]);
  const byDoctor = new Map(
    doctors.map((doctor) => [doctor._id.toString(), { id: doctor._id.toString(), name: doctor.name, counts: emptyCounts() }])
  );

  for (const row of rows) {
    const entry = byDoctor.get(row._id.doctorId.toString());

    if (!entry) {
      continue;
    }

    entry.counts[row._id.status] = (entry.counts[row._id.status] || 0) + row.count;
    entry.counts.total += row.count;
  }

  return [...byDoctor.values()];
}

// who the doctor should look up when the board opens: someone already waiting comes first, then the
// earliest visit that has not finished yet. Both questions need the clock, which lives on the server.
async function nextAppointment(doctorId, today, clinicNow) {
  const live = await Appointment.find({
    doctorId,
    date: { $gte: today },
    status: { $in: [APPOINTMENT_STATUS.ARRIVED, APPOINTMENT_STATUS.SCHEDULED] },
  })
    .sort({ date: 1, startTime: 1 })
    .limit(NEXT_PATIENT_SCAN)
    .select('patientId date startTime endTime status purpose patientSnapshot arrivedAt')
    .lean();

  const waiting = live.find((row) => row.status === APPOINTMENT_STATUS.ARRIVED);

  if (waiting) {
    return waiting;
  }

  const nowTime = clinicNow.toFormat('HH:mm');

  // a slot that has already ended was never closed by the desk, so it is history rather than a queue
  return live.find((row) => row.date > today || row.endTime >= nowTime) || null;
}

// only what the next patient card renders, never the row itself
function toNextPatientDto(appointment) {
  return {
    id: appointment._id.toString(),
    date: appointment.date,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    status: appointment.status,
    purpose: appointment.purpose || null,
    arrivedAt: appointment.arrivedAt || null,
    patient: {
      id: appointment.patientId.toString(),
      name: appointment.patientSnapshot?.name,
      patientCode: appointment.patientSnapshot?.patientCode,
      mobile: appointment.patientSnapshot?.mobile,
    },
  };
}

// one aggregation groups the board by status. Six separate counts would be six round trips for numbers
// that only add up if they all describe the same moment.
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

    // a cancelled visit belongs to today's board but it is not something still coming up
    if (!isToday && row._id.status === APPOINTMENT_STATUS.CANCELLED) {
      continue;
    }

    counts[row._id.status] = (counts[row._id.status] || 0) + row.count;
    counts.total += row.count;
  }

  return counts;
}

// One entry per day, oldest first, ending today. The database only holds days that saw an appointment,
// so the empty days are filled in afterwards.
async function getTrend(days, user) {
  const clinicNow = nowInClinicTz();
  const today = clinicNow.toISODate();
  const countsByDate = await countByDateAndStatus(trendRange(days, clinicNow, today), user);
  const trend = [];

  // the range is rebuilt from the clinic clock rather than from the rows, so a gap shows as a zero
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = clinicNow.minus({ days: offset }).toISODate();

    trend.push({ date, ...(countsByDate.get(date) || emptyCounts()) });
  }

  return { scope: scopeFor(user), today, days, trend };
}

function trendRange(days, clinicNow, today) {
  return { date: { $gte: clinicNow.minus({ days: days - 1 }).toISODate(), $lte: today } };
}

async function countByDateAndStatus(match, user) {
  const rows = await Appointment.aggregate([
    { $match: await withDoctorScope(match, user) },
    { $group: { _id: { date: '$date', status: '$status' }, count: { $sum: 1 } } },
  ]);
  const countsByDate = new Map();

  for (const row of rows) {
    const counts = countsByDate.get(row._id.date) || emptyCounts();

    counts[row._id.status] = (counts[row._id.status] || 0) + row.count;
    counts.total += row.count;
    countsByDate.set(row._id.date, counts);
  }

  return countsByDate;
}

// One number per day of the month the calendar is showing, zero filled, so the mini calendar can put a
// dot under the days that hold appointments without asking a question per cell.
async function getCalendar(user, month = nowInClinicTz().toFormat('yyyy-MM')) {
  const start = DateTime.fromFormat(month, 'yyyy-MM', { zone: 'utc' });
  const totalsByDate = await countByDate(monthRange(start), user);
  const days = [];

  // the month is walked from the calendar rather than from the rows, so an empty day still comes back
  for (let date = start.startOf('month'); date <= start.endOf('month'); date = date.plus({ days: 1 })) {
    const iso = date.toISODate();

    days.push({ date: iso, total: totalsByDate.get(iso) || 0 });
  }

  return { scope: scopeFor(user), month, days };
}

function monthRange(start) {
  return { date: { $gte: start.startOf('month').toISODate(), $lte: start.endOf('month').toISODate() } };
}

async function countByDate(match, user) {
  const rows = await Appointment.aggregate([
    { $match: await withDoctorScope(match, user) },
    { $group: { _id: '$date', total: { $sum: 1 } } },
  ]);

  return new Map(rows.map((row) => [row._id, row.total]));
}

// a doctor only ever sees their own board, everyone else sees the clinic
async function withDoctorScope(match, user) {
  if (user.role !== ROLES.DOCTOR) {
    return match;
  }

  const own = await ownDoctor(user);

  return { ...match, doctorId: own._id };
}

function scopeFor(user) {
  return user.role === ROLES.DOCTOR ? 'own' : 'clinic';
}

function emptyCounts() {
  return {
    total: 0,
    [APPOINTMENT_STATUS.SCHEDULED]: 0,
    [APPOINTMENT_STATUS.ARRIVED]: 0,
    [APPOINTMENT_STATUS.COMPLETED]: 0,
    [APPOINTMENT_STATUS.CANCELLED]: 0,
  };
}

async function ownDoctor(user) {
  const own = await doctorService.findOwnDoctorProfile(user.id);

  if (!own) {
    throw AppError.forbidden('No doctor profile is linked to this account');
  }

  return own;
}

module.exports = { DEFAULT_TREND_DAYS, getCalendar, getDashboard, getTrend };
