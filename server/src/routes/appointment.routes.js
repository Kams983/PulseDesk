const { Router } = require('express');
const appointmentController = require('../controllers/appointment.controller');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');
const validate = require('../middlewares/validate');
const { ROLES } = require('../config/constants');
const asyncHandler = require('../utils/asyncHandler');
const { createAppointmentSchema } = require('../validators/appointment.validator');

const router = Router();

// booking is desk work
router.post(
  '/',
  authenticate,
  authorize(ROLES.RECEPTIONIST, ROLES.SUPER_ADMIN),
  validate(createAppointmentSchema),
  asyncHandler(appointmentController.createAppointment)
);

module.exports = router;
