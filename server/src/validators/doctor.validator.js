const { z } = require('zod');
const { DateTime } = require('luxon');
const { timeToMinutes } = require('../utils/time');

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const timeWindowSchema = z.object({
  name: z.string().trim().max(40).optional(),
  start: z.string().regex(TIME_PATTERN, 'Expected a HH:mm time'),
  end: z.string().regex(TIME_PATTERN, 'Expected a HH:mm time'),
});

// one working day: when it runs, and which windows inside it are unavailable
const dayScheduleSchema = z
  .object({
    dayOfWeek: z.coerce.number().int().min(0, 'Day must be 0 (Sunday) to 6 (Saturday)').max(6, 'Day must be 0 (Sunday) to 6 (Saturday)'),
    // a day in the schedule means the doctor works it, so at least one session is required
    sessions: z.array(timeWindowSchema).min(1, 'A working day needs at least one session'),
    breaks: z.array(timeWindowSchema).default([]),
  })
  .superRefine((day, ctx) => {
    // an inner rule failing still runs this refinement, so nothing below may assume clean input:
    // a window with an unparsable time cannot be compared, and an empty day has no bounds at all
    const parsable = (window) => TIME_PATTERN.test(window.start) && TIME_PATTERN.test(window.end);

    for (const [kind, windows] of [['sessions', day.sessions], ['breaks', day.breaks]]) {
      windows.forEach((window, index) => {
        if (parsable(window) && timeToMinutes(window.start) >= timeToMinutes(window.end)) {
          ctx.addIssue({ code: 'custom', message: 'End time must be after the start time', path: [kind, index, 'end'] });
        }
      });
    }

    if (day.sessions.length === 0 || !day.sessions.every(parsable)) {
      return;
    }

    // the window a break has to sit inside is the whole day the doctor works, so the usual
    // 12:00 to 13:00 lunch stays valid between a morning and an evening session
    const ordered = [...day.sessions].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
    const dayStart = timeToMinutes(ordered[0].start);
    const dayEnd = timeToMinutes(ordered[ordered.length - 1].end);

    ordered.forEach((session, index) => {
      if (index > 0 && timeToMinutes(session.start) < timeToMinutes(ordered[index - 1].end)) {
        ctx.addIssue({ code: 'custom', message: 'Sessions in one day cannot overlap', path: ['sessions', index, 'start'] });
      }
    });

    day.breaks.forEach((brk, index) => {
      if (!parsable(brk)) {
        return;
      }

      if (timeToMinutes(brk.start) < dayStart || timeToMinutes(brk.end) > dayEnd) {
        ctx.addIssue({ code: 'custom', message: 'Break must fall inside the hours the doctor works', path: ['breaks', index, 'start'] });
      }
    });
  });

const scheduleSchema = z.array(dayScheduleSchema).max(7).superRefine((days, ctx) => {
  const seen = new Set();

  days.forEach((day, index) => {
    if (seen.has(day.dayOfWeek)) {
      ctx.addIssue({ code: 'custom', message: 'Each weekday can only appear once', path: [index, 'dayOfWeek'] });
    }

    seen.add(day.dayOfWeek);
  });
});

const createDoctorSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(120),
  email: z.email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  departmentId: z.string().regex(OBJECT_ID_PATTERN, 'Expected a department id'),
  specialization: z.string().trim().max(120).optional(),
  slotDurationMinutes: z.coerce.number().int().min(5).max(120).default(15),
  schedule: scheduleSchema.default([]),
});

const createReceptionistSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(120),
  email: z.email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const updateScheduleSchema = z.object({
  slotDurationMinutes: z.coerce.number().int().min(5).max(120),
  schedule: scheduleSchema,
});

const doctorIdParamSchema = z.object({ id: z.string().regex(OBJECT_ID_PATTERN, 'Expected a doctor id') });

// a filter widget usually sends its empty state as an empty string, which means "no filter" rather
// than an invalid one, so those values are treated as absent
const emptyMeansAbsent = (schema) => z.preprocess((value) => (value === '' ? undefined : value), schema);

const listDoctorsQuerySchema = z.object({
  departmentId: emptyMeansAbsent(z.string().regex(OBJECT_ID_PATTERN, 'Expected a department id').optional()),
  q: emptyMeansAbsent(z.string().trim().min(1).max(80).optional()),
});

const slotsQuerySchema = z.object({
  doctorId: z.string().regex(OBJECT_ID_PATTERN, 'Expected a doctor id'),
  date: z
    .string()
    .regex(DATE_PATTERN, 'Expected a YYYY-MM-DD date')
    .refine((date) => DateTime.fromISO(date, { zone: 'utc' }).isValid, 'That calendar date does not exist'),
});

module.exports = {
  createDoctorSchema,
  createReceptionistSchema,
  doctorIdParamSchema,
  listDoctorsQuerySchema,
  scheduleSchema,
  slotsQuerySchema,
  updateScheduleSchema,
};
