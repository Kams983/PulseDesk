const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const env = require('../config/env');
const { ROLES } = require('../config/constants');
const User = require('../models/user.model');
const { calendarDate, objectId } = require('../validators/common');
const doctorService = require('../services/doctorService');

// Room names are built here and nowhere else, so the side that joins a room and the side that
// broadcasts into it cannot drift apart over a string.
const STAFF_ROOM = 'staff';
const doctorSelfRoom = (doctorId) => `doctor-self:${doctorId}`;
const doctorDateRoom = (doctorId, date) => `doctor:${doctorId}:${date}`;

// the two things a client may ask for: the board it wants to watch, and that is it
const schedulerScopeSchema = z.object({
  doctorId: objectId('Expected a doctor id'),
  date: calendarDate(),
});

let io = null;

// called once at boot, after the http server exists, so socket.io shares the port and the middleware
// stack of the api instead of opening a second one
function initSocket(httpServer) {
  io = new Server(httpServer, {
    // the browser client is on another origin in development, so it needs the same allowance as the api
    cors: { origin: env.clientOrigin, credentials: true },
  });

  io.use(authenticateHandshake);
  io.on('connection', handleConnection);

  return io;
}

// null until initSocket runs, which is what lets a test import the app without starting a server
function getIo() {
  return io;
}

// The same access token the api uses, so a socket cannot outlive the session it was opened with, and
// a deactivated account loses its live board at the same moment it loses its requests.
async function authenticateHandshake(socket, next) {
  const token = socket.handshake.auth ? socket.handshake.auth.token : undefined;

  if (!token) {
    return next(new Error('Access token missing'));
  }

  let payload;

  try {
    payload = jwt.verify(token, env.jwtAccessSecret);
  } catch (err) {
    // the client only needs to know the connection was refused, never which part of the token failed
    return next(new Error('Access token is invalid or expired'));
  }

  const user = await User.findById(payload.sub).lean();

  if (!user || !user.isActive) {
    return next(new Error('Account is no longer active'));
  }

  socket.user = { id: user._id.toString(), role: user.role, name: user.name };

  // Appointments and rooms are keyed by the doctor profile id, never by the user id. Resolving it
  // here rather than on connect means the rooms below are joined before the client sees a connect,
  // so no event can slip through the gap between connecting and being watchable.
  if (user.role === ROLES.DOCTOR) {
    const own = await doctorService.findOwnDoctorProfile(user._id);
    socket.data.doctorId = own ? own._id.toString() : null;
  }

  return next();
}

function handleConnection(socket) {
  // Rooms that stay open for the whole session: the desk watches every doctor, a doctor watches
  // their own day. The list page is live from the moment it connects, without asking for anything.
  if (socket.user.role === ROLES.DOCTOR) {
    // a doctor account without a profile can watch nothing, which is the same answer the api gives
    if (socket.data.doctorId) {
      socket.join(doctorSelfRoom(socket.data.doctorId));
    }
  } else {
    socket.join(STAFF_ROOM);
  }

  socket.on('scheduler:join', (payload, ack) => joinScope(socket, payload, ack));
  socket.on('scheduler:leave', (payload, ack) => leaveScope(socket, payload, ack));
}

// A client joins one doctor and one date, which is exactly what the board on screen is showing.
function joinScope(socket, payload, ack) {
  const scope = parseScope(socket, payload);

  if (!scope.ok) {
    return respond(ack, { ok: false, error: scope.error });
  }

  const { doctorId, date } = scope.value;

  socket.join(doctorDateRoom(doctorId, date));

  return respond(ack, { ok: true, room: doctorDateRoom(doctorId, date) });
}

function leaveScope(socket, payload, ack) {
  const scope = parseScope(socket, payload);

  if (!scope.ok) {
    return respond(ack, { ok: false, error: scope.error });
  }

  const { doctorId, date } = scope.value;

  // leaving a room the socket never joined is harmless, so a stale page can always clean up
  socket.leave(doctorDateRoom(doctorId, date));

  return respond(ack, { ok: true });
}

// The scope is validated here rather than derived from the connection, so a receptionist can watch
// any doctor and a doctor may only watch themselves.
function parseScope(socket, payload) {
  const parsed = schedulerScopeSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, error: 'Expected a doctorId and a YYYY-MM-DD date' };
  }

  if (socket.user.role === ROLES.DOCTOR && parsed.data.doctorId !== socket.data.doctorId) {
    return { ok: false, error: 'You can only watch your own schedule' };
  }

  return { ok: true, value: parsed.data };
}

// the ack is optional, so a plain emit without a callback still joins or leaves the room
function respond(ack, result) {
  if (typeof ack === 'function') {
    ack(result);
  }
}

module.exports = { STAFF_ROOM, doctorDateRoom, doctorSelfRoom, getIo, initSocket };
