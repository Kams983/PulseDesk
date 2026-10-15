const { Router } = require('express');
const appointmentController = require('../controllers/appointment.controller');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');
const validate = require('../middlewares/validate');
const { ROLES } = require('../config/constants');
const asyncHandler = require('../utils/asyncHandler');
const {
  appointmentIdParamSchema,
  cancelAppointmentSchema,
  createAppointmentSchema,
  listAppointmentsQuerySchema,
  updateAppointmentSchema,
} = require('../validators/appointment.validator');

const router = Router();

// the desk owns booking and the paper trail around it, a doctor reads their own list and closes visits
router.post(
  '/',
  authenticate,
  authorize(ROLES.RECEPTIONIST, ROLES.SUPER_ADMIN),
  validate(createAppointmentSchema),
  asyncHandler(appointmentController.createAppointment)
);
router.get('/', authenticate, validate(listAppointmentsQuerySchema, 'query'), asyncHandler(appointmentController.listAppointments));
router.get(
  '/:id',
  authenticate,
  validate(appointmentIdParamSchema, 'params'),
  asyncHandler(appointmentController.getAppointment)
);
router.put(
  '/:id',
  authenticate,
  authorize(ROLES.RECEPTIONIST, ROLES.SUPER_ADMIN),
  validate(appointmentIdParamSchema, 'params'),
  validate(updateAppointmentSchema),
  asyncHandler(appointmentController.updateAppointment)
);
router.delete(
  '/:id',
  authenticate,
  authorize(ROLES.RECEPTIONIST, ROLES.SUPER_ADMIN),
  validate(appointmentIdParamSchema, 'params'),
  validate(cancelAppointmentSchema),
  asyncHandler(appointmentController.cancelAppointment)
);
router.post(
  '/:id/arrive',
  authenticate,
  authorize(ROLES.RECEPTIONIST, ROLES.SUPER_ADMIN),
  validate(appointmentIdParamSchema, 'params'),
  asyncHandler(appointmentController.markArrived)
);
router.post(
  '/:id/complete',
  authenticate,
  authorize(ROLES.DOCTOR, ROLES.SUPER_ADMIN),
  validate(appointmentIdParamSchema, 'params'),
  asyncHandler(appointmentController.completeAppointment)
);

module.exports = router;
