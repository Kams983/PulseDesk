const { APPOINTMENT_STATUS } = require('../config/constants');
const Appointment = require('../models/appointment.model');
const Doctor = require('../models/doctor.model');
const Patient = require('../models/patient.model');
const AppError = require('../utils/AppError');
const { isPastDate, isPastSlot } = require('../utils/time');
const { emitAppointmentChange } = require('../sockets/realtime');
const { logAction } = require('./auditService');
const patientService = require('./patientService');
const { getSlotsForDoctorDate } = require('./slotService');

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

module.exports = { createAppointment };
