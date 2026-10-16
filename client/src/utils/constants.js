import {
  CalendarCheck,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  ClipboardList,
  Clock,
  LayoutDashboard,
  Stethoscope,
  UserCheck,
} from 'lucide-react';

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  RECEPTIONIST: 'receptionist',
  DOCTOR: 'doctor',
};

export const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: 'Super admin',
  [ROLES.RECEPTIONIST]: 'Receptionist',
  [ROLES.DOCTOR]: 'Doctor',
};

export const APPOINTMENT_STATUS = {
  SCHEDULED: 'scheduled',
  ARRIVED: 'arrived',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

// The one status to colour mapping. Badges, slot cells, the chart and the legend dots read it, so a
// status can never mean two different colours on two screens. The class names are literal so Tailwind
// keeps them: a class assembled at runtime from a template would be purged away.
export const STATUS_STYLES = {
  [APPOINTMENT_STATUS.SCHEDULED]: { label: 'Scheduled', text: 'text-scheduled', tint: 'bg-scheduled-tint', dot: 'bg-scheduled' },
  [APPOINTMENT_STATUS.ARRIVED]: { label: 'Arrived', text: 'text-arrived', tint: 'bg-arrived-tint', dot: 'bg-arrived' },
  [APPOINTMENT_STATUS.COMPLETED]: { label: 'Completed', text: 'text-completed', tint: 'bg-completed-tint', dot: 'bg-completed' },
  [APPOINTMENT_STATUS.CANCELLED]: { label: 'Cancelled', text: 'text-cancelled', tint: 'bg-cancelled-tint', dot: 'bg-cancelled' },
};

// the stat cards, in the order the board reads them. Each one carries its own icon and tint so the
// card is a single lookup rather than a switch inside the page.
export const STAT_CARDS = [
  { key: 'total', label: 'Today', icon: CalendarCheck, tone: 'bg-primary-tint text-primary' },
  { key: APPOINTMENT_STATUS.SCHEDULED, label: 'Scheduled', icon: Clock, tone: 'bg-scheduled-tint text-scheduled' },
  { key: APPOINTMENT_STATUS.ARRIVED, label: 'Arrived', icon: UserCheck, tone: 'bg-arrived-tint text-arrived' },
  { key: APPOINTMENT_STATUS.COMPLETED, label: 'Completed', icon: CheckCircle2, tone: 'bg-completed-tint text-completed' },
  { key: APPOINTMENT_STATUS.CANCELLED, label: 'Cancelled', icon: CalendarX2, tone: 'bg-cancelled-tint text-cancelled' },
];

// the three states a generated slot can be in. Available is the only one that can be clicked, which is
// why the disabled ones carry their own cursor and softer colour instead of looking merely greyed.
export const SLOT_STATUS = {
  AVAILABLE: 'available',
  BOOKED: 'booked',
  PAST: 'past',
};

export const SLOT_STYLES = {
  [SLOT_STATUS.AVAILABLE]: {
    label: 'Available',
    button: 'border-primary/25 bg-card text-ink hover:border-primary hover:bg-primary-tint',
    dot: 'bg-primary',
  },
  [SLOT_STATUS.BOOKED]: {
    label: 'Booked',
    button: 'border-transparent bg-page text-ink-muted cursor-not-allowed',
    dot: 'bg-scheduled',
  },
  [SLOT_STATUS.PAST]: {
    label: 'Past',
    button: 'border-line bg-card/40 text-ink-muted/50 cursor-not-allowed',
    dot: 'bg-line',
  },
};

export const TREND_SERIES = [
  { key: 'total', label: 'All appointments', color: '#4B4FB5' },
  { key: 'completed', label: 'Completed', color: '#1F7A4C' },
];

// the rail, in order. A role that is not listed never sees the item, and the route guard agrees.
export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: Object.values(ROLES) },
  { to: '/scheduler', label: 'Scheduler', icon: CalendarDays, roles: Object.values(ROLES) },
  { to: '/appointments', label: 'Appointments', icon: ClipboardList, roles: Object.values(ROLES) },
  { to: '/doctors', label: 'Doctors', icon: Stethoscope, roles: [ROLES.SUPER_ADMIN] },
];

export function navItemsFor(role) {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

// Booking is a front desk action: a doctor opens their own board to read it, so every booking affordance
// asks this one question rather than each component comparing roles itself.
export function canBookAppointments(role) {
  return role === ROLES.SUPER_ADMIN || role === ROLES.RECEPTIONIST;
}
