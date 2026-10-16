// Initials for the avatar, at most two, and never empty: a name is always something to show.
export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return '?';
  }

  const letters = parts.length === 1 ? [parts[0][0]] : [parts[0][0], parts[parts.length - 1][0]];

  return letters.join('').toUpperCase();
}

// A colour for the initials circle, derived from the name so the same doctor keeps the same colour on
// every screen without the server storing one.
export function avatarTint(name = '') {
  const tints = ['bg-primary-tint text-primary', 'bg-scheduled-tint text-scheduled', 'bg-arrived-tint text-arrived', 'bg-completed-tint text-completed', 'bg-cancelled-tint text-cancelled'];
  let hash = 0;

  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 997;
  }

  return tints[hash % tints.length];
}

// HH:mm as a person reads a clock, never 24 hour. Minutes are dropped at :00, so a grid stays calm.
export function formatTime(time = '') {
  const [hourText, minute] = time.split(':');
  const hour = Number(hourText);

  if (Number.isNaN(hour)) {
    return time;
  }

  const suffix = hour < 12 ? 'am' : 'pm';
  const shown = hour % 12 === 0 ? 12 : hour % 12;

  return minute === '00' ? `${shown}${suffix}` : `${shown}:${minute}${suffix}`;
}

export function formatDate(iso, options = { weekday: 'short', day: 'numeric', month: 'short' }) {
  if (!iso) {
    return '';
  }

  // read in UTC: these are calendar dates, and local parsing can move them a day
  return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

export function formatDateLong(iso) {
  return formatDate(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// An instant is not a calendar date: createdAt, arrivedAt and completedAt are real ISO timestamps, and a
// booking made at 00:30 in Lagos carries the previous day in UTC. Calendar dates stay clinic-owned
// strings read in UTC; an instant belongs to the clock of whoever is reading it.
export function formatStamp(iso, options = { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) {
  if (!iso) {
    return '';
  }

  return new Intl.DateTimeFormat('en-GB', options).format(new Date(iso));
}

export function formatStampTime(iso) {
  return formatStamp(iso, { hour: 'numeric', minute: '2-digit' });
}

export function firstName(name = '') {
  return name.trim().split(/\s+/)[0] || name;
}

// How the board greets someone: the given name, with the title kept when there is one, so a doctor is
// greeted as "Dr. Ifeanyi" and everyone else by their first name alone. A greeting is one person talking
// to another, and nobody says a full name out loud.
const TITLE_PATTERN = /^(dr|mr|mrs|ms|miss|prof)\.?$/i;

export function greetingName(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return '';
  }

  if (!TITLE_PATTERN.test(parts[0])) {
    return parts[0];
  }

  const title = `${parts[0].replace(/\.$/, '')}.`;

  return parts[1] ? `${title} ${parts[1]}` : title;
}

// the greeting follows the time of day the user actually opened the page
export function greetingFor(date = new Date()) {
  const hour = date.getHours();

  if (hour < 12) {
    return 'Good morning';
  }

  if (hour < 17) {
    return 'Good afternoon';
  }

  return 'Good evening';
}

export function pluralize(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

// How long somebody has been sitting in the waiting room, measured from the arrival stamp the server
// wrote. The clock is passed in rather than read here, so the card repaints from its own minute tick and
// two rows on the same screen can never be measured against two different moments.
export function waitingMinutes(arrivedAt, now) {
  if (!arrivedAt) {
    return 0;
  }

  return Math.max(0, Math.floor((now.getTime() - new Date(arrivedAt).getTime()) / 60_000));
}

export function waitingFor(arrivedAt, now) {
  const minutes = waitingMinutes(arrivedAt, now);

  if (minutes < 1) {
    return 'just arrived';
  }

  if (minutes < 60) {
    return `${minutes} min waiting`;
  }

  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m waiting`;
}

// A day is either today, tomorrow or a date, and a desk should never have to work out which.
export function relativeDay(iso, today) {
  if (!iso || !today) {
    return '';
  }

  if (iso === today) {
    return 'today';
  }

  const day = new Date(`${iso}T00:00:00Z`);
  const reference = new Date(`${today}T00:00:00Z`);
  const difference = Math.round((day - reference) / 86_400_000);

  if (difference === 1) {
    return 'tomorrow';
  }

  if (difference === -1) {
    return 'yesterday';
  }

  return formatDate(iso, { weekday: 'long', day: 'numeric', month: 'short' });
}
