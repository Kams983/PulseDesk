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

// availability for one doctor on one calendar day: the schedule supplies the grid, the appointments
// only mark it up
async function getSlotsForDoctorDate(doctorId, date) {
  const doctor = await Doctor.findById(doctorId).lean();

  if (!doctor) {
    throw AppError.notFound('Doctor not found');
  }

  const workingDay = doctor.schedule.find((day) => day.dayOfWeek === weekdayOf(date));

  // a day the doctor does not work has no grid at all, which is different from a day with no free slots
  if (!workingDay) {
    return { doctorId: doctor._id.toString(), date, slots: [] };
  }

  const slots = generateSlots({
    sessions: workingDay.sessions,
    breaks: workingDay.breaks,
    slotDurationMinutes: doctor.slotDurationMinutes,
  });

  // one query for the whole day. A per slot lookup would be dozens of round trips for a list that is
  // always small, and the active only filter matches the partial unique index that guards booking.
  const booked = await Appointment.find({
    doctorId: doctor._id,
    date,
    status: { $in: ACTIVE_STATUSES },
  })
    .select('startTime')
    .lean();
  const bookedStarts = new Set(booked.map((appointment) => appointment.startTime));
  const dateHasPassed = isPastDate(date);

  return {
    doctorId: doctor._id.toString(),
    date,
    slots: slots.map((slot) => ({
      ...slot,
      // booked outranks past on purpose: an appointment that already happened still has to show on the
      // day view, only an unbooked slot in the past is useless to a receptionist
      status: bookedStarts.has(slot.startTime)
        ? SLOT_STATUS.BOOKED
        : dateHasPassed || isPastSlot(date, slot.startTime)
          ? SLOT_STATUS.PAST
          : SLOT_STATUS.AVAILABLE,
    })),
  };
}

// the date is a plain calendar date, so it is read in utc and never shifted by a timezone. Luxon
// counts Monday as 1 and the schema stores Sunday as 0, hence the modulo.
function weekdayOf(date) {
  const parsed = DateTime.fromISO(date, { zone: 'utc' });

  if (!parsed.isValid) {
    throw AppError.badRequest('Invalid date', [{ field: 'date', message: 'Expected a YYYY-MM-DD calendar date' }]);
  }

  return parsed.weekday % 7;
}

module.exports = { getSlotsForDoctorDate, SLOT_STATUS };
