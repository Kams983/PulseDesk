const { DateTime } = require('luxon');
const env = require('../config/env');

// every "is this in the past" question goes through here, so the clinic timezone is applied in one place
function nowInClinicTz() {
  return DateTime.now().setZone(env.clinicTimezone);
}

// YYYY-MM-DD strings compare correctly as strings, no Date parsing needed
function isPastDate(date) {
  return date < nowInClinicTz().toISODate();
}

function isPastSlot(date, startTime) {
  const slot = DateTime.fromISO(`${date}T${startTime}`, { zone: env.clinicTimezone });

  return slot <= nowInClinicTz();
}

// slots are compared and stepped in minutes since midnight, which keeps the math in plain integers
function timeToMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);

  return hours * 60 + minutes;
}

function minutesToTime(minutes) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  const rest = String(minutes % 60).padStart(2, '0');

  return `${hours}:${rest}`;
}

module.exports = { nowInClinicTz, isPastDate, isPastSlot, timeToMinutes, minutesToTime };
