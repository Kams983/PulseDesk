const { z } = require('zod');
const { calendarDate, objectId, timeSchema } = require('./common');

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

module.exports = { createAppointmentSchema };
