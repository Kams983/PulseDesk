const { ROLES } = require('../config/constants');
const Department = require('../models/department.model');
const Doctor = require('../models/doctor.model');
const User = require('../models/user.model');
const AppError = require('../utils/AppError');
const { escapeRegExp } = require('../utils/regex');
const { hashPassword } = require('./authService');
const { logAction } = require('./auditService');

// only the fields a doctor response needs, so a list page never drags every schedule through the wire
const DOCTOR_FIELDS = 'name departmentId specialization slotDurationMinutes schedule';

async function listDoctors({ departmentId, q, requester } = {}) {
  if (requester.role === ROLES.DOCTOR) {
    // a doctor's own profile is the only one they may see, so the filters are ignored
    const own = await findOwnDoctorProfile(requester.id);

    return own ? [own] : [];
  }

  const filter = {};

  if (departmentId) {
    filter.departmentId = departmentId;
  }

  if (q) {
    // a contains match, so "okafor" finds "Dr. Ifeanyi Okafor". The nameLower index cannot serve it.
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

  return createDoctorWithLogin({ ...payload, passwordHash, actor, ip });
}

// There are no transactions on a single mongod, so a half created doctor is undone by hand rather than
// leaving a login with no profile behind.
async function createDoctorWithLogin({ name, email, departmentId, specialization, slotDurationMinutes, schedule, passwordHash, actor, ip }) {
  try {
    const user = await User.create({ name, email, passwordHash, role: ROLES.DOCTOR });
    const doctor = await Doctor.create({
      userId: user._id,
      departmentId,
      name,
      nameLower: name.toLowerCase(),
      specialization,
      slotDurationMinutes,
      schedule: schedule || [],
    });

    await logAction({
      user: actor,
      action: 'DOCTOR_CREATED',
      entity: 'Doctor',
      entityId: doctor._id,
      metadata: { email, departmentId: String(departmentId) },
      ip,
    });

    return await findWithDepartment(doctor._id);
  } catch (error) {
    await User.deleteOne({ email }).catch((rollbackError) => console.error('doctor rollback failed:', rollbackError.message));

    // two requests can pass the check above at the same instant, and the loser still needs to be told
    // which field is the problem
    if (error.code === 11000) {
      throw AppError.conflict('A user with that email already exists', [
        { field: 'email', message: 'That email is already in use' },
      ]);
    }

    throw error;
  }
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

async function findWithDepartment(doctorId) {
  return Doctor.findById(doctorId).select(DOCTOR_FIELDS).populate('departmentId', 'name code').lean();
}

// the caller's own doctor profile. The patient and appointment services scope a doctor by it, so it is
// shared rather than reimplemented per feature.
async function findOwnDoctorProfile(userId) {
  return Doctor.findOne({ userId }).select(DOCTOR_FIELDS).populate('departmentId', 'name code').lean();
}

async function assertDepartmentExists(departmentId) {
  const department = await Department.findById(departmentId).lean();

  if (!department) {
    throw AppError.badRequest('Validation failed', [{ field: 'departmentId', message: 'No such department' }]);
  }
}

// the field is named so a form can put the answer beside the email box, which is where the person who
// typed it is looking
async function assertEmailIsFree(email) {
  const existing = await User.exists({ email: String(email).toLowerCase() });

  if (existing) {
    throw AppError.conflict('A user with that email already exists', [
      { field: 'email', message: 'That email is already in use' },
    ]);
  }
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
