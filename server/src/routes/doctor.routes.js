const { Router } = require('express');
const doctorController = require('../controllers/doctor.controller');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');
const validate = require('../middlewares/validate');
const { ROLES } = require('../config/constants');
const asyncHandler = require('../utils/asyncHandler');
const {
  createDoctorSchema,
  doctorIdParamSchema,
  listDoctorsQuerySchema,
  updateScheduleSchema,
} = require('../validators/doctor.validator');

const router = Router();

router.get('/', authenticate, validate(listDoctorsQuerySchema, 'query'), asyncHandler(doctorController.listDoctors));
router.get('/:id', authenticate, validate(doctorIdParamSchema, 'params'), asyncHandler(doctorController.getDoctor));

// only a super admin creates staff, and only a super admin decides who works when
router.post(
  '/',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  validate(createDoctorSchema),
  asyncHandler(doctorController.createDoctor)
);
router.put(
  '/:id/schedule',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  validate(doctorIdParamSchema, 'params'),
  validate(updateScheduleSchema),
  asyncHandler(doctorController.updateSchedule)
);

module.exports = router;
