const { Router } = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const departmentRoutes = require('./department.routes');
const doctorRoutes = require('./doctor.routes');
const userRoutes = require('./user.routes');

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/departments', departmentRoutes);
router.use('/doctors', doctorRoutes);
router.use('/users', userRoutes);

module.exports = router;
