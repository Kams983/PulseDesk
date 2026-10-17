// A small copy of the server's slot generator. The server is still in charge: a schedule is saved
// through the api, which checks it and builds the slots again. This copy is here so the editor can show
// how many slots a day makes while the form is still open.
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

function toMinutes(time) {
  const parts = String(time).split(':');

  return Number(parts[0]) * 60 + Number(parts[1]);
}

function isValidTime(time) {
  return TIME_PATTERN.test(String(time));
}

function toTimeString(minutes) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  const rest = String(minutes % 60).padStart(2, '0');

  return `${hours}:${rest}`;
}

// Build the slots the same way the server does: step through each session, skip a slot that would hit a
// break, and keep each start time only once.
function buildSlots(day, slotDurationMinutes) {
  if (!Number.isInteger(slotDurationMinutes) || slotDurationMinutes <= 0) {
    return [];
  }

  const breakWindows = [];

  for (const brk of day.breaks || []) {
    if (isValidTime(brk.start) && isValidTime(brk.end)) {
      breakWindows.push({ start: toMinutes(brk.start), end: toMinutes(brk.end) });
    }
  }

  const slots = [];

  for (const session of day.sessions || []) {
    if (!isValidTime(session.start) || !isValidTime(session.end)) {
      continue;
    }

    const sessionStart = toMinutes(session.start);
    const sessionEnd = toMinutes(session.end);

    for (let start = sessionStart; start + slotDurationMinutes <= sessionEnd; start += slotDurationMinutes) {
      const end = start + slotDurationMinutes;

      let hitsBreak = false;

      for (const brk of breakWindows) {
        if (start < brk.end && end > brk.start) {
          hitsBreak = true;
        }
      }

      if (hitsBreak) {
        continue;
      }

      const time = toTimeString(start);

      if (!slots.includes(time)) {
        slots.push(time);
      }
    }
  }

  return slots.sort((a, b) => toMinutes(a) - toMinutes(b));
}

export function countSlots(day, slotDurationMinutes) {
  return buildSlots(day, slotDurationMinutes).length;
}

// A window needs two readable times, and it has to end after it starts.
function checkWindow(window, label) {
  if (!isValidTime(window.start) || !isValidTime(window.end)) {
    return `${label} needs a start and an end time`;
  }

  if (toMinutes(window.start) >= toMinutes(window.end)) {
    return `${label} must end after it starts`;
  }

  return '';
}

// The same rules the server checks, written as messages the form can show next to a field.
export function validateDay(day) {
  const errors = {};

  day.sessions.forEach((session, index) => {
    const problem = checkWindow(session, 'Session');

    if (problem) {
      errors[`sessions.${index}.end`] = problem;
    }
  });

  // only the sessions that read correctly can be put in order
  const goodSessions = day.sessions
    .map((session, index) => ({ session, index }))
    .filter((item) => !errors[`sessions.${item.index}.end`])
    .sort((a, b) => toMinutes(a.session.start) - toMinutes(b.session.start));

  for (let i = 1; i < goodSessions.length; i += 1) {
    const previousEnd = toMinutes(goodSessions[i - 1].session.end);

    if (toMinutes(goodSessions[i].session.start) < previousEnd) {
      errors.sessions = 'Sessions in one day cannot overlap';
    }
  }

  // a break has to sit inside the hours the doctor works
  const dayStart = goodSessions.length > 0 ? toMinutes(goodSessions[0].session.start) : null;
  const dayEnd = goodSessions.length > 0 ? toMinutes(goodSessions[goodSessions.length - 1].session.end) : null;

  day.breaks.forEach((brk, index) => {
    const problem = checkWindow(brk, 'Break');

    if (problem) {
      errors[`breaks.${index}.end`] = problem;
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

// What the editor opens with: the doctor's saved week, and every other day turned off.
export function scheduleFromDoctor(doctor) {
  const saved = doctor.schedule || [];

  return WEEKDAYS.map(({ value }) => {
    const day = saved.find((item) => item.dayOfWeek === value);

    if (!day) {
      return { dayOfWeek: value, sessions: [], breaks: [] };
    }

    return {
      dayOfWeek: value,
      sessions: day.sessions.map((session) => ({ ...session })),
      breaks: day.breaks.map((brk) => ({ ...brk })),
    };
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

    // a day that is switched on needs some hours to start from
    return {
      ...day,
      sessions: [
        { name: 'Morning', start: '09:00', end: '12:00' },
        { name: 'Evening', start: '13:00', end: '17:00' },
      ],
      breaks: [{ name: 'Lunch', start: '12:00', end: '13:00' }],
    };
  });
}

// Only the days the doctor actually works are sent. A day in the schedule means the doctor works it.
export function schedulePayload(schedule) {
  return schedule.filter((day) => day.sessions.length > 0);
}

export function scheduleSummary(doctor) {
  const days = (doctor.schedule || []).map((day) => day.dayOfWeek).sort();

  if (days.length === 0) {
    return 'No working days set';
  }

  // Monday to Friday is the usual week, and it reads better than five short names
  if (days.length === 5 && [1, 2, 3, 4, 5].every((day) => days.includes(day))) {
    return 'Mon-Fri';
  }

  const names = [];

  for (const weekday of WEEKDAYS) {
    if (days.includes(weekday.value)) {
      names.push(weekday.short);
    }
  }

  return names.join(', ');
}
