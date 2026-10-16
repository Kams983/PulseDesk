const { ALLOWED_TRANSITIONS, APPOINTMENT_SORT_FIELDS, APPOINTMENT_STATUS, ROLES } = require('../config/constants');
const Appointment = require('../models/appointment.model');
const Doctor = require('../models/doctor.model');
const Patient = require('../models/patient.model');
const AppError = require('../utils/AppError');
const { anchoredPrefix, escapeRegExp } = require('../utils/regex');
const { isPastDate, isPastSlot, nowInClinicTz } = require('../utils/time');
const { emitAppointmentEvent } = require('../sockets/appointmentEvents');
const { logAction } = require('./auditService');
const doctorService = require('./doctorService');
const patientService = require('./patientService');
const { getSlotsForDoctorDate } = require('./slotService');

// only the fields a list page renders, so a query never drags whole documents around
const APPOINTMENT_FIELDS =
  'patientId doctorId departmentId date startTime endTime status purpose notes patientSnapshot doctorSnapshot createdBy arrivedAt completedAt cancelledAt cancelReason createdAt';

const DEFAULT_LIMIT = 10;

async function createAppointment(payload, user, ip) {
  const doctor = await findDoctorOrFail(payload.doctorId);

  assertSlotIsInTheFuture(payload.date, payload.startTime);

  const slot = await findBookableSlot(doctor, payload);
  const { patient, createdNewPatient } = await resolvePatient(payload, user);

  try {
    return await saveBooking({ doctor, slot, patient, payload, user, ip });
  } catch (error) {
    // a visit that was never booked must not leave a freshly registered patient behind
    if (createdNewPatient) {
      await Patient.deleteOne({ _id: patient._id }).catch((cleanupError) =>
        console.error('patient rollback failed:', cleanupError.message)
      );
    }

    // 11000 comes from the partial unique index that guards the slot, see the model
    if (error.code === 11000) {
      throw AppError.conflict('This slot has just been booked by someone else');
    }

    throw error;
  }
}

async function findDoctorOrFail(doctorId) {
  const doctor = await Doctor.findById(doctorId).lean();

  if (!doctor) {
    throw AppError.notFound('Doctor not found');
  }

  return doctor;
}

// The grid the booking screen showed is the only source of bookable times, so this one check rejects a
// Sunday, an off grid time such as 09:07 and any time outside the doctor's hours.
async function findBookableSlot(doctor, payload) {
  const { slots } = await getSlotsForDoctorDate(doctor._id.toString(), payload.date);
  const slot = slots.find((candidate) => candidate.startTime === payload.startTime);

  if (!slot) {
    throw AppError.badRequest("That time is not one of the doctor's slots on that date", [
      { field: 'startTime', message: 'Choose one of the times the doctor works on that date' },
    ]);
  }

  // the friendly message only: two requests can both get this far, which is what the index is for
  if (slot.status === 'booked') {
    throw AppError.conflict('That slot is already booked');
  }

  return slot;
}

async function saveBooking({ doctor, slot, patient, payload, user, ip }) {
  const appointment = await Appointment.create(bookingFields({ doctor, slot, patient, payload, user }));

  await logAction({
    user,
    action: 'APPOINTMENT_CREATED',
    entity: 'Appointment',
    entityId: appointment._id,
    metadata: { date: appointment.date, startTime: appointment.startTime, doctorId: String(doctor._id) },
    ip,
  });

  emitAppointmentEvent('created', appointment);

  return appointment;
}

function bookingFields({ doctor, slot, patient, payload, user }) {
  return {
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
    // snapshots are what the list page searches and shows, so it never joins to display a row
    patientSnapshot: {
      name: patient.name,
      nameLower: patient.name.toLowerCase(),
      mobile: patient.mobile,
      patientCode: patient.patientCode,
    },
    doctorSnapshot: { name: doctor.name, nameLower: doctor.nameLower },
    createdBy: user.id,
  };
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

  await assertOwnsAppointment(appointment, user, 'view');

  return appointment;
}

// only the desk may rewrite the purpose and the notes of a visit that has not finished
async function updateAppointment(appointmentId, payload, user, ip) {
  const appointment = await findForChange(appointmentId);

  if ([APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED].includes(appointment.status)) {
    throw AppError.conflict(`A ${appointment.status} appointment cannot be edited`);
  }

  const changed = {};

  for (const field of ['purpose', 'notes']) {
    if (payload[field] !== undefined && payload[field] !== appointment[field]) {
      appointment[field] = payload[field];
      changed[field] = payload[field];
    }
  }

  // sending the same values back changes nothing, and an empty audit row would only be noise
  if (Object.keys(changed).length === 0) {
    return appointment;
  }

  await appointment.save();

  await logAction({
    user,
    action: 'APPOINTMENT_UPDATED',
    entity: 'Appointment',
    entityId: appointment._id,
    metadata: changed,
    ip,
  });

  emitAppointmentEvent('updated', appointment);

  return appointment;
}

// a cancel keeps the row as a record and only takes it out of the active statuses, which is what frees
// the slot inside the partial unique index
async function cancelAppointment(appointmentId, reason, user, ip) {
  const appointment = await findForChange(appointmentId);

  assertTransition(appointment.status, APPOINTMENT_STATUS.CANCELLED);

  // read before the change, because the audit row says what the visit actually was
  const previousStatus = appointment.status;

  appointment.status = APPOINTMENT_STATUS.CANCELLED;
  appointment.cancelledAt = new Date();

  if (reason) {
    appointment.cancelReason = reason;
  }

  await appointment.save();

  await logAction({
    user,
    action: 'APPOINTMENT_CANCELLED',
    entity: 'Appointment',
    entityId: appointment._id,
    metadata: { from: previousStatus, reason },
    ip,
  });

  emitAppointmentEvent('cancelled', appointment);

  return appointment;
}

async function markArrived(appointmentId, user, ip) {
  const appointment = await findForChange(appointmentId);

  assertTransition(appointment.status, APPOINTMENT_STATUS.ARRIVED);

  // nobody can arrive for tomorrow, so the status and the date would contradict each other
  if (appointment.date > nowInClinicTz().toISODate()) {
    throw AppError.conflict('This appointment is not due yet');
  }

  appointment.status = APPOINTMENT_STATUS.ARRIVED;
  appointment.arrivedAt = new Date();
  await appointment.save();

  await logAction({
    user,
    action: 'APPOINTMENT_ARRIVED',
    entity: 'Appointment',
    entityId: appointment._id,
    metadata: { date: appointment.date, startTime: appointment.startTime },
    ip,
  });

  // an arrival moves the same row on, so the board refetches instead of learning a new event
  emitAppointmentEvent('updated', appointment);

  return appointment;
}

async function completeAppointment(appointmentId, user, ip) {
  const appointment = await findForChange(appointmentId);

  await assertOwnsAppointment(appointment, user, 'complete');
  assertTransition(appointment.status, APPOINTMENT_STATUS.COMPLETED);

  appointment.status = APPOINTMENT_STATUS.COMPLETED;
  appointment.completedAt = new Date();
  await appointment.save();

  await logAction({
    user,
    action: 'APPOINTMENT_COMPLETED',
    entity: 'Appointment',
    entityId: appointment._id,
    metadata: { date: appointment.date, startTime: appointment.startTime },
    ip,
  });

  emitAppointmentEvent('updated', appointment);

  return appointment;
}

// every status change passes through here, so no route can invent a move the workflow does not allow
function assertTransition(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from] || [];

  if (!allowed.includes(to)) {
    throw AppError.conflict(`Cannot move an appointment from ${from} to ${to}`);
  }
}

async function buildListFilter(query, user) {
  const filter = {};

  addExactFilters(filter, query);
  addTextFilters(filter, query);
  await addDoctorScope(filter, query, user);

  return filter;
}

function addExactFilters(filter, query) {
  if (query.status) {
    filter.status = query.status;
  }

  if (query.departmentId) {
    filter.departmentId = query.departmentId;
  }

  if (query.dateFrom || query.dateTo) {
    // dates are YYYY-MM-DD strings, so a string range is exactly a date range
    filter.date = {};

    if (query.dateFrom) {
      filter.date.$gte = query.dateFrom;
    }

    if (query.dateTo) {
      filter.date.$lte = query.dateTo;
    }
  }
}

function addTextFilters(filter, query) {
  if (query.q) {
    filter['patientSnapshot.nameLower'] = anchoredPrefix(query.q.toLowerCase());
  }

  if (query.mobile) {
    filter['patientSnapshot.mobile'] = new RegExp(`^${escapeRegExp(query.mobile)}`);
  }

  if (query.doctor) {
    filter['doctorSnapshot.nameLower'] = anchoredPrefix(query.doctor.toLowerCase());
  }
}

// a doctor sees their own visits no matter what the query string asked for
async function addDoctorScope(filter, query, user) {
  if (user.role !== ROLES.DOCTOR) {
    if (query.doctorId) {
      filter.doctorId = query.doctorId;
    }

    return;
  }

  const own = await doctorService.findOwnDoctorProfile(user.id);

  if (!own) {
    throw AppError.forbidden('No doctor profile is linked to this account');
  }

  filter.doctorId = own._id;
}

function buildSort(sortBy = APPOINTMENT_SORT_FIELDS[0], sortOrder = 'asc') {
  const direction = sortOrder === 'desc' ? -1 : 1;
  const sort = { [sortBy]: direction };

  // a date on its own does not order a busy day, so the start time is always the second key
  if (sortBy === 'date') {
    sort.startTime = direction;
  }

  // many visits share a date and a start time across doctors, and without a full order skip and limit
  // can repeat one row on page two and drop another
  sort._id = 1;

  return sort;
}

// a doctor may only touch a visit of their own, everyone else is already allowed by the route
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
  if (!payload.patientId) {
    const patient = await patientService.createPatientFromInput(payload.newPatient, user.id);

    return { patient, createdNewPatient: true };
  }

  const patient = await Patient.findById(payload.patientId).select('patientCode name mobile').lean();

  if (!patient) {
    throw AppError.badRequest('Patient not found', [{ field: 'patientId', message: 'No such patient' }]);
  }

  return { patient, createdNewPatient: false };
}

async function findForChange(appointmentId) {
  const appointment = await Appointment.findById(appointmentId);

  if (!appointment) {
    throw AppError.notFound('Appointment not found');
  }

  return appointment;
}

module.exports = {
  cancelAppointment,
  completeAppointment,
  createAppointment,
  getAppointmentById,
  listAppointments,
  markArrived,
  updateAppointment,
};
