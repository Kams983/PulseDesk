const { Router } = require('express');
const dashboardController = require('../controllers/dashboard.controller');
const authenticate = require('../middlewares/authenticate');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

// every role has a board, what it contains depends on who is asking
router.get('/', authenticate, asyncHandler(dashboardController.getDashboard));

module.exports = router;
