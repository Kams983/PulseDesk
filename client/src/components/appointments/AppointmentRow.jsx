import { memo } from 'react';
import { CheckCircle2, Eye, Pencil, UserCheck, X } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import { formatDate, formatTime } from '@/utils/formatters';

// Memoised, and deliberately given primitives plus one stable callback rather than the appointment
// object and the page's whole state. The list re-renders on every keystroke in the filter boxes and on
// every page of results, and with these props React.memo skips the twenty rows that did not change,
// which is what keeps a table this wide responsive while a search is being typed.
function AppointmentRow({ id, date, startTime, endTime, patientName, patientCode, mobile, doctorName, departmentName, purpose, status, actions, onRun }) {
  return (
    <tr className="border-b border-line last:border-0 hover:bg-page/60">
      <td className="whitespace-nowrap px-3 py-3 text-sm text-ink">
        {formatDate(date, { day: 'numeric', month: 'short', year: 'numeric' })}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm font-medium text-ink">
        {formatTime(startTime)}
        <span className="text-ink-muted">-{formatTime(endTime)}</span>
      </td>
      <td className="px-3 py-3">
        <p className="text-sm font-medium text-ink">{patientName}</p>
        <p className="text-xs text-ink-muted">{patientCode}</p>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-ink-muted">{mobile}</td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-ink">{doctorName}</td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-ink-muted">{departmentName}</td>
      <td className="max-w-[14rem] px-3 py-3 text-sm text-ink-muted">
        <span className="line-clamp-2">{purpose || '-'}</span>
      </td>
      <td className="px-3 py-3">
        <Badge status={status} />
      </td>
      <td className="px-3 py-3">
        {/* The actions column is built from the action list the page computed for this role and status.
            A button that would come back 403 or 409 simply is not here, which is why nothing in this row
            asks who the user is. */}
        <div className="flex items-center justify-end gap-0.5">
          {actions.map((action) => {
            const Icon = ACTION_ICONS[action];

            return (
              <button
                key={action}
                type="button"
                title={ACTION_LABELS[action]}
                aria-label={`${ACTION_LABELS[action]} for ${patientName}`}
                onClick={() => onRun(action, id)}
                className={`rounded-pill p-1.5 transition hover:bg-page ${action === 'cancel' ? 'text-danger' : 'text-ink-muted hover:text-primary'}`}
              >
                <Icon size={16} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </td>
    </tr>
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
  view: 'View details',
  edit: 'Edit purpose and notes',
  arrive: 'Mark arrived',
  complete: 'Complete',
  cancel: 'Cancel',
};

export default memo(AppointmentRow);
