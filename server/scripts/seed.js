const mongoose = require('mongoose');
const connectDb = require('../src/config/db');
const { ROLES, APPOINTMENT_STATUS } = require('../src/config/constants');
const { hashPassword } = require('../src/services/authService');
const models = require('../src/models');
const patientService = require('../src/services/patientService');
const { nowInClinicTz, timeToMinutes, minutesToTime } = require('../src/utils/time');

const { User, RefreshToken, Department, Doctor, Patient, Appointment, AuditLog } = models;

const DEMO_PASSWORD = 'Password123!';

// every doctor gets the same weekday shape, only the slot length differs so the booking logic is
// visibly exercised with 15, 20 and 30 minute grids
function weekdaySchedule() {
  return [1, 2, 3, 4, 5].map((dayOfWeek) => ({
    dayOfWeek,
    sessions: [
      { name: 'Morning', start: '09:00', end: '12:00' },
      { name: 'Evening', start: '13:00', end: '17:00' },
    ],
    breaks: [{ name: 'Lunch', start: '12:00', end: '13:00' }],
  }));
}

const DEPARTMENTS = [
  { name: 'General Medicine', code: 'GEN' },
  { name: 'Pediatrics', code: 'PED' },
  { name: 'Cardiology', code: 'CAR' },
];

const USERS = [
  { name: 'Dr. Ifeanyi Okafor', email: 'dr.okafor@emr.test', role: ROLES.DOCTOR, department: 'GEN', specialization: 'Consultant Physician', slotDurationMinutes: 15 },
  { name: 'Dr. Amina Bello', email: 'dr.bello@emr.test', role: ROLES.DOCTOR, department: 'PED', specialization: 'Paediatrician', slotDurationMinutes: 20 },
  { name: 'Dr. Tunde Adeyemi', email: 'dr.adeyemi@emr.test', role: ROLES.DOCTOR, department: 'CAR', specialization: 'Cardiologist', slotDurationMinutes: 30 },
  { name: 'System Administrator', email: 'admin@emr.test', role: ROLES.SUPER_ADMIN },
  { name: 'Front Desk', email: 'reception@emr.test', role: ROLES.RECEPTIONIST },
];

const PATIENTS = [
  { name: 'Chiamaka Nwosu', gender: 'female', dateOfBirth: '1991-04-18', mobile: '08031234567' },
  { name: 'Emeka Obi', gender: 'male', dateOfBirth: '1985-11-02', mobile: '08059876543' },
  { name: 'Fatima Yusuf', gender: 'female', dateOfBirth: '1998-06-27', mobile: '08144556677' },
  { name: 'Oluwaseun Adeleke', gender: 'male', dateOfBirth: '1979-01-09', mobile: '07033445566' },
  { name: 'Ngozi Eze', gender: 'female', dateOfBirth: '2002-09-15', mobile: '09022334455' },
];

// the days behind today that the dashboard trend reads, one week back
const HISTORY_DAYS = [1, 2, 3, 4, 5, 6, 7];

// The dashboard is a board for the clinic's today plus a line for the week behind it, and both would be
// empty with only the booking demo in place. So today gets one visit in each live state, and the week
// gets a rising number of completed ones, thinning out as it goes back.
async function createHistory(doctors, patients, createdBy) {
  const now = nowInClinicTz();
  const rows = [
    { offset: 0, doctor: doctors[0], patient: patients[0], startTime: '09:00', status: APPOINTMENT_STATUS.COMPLETED, purpose: 'Blood pressure review' },
    { offset: 0, doctor: doctors[1], patient: patients[1], startTime: '09:00', status: APPOINTMENT_STATUS.ARRIVED, purpose: 'Immunization review' },
    { offset: 0, doctor: doctors[2], patient: patients[2], startTime: '13:00', status: APPOINTMENT_STATUS.SCHEDULED, purpose: 'Cardiology consult' },
  ];

  // per doctor per day, so two visits never land on the same start time
  const used = new Map();

  for (const offset of HISTORY_DAYS) {
    const day = now.minus({ days: offset });

    // the clinic does not open at the weekend, and a zero there is exactly what the chart should show
    if (day.weekday > 5) {
      continue;
    }

    const visits = Math.max(1, 6 - offset);

    for (let index = 0; index < visits; index += 1) {
      const doctor = doctors[index % doctors.length];
      const key = `${doctor._id.toString()}:${day.toISODate()}`;
      const slot = used.get(key) || 0;

      used.set(key, slot + 1);

      rows.push({
        offset,
        doctor,
        patient: patients[(index + offset) % patients.length],
        // the first visit of the day starts the morning session, the next ones step by slot length
        startTime: minutesToTime(timeToMinutes('09:00') + slot * doctor.slotDurationMinutes),
        // one cancellation in the week, so the cancelled state exists somewhere in the demo data
        status: offset === 4 && index === 0 ? APPOINTMENT_STATUS.CANCELLED : APPOINTMENT_STATUS.COMPLETED,
        purpose: 'Completed consultation',
      });
    }
  }

  const nowDate = new Date();
  const documents = rows.map((row) => ({
    patientId: row.patient._id,
    doctorId: row.doctor._id,
    departmentId: row.doctor.departmentId,
    date: now.minus({ days: row.offset }).toISODate(),
    startTime: row.startTime,
    endTime: minutesToTime(timeToMinutes(row.startTime) + row.doctor.slotDurationMinutes),
    status: row.status,
    purpose: row.purpose,
    createdBy,
    ...snapshot(row.doctor, row.patient),
    ...(row.status === APPOINTMENT_STATUS.SCHEDULED ? {} : { arrivedAt: nowDate }),
    ...(row.status === APPOINTMENT_STATUS.COMPLETED ? { completedAt: nowDate } : {}),
  }));

  return Appointment.insertMany(documents);
}

// tomorrow, pushed to Monday when tomorrow falls on a weekend, so a reviewer always sees slots
function demoDate() {
  const tomorrow = nowInClinicTz().plus({ days: 1 });
  const weekday = tomorrow.weekday;

  if (weekday === 6) {
    return tomorrow.plus({ days: 2 }).toISODate();
  }

  if (weekday === 7) {
    return tomorrow.plus({ days: 1 }).toISODate();
  }

  return tomorrow.toISODate();
}

async function wipe() {
  await Promise.all([
    User.deleteMany({}),
    RefreshToken.deleteMany({}),
    Department.deleteMany({}),
    Doctor.deleteMany({}),
    Patient.deleteMany({}),
    Appointment.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);

  // dropping the counter restarts patient codes at PT-000001, so a reseed looks like a fresh install
  await mongoose.connection.collection('counters').deleteMany({});
}

async function createUsers() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const users = await User.insertMany(USERS.map(({ name, email, role }) => ({ name, email, role, passwordHash })));
  const byEmail = new Map(users.map((user) => [user.email, user]));

  return USERS.map((spec) => ({ spec, user: byEmail.get(spec.email) }));
}

async function createDepartments() {
  const departments = await Department.insertMany(DEPARTMENTS);

  return new Map(departments.map((department) => [department.code, department]));
}

async function createDoctors(userSpecs, departments) {
  const doctorSpecs = userSpecs.filter(({ spec }) => spec.role === ROLES.DOCTOR);
  const doctors = await Doctor.insertMany(
    doctorSpecs.map(({ spec, user }) => ({
      userId: user._id,
      departmentId: departments.get(spec.department)._id,
      name: spec.name,
      nameLower: spec.name.toLowerCase(),
      specialization: spec.specialization,
      slotDurationMinutes: spec.slotDurationMinutes,
      schedule: weekdaySchedule(),
    }))
  );

  return { doctors, doctorSpecs };
}

async function createPatients(createdBy) {
  const patients = [];

  for (const spec of PATIENTS) {
    // one at a time on purpose, each needs its own sequential code
    patients.push(
      await Patient.create({
        ...spec,
        nameLower: spec.name.toLowerCase(),
        // the same generator the booking route uses, so the seed and the api cannot drift
        patientCode: await patientService.nextPatientCode(),
        createdBy,
      })
    );
  }

  return patients;
}

function snapshot(doctor, patient) {
  return {
    doctorSnapshot: { name: doctor.name, nameLower: doctor.nameLower },
    patientSnapshot: {
      name: patient.name,
      nameLower: patient.nameLower,
      mobile: patient.mobile,
      patientCode: patient.patientCode,
    },
  };
}

async function createAppointments(doctors, patients, createdBy, date) {
  const byName = new Map(doctors.map((doctor) => [doctor.nameLower, doctor]));
  const [chiamaka, emeka, fatima, oluwaseun, ngozi] = patients;

  // start times respect each doctor's slot length, and the mix of statuses gives the list page
  // something to show in every state
  const specs = [
    { doctor: 'dr. ifeanyi okafor', patient: chiamaka, startTime: '09:00', status: APPOINTMENT_STATUS.SCHEDULED, purpose: 'Follow up consultation' },
    { doctor: 'dr. ifeanyi okafor', patient: emeka, startTime: '09:15', status: APPOINTMENT_STATUS.ARRIVED, purpose: 'Malaria review' },
    { doctor: 'dr. ifeanyi okafor', patient: fatima, startTime: '10:30', status: APPOINTMENT_STATUS.SCHEDULED, purpose: 'Routine check up' },
    { doctor: 'dr. amina bello', patient: oluwaseun, startTime: '09:00', status: APPOINTMENT_STATUS.SCHEDULED, purpose: 'Child immunization' },
    { doctor: 'dr. amina bello', patient: ngozi, startTime: '09:40', status: APPOINTMENT_STATUS.SCHEDULED, purpose: 'Persistent cough' },
    { doctor: 'dr. tunde adeyemi', patient: chiamaka, startTime: '13:00', status: APPOINTMENT_STATUS.SCHEDULED, purpose: 'Blood pressure review' },
    { doctor: 'dr. tunde adeyemi', patient: oluwaseun, startTime: '14:00', status: APPOINTMENT_STATUS.COMPLETED, purpose: 'ECG result' },
  ];

  const now = new Date();
  const documents = specs.map((spec) => {
    const doctor = byName.get(spec.doctor);
    const endTime = minutesToTime(timeToMinutes(spec.startTime) + doctor.slotDurationMinutes);

    return {
      patientId: spec.patient._id,
      doctorId: doctor._id,
      departmentId: doctor.departmentId,
      date,
      startTime: spec.startTime,
      endTime,
      status: spec.status,
      purpose: spec.purpose,
      createdBy,
      ...snapshot(doctor, spec.patient),
      ...(spec.status === APPOINTMENT_STATUS.ARRIVED ? { arrivedAt: now } : {}),
      ...(spec.status === APPOINTMENT_STATUS.COMPLETED ? { arrivedAt: now, completedAt: now } : {}),
    };
  });

  return Appointment.insertMany(documents);
}

function printCredentials(date, counts) {
  console.log('\nDemo accounts (password for all of them: %s)\n', DEMO_PASSWORD);
  console.log('  super_admin   admin@emr.test');
  console.log('  receptionist  reception@emr.test');
  console.log('  doctor        dr.okafor@emr.test');
  console.log('  doctor        dr.bello@emr.test');
  console.log('  doctor        dr.adeyemi@emr.test');
  console.log('\nCreated %d departments, %d doctors, %d patients and %d appointments:', counts.departments, counts.doctors, counts.patients, counts.appointments);
  console.log('  seven on the next working day (%s) and the rest across today and the week behind it, so the', date);
  console.log('  dashboard trend and the day board both have data.\n');
}

async function seed() {
  await connectDb();

  console.log('seed: wiping demo collections');
  await wipe();

  const userSpecs = await createUsers();
  const departments = await createDepartments();
  const { doctors, doctorSpecs } = await createDoctors(userSpecs, departments);
  const receptionist = userSpecs.find(({ spec }) => spec.role === ROLES.RECEPTIONIST).user;

  const patients = await createPatients(receptionist._id);
  const date = demoDate();
  const appointments = await createAppointments(doctors, patients, receptionist._id, date);
  const history = await createHistory(doctors, patients, receptionist._id);

  printCredentials(date, {
    departments: departments.size,
    doctors: doctorSpecs.length,
    patients: patients.length,
    appointments: appointments.length + history.length,
  });

  await mongoose.disconnect();
}

seed().catch(async (err) => {
  console.error('seed failed:', err.message);
  await mongoose.disconnect();
  process.exit(1);
});
