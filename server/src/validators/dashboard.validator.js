const { z } = require('zod');
const { emptyMeansAbsent } = require('./common');

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

// a chart with hundreds of points is unreadable, so the window is bounded here rather than in the
// service, and the message names the two ends a bad value can have
const trendQuerySchema = z.object({
  days: emptyMeansAbsent(
    z.coerce
      .number()
      .int()
      .min(1, 'Days must be between 1 and 31')
      .max(31, 'Days must be between 1 and 31')
      .default(7)
  ),
});

// the month is a YYYY-MM string, the same way every other date in the api is a string rather than a
// Date. A missing or empty month means the current clinic month, which is what the board opens on.
const calendarQuerySchema = z.object({
  month: emptyMeansAbsent(
    z
      .string()
      .regex(MONTH_PATTERN, 'Month must be a YYYY-MM value like 2026-10')
      .optional()
  ),
});

module.exports = { calendarQuerySchema, trendQuerySchema };
