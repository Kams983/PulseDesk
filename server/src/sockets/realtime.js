// Realtime is phase 4, but the appointment service already has to announce what it changed. Keeping
// the call site here means adding socket.io later touches this file and no service.
let io = null;

// phase 4 passes the socket.io server in once, at boot
function attachRealtime(server) {
  io = server;
}

// rooms follow the screens that care: the doctor's own board and the clinic wide queue
function emitAppointmentChange(action, appointment) {
  if (!io) {
    return;
  }

  const payload = {
    action,
    appointmentId: appointment._id.toString(),
    doctorId: appointment.doctorId.toString(),
    date: appointment.date,
    startTime: appointment.startTime,
    status: appointment.status,
  };

  io.to('clinic').emit('appointment:changed', payload);
  io.to(`doctor:${payload.doctorId}`).emit('appointment:changed', payload);
}

module.exports = { attachRealtime, emitAppointmentChange };
