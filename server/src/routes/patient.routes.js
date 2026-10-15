const { Router } = require('express');
const patientController = require('../controllers/patient.controller');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');
const validate = require('../middlewares/validate');
const { ROLES } = require('../config/constants');
const asyncHandler = require('../utils/asyncHandler');
const { patientIdParamSchema, searchPatientsQuerySchema } = require('../validators/patient.validator');

const router = Router();

// registering and finding patients is desk work, a doctor only reaches a patient they have seen
router.get(
  '/',
  authenticate,
  authorize(ROLES.RECEPTIONIST, ROLES.SUPER_ADMIN),
  validate(searchPatientsQuerySchema, 'query'),
  asyncHandler(patientController.searchPatients)
);
router.get(
  '/:id',
  authenticate,
  authorize(ROLES.RECEPTIONIST, ROLES.SUPER_ADMIN, ROLES.DOCTOR),
  validate(patientIdParamSchema, 'params'),
  asyncHandler(patientController.getPatient)
);

module.exports = router;
