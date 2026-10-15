const http = require('http');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { io: ioClient } = require('socket.io-client');
const app = require('../src/app');
const env = require('../src/config/env');
const { initSocket } = require('../src/sockets');
const { ROLES } = require('../src/config/constants');
const Department = require('../src/models/department.model');
const Doctor = require('../src/models/doctor.model');
const User = require('../src/models/user.model');
const { hashPassword } = require('../src/services/authService');
const { nowInClinicTz } = require('../src/utils/time');

const API = '/api/v1';
const PASSWORD = 'Password123!';
const WAIT = 8000;
// a booking landing in the room must be seen; nothing arriving takes one short window to prove
const SILENCE_MS = 400;

let server;
let io;
let port;
const openSockets = [];
// every booking registers a new patient, so each one needs a mobile of its own
let bookingCount = 0;

// a weekday that is still ahead, computed per run so the test can never go stale
function nextWeekday() {
  let day = nowInClinicTz().plus({ days: 1 });

  while (day.weekday > 5) {
    day = day.plus({ days: 1 });
  }

  return day.toISODate();
}

// the doctors work every day, so the test has a grid whatever weekday the run lands on
function everyDaySchedule() {
  return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    sessions: [{ start: '09:00', end: '12:00' }],
    breaks: [],
  }));
}

function once(socket, event, timeoutMs = WAIT) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

// resolves with null when nothing arrived inside the window, which is the honest result of "no event"
function silence(socket, event, windowMs = SILENCE_MS) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(event);
      resolve(null);
    }, windowMs);

    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

// the server answers a join with an ack, so a client knows whether it is actually being listened to
function ask(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} was never acknowledged`)), WAIT);
    socket.emit(event, payload, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

function connect(token) {
  const socket = ioClient(`http://127.0.0.1:${port}`, {
    auth: { token },
    // no reconnection, so a refused handshake stays refused instead of retrying on a loop
    reconnection: false,
    transports: ['websocket'],
  });

  openSockets.push(socket);

  return socket;
}

async function connected(token) {
  const socket = connect(token);
  await once(socket, 'connect');

  return socket;
}

const roomSockets = (room) => Array.from(io.sockets.adapter.rooms.get(room) || []);

async function arrange() {
  const department = await Department.create({ name: 'General Medicine', code: 'GEN' });
  const doctors = [];

  for (const name of ['Dr. Ifeanyi Okafor', 'Dr. Bello Adeyemi']) {
    const email = `${name.split(' ')[1].toLowerCase()}@emr.test`;
    const user = await User.create({
      name,
      email,
      passwordHash: await hashPassword(PASSWORD),
      role: ROLES.DOCTOR,
    });
    const doctor = await Doctor.create({
      userId: user._id,
      departmentId: department._id,
      name,
      nameLower: name.toLowerCase(),
      slotDurationMinutes: 15,
      schedule: everyDaySchedule(),
    });

    doctors.push({ user, doctor });
  }

  await User.create({
    name: 'Front Desk',
    email: 'reception@emr.test',
    passwordHash: await hashPassword(PASSWORD),
    role: ROLES.RECEPTIONIST,
  });

  return { doctors };
}

async function loginAs(email) {
  const res = await request(app).post(`${API}/auth/login`).send({ email, password: PASSWORD });

  expect(res.status).toBe(200);

  return res.body.data.accessToken;
}

function book(doctorId, date, startTime, token) {
  bookingCount += 1;

  return request(app)
    .post(`${API}/appointments`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      doctorId,
      date,
      startTime,
      newPatient: { name: `Walk In ${bookingCount}`, mobile: `0804${String(bookingCount).padStart(7, '0')}` },
      purpose: 'Walk in',
    });
}

beforeAll(async () => {
  server = http.createServer(app);
  io = initSocket(server);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  port = server.address().port;
});

afterAll(async () => {
  await new Promise((resolve) => io.close(resolve));
});

afterEach(() => {
  bookingCount = 0;

  // a socket left open would still be attached when the next test wipes the database
  while (openSockets.length > 0) {
    openSockets.pop().close();
  }
});

describe('socket handshake', () => {
  it('refuses a missing, malformed and expired token', async () => {
    const { doctors } = await arrange();

    const cases = [
      [undefined, 'Access token missing'],
      ['not-a-real-token', 'Access token is invalid or expired'],
      [
        jwt.sign({ sub: doctors[0].user._id.toString() }, env.jwtAccessSecret, { expiresIn: '-1s' }),
        'Access token is invalid or expired',
      ],
    ];

    for (const [token, message] of cases) {
      const socket = connect(token);
      // eslint-disable-next-line no-await-in-loop
      const error = await once(socket, 'connect_error');

      expect(error.message).toBe(message);
      expect(socket.connected).toBe(false);
    }
  });

  it('accepts a valid access token', async () => {
    await arrange();
    const token = await loginAs('reception@emr.test');
    const socket = await connected(token);

    expect(socket.connected).toBe(true);
    // the desk watches every doctor, so this room is joined without asking
    expect(roomSockets('staff')).toContain(socket.id);
  });
});

describe('appointment events', () => {
  it('delivers appointment:created to the doctor and date room a client joined, and stops after leave', async () => {
    const { doctors } = await arrange();
    const token = await loginAs('reception@emr.test');
    const date = nextWeekday();
    const doctorId = doctors[0].doctor._id.toString();
    const room = `doctor:${doctorId}:${date}`;
    const socket = await connected(token);

    expect(await ask(socket, 'scheduler:join', { doctorId, date })).toEqual({ ok: true, room });
    expect(roomSockets(room)).toContain(socket.id);

    const created = once(socket, 'appointment:created');
    const res = await book(doctorId, date, '09:00', token);

    expect(res.status).toBe(201);
    expect(res.body.data.appointment.startTime).toBe('09:00');

    // exactly the five fields the board needs to refetch, and nothing about the patient
    expect(await created).toEqual({
      id: res.body.data.appointment.id,
      doctorId,
      date,
      startTime: '09:00',
      status: 'scheduled',
    });

    expect(await ask(socket, 'scheduler:leave', { doctorId, date })).toEqual({ ok: true });
    expect(roomSockets(room)).not.toContain(socket.id);

    // the room is gone, so the next booking for that doctor does not reach this socket
    const booked = await book(doctorId, date, '09:15', token);
    expect(booked.status).toBe(201);
    expect(await silence(socket, 'appointment:created')).toBeNull();
  });

  it('keeps a doctor out of another doctor and sends them their own events', async () => {
    const { doctors } = await arrange();
    const receptionToken = await loginAs('reception@emr.test');
    const doctorToken = await loginAs('ifeanyi@emr.test');
    const date = nextWeekday();
    const ownId = doctors[0].doctor._id.toString();
    const otherId = doctors[1].doctor._id.toString();
    const socket = await connected(doctorToken);

    // a doctor is in their own board from the moment they connect, without a join
    expect(roomSockets(`doctor-self:${ownId}`)).toContain(socket.id);
    expect(roomSockets('staff')).not.toContain(socket.id);

    const ownEvent = once(socket, 'appointment:created');
    await book(ownId, date, '09:00', receptionToken);

    expect((await ownEvent).doctorId).toBe(ownId);

    // asking for someone else is refused, and no room is joined
    expect(await ask(socket, 'scheduler:join', { doctorId: otherId, date })).toEqual({
      ok: false,
      error: 'You can only watch your own schedule',
    });
    expect(roomSockets(`doctor:${otherId}:${date}`)).not.toContain(socket.id);

    const otherEvent = await book(otherId, date, '09:00', receptionToken);
    expect(otherEvent.status).toBe(201);
    expect(await silence(socket, 'appointment:created')).toBeNull();

    // a malformed scope is refused the same way, so a typo cannot silently open a board
    expect(await ask(socket, 'scheduler:join', { doctorId: otherId, date: 'tomorrow' })).toEqual({
      ok: false,
      error: 'Expected a doctorId and a YYYY-MM-DD date',
    });
  });
});
