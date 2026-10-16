import { memo } from 'react';
import { CheckCircle2, Eye, Pencil, UserCheck, X } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import { formatDate, formatTime } from '@/utils/formatters';
import { availableActions } from '@/utils/appointmentActions';

// The phone build of the same row: a table with nine columns is unusable in a 390px column, so the list
// becomes cards that keep the two facts a desk needs first (who and when) at the top.
function AppointmentCards({ appointments, departmentNames, role, today, onRun }) {
  return (
    <ul className="space-y-3">
      {appointments.map((appointment) => {
        const actions = availableActions(appointment, role, today);

        return (
          <li key={appointment.id} className="rounded-card border border-line p-4">
            <div className="flex items-start gap-3">
              <Avatar name={appointment.patient.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{appointment.patient.name}</p>
                <p className="truncate text-xs text-ink-muted">
                  {appointment.patient.patientCode} · {appointment.patient.mobile}
                </p>
              </div>
              <Badge status={appointment.status} />
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <dt className="text-ink-muted">When</dt>
                <dd className="font-medium text-ink">
                  {formatDate(appointment.date, { day: 'numeric', month: 'short' })} · {formatTime(appointment.startTime)}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Doctor</dt>
                <dd className="truncate font-medium text-ink">{appointment.doctor.name}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Department</dt>
                <dd className="truncate font-medium text-ink">{departmentNames.get(appointment.departmentId) || '-'}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Purpose</dt>
                <dd className="truncate font-medium text-ink">{appointment.purpose || '-'}</dd>
              </div>
            </dl>

            {actions.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                {actions.map((action) => {
                  const Icon = ACTION_ICONS[action];

                  return (
                    <button
                      key={action}
                      type="button"
                      onClick={() => onRun(action, appointment.id)}
                      className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-semibold transition ${
                        action === 'cancel'
                          ? 'text-danger hover:bg-danger-tint'
                          : 'text-primary hover:bg-primary-tint'
                      }`}
                    >
                      <Icon size={14} aria-hidden="true" />
                      {ACTION_LABELS[action]}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
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

export default memo(AppointmentCards);
