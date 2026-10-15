const { Router } = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const departmentRoutes = require('./department.routes');
const doctorRoutes = require('./doctor.routes');
const slotRoutes = require('./slot.routes');
const userRoutes = require('./user.routes');
const patientRoutes = require('./patient.routes');
const appointmentRoutes = require('./appointment.routes');

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/departments', departmentRoutes);
router.use('/doctors', doctorRoutes);
router.use('/slots', slotRoutes);
router.use('/users', userRoutes);
router.use('/patients', patientRoutes);
router.use('/appointments', appointmentRoutes);

module.exports = router;
