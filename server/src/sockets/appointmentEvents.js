const { STAFF_ROOM, doctorDateRoom, doctorSelfRoom, getIo } = require('./index');

// The three things a board reacts to. Arriving and completing are updates, not their own type: the
// appointment is the same row and only its state moved, which is exactly what a refetch will show.
const EVENT_TYPES = ['created', 'updated', 'cancelled'];

// Announcing a change is a convenience for the people already looking at the board, never a reason
// for the write itself to fail, so every failure here is logged and swallowed.
function emitAppointmentEvent(type, appointment) {
  try {
    const io = getIo();

    if (!io || !EVENT_TYPES.includes(type)) {
      return;
    }

    const payload = {
      id: String(appointment._id),
      doctorId: String(appointment.doctorId),
      date: appointment.date,
      startTime: appointment.startTime,
      status: appointment.status,
    };

    // The payload is deliberately thin: the client refetches the row through the api it already
    // trusts. Pushing whole appointments would put patient snapshots on a second channel with its own
    // authorization rules, and the copy on screen could disagree with what a fresh read returns.
    io.to(doctorDateRoom(payload.doctorId, payload.date))
      .to(doctorSelfRoom(payload.doctorId))
      .to(STAFF_ROOM)
      .emit(`appointment:${type}`, payload);
  } catch (err) {
    console.error('socket emit failed:', err.message);
  }
}

module.exports = { EVENT_TYPES, emitAppointmentEvent };
