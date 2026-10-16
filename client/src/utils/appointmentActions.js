import { APPOINTMENT_STATUS, ROLES } from './constants';

// Every action a row can offer, and the rule for each one. The rules are the server's, restated here so
// a button that would come back a 403 or a 409 is never shown in the first place. A row asks this module
// what it may do rather than comparing roles and statuses itself, which is how a screen and its api
// drift apart.
const ACTIONS = {
  view: { roles: Object.values(ROLES), statuses: Object.values(APPOINTMENT_STATUS) },
  edit: {
    roles: [ROLES.SUPER_ADMIN, ROLES.RECEPTIONIST],
    statuses: [APPOINTMENT_STATUS.SCHEDULED, APPOINTMENT_STATUS.ARRIVED],
  },
  arrive: {
    roles: [ROLES.SUPER_ADMIN, ROLES.RECEPTIONIST],
    statuses: [APPOINTMENT_STATUS.SCHEDULED],
    // nobody can arrive for a day that has not happened, which is what the api answers with a 409
    requiresToday: true,
  },
  complete: {
    roles: [ROLES.SUPER_ADMIN, ROLES.DOCTOR],
    statuses: [APPOINTMENT_STATUS.ARRIVED],
  },
  cancel: {
    roles: [ROLES.SUPER_ADMIN, ROLES.RECEPTIONIST],
    statuses: [APPOINTMENT_STATUS.SCHEDULED, APPOINTMENT_STATUS.ARRIVED],
  },
};

const ACTION_ORDER = ['view', 'edit', 'arrive', 'complete', 'cancel'];

function canRunAction(action, appointment, role, today) {
  const rule = ACTIONS[action];

  if (!rule || !appointment) {
    return false;
  }

  if (!rule.roles.includes(role) || !rule.statuses.includes(appointment.status)) {
    return false;
  }

  // today is the clinic's date from the api, never the browser's clock
  if (rule.requiresToday && today && appointment.date > today) {
    return false;
  }

  return true;
}

export function availableActions(appointment, role, today) {
  return ACTION_ORDER.filter((action) => canRunAction(action, appointment, role, today));
}
