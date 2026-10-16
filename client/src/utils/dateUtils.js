// Everything here works on plain YYYY-MM-DD strings and never on a Date from the database. The dates
// are calendar dates, so they are read in UTC: parsing them as local time would shift a day for any
// user west of UTC.
// Sunday first, because that is the first column monthMatrix builds: the header has to name the
// columns the grid actually produces, or every date sits under the wrong day.
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function toDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);

  return new Date(Date.UTC(year, month - 1, day));
}

// internal: the only values that leave this module are the YYYY-MM-DD strings it takes and returns
function toIso(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  const date = toDate(iso);
  date.setUTCDate(date.getUTCDate() + days);

  return toIso(date);
}

export function addMonths(iso, months) {
  const date = toDate(iso);

  // day 1 avoids the 31st rolling into the next month when the target month is shorter
  return toIso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)));
}

export const weekdayLabels = () => WEEKDAYS;

export function monthLabel(iso) {
  const date = toDate(iso);

  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

// a sunday first grid for the month holding the given date, padded with the neighbouring months so
// every week is a full row
export function monthMatrix(iso) {
  const date = toDate(iso);
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());

  const weeks = [];

  for (let week = 0; week < 6; week += 1) {
    const row = [];

    for (let day = 0; day < 7; day += 1) {
      row.push(toIso(start));
      start.setUTCDate(start.getUTCDate() + 1);
    }

    weeks.push(row);
  }

  return weeks;
}

// Sunday is 0, which is what the doctor schedule stores. Read in utc for the same reason every other
// date here is: a calendar date must not move a day because of the reader's timezone.
export function weekdayIndex(iso) {
  return toDate(iso).getUTCDay();
}

// the strip of days the scheduler shows, starting at from and never running past it
export function dateStrip(from, count) {
  const days = [];

  for (let offset = 0; offset < count; offset += 1) {
    days.push(addDays(from, offset));
  }

  return days;
}

export function isSameMonth(iso, monthIso) {
  return iso.slice(0, 7) === monthIso.slice(0, 7);
}
