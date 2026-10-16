const { ROLES } = require('../config/constants');
const Appointment = require('../models/appointment.model');
const Patient = require('../models/patient.model');
const AppError = require('../utils/AppError');
const { anchoredPrefix, escapeRegExp } = require('../utils/regex');
const nextSequence = require('../utils/sequence');
const doctorService = require('./doctorService');

// the fields a patient screen needs, never the whole document
const PATIENT_FIELDS = 'patientCode name mobile gender dateOfBirth createdAt';
// a search box is for finding someone at the desk, not for browsing the register
const SEARCH_LIMIT = 10;

// one counter shared by the seed and every registration path, so a code can never be handed out twice
async function nextPatientCode() {
  const value = await nextSequence('patient');

  return `PT-${String(value).padStart(6, '0')}`;
}

async function searchPatients(q) {
  return Patient.find(buildSearchFilter(q)).select(PATIENT_FIELDS).sort({ patientCode: 1 }).limit(SEARCH_LIMIT).lean();
}

// one box accepts a code, a phone number or a name, so the shape of what was typed decides the search
function buildSearchFilter(q) {
  const term = String(q || '').trim();

  if (/^pt-/i.test(term)) {
    return { patientCode: term.toUpperCase() };
  }

  if (/^\+?\d+$/.test(term)) {
    // a mobile search is a prefix match, because the caller reads the number off a phone
    return { mobile: new RegExp(`^${escapeRegExp(term)}`) };
  }

  // anchored so the nameLower index can be used, and escaped so a typed dot or bracket stays a
  // character instead of becoming part of a pattern
  return { nameLower: anchoredPrefix(term.toLowerCase()) };
}

async function getPatientById(patientId, requester) {
  const patient = await Patient.findById(patientId).select(PATIENT_FIELDS).lean();

  if (!patient) {
    throw AppError.notFound('Patient not found');
  }

  if (requester.role === ROLES.DOCTOR) {
    await assertDoctorHasSeenPatient(requester, patientId);
  }

  return patient;
}

// a doctor may only open a patient they have seen, which keeps the register private without a
// permission table of its own
async function assertDoctorHasSeenPatient(requester, patientId) {
  const own = await doctorService.findOwnDoctorProfile(requester.id);

  if (!own) {
    throw AppError.forbidden('No doctor profile is linked to this account');
  }

  const hasSeen = await Appointment.exists({ patientId, doctorId: own._id });

  if (!hasSeen) {
    throw AppError.forbidden('You can only view patients you have appointments with');
  }
}

// registers a patient from the booking form, where only a name and a mobile number are known yet
async function createPatientFromInput(input, createdBy) {
  const mobile = input.mobile.trim();
  const existing = await Patient.findOne({ mobile }).select(PATIENT_FIELDS).lean();

  if (existing) {
    throw duplicateMobile(existing);
  }

  return createPatient({ input, mobile, createdBy });
}

async function createPatient({ input, mobile, createdBy }) {
  try {
    return await Patient.create({
      patientCode: await nextPatientCode(),
      name: input.name,
      nameLower: input.name.toLowerCase(),
      mobile,
      gender: input.gender,
      dateOfBirth: input.dateOfBirth,
      createdBy,
    });
  } catch (error) {
    // the check above is there for a friendly message, the unique index is the real guard
    if (error.code !== 11000) {
      throw error;
    }

    const winner = await Patient.findOne({ mobile }).select(PATIENT_FIELDS).lean();

    if (!winner) {
      throw error;
    }

    throw duplicateMobile(winner);
  }
}

// the existing patient travels in the error so the desk can offer "use this patient" instead of
// silently merging two people with one phone number
function duplicateMobile(existing) {
  return AppError.conflict('A patient with this mobile number already exists', [
    {
      field: 'mobile',
      message: 'A patient with this mobile number already exists',
      existingPatient: {
        id: existing._id.toString(),
        patientCode: existing.patientCode,
        name: existing.name,
        mobile: existing.mobile,
      },
    },
  ]);
}

module.exports = {
  SEARCH_LIMIT,
  createPatientFromInput,
  getPatientById,
  nextPatientCode,
  searchPatients,
};
