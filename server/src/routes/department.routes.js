const { Router } = require('express');
const departmentController = require('../controllers/department.controller');
const authenticate = require('../middlewares/authenticate');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

// every signed in role needs the department list, it is the first filter on most screens
router.get('/', authenticate, asyncHandler(departmentController.listDepartments));

module.exports = router;
