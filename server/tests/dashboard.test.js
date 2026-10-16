const request = require('supertest');
const app = require('../src/app');
const { APPOINTMENT_STATUS, ROLES } = require('../src/config/constants');
const Appointment = require('../src/models/appointment.model');
const Department = require('../src/models/department.model');
const Doctor = require('../src/models/doctor.model');
const Patient = require('../src/models/patient.model');
const User = require('../src/models/user.model');
const { hashPassword } = require('../src/services/authService');
const { nowInClinicTz } = require('../src/utils/time');

const API = '/api/v1';
const PASSWORD = 'Password123!';

// seeded away from the counter's range, otherwise the first generated patient code would collide
async function arrange() {
  const department = await Department.create({ name: 'General Medicine', code: 'GEN' });
  const doctors = [];

  for (const name of ['Dr. Ifeanyi Okafor', 'Dr. Amina Bello']) {
    const email = name.includes('Okafor') ? 'okafor@emr.test' : 'bello@emr.test';
    const user = await User.create({
      name,
      email,
      passwordHash: await hashPassword(PASSWORD),
      role: ROLES.DOCTOR,
    });

    doctors.push(
      await Doctor.create({
        userId: user._id,
        departmentId: department._id,
        name,
        nameLower: name.toLowerCase(),
        slotDurationMinutes: 15,
        schedule: [],
      })
    );
  }

  await User.create({
    name: 'Front Desk',
    email: 'reception@emr.test',
    passwordHash: await hashPassword(PASSWORD),
    role: ROLES.RECEPTIONIST,
  });

  await User.create({
    name: 'Folake Adeniran',
    email: 'admin@emr.test',
    passwordHash: await hashPassword(PASSWORD),
    role: ROLES.SUPER_ADMIN,
  });

  const patient = await Patient.create({
    patientCode: 'PT-000900',
    name: 'Ada Nwosu',
    nameLower: 'ada nwosu',
    mobile: '08030000001',
  });

  return { doctors, patient };
}

async function login(email) {
  const res = await request(app).post(`${API}/auth/login`).send({ email, password: PASSWORD });

  expect(res.status).toBe(200);

  return res.body.data.accessToken;
}

// the trend only groups by date, doctor and status, and the snapshots are what the next patient card
// reads, so a row carries the same copies the booking service writes. The end time is settable because
// the next patient rule asks whether a slot has already finished.
async function place(doctor, patient, date, startTime, status, endTime = '09:15') {
  return Appointment.create({
    patientId: patient._id,
    doctorId: doctor._id,
    departmentId: doctor.departmentId,
    date,
    startTime,
    endTime,
    status,
    patientSnapshot: {
      name: patient.name,
      nameLower: patient.nameLower,
      mobile: patient.mobile,
      patientCode: patient.patientCode,
    },
    doctorSnapshot: { name: doctor.name, nameLower: doctor.nameLower },
  });
}

const get = (path, token) => request(app).get(`${API}${path}`).set('Authorization', `Bearer ${token}`);

describe('dashboard', () => {
  it('reports the clinic date and the counts behind it', async () => {
    const { doctors, patient } = await arrange();
    const today = nowInClinicTz().toISODate();
    const token = await login('reception@emr.test');

    await place(doctors[0], patient, today, '09:00', APPOINTMENT_STATUS.SCHEDULED);
    await place(doctors[0], patient, today, '09:15', APPOINTMENT_STATUS.ARRIVED);
    await place(doctors[1], patient, today, '09:00', APPOINTMENT_STATUS.COMPLETED);

    const res = await get('/dashboard', token);

    expect(res.status).toBe(200);
    // the client trusts this string instead of the browser clock
    expect(res.body.data.today).toBe(today);
    expect(res.body.data.scope).toBe('clinic');
    expect(res.body.data.counts.today).toEqual({
      total: 3,
      scheduled: 1,
      arrived: 1,
      completed: 1,
      cancelled: 0,
    });
  });

  it('fills the days with no appointments and covers the whole window', async () => {
    const { doctors, patient } = await arrange();
    const clinicNow = nowInClinicTz();
    const today = clinicNow.toISODate();
    const threeDaysAgo = clinicNow.minus({ days: 3 }).toISODate();
    const token = await login('reception@emr.test');

    await place(doctors[0], patient, today, '09:00', APPOINTMENT_STATUS.SCHEDULED);
    await place(doctors[0], patient, today, '09:15', APPOINTMENT_STATUS.ARRIVED);
    await place(doctors[1], patient, today, '09:00', APPOINTMENT_STATUS.COMPLETED);
    await place(doctors[0], patient, threeDaysAgo, '09:00', APPOINTMENT_STATUS.COMPLETED);

    const res = await get('/dashboard/trend?days=5', token);

    expect(res.status).toBe(200);
    expect(res.body.data.today).toBe(today);
    expect(res.body.data.days).toBe(5);
    expect(res.body.data.trend).toHaveLength(5);
    // oldest first, ending today, one entry per calendar day in between
    expect(res.body.data.trend.map((entry) => entry.date)).toEqual(
      [4, 3, 2, 1, 0].map((offset) => clinicNow.minus({ days: offset }).toISODate())
    );
    expect(res.body.data.trend[0]).toEqual({
      date: clinicNow.minus({ days: 4 }).toISODate(),
      total: 0,
      scheduled: 0,
      arrived: 0,
      completed: 0,
      cancelled: 0,
    });
    expect(res.body.data.trend[1]).toMatchObject({ date: threeDaysAgo, total: 1, completed: 1 });
    expect(res.body.data.trend[2].total).toBe(0);
    expect(res.body.data.trend[4]).toMatchObject({ date: today, total: 3, scheduled: 1, arrived: 1, completed: 1 });
  });

  it('scopes the trend and the board to a doctor', async () => {
    const { doctors, patient } = await arrange();
    const today = nowInClinicTz().toISODate();
    const token = await login('okafor@emr.test');

    await place(doctors[0], patient, today, '09:00', APPOINTMENT_STATUS.SCHEDULED);
    await place(doctors[0], patient, today, '09:15', APPOINTMENT_STATUS.ARRIVED);
    await place(doctors[1], patient, today, '09:00', APPOINTMENT_STATUS.COMPLETED);

    const trend = await get('/dashboard/trend', token);
    const dashboard = await get('/dashboard', token);

    expect(trend.status).toBe(200);
    expect(trend.body.data.scope).toBe('own');
    // the default window is seven days
    expect(trend.body.data.trend).toHaveLength(7);
    // doctor B's completion is not in doctor A's series
    expect(trend.body.data.trend[6]).toMatchObject({ date: today, total: 2, scheduled: 1, arrived: 1, completed: 0 });

    expect(dashboard.body.data.scope).toBe('own');
    expect(dashboard.body.data.counts.today.total).toBe(2);
    expect(dashboard.body.data.counts.upcoming.total).toBe(0);
  });

  it('adds one line per doctor to the super admin board, and only there', async () => {
    const { doctors, patient } = await arrange();
    const today = nowInClinicTz().toISODate();
    const adminToken = await login('admin@emr.test');
    const deskToken = await login('reception@emr.test');

    await place(doctors[0], patient, today, '09:00', APPOINTMENT_STATUS.SCHEDULED);
    await place(doctors[0], patient, today, '09:15', APPOINTMENT_STATUS.COMPLETED);
    await place(doctors[1], patient, today, '09:00', APPOINTMENT_STATUS.ARRIVED);

    const admin = await get('/dashboard', adminToken);
    const desk = await get('/dashboard', deskToken);

    expect(admin.status).toBe(200);
    expect(admin.body.data.doctors).toBe(2);
    // every doctor is listed, sorted the way the register is, so a free doctor reads as a zero
    expect(admin.body.data.byDoctor.map((row) => row.name)).toEqual(['Dr. Amina Bello', 'Dr. Ifeanyi Okafor']);
    expect(admin.body.data.byDoctor[0].counts).toEqual({ total: 1, scheduled: 0, arrived: 1, completed: 0, cancelled: 0 });
    expect(admin.body.data.byDoctor[1].counts).toEqual({ total: 2, scheduled: 1, arrived: 0, completed: 1, cancelled: 0 });

    // the desk board is the same board, without the register broken down
    expect(desk.body.data).not.toHaveProperty('byDoctor');
    expect(desk.body.data.counts.today.total).toBe(3);
  });

  it('points a doctor at the patient they should see next', async () => {
    const { doctors, patient } = await arrange();
    const clinicNow = nowInClinicTz();
    const today = clinicNow.toISODate();
    const token = await login('okafor@emr.test');
    const later = clinicNow.plus({ hours: 3 }).toFormat('HH:mm');
    const laterEnd = clinicNow.plus({ hours: 3, minutes: 15 }).toFormat('HH:mm');
    const lastSlot = clinicNow.plus({ hours: 4 }).toFormat('HH:mm');
    const lastSlotEnd = clinicNow.plus({ hours: 4, minutes: 15 }).toFormat('HH:mm');

    await place(doctors[0], patient, today, '00:01', APPOINTMENT_STATUS.COMPLETED, '00:16');
    await place(doctors[0], patient, today, later, APPOINTMENT_STATUS.SCHEDULED, laterEnd);
    // another doctor's arrived patient is not this doctor's next patient
    await place(doctors[1], patient, today, '00:01', APPOINTMENT_STATUS.ARRIVED, '00:16');

    const board = await get('/dashboard', token);

    expect(board.status).toBe(200);
    expect(board.body.data.next).toMatchObject({
      date: today,
      startTime: later,
      status: APPOINTMENT_STATUS.SCHEDULED,
      patient: { name: 'Ada Nwosu', patientCode: 'PT-000900' },
    });

    // somebody already waiting jumps the queue, even though their slot is the later one
    await place(doctors[0], patient, today, lastSlot, APPOINTMENT_STATUS.ARRIVED, lastSlotEnd);

    const arrived = await get('/dashboard', token);

    expect(arrived.body.data.next.status).toBe(APPOINTMENT_STATUS.ARRIVED);
  });

  it('reports one number per day of the month for the mini calendar', async () => {
    const { doctors, patient } = await arrange();
    const clinicNow = nowInClinicTz();
    const month = clinicNow.toFormat('yyyy-MM');
    const first = clinicNow.startOf('month').toISODate();
    const token = await login('reception@emr.test');

    await place(doctors[0], patient, first, '09:00', APPOINTMENT_STATUS.COMPLETED);
    await place(doctors[0], patient, first, '09:15', APPOINTMENT_STATUS.COMPLETED);
    await place(doctors[1], patient, first, '09:30', APPOINTMENT_STATUS.ARRIVED);

    const res = await get(`/dashboard/calendar?month=${month}`, token);

    expect(res.status).toBe(200);
    expect(res.body.data.scope).toBe('clinic');
    expect(res.body.data.month).toBe(month);
    // every day of the month comes back, so a quiet day is a zero rather than a gap
    expect(res.body.data.days).toHaveLength(clinicNow.daysInMonth);
    expect(res.body.data.days[0]).toEqual({ date: first, total: 3 });
    expect(res.body.data.days[1].total).toBe(0);

    const scoped = await get(`/dashboard/calendar?month=${month}`, await login('okafor@emr.test'));

    expect(scoped.body.data.scope).toBe('own');
    expect(scoped.body.data.days[0].total).toBe(2);
  });

  it('falls back to the current month and refuses a month that does not exist', async () => {
    await arrange();
    const token = await login('reception@emr.test');
    const month = nowInClinicTz().toFormat('yyyy-MM');

    const empty = await get('/dashboard/calendar?month=', token);
    const missing = await get('/dashboard/calendar', token);
    const thirteenthMonth = await get('/dashboard/calendar?month=2026-13', token);
    const notAMonth = await get('/dashboard/calendar?month=October', token);

    expect(empty.status).toBe(200);
    expect(empty.body.data.month).toBe(month);
    expect(missing.status).toBe(200);
    expect(missing.body.data.month).toBe(month);
    expect(thirteenthMonth.status).toBe(400);
    expect(thirteenthMonth.body.meta.details[0].field).toBe('month');
    expect(notAMonth.status).toBe(400);
  });

  it('rejects a window outside one to thirty one days', async () => {
    await arrange();
    const token = await login('reception@emr.test');

    const zero = await get('/dashboard/trend?days=0', token);
    const tooLong = await get('/dashboard/trend?days=99', token);
    const notANumber = await get('/dashboard/trend?days=week', token);
    const empty = await get('/dashboard/trend?days=', token);

    expect(zero.status).toBe(400);
    expect(zero.body.meta.details[0].field).toBe('days');
    expect(tooLong.status).toBe(400);
    expect(notANumber.status).toBe(400);
    // a filter widget sending its empty state means the default, not an invalid value
    expect(empty.status).toBe(200);
    expect(empty.body.data.days).toBe(7);
  });
});
