import { CalendarX2 } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import ErrorMessage from '@/components/ui/ErrorMessage';
import Skeleton from '@/components/ui/Skeleton';
import { formatTime } from '@/utils/formatters';

// The list under the calendar. It is deliberately not paged: a day holds what a day holds, and the
// links out to the full list stay in the header rather than repeating the filters here.
export default function DayList({ appointments = [], isLoading, error, onRetry, emptyTitle, emptyText }) {
  if (error) {
    return <ErrorMessage message={error.message} onRetry={onRetry} />;
  }

  if (isLoading) {
    return (
      <ul className="space-y-3">
        {[0, 1, 2].map((row) => (
          <li key={row} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-pill" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (appointments.length === 0) {
    return <EmptyState icon={CalendarX2} title={emptyTitle} text={emptyText} />;
  }

  return (
    <ul className="divide-y divide-line">
      {appointments.map((appointment) => (
        <li key={appointment.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <Avatar name={appointment.patient.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{appointment.patient.name}</p>
            <p className="truncate text-xs text-ink-muted">
              {appointment.purpose || 'No purpose recorded'} · {formatTime(appointment.startTime)}-
              {formatTime(appointment.endTime)}
            </p>
          </div>
          <Badge status={appointment.status} />
        </li>
      ))}
    </ul>
  );
}
