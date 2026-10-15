const { Router } = require('express');
const { healthCheck } = require('../controllers/health.controller');

const router = Router();

router.get('/', healthCheck);

module.exports = router;
