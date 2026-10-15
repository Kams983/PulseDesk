const { z } = require('zod');
const { APPOINTMENT_SORT_FIELDS, APPOINTMENT_STATUS } = require('../config/constants');
const { calendarDate, emptyMeansAbsent, objectId, timeSchema } = require('./common');

const MOBILE_PATTERN = /^\+?\d{7,15}$/;

const newPatientSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(120),
  mobile: z.string().trim().regex(MOBILE_PATTERN, 'Expected a mobile number, 7 to 15 digits'),
  gender: z.enum(['male', 'female', 'other']).optional(),
  dateOfBirth: calendarDate('Expected a YYYY-MM-DD date of birth').optional(),
});

const createAppointmentSchema = z
  .object({
    doctorId: objectId('Expected a doctor id'),
    date: calendarDate(),
    startTime: timeSchema(),
    patientId: objectId('Expected a patient id').optional(),
    newPatient: newPatientSchema.optional(),
    purpose: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .superRefine((payload, ctx) => {
    // exactly one of the two, so a booking can never mean two different patients at once
    if (payload.patientId && payload.newPatient) {
      ctx.addIssue({ code: 'custom', message: 'Provide either patientId or newPatient, not both', path: ['patientId'] });
    }

    if (!payload.patientId && !payload.newPatient) {
      ctx.addIssue({ code: 'custom', message: 'Provide an existing patientId or a newPatient', path: ['patientId'] });
    }
  });

const listAppointmentsQuerySchema = z
  .object({
    q: emptyMeansAbsent(z.string().trim().min(1).max(80).optional()),
    mobile: emptyMeansAbsent(z.string().trim().min(1).max(20).optional()),
    doctor: emptyMeansAbsent(z.string().trim().min(1).max(80).optional()),
    doctorId: emptyMeansAbsent(objectId('Expected a doctor id').optional()),
    departmentId: emptyMeansAbsent(objectId('Expected a department id').optional()),
    status: emptyMeansAbsent(z.enum(Object.values(APPOINTMENT_STATUS), 'Unknown appointment status').optional()),
    dateFrom: emptyMeansAbsent(calendarDate().optional()),
    dateTo: emptyMeansAbsent(calendarDate().optional()),
    sortBy: z.enum(APPOINTMENT_SORT_FIELDS, 'Unknown sort field').default(APPOINTMENT_SORT_FIELDS[0]),
    sortOrder: z.enum(['asc', 'desc'], 'Sort order must be asc or desc').default('asc'),
    page: z.coerce.number().int().min(1).default(1),
    // a bigger page would only let one caller decide how much work the database does for everyone
    limit: z.coerce.number().int().min(1).max(50, 'Limit cannot be more than 50').default(10),
  })
  .superRefine((query, ctx) => {
    if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo) {
      ctx.addIssue({ code: 'custom', message: 'dateFrom must not be after dateTo', path: ['dateFrom'] });
    }
  });

const updateAppointmentSchema = z
  .object({
    purpose: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .superRefine((payload, ctx) => {
    if (payload.purpose === undefined && payload.notes === undefined) {
      ctx.addIssue({ code: 'custom', message: 'Provide purpose or notes', path: ['purpose'] });
    }
  });

const cancelAppointmentSchema = z.object({
  reason: z.string().trim().max(200).optional(),
});

const appointmentIdParamSchema = z.object({ id: objectId('Expected an appointment id') });

module.exports = {
  appointmentIdParamSchema,
  cancelAppointmentSchema,
  createAppointmentSchema,
  listAppointmentsQuerySchema,
  updateAppointmentSchema,
};
