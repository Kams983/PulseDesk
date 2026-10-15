const { z } = require('zod');
const { objectId } = require('./common');

// an empty search box would return the whole register, so the term is required
const searchPatientsQuerySchema = z.object({
  q: z.string().trim().min(1, 'Type a name, a mobile number or a patient code').max(80),
});

const patientIdParamSchema = z.object({ id: objectId('Expected a patient id') });

module.exports = { patientIdParamSchema, searchPatientsQuerySchema };
