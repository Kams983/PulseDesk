const { Router } = require('express');
const dashboardController = require('../controllers/dashboard.controller');
const authenticate = require('../middlewares/authenticate');
const validate = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const { trendQuerySchema } = require('../validators/dashboard.validator');

const router = Router();

// every role has a board, what it contains depends on who is asking
router.get('/', authenticate, asyncHandler(dashboardController.getDashboard));
// one entry per day ending today, zero filled, scoped to the caller
router.get('/trend', authenticate, validate(trendQuerySchema, 'query'), asyncHandler(dashboardController.getTrend));

module.exports = router;
