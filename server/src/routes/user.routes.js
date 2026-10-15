const { Router } = require('express');
const userController = require('../controllers/user.controller');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');
const validate = require('../middlewares/validate');
const { ROLES } = require('../config/constants');
const asyncHandler = require('../utils/asyncHandler');
const { createReceptionistSchema } = require('../validators/doctor.validator');

const router = Router();

// staff accounts are created by a super admin only
router.post(
  '/receptionists',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  validate(createReceptionistSchema),
  asyncHandler(userController.createReceptionist)
);

module.exports = router;
