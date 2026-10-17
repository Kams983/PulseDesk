const { DateTime } = require('luxon');
const { APPOINTMENT_STATUS, ROLES } = require('../config/constants');
const Appointment = require('../models/appointment.model');
const Doctor = require('../models/doctor.model');
const AppError = require('../utils/AppError');
const { nowInClinicTz } = require('../utils/time');
const doctorService = require('./doctorService');

const DEFAULT_TREND_DAYS = 7;
// a doctor's next patient is always near the top of their open visits
const NEXT_PATIENT_SCAN = 50;

// The dashboard reads the time on the server, so a browser in another timezone still agrees with it.
async function getDashboard(user) {
  const now = nowInClinicTz();
  const today = now.toISODate();

  if (user.role === ROLES.DOCTOR) {
    return doctorDashboard(user, today, now);
  }

  return clinicDashboard(today, user.role);
}

// For the desk: today's counts, plus a breakdown per doctor for the super admin.
async function clinicDashboard(today, role) {
  const rows = await groupByStatus({ date: today }, today);
  const counts = shapeCounts(rows, true);
  const board = { scope: 'clinic', today, counts: { today: counts } };

  if (role !== ROLES.SUPER_ADMIN) {
    return board;
  }

  const [doctors, byDoctor] = await Promise.all([Doctor.countDocuments({}), doctorBreakdown(today)]);

  return { ...board, doctors, byDoctor };
}

async function doctorDashboard(user, today, now) {
  const own = await ownDoctor(user);

  // one query gives us today and everything still ahead
  const rows = await groupByStatus({ doctorId: own._id, date: { $gte: today } }, today);
  const next = await nextAppointment(own._id, today, now);

  return {
    scope: 'own',
    today,
    doctor: { id: own._id.toString(), name: own.name },
    counts: {
      today: shapeCounts(rows, true),
      upcoming: shapeCounts(rows, false),
    },
    next: next ? toNextPatient(next) : null,
  };
}

// One row per doctor, including the doctors with nothing today.
async function doctorBreakdown(today) {
  const [rows, doctors] = await Promise.all([
    Appointment.aggregate([
      { $match: { date: today } },
      { $group: { _id: { doctorId: '$doctorId', status: '$status' }, count: { $sum: 1 } } },
    ]),
    Doctor.find({}).select('name').sort({ nameLower: 1 }).lean(),
  ]);

  const byDoctor = new Map();

  for (const doctor of doctors) {
    byDoctor.set(doctor._id.toString(), {
      id: doctor._id.toString(),
      name: doctor.name,
      counts: emptyCounts(),
    });
  }

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

// Who the doctor should look up: someone already waiting first, then the next visit that has not ended.
async function nextAppointment(doctorId, today, now) {
  const visits = await Appointment.find({
    doctorId,
    date: { $gte: today },
    status: { $in: [APPOINTMENT_STATUS.ARRIVED, APPOINTMENT_STATUS.SCHEDULED] },
  })
    .sort({ date: 1, startTime: 1 })
    .limit(NEXT_PATIENT_SCAN)
    .select('patientId date startTime endTime status purpose patientSnapshot arrivedAt')
    .lean();

  const waiting = visits.find((visit) => visit.status === APPOINTMENT_STATUS.ARRIVED);

  if (waiting) {
    return waiting;
  }

  // a visit that already ended was never closed by the desk, so it is not next
  const currentTime = now.toFormat('HH:mm');

  return visits.find((visit) => visit.date > today || visit.endTime >= currentTime) || null;
}

function toNextPatient(appointment) {
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

// One query groups the board by status instead of running a count per status.
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

    // a cancelled visit is on today's board but is not still coming up
    if (!isToday && row._id.status === APPOINTMENT_STATUS.CANCELLED) {
      continue;
    }

    counts[row._id.status] = (counts[row._id.status] || 0) + row.count;
    counts.total += row.count;
  }

  return counts;
}

// One entry per day, ending today. Days with no appointments are filled in as zeros.
async function getTrend(days, user) {
  const now = nowInClinicTz();
  const today = now.toISODate();
  const firstDay = now.minus({ days: days - 1 }).toISODate();

  const rows = await Appointment.aggregate([
    { $match: await addDoctorScope({ date: { $gte: firstDay, $lte: today } }, user) },
    { $group: { _id: { date: '$date', status: '$status' }, count: { $sum: 1 } } },
  ]);

  const countsByDate = new Map();

  for (const row of rows) {
    const counts = countsByDate.get(row._id.date) || emptyCounts();

    counts[row._id.status] = (counts[row._id.status] || 0) + row.count;
    counts.total += row.count;
    countsByDate.set(row._id.date, counts);
  }

  const trend = [];

  // we walk the days ourselves, so a day with no appointments still appears
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = now.minus({ days: offset }).toISODate();

    trend.push({ date, ...(countsByDate.get(date) || emptyCounts()) });
  }

  return { scope: scopeFor(user), today, days, trend };
}

// One number per day of the month, so the mini calendar can show its dots.
async function getCalendar(user, month = nowInClinicTz().toFormat('yyyy-MM')) {
  const start = DateTime.fromFormat(month, 'yyyy-MM', { zone: 'utc' });

  const rows = await Appointment.aggregate([
    {
      $match: await addDoctorScope(
        { date: { $gte: start.startOf('month').toISODate(), $lte: start.endOf('month').toISODate() } },
        user
      ),
    },
    { $group: { _id: '$date', total: { $sum: 1 } } },
  ]);

  const totalsByDate = new Map();

  for (const row of rows) {
    totalsByDate.set(row._id, row.total);
  }

  const days = [];

  // the month comes from the calendar, so an empty day is still listed
  for (let date = start.startOf('month'); date <= start.endOf('month'); date = date.plus({ days: 1 })) {
    const iso = date.toISODate();

    days.push({ date: iso, total: totalsByDate.get(iso) || 0 });
  }

  return { scope: scopeFor(user), month, days };
}

// A doctor only sees their own appointments.
async function addDoctorScope(match, user) {
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
