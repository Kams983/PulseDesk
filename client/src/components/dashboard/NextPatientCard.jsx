import { UserRound } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import { APPOINTMENT_STATUS } from '@/utils/constants';
import { formatTime, relativeDay, waitingFor } from '@/utils/formatters';

// What a doctor opens the board for: one patient, with everything needed to call them in. The server
// decides who that is, because "not finished yet" is a question about the clinic clock, and the card
// only has to say which patient and when.
export default function NextPatientCard({ next, today, isLoading, now }) {
  return (
    <Card
      title="My next patient"
      subtitle={isLoading ? 'Reading your diary' : 'Someone waiting comes first, then your earliest booking'}
      action={next ? <Badge status={next.status} /> : null}
    >
      {isLoading ? (
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-pill" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
      ) : !next ? (
        <EmptyState
          icon={UserRound}
          title="Nobody is waiting on you"
          text="Every booking has been seen or cancelled. The next one appears here as soon as it is booked."
        />
      ) : (
        <div className="flex items-start gap-4">
          <Avatar name={next.patient.name} size="lg" />

          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-ink">{next.patient.name}</p>
            <p className="mt-0.5 text-sm text-ink-muted">
              {next.patient.patientCode} · {formatTime(next.startTime)}-{formatTime(next.endTime)} ·{' '}
              {relativeDay(next.date, today)}
            </p>
            <p className="mt-0.5 truncate text-sm text-ink-muted">{next.purpose || 'No purpose recorded'}</p>

            {/* only an arrived patient has a waiting time, and it counts up on the page's minute tick */}
            {next.status === APPOINTMENT_STATUS.ARRIVED ? (
              <p className="mt-2 inline-flex rounded-pill bg-arrived-tint px-2.5 py-1 text-xs font-semibold text-arrived">
                {waitingFor(next.arrivedAt, now)}
              </p>
            ) : null}
          </div>

          <p className="hidden shrink-0 text-sm font-semibold text-ink sm:block">{next.patient.mobile}</p>
        </div>
      )}
    </Card>
  );
}
