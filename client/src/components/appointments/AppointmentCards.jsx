import { memo } from 'react';
import { CheckCircle2, Eye, Pencil, UserCheck, X } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import { formatDate, formatTime } from '@/utils/formatters';
import { availableActions } from '@/utils/appointmentActions';

// The phone build of the same row: a table with nine columns is unusable in a 390px column, so the
// list becomes cards that keep the two facts a desk needs first (who and when) at the top.
export default function AppointmentCards({ appointments, departmentNames, role, today, onRun }) {
  return (
    <ul className="space-y-3">
      {appointments.map((appointment) => (
        <MemoisedCard
          key={appointment.id}
          id={appointment.id}
          date={appointment.date}
          startTime={appointment.startTime}
          patientName={appointment.patient.name}
          patientCode={appointment.patient.patientCode}
          mobile={appointment.patient.mobile}
          doctorName={appointment.doctor.name}
          departmentName={departmentNames.get(appointment.departmentId) || '-'}
          purpose={appointment.purpose}
          status={appointment.status}
          actions={availableActions(appointment, role, today)}
          onRun={onRun}
        />
      ))}
    </ul>
  );
}

// Memoised on primitives plus one stable callback, the same way the table row is, so typing in a filter
// does not redraw every card.
function AppointmentCard({
  id,
  date,
  startTime,
  patientName,
  patientCode,
  mobile,
  doctorName,
  departmentName,
  purpose,
  status,
  actions,
  onRun,
}) {
  return (
    <li className="rounded-card border border-line p-4">
      <div className="flex items-start gap-3">
        <Avatar name={patientName} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{patientName}</p>
          <p className="truncate text-xs text-ink-muted">
            {patientCode} · {mobile}
          </p>
        </div>
        <Badge status={status} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <div>
          <dt className="text-ink-muted">When</dt>
          <dd className="font-medium text-ink">
            {formatDate(date, { day: 'numeric', month: 'short' })} · {formatTime(startTime)}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Doctor</dt>
          <dd className="truncate font-medium text-ink">{doctorName}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Department</dt>
          <dd className="truncate font-medium text-ink">{departmentName}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Purpose</dt>
          <dd className="truncate font-medium text-ink">{purpose || '-'}</dd>
        </div>
      </dl>

      {actions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
          {actions.map((action) => (
            <ActionButton key={action} action={action} id={id} patientName={patientName} onRun={onRun} />
          ))}
        </div>
      ) : null}
    </li>
  );
}

function ActionButton({ action, id, patientName, onRun }) {
  const Icon = ACTION_ICONS[action];

  return (
    <button
      type="button"
      onClick={() => onRun(action, id)}
      aria-label={`${ACTION_LABELS[action]} for ${patientName}`}
      className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-semibold transition ${
        action === 'cancel' ? 'text-danger hover:bg-danger-tint' : 'text-primary hover:bg-primary-tint'
      }`}
    >
      <Icon size={14} aria-hidden="true" />
      {ACTION_LABELS[action]}
    </button>
  );
}

const ACTION_ICONS = {
  view: Eye,
  edit: Pencil,
  arrive: UserCheck,
  complete: CheckCircle2,
  cancel: X,
};

const ACTION_LABELS = {
  view: 'Details',
  edit: 'Edit',
  arrive: 'Arrived',
  complete: 'Complete',
  cancel: 'Cancel',
};

const MemoisedCard = memo(AppointmentCard);
