const appointmentService = require('../services/appointmentService');
const { sendSuccess } = require('../utils/response');

async function createAppointment(req, res) {
  const appointment = await appointmentService.createAppointment(req.body, req.user, req.ip);

  return sendSuccess(res, {
    status: 201,
    message: 'Appointment booked',
    data: { appointment: toAppointmentDto(appointment) },
  });
}

async function listAppointments(req, res) {
  const { appointments, meta } = await appointmentService.listAppointments(req.query, req.user);

  return sendSuccess(res, { data: { appointments: appointments.map(toAppointmentDto) }, meta });
}

async function getAppointment(req, res) {
  const appointment = await appointmentService.getAppointmentById(req.params.id, req.user);

  return sendSuccess(res, { data: { appointment: toAppointmentDto(appointment) } });
}

// the list page renders from the snapshots, so a row here never needs a join to be displayed
function toAppointmentDto(appointment) {
  return {
    id: appointment._id.toString(),
    date: appointment.date,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    status: appointment.status,
    purpose: appointment.purpose,
    notes: appointment.notes,
    departmentId: appointment.departmentId ? appointment.departmentId.toString() : null,
    doctor: {
      id: appointment.doctorId.toString(),
      name: appointment.doctorSnapshot ? appointment.doctorSnapshot.name : undefined,
    },
    patient: {
      id: appointment.patientId.toString(),
      name: appointment.patientSnapshot ? appointment.patientSnapshot.name : undefined,
      patientCode: appointment.patientSnapshot ? appointment.patientSnapshot.patientCode : undefined,
      mobile: appointment.patientSnapshot ? appointment.patientSnapshot.mobile : undefined,
    },
    arrivedAt: appointment.arrivedAt,
    completedAt: appointment.completedAt,
    cancelledAt: appointment.cancelledAt,
    cancelReason: appointment.cancelReason,
    createdAt: appointment.createdAt,
  };
}

module.exports = { createAppointment, getAppointment, listAppointments, toAppointmentDto };
