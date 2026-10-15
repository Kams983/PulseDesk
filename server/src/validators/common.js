const { z } = require('zod');
const { DateTime } = require('luxon');

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// a filter widget sends its empty state as an empty string, which means "no filter" rather than an
// invalid one, so those values are treated as absent
function emptyMeansAbsent(schema) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema);
}

// the date is a plain calendar date throughout the api, never a Date object
function calendarDate(message = 'Expected a YYYY-MM-DD date') {
  return z
    .string()
    .regex(DATE_PATTERN, message)
    .refine((date) => DateTime.fromISO(date, { zone: 'utc' }).isValid, 'That calendar date does not exist');
}

function objectId(message) {
  return z.string().regex(OBJECT_ID_PATTERN, message);
}

const timeSchema = (message = 'Expected a HH:mm time') => z.string().regex(TIME_PATTERN, message);

module.exports = { calendarDate, emptyMeansAbsent, objectId, timeSchema, DATE_PATTERN, OBJECT_ID_PATTERN, TIME_PATTERN };
