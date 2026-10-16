const { DateTime } = require('luxon');
const { ACTIVE_STATUSES } = require('../config/constants');
const Appointment = require('../models/appointment.model');
const Doctor = require('../models/doctor.model');
const AppError = require('../utils/AppError');
const { isPastDate, isPastSlot } = require('../utils/time');
const { generateSlots } = require('./slotGenerator');

const SLOT_STATUS = {
  AVAILABLE: 'available',
  BOOKED: 'booked',
  PAST: 'past',
};

// availability for one doctor on one calendar day: the schedule supplies the grid, the day's
// appointments only mark it up
async function getSlotsForDoctorDate(doctorId, date) {
  const doctor = await findDoctorOrFail(doctorId);
  const workingDay = doctor.schedule.find((day) => day.dayOfWeek === weekdayOf(date));

  // a day the doctor does not work has no grid at all, which is different from a day with no free slots
  if (!workingDay) {
    return { doctorId: doctor._id.toString(), date, slots: [] };
  }

  const grid = generateSlots({
    sessions: workingDay.sessions,
    breaks: workingDay.breaks,
    slotDurationMinutes: doctor.slotDurationMinutes,
  });
  const bookedStarts = await bookedStartTimes(doctor._id, date);
  const dateHasPassed = isPastDate(date);

  return {
    doctorId: doctor._id.toString(),
    date,
    slots: grid.map((slot) => ({ ...slot, status: slotStatus(slot, { bookedStarts, date, dateHasPassed }) })),
  };
}

function slotStatus(slot, { bookedStarts, date, dateHasPassed }) {
  // booked outranks past: an appointment that already happened still has to show on the day view,
  // only an unbooked slot in the past is useless to a receptionist
  if (bookedStarts.has(slot.startTime)) {
    return SLOT_STATUS.BOOKED;
  }

  if (dateHasPassed || isPastSlot(date, slot.startTime)) {
    return SLOT_STATUS.PAST;
  }

  return SLOT_STATUS.AVAILABLE;
}

// one query for the whole day, matching the partial index that guards booking
async function bookedStartTimes(doctorId, date) {
  const booked = await Appointment.find({ doctorId, date, status: { $in: ACTIVE_STATUSES } })
    .select('startTime')
    .lean();

  return new Set(booked.map((appointment) => appointment.startTime));
}

async function findDoctorOrFail(doctorId) {
  const doctor = await Doctor.findById(doctorId).lean();

  if (!doctor) {
    throw AppError.notFound('Doctor not found');
  }

  return doctor;
}

// The date is a plain calendar date, so it is read in UTC and never shifted by a timezone. Luxon counts
// Monday as 1 and the schema stores Sunday as 0, hence the modulo.
function weekdayOf(date) {
  const parsed = DateTime.fromISO(date, { zone: 'utc' });

  if (!parsed.isValid) {
    throw AppError.badRequest('Invalid date', [{ field: 'date', message: 'Expected a YYYY-MM-DD calendar date' }]);
  }

  return parsed.weekday % 7;
}

module.exports = { getSlotsForDoctorDate, SLOT_STATUS };
