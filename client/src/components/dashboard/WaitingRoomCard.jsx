import { UserCheck } from 'lucide-react';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorMessage from '@/components/ui/ErrorMessage';
import Skeleton from '@/components/ui/Skeleton';
import Avatar from '@/components/ui/Avatar';
import { formatStampTime, formatTime, waitingFor } from '@/utils/formatters';

// The front desk's live card: everyone who has been marked arrived and has not been completed yet. The
// server owns the arrival stamp, and the minutes are recomputed from the page's minute tick, so the row
// counts up while the desk is looking at it without asking the api again.
export default function WaitingRoomCard({ appointments = [], isLoading, error, onRetry, now }) {
  return (
    <Card
      title="Waiting room"
      subtitle={
        isLoading
          ? 'Reading the arrivals'
          : appointments.length === 0
            ? 'Nobody is waiting'
            : `${appointments.length} patient${appointments.length === 1 ? '' : 's'} waiting to be seen`
      }
    >
      {error ? (
        <ErrorMessage message={error.message} onRetry={onRetry} />
      ) : isLoading ? (
        <ul className="space-y-3">
          {[0, 1].map((row) => (
            <li key={row} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-pill" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-40" />
              </div>
            </li>
          ))}
        </ul>
      ) : appointments.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title="No arrivals yet"
          text="Mark a patient as arrived from the day list and they appear here with the time they have been waiting."
        />
      ) : (
        <ul className="divide-y divide-line">
          {appointments.map((appointment) => (
            <li key={appointment.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <Avatar name={appointment.patient.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{appointment.patient.name}</p>
                <p className="truncate text-xs text-ink-muted">
                  {appointment.patient.patientCode} · seen at {formatTime(appointment.startTime)}
                  {appointment.arrivedAt ? ` · arrived ${formatStampTime(appointment.arrivedAt)}` : ''}
                </p>
              </div>
              <span className="shrink-0 whitespace-nowrap rounded-pill bg-arrived-tint px-2.5 py-1 text-xs font-semibold text-arrived">
                {waitingFor(appointment.arrivedAt, now)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
