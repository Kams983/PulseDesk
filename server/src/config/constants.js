const ROLES = {
  SUPER_ADMIN: 'super_admin',
  RECEPTIONIST: 'receptionist',
  DOCTOR: 'doctor',
};

const APPOINTMENT_STATUS = {
  SCHEDULED: 'scheduled',
  ARRIVED: 'arrived',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

// these are the statuses that still hold a slot, and the same list goes into the partial unique index
const ACTIVE_STATUSES = [
  APPOINTMENT_STATUS.SCHEDULED,
  APPOINTMENT_STATUS.ARRIVED,
  APPOINTMENT_STATUS.COMPLETED,
];

// the only place that decides whether a status change is allowed, so no route can invent its own rules
const ALLOWED_TRANSITIONS = {
  [APPOINTMENT_STATUS.SCHEDULED]: [APPOINTMENT_STATUS.ARRIVED, APPOINTMENT_STATUS.CANCELLED],
  [APPOINTMENT_STATUS.ARRIVED]: [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED],
  [APPOINTMENT_STATUS.COMPLETED]: [],
  [APPOINTMENT_STATUS.CANCELLED]: [],
};

module.exports = { ROLES, APPOINTMENT_STATUS, ACTIVE_STATUSES, ALLOWED_TRANSITIONS };
