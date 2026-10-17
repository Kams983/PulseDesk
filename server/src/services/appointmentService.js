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

// the only fields the list page needs
const APPOINTMENT_FIELDS =
  'patientId doctorId departmentId date startTime endTime status purpose notes patientSnapshot doctorSnapshot createdBy arrivedAt completedAt cancelledAt cancelReason createdAt';

const DEFAULT_LIMIT = 10;

// Book a visit. The patient is either picked from the list or created here.
async function createAppointment(payload, user, ip) {
  const doctor = await Doctor.findById(payload.doctorId).lean();

  if (!doctor) {
    throw AppError.notFound('Doctor not found');
  }

  if (isPastDate(payload.date)) {
    throw AppError.badRequest('That date is in the past', [
      { field: 'date', message: 'Appointments cannot be booked for a date that has passed' },
    ]);
  }

  if (isPastSlot(payload.date, payload.startTime)) {
    throw AppError.badRequest('That time has already passed', [
      { field: 'startTime', message: 'Choose a later time today' },
    ]);
  }

  // the booking screen only shows the doctor's slots, so we check against those
  const { slots } = await getSlotsForDoctorDate(doctor._id.toString(), payload.date);
  const slot = slots.find((item) => item.startTime === payload.startTime);

  if (!slot) {
    throw AppError.badRequest("That time is not one of the doctor's slots on that date", [
      { field: 'startTime', message: 'Choose one of the times the doctor works on that date' },
    ]);
  }

  if (slot.status === 'booked') {
    throw AppError.conflict('That slot is already booked');
  }

  let patient;
  let createdNewPatient = false;

  if (payload.patientId) {
    patient = await Patient.findById(payload.patientId).select('patientCode name mobile').lean();

    if (!patient) {
      throw AppError.badRequest('Patient not found', [{ field: 'patientId', message: 'No such patient' }]);
    }
  } else {
    patient = await patientService.createPatientFromInput(payload.newPatient, user.id);
    createdNewPatient = true;
  }

  try {
    const appointment = await Appointment.create({
      patientId: patient._id,
      doctorId: doctor._id,
      departmentId: doctor.departmentId,
      date: payload.date,
      startTime: slot.startTime,
      // the end time comes from the slot, not from the client
      endTime: slot.endTime,
      status: APPOINTMENT_STATUS.SCHEDULED,
      purpose: payload.purpose,
      notes: payload.notes,
      // snapshots keep the list page from having to look up the patient and doctor again
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

    emitAppointmentEvent('created', appointment);

    return appointment;
  } catch (error) {
    // if the booking failed, do not leave a brand new patient behind
    if (createdNewPatient) {
      try {
        await Patient.deleteOne({ _id: patient._id });
      } catch (cleanupError) {
        console.error('patient rollback failed:', cleanupError.message);
      }
    }

    // 11000 is the duplicate key error from the index that protects a slot
    if (error.code === 11000) {
      throw AppError.conflict('This slot has just been booked by someone else');
    }

    throw error;
  }
}

async function listAppointments(query, user) {
  const filter = await buildFilter(query, user);
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

  return {
    appointments,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

async function getAppointmentById(appointmentId, user) {
  const appointment = await Appointment.findById(appointmentId).select(APPOINTMENT_FIELDS).lean();

  if (!appointment) {
    throw AppError.notFound('Appointment not found');
  }

  await checkOwnership(appointment, user, 'view');

  return appointment;
}

// Only the desk may change the purpose and the notes of a visit that is still open.
async function updateAppointment(appointmentId, payload, user, ip) {
  const appointment = await getAppointmentDocument(appointmentId);

  if (appointment.status === APPOINTMENT_STATUS.COMPLETED || appointment.status === APPOINTMENT_STATUS.CANCELLED) {
    throw AppError.conflict(`A ${appointment.status} appointment cannot be edited`);
  }

  const changed = {};

  if (payload.purpose !== undefined && payload.purpose !== appointment.purpose) {
    appointment.purpose = payload.purpose;
    changed.purpose = payload.purpose;
  }

  if (payload.notes !== undefined && payload.notes !== appointment.notes) {
    appointment.notes = payload.notes;
    changed.notes = payload.notes;
  }

  // nothing changed, so there is nothing to save or log
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

// Cancelling keeps the row and only changes its status, which frees the slot.
async function cancelAppointment(appointmentId, reason, user, ip) {
  const appointment = await getAppointmentDocument(appointmentId);

  assertTransition(appointment.status, APPOINTMENT_STATUS.CANCELLED);

  // read the old status before we change it, because the audit row needs it
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
  const appointment = await getAppointmentDocument(appointmentId);

  assertTransition(appointment.status, APPOINTMENT_STATUS.ARRIVED);

  // nobody can arrive for tomorrow
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

  // the row moved on, so the board just fetches it again
  emitAppointmentEvent('updated', appointment);

  return appointment;
}

async function completeAppointment(appointmentId, user, ip) {
  const appointment = await getAppointmentDocument(appointmentId);

  await checkOwnership(appointment, user, 'complete');
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

// Every status change goes through here, so no route can make up a move the workflow forbids.
function assertTransition(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from] || [];

  if (!allowed.includes(to)) {
    throw AppError.conflict(`Cannot move an appointment from ${from} to ${to}`);
  }
}

async function buildFilter(query, user) {
  const filter = {};

  if (query.status) {
    filter.status = query.status;
  }

  if (query.departmentId) {
    filter.departmentId = query.departmentId;
  }

  if (query.dateFrom || query.dateTo) {
    // dates are YYYY-MM-DD strings, so comparing them as strings works
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

  // a doctor always sees their own visits, whatever the query says
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

function buildSort(sortBy = APPOINTMENT_SORT_FIELDS[0], sortOrder = 'asc') {
  const direction = sortOrder === 'desc' ? -1 : 1;
  const sort = {};

  sort[sortBy] = direction;

  // a whole day shares a date, so the start time breaks the tie
  if (sortBy === 'date') {
    sort.startTime = direction;
  }

  // and the id makes the order complete, so no row shows up twice on two pages
  sort._id = 1;

  return sort;
}

// A doctor may only view or complete their own visits.
async function checkOwnership(appointment, user, action) {
  if (user.role !== ROLES.DOCTOR) {
    return;
  }

  const own = await doctorService.findOwnDoctorProfile(user.id);
  const isMine = own && own._id.toString() === appointment.doctorId.toString();

  if (!isMine) {
    throw AppError.forbidden(`You can only ${action} your own appointments`);
  }
}

async function getAppointmentDocument(appointmentId) {
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
