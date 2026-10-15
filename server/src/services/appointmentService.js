const { APPOINTMENT_SORT_FIELDS, APPOINTMENT_STATUS, ROLES } = require('../config/constants');
const Appointment = require('../models/appointment.model');
const Doctor = require('../models/doctor.model');
const Patient = require('../models/patient.model');
const AppError = require('../utils/AppError');
const { anchoredPrefix, escapeRegExp } = require('../utils/regex');
const { isPastDate, isPastSlot } = require('../utils/time');
const { emitAppointmentChange } = require('../sockets/realtime');
const { logAction } = require('./auditService');
const doctorService = require('./doctorService');
const patientService = require('./patientService');
const { getSlotsForDoctorDate } = require('./slotService');

// the list page renders exactly these fields, so a query never drags whole documents around
const APPOINTMENT_FIELDS =
  'patientId doctorId departmentId date startTime endTime status purpose notes patientSnapshot doctorSnapshot createdBy arrivedAt completedAt cancelledAt cancelReason createdAt';

// client input never reaches the sort directly: only the whitelisted fields are accepted, so a sort
// can never become an injection point or an unindexed scan of a field nobody sorts by
const SORT_FIELDS = APPOINTMENT_SORT_FIELDS;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

async function createAppointment(payload, user, ip) {
  const doctor = await Doctor.findById(payload.doctorId).lean();

  if (!doctor) {
    throw AppError.notFound('Doctor not found');
  }

  assertSlotIsInTheFuture(payload.date, payload.startTime);

  // The generator already knows the working days, the sessions, the breaks and the slot length, so one
  // membership test rejects a Sunday, an off grid time such as 09:07 and any time outside the doctor's
  // hours. Four separate checks could disagree with the grid the booking screen showed.
  const { slots } = await getSlotsForDoctorDate(doctor._id.toString(), payload.date);
  const slot = slots.find((candidate) => candidate.startTime === payload.startTime);

  if (!slot) {
    throw AppError.badRequest('That time is not one of the doctor\'s slots on that date', [
      { field: 'startTime', message: 'Choose one of the times the doctor works on that date' },
    ]);
  }

  // friendly message only. Two requests can both get this far, which is exactly why the unique index
  // and the duplicate key catch below exist.
  if (slot.status === 'booked') {
    throw AppError.conflict('That slot is already booked');
  }

  const { patient, createdNewPatient } = await resolvePatient(payload, user);

  try {
    const appointment = await Appointment.create({
      patientId: patient._id,
      doctorId: doctor._id,
      departmentId: doctor.departmentId,
      date: payload.date,
      startTime: slot.startTime,
      // the end time comes from the generated slot, never from the client
      endTime: slot.endTime,
      status: APPOINTMENT_STATUS.SCHEDULED,
      purpose: payload.purpose,
      notes: payload.notes,
      // snapshots carry what the list page searches and shows, so it never joins to display a row
      patientSnapshot: {
        name: patient.name,
        nameLower: patient.name.toLowerCase(),
        mobile: patient.mobile,
        patientCode: patient.patientCode,
      },
      doctorSnapshot: { name: doctor.name, nameLower: doctor.nameLower },
      createdBy: user.id,
    });

    await logAction({
      user,
      action: 'APPOINTMENT_CREATED',
      entity: 'Appointment',
      entityId: appointment._id,
      metadata: { date: appointment.date, startTime: appointment.startTime, doctorId: String(doctor._id) },
      ip,
    });

    emitAppointmentChange('created', appointment);

    return appointment;
  } catch (err) {
    // a visit that never got booked must not leave a freshly registered patient behind
    if (createdNewPatient) {
      await Patient.deleteOne({ _id: patient._id }).catch((cleanupError) =>
        console.error('patient rollback failed:', cleanupError.message)
      );
    }

    // The partial unique index over the active statuses is the real double booking guard, everything
    // above only produces friendlier errors.
    if (err.code === 11000) {
      throw AppError.conflict('This slot has just been booked by someone else');
    }

    throw err;
  }
}

async function listAppointments(query, user) {
  const filter = await buildListFilter(query, user);
  const sort = buildSort(query.sortBy, query.sortOrder);
  const page = query.page || 1;
  const limit = query.limit || DEFAULT_LIMIT;

  const [appointments, total] = await Promise.all([
    Appointment.find(filter)
      .select(APPOINTMENT_FIELDS)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Appointment.countDocuments(filter),
  ]);

  return { appointments, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function getAppointmentById(appointmentId, user) {
  const appointment = await Appointment.findById(appointmentId).select(APPOINTMENT_FIELDS).lean();

  if (!appointment) {
    throw AppError.notFound('Appointment not found');
  }

  await assertCanSeeAppointment(appointment, user);

  return appointment;
}

async function buildListFilter(query, user) {
  const filter = {};

  if (query.status) {
    filter.status = query.status;
  }

  if (query.departmentId) {
    filter.departmentId = query.departmentId;
  }

  if (query.dateFrom || query.dateTo) {
    // dates are YYYY-MM-DD strings, so a string range is exactly a date range and needs no parsing
    filter.date = {};

    if (query.dateFrom) {
      filter.date.$gte = query.dateFrom;
    }

    if (query.dateTo) {
      filter.date.$lte = query.dateTo;
    }
  }

  if (query.q) {
    filter['patientSnapshot.nameLower'] = anchoredPrefix(query.q.toLowerCase());
  }

  if (query.mobile) {
    filter['patientSnapshot.mobile'] = new RegExp(`^${escapeRegExp(query.mobile)}`);
  }

  if (query.doctor) {
    filter['doctorSnapshot.nameLower'] = anchoredPrefix(query.doctor.toLowerCase());
  }

  // a doctor's own scope wins over whatever the client sent, so passing someone else's doctorId in the
  // query cannot widen the list
  if (user.role === ROLES.DOCTOR) {
    const own = await doctorService.findOwnDoctorProfile(user.id);

    if (!own) {
      throw AppError.forbidden('No doctor profile is linked to this account');
    }

    filter.doctorId = own._id;
  } else if (query.doctorId) {
    filter.doctorId = query.doctorId;
  }

  return filter;
}

function buildSort(sortBy = SORT_FIELDS[0], sortOrder = 'asc') {
  const direction = sortOrder === 'desc' ? -1 : 1;
  const sort = { [sortBy]: direction };

  // a date on its own does not order a busy day, so the start time is always the second key
  if (sortBy === 'date') {
    sort.startTime = direction;
  }

  // Many appointments share a date and a start time across doctors, and without a total order skip
  // and limit can repeat one row on page two and drop another. The id makes every page deterministic.
  sort._id = 1;

  return sort;
}

async function assertCanSeeAppointment(appointment, user) {
  await assertOwnsAppointment(appointment, user, 'view');
}

// the caller either is the doctor on the appointment or is not allowed near it
async function assertOwnsAppointment(appointment, user, action) {
  if (user.role !== ROLES.DOCTOR) {
    return;
  }

  const own = await doctorService.findOwnDoctorProfile(user.id);

  if (!own || own._id.toString() !== appointment.doctorId.toString()) {
    throw AppError.forbidden(`You can only ${action} your own appointments`);
  }
}

function assertSlotIsInTheFuture(date, startTime) {
  if (isPastDate(date)) {
    throw AppError.badRequest('That date is in the past', [
      { field: 'date', message: 'Appointments cannot be booked for a date that has passed' },
    ]);
  }

  if (isPastSlot(date, startTime)) {
    throw AppError.badRequest('That time has already passed', [
      { field: 'startTime', message: 'Choose a later time today' },
    ]);
  }
}

// an existing patient is looked up, a new one is registered on the spot. A repeat mobile number is a
// conflict that carries the existing patient, never a silent merge.
async function resolvePatient(payload, user) {
  if (payload.patientId) {
    const patient = await Patient.findById(payload.patientId).select('patientCode name mobile').lean();

    if (!patient) {
      throw AppError.badRequest('Patient not found', [{ field: 'patientId', message: 'No such patient' }]);
    }

    return { patient, createdNewPatient: false };
  }

  const patient = await patientService.createPatientFromInput(payload.newPatient, user.id);

  return { patient, createdNewPatient: true };
}

module.exports = {
  APPOINTMENT_FIELDS,
  MAX_LIMIT,
  SORT_FIELDS,
  createAppointment,
  getAppointmentById,
  listAppointments,
};
