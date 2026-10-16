const { STAFF_ROOM, doctorDateRoom, doctorSelfRoom, getIo } = require('./index');

// the three things a board reacts to. Arriving and completing are updates: the appointment is the same
// row and only its state moved, which is what a refetch will show.
const EVENT_TYPES = ['created', 'updated', 'cancelled'];

// Announcing a change keeps the people already looking at the board up to date, and is never a reason
// for the write itself to fail, so a failure here is logged and swallowed.
function emitAppointmentEvent(type, appointment) {
  try {
    const io = getIo();

    if (!io || !EVENT_TYPES.includes(type)) {
      return;
    }

    // The payload carries those five fields and nothing else: the client refetches the row through the
    // api it already trusts, so no patient data travels on a second channel and the copy on screen
    // cannot disagree with a fresh read.
    const payload = {
      id: String(appointment._id),
      doctorId: String(appointment.doctorId),
      date: appointment.date,
      startTime: appointment.startTime,
      status: appointment.status,
    };

    io.to(doctorDateRoom(payload.doctorId, payload.date))
      .to(doctorSelfRoom(payload.doctorId))
      .to(STAFF_ROOM)
      .emit(`appointment:${type}`, payload);
  } catch (error) {
    console.error('socket emit failed:', error.message);
  }
}

module.exports = { emitAppointmentEvent };
