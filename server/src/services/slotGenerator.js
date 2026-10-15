const { minutesToTime, timeToMinutes } = require('../utils/time');

// Pure on purpose: no database, no Date, no clock. Every rule here is a function of its arguments,
// which is why the unit tests need no fixtures and why the slot maths can be trusted anywhere.
// Everything runs in minutes since midnight and is converted to HH:mm only at the edges.
function generateSlots({ sessions = [], breaks = [], slotDurationMinutes } = {}) {
  if (!Number.isInteger(slotDurationMinutes) || slotDurationMinutes <= 0) {
    throw new RangeError('slotDurationMinutes must be a positive whole number');
  }

  const breakWindows = breaks.map((br) => ({ start: timeToMinutes(br.start), end: timeToMinutes(br.end) }));
  const slots = [];

  for (const session of sessions) {
    const sessionStart = timeToMinutes(session.start);
    const sessionEnd = timeToMinutes(session.end);

    // the loop stops as soon as a step would end past the session, so a session whose length is not
    // a multiple of the duration simply leaves the leftover tail unused instead of overrunning
    for (let start = sessionStart; start + slotDurationMinutes <= sessionEnd; start += slotDurationMinutes) {
      const end = start + slotDurationMinutes;

      if (overlapsAnyBreak(start, end, breakWindows)) {
        continue;
      }

      slots.push({ startTime: minutesToTime(start), endTime: minutesToTime(end) });
    }
  }

  // two overlapping sessions would otherwise hand out the same start twice, so sort by start and
  // keep the first of each, which also guarantees the list can never contain overlapping slots
  const seen = new Set();

  return slots
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
    .filter((slot) => {
      if (seen.has(slot.startTime)) {
        return false;
      }

      seen.add(slot.startTime);

      return true;
    });
}

// a slot and a break overlap when each one starts before the other one ends
function overlapsAnyBreak(start, end, breakWindows) {
  return breakWindows.some((br) => start < br.end && end > br.start);
}

module.exports = { generateSlots };
