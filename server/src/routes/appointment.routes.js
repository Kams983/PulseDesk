const { Router } = require('express');
const appointmentController = require('../controllers/appointment.controller');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');
const validate = require('../middlewares/validate');
const { ROLES } = require('../config/constants');
const asyncHandler = require('../utils/asyncHandler');
const { appointmentIdParamSchema, createAppointmentSchema, listAppointmentsQuerySchema } = require('../validators/appointment.validator');

const router = Router();

// booking is desk work
router.post(
  '/',
  authenticate,
  authorize(ROLES.RECEPTIONIST, ROLES.SUPER_ADMIN),
  validate(createAppointmentSchema),
  asyncHandler(appointmentController.createAppointment)
);
// every role reads, and the service narrows a doctor to their own rows whatever the query says
router.get('/', authenticate, validate(listAppointmentsQuerySchema, 'query'), asyncHandler(appointmentController.listAppointments));
router.get(
  '/:id',
  authenticate,
  validate(appointmentIdParamSchema, 'params'),
  asyncHandler(appointmentController.getAppointment)
);

module.exports = router;
