const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const authenticate = require('../middlewares/authenticate');
const { loginLimiter } = require('../middlewares/rateLimiters');
const validate = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const { loginSchema } = require('../validators/auth.validator');

const router = Router();

router.post('/login', loginLimiter, validate(loginSchema), asyncHandler(authController.login));
router.post('/refresh', asyncHandler(authController.refresh));
router.post('/logout', asyncHandler(authController.logout));
router.get('/me', authenticate, authController.me);

module.exports = router;
