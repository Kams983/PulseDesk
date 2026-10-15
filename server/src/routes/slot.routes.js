const { Router } = require('express');
const slotController = require('../controllers/slot.controller');
const authenticate = require('../middlewares/authenticate');
const validate = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const { slotsQuerySchema } = require('../validators/doctor.validator');

const router = Router();

// availability is readable by any signed in role, the per doctor narrowing happens in the controller
router.get('/', authenticate, validate(slotsQuerySchema, 'query'), asyncHandler(slotController.listSlots));

module.exports = router;
