const { ROLES } = require('../config/constants');
const Department = require('../models/department.model');
const Doctor = require('../models/doctor.model');
const User = require('../models/user.model');
const AppError = require('../utils/AppError');
const { hashPassword } = require('./authService');
const { logAction } = require('./auditService');

// the only fields a doctor response needs, so a lean query never drags the schedule of every doctor
// through the wire for a list page
const DOCTOR_FIELDS = 'name departmentId specialization slotDurationMinutes schedule';

async function listDoctors({ departmentId, q, requester } = {}) {
  if (requester.role === ROLES.DOCTOR) {
    // a doctor's own profile is the only one they may see, so the filters are ignored entirely
    return findOwnDoctorProfile(requester.id, true);
  }

  const filter = {};

  if (departmentId) {
    filter.departmentId = departmentId;
  }

  if (q) {
    // a contains match rather than a prefix one, so "okafor" finds "Dr. Ifeanyi Okafor". The nameLower
    // index cannot be used by an unanchored regex, which is a fair trade at clinic sized lists.
    filter.nameLower = new RegExp(escapeRegExp(q.toLowerCase()));
  }

  return Doctor.find(filter).select(DOCTOR_FIELDS).populate('departmentId', 'name code').sort({ nameLower: 1 }).lean();
}

async function getDoctorById(doctorId, requester) {
  await assertCanViewDoctor(requester, doctorId);

  const doctor = await Doctor.findById(doctorId).select(DOCTOR_FIELDS).populate('departmentId', 'name code').lean();

  if (!doctor) {
    throw AppError.notFound('Doctor not found');
  }

  return doctor;
}

// the one place the "a doctor only sees themselves" rule lives, shared by the doctor routes and slots
async function assertCanViewDoctor(requester, doctorId) {
  if (requester.role !== ROLES.DOCTOR) {
    return;
  }

  const own = await findOwnDoctorProfile(requester.id);

  if (!own || own._id.toString() !== String(doctorId)) {
    throw AppError.forbidden('You can only view your own schedule');
  }
}

async function createDoctor(payload, actor, ip) {
  await assertDepartmentExists(payload.departmentId);
  await assertEmailIsFree(payload.email);

  const passwordHash = await hashPassword(payload.password);

  return createWithRollback(async () => {
    const user = await User.create({
      name: payload.name,
      email: payload.email,
      passwordHash,
      role: ROLES.DOCTOR,
    });

    const doctor = await Doctor.create({
      userId: user._id,
      departmentId: payload.departmentId,
      name: payload.name,
      nameLower: payload.name.toLowerCase(),
      specialization: payload.specialization,
      slotDurationMinutes: payload.slotDurationMinutes,
      schedule: payload.schedule || [],
    });

    await logAction({
      user: actor,
      action: 'DOCTOR_CREATED',
      entity: 'Doctor',
      entityId: doctor._id,
      metadata: { email: payload.email, departmentId: String(payload.departmentId) },
      ip,
    });

    return doctor;
  }, () => User.deleteOne({ email: payload.email }));
}

async function createReceptionist(payload, actor, ip) {
  await assertEmailIsFree(payload.email);

  const passwordHash = await hashPassword(payload.password);
  const user = await User.create({
    name: payload.name,
    email: payload.email,
    passwordHash,
    role: ROLES.RECEPTIONIST,
  });

  await logAction({
    user: actor,
    action: 'RECEPTIONIST_CREATED',
    entity: 'User',
    entityId: user._id,
    metadata: { email: payload.email },
    ip,
  });

  return user;
}

async function replaceSchedule(doctorId, payload, actor, ip) {
  const doctor = await Doctor.findById(doctorId);

  if (!doctor) {
    throw AppError.notFound('Doctor not found');
  }

  doctor.slotDurationMinutes = payload.slotDurationMinutes;
  doctor.schedule = payload.schedule;
  await doctor.save();

  await logAction({
    user: actor,
    action: 'SCHEDULE_UPDATED',
    entity: 'Doctor',
    entityId: doctor._id,
    metadata: {
      slotDurationMinutes: payload.slotDurationMinutes,
      workingDays: payload.schedule.map((day) => day.dayOfWeek),
    },
    ip,
  });

  return findWithDepartment(doctor._id);
}

// no transactions on a single mongod, so a half created doctor is undone by hand instead of leaving
// a login that has no profile behind
async function createWithRollback(create, rollback) {
  try {
    const created = await create();

    return await findWithDepartment(created._id);
  } catch (err) {
    // the rollback itself must not hide the original failure, but a failed rollback has to be visible
    await rollback().catch((rollbackError) => console.error('doctor rollback failed:', rollbackError.message));

    if (err.code === 11000) {
      throw AppError.conflict('A user with that email already exists');
    }

    throw err;
  }
}

async function findWithDepartment(doctorId) {
  return Doctor.findById(doctorId).select(DOCTOR_FIELDS).populate('departmentId', 'name code').lean();
}

// the caller's own doctor profile. The patient and appointment services scope a doctor by it, so it
// is exported rather than reimplemented per feature.
async function findOwnDoctorProfile(userId, asList = false) {
  const doctor = await Doctor.findOne({ userId }).select(DOCTOR_FIELDS).populate('departmentId', 'name code').lean();

  if (asList) {
    // a doctor account without a profile is possible only through a bad import, an empty list is honest
    return doctor ? [doctor] : [];
  }

  return doctor;
}

async function assertDepartmentExists(departmentId) {
  const department = await Department.findById(departmentId).lean();

  if (!department) {
    throw AppError.badRequest('Validation failed', [{ field: 'departmentId', message: 'No such department' }]);
  }
}

async function assertEmailIsFree(email) {
  const existing = await User.exists({ email: String(email).toLowerCase() });

  if (existing) {
    throw AppError.conflict('A user with that email already exists');
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  assertCanViewDoctor,
  createDoctor,
  createReceptionist,
  findOwnDoctorProfile,
  getDoctorById,
  listDoctors,
  replaceSchedule,
};
