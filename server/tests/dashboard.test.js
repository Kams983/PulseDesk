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

// the trend only groups by date, doctor and status, so a row needs nothing else to be counted
async function place(doctor, patient, date, startTime, status) {
  return Appointment.create({
    patientId: patient._id,
    doctorId: doctor._id,
    departmentId: doctor.departmentId,
    date,
    startTime,
    endTime: '09:15',
    status,
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
