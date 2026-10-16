// A small mirror of server/src/services/slotGenerator.js. The server stays the authority, since a
// schedule is only ever saved through the api, which validates and regenerates the grid itself, but the
// needs to answer "how many slots does this day produce" while the form is still open, and a round trip
// per keystroke would be a worse answer than a copy of eight lines of pure arithmetic.
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const WEEKDAYS = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
  { value: 0, label: 'Sunday', short: 'Sun' },
];

export function toMinutes(time) {
  const [hours, minutes] = String(time).split(':').map(Number);

  return hours * 60 + minutes;
}

export function isValidTime(time) {
  return TIME_PATTERN.test(String(time));
}

// The same grid the api builds: step from the start of each session, drop a slot that would run into a
// break, and keep one slot per start so two overlapping sessions cannot produce the same one twice.
export function buildSlots({ sessions = [], breaks = [], slotDurationMinutes } = {}) {
  if (!Number.isInteger(slotDurationMinutes) || slotDurationMinutes <= 0) {
    return [];
  }

  const breakWindows = breaks
    .filter((window) => isValidTime(window.start) && isValidTime(window.end))
    .map((window) => ({ start: toMinutes(window.start), end: toMinutes(window.end) }));
  const slots = [];

  for (const session of sessions) {
    if (!isValidTime(session.start) || !isValidTime(session.end)) {
      continue;
    }

    const sessionStart = toMinutes(session.start);
    const sessionEnd = toMinutes(session.end);

    for (let start = sessionStart; start + slotDurationMinutes <= sessionEnd; start += slotDurationMinutes) {
      const end = start + slotDurationMinutes;

      if (breakWindows.some((window) => start < window.end && end > window.start)) {
        continue;
      }

      const startTime = `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`;

      if (!slots.includes(startTime)) {
        slots.push(startTime);
      }
    }
  }

  return slots.sort((a, b) => toMinutes(a) - toMinutes(b));
}

export function countSlots(day, slotDurationMinutes) {
  return buildSlots({ ...day, slotDurationMinutes }).length;
}

// The rules the server's zod schema enforces, restated as messages a form can show beside a field: a
// window has to be readable, has to end after it starts, sessions in one day may not overlap, and a
// break has to fall inside the hours the doctor actually works.
export function validateWindow(window, label) {
  if (!isValidTime(window.start) || !isValidTime(window.end)) {
    return `${label} needs a start and an end time`;
  }

  if (toMinutes(window.start) >= toMinutes(window.end)) {
    return `${label} must end after it starts`;
  }

  return '';
}

export function validateDay(day) {
  const errors = {};

  day.sessions.forEach((session, index) => {
    const message = validateWindow(session, 'Session');

    if (message) {
      errors[`sessions.${index}.end`] = message;
    }
  });

  // only the windows that parsed can be ordered, so the overlap test runs on the readable ones and the
  // unreadable ones keep their own message
  const ordered = day.sessions
    .map((session, index) => ({ session, index }))
    .filter(({ index }) => !errors[`sessions.${index}.end`])
    .map(({ session }) => session)
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  ordered.forEach((session, index) => {
    if (index > 0 && toMinutes(session.start) < toMinutes(ordered[index - 1].end)) {
      errors.sessions = 'Sessions in one day cannot overlap';
    }
  });

  const dayStart = ordered.length > 0 ? toMinutes(ordered[0].start) : null;
  const dayEnd = ordered.length > 0 ? toMinutes(ordered[ordered.length - 1].end) : null;

  day.breaks.forEach((brk, index) => {
    const message = validateWindow(brk, 'Break');

    if (message) {
      errors[`breaks.${index}.end`] = message;
      return;
    }

    if (dayStart !== null && (toMinutes(brk.start) < dayStart || toMinutes(brk.end) > dayEnd)) {
      errors[`breaks.${index}.start`] = 'A break must fall inside the hours the doctor works';
    }
  });

  return errors;
}

export function hasErrors(errors) {
  return Object.keys(errors).length > 0;
}

// what the editor opens with: the doctor's own week, with every other day off
export function scheduleFromDoctor(doctor) {
  return WEEKDAYS.map(({ value }) => {
    const saved = (doctor.schedule || []).find((day) => day.dayOfWeek === value);

    return saved
      ? { dayOfWeek: value, sessions: saved.sessions.map((s) => ({ ...s })), breaks: saved.breaks.map((b) => ({ ...b })) }
      : { dayOfWeek: value, sessions: [], breaks: [] };
  });
}

export function toggleDay(schedule, dayOfWeek, isOn) {
  return schedule.map((day) => {
    if (day.dayOfWeek !== dayOfWeek) {
      return day;
    }

    if (!isOn) {
      return { ...day, sessions: [], breaks: [] };
    }

    // a day that is switched on needs something to be on with, and the clinic's shape is the seed's
    return {
      ...day,
      sessions: [{ name: 'Morning', start: '09:00', end: '12:00' }, { name: 'Evening', start: '13:00', end: '17:00' }],
      breaks: [{ name: 'Lunch', start: '12:00', end: '13:00' }],
    };
  });
}

// only the days that are actually worked are sent: a day in the schedule means the doctor works it, which
// is what the server's schema says too
export function schedulePayload(schedule) {
  return schedule.filter((day) => day.sessions.length > 0);
}

export function scheduleSummary(doctor) {
  const days = (doctor.schedule || []).map((day) => day.dayOfWeek).sort();

  if (days.length === 0) {
    return 'No working days set';
  }

  const labels = WEEKDAYS.filter((weekday) => days.includes(weekday.value)).map((weekday) => weekday.short);

  // a Monday to Friday week is the common case and reads better than five abbreviations in a row
  if (days.length === 5 && [1, 2, 3, 4, 5].every((day) => days.includes(day))) {
    return 'Mon-Fri';
  }

  return labels.join(', ');
}
