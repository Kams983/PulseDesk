const { z } = require('zod');
const { emptyMeansAbsent } = require('./common');

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

module.exports = { trendQuerySchema };
