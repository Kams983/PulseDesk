import { Clock } from 'lucide-react';
import Skeleton from '@/components/ui/Skeleton';
import { APPOINTMENT_STATUS, STAT_CARDS, STATUS_STYLES } from '@/utils/constants';

// A doctor's dashboard has an upcoming block the desk does not: cancelled visits are already dropped by
// the server, because a cancelled appointment is not something still coming.
const UPCOMING_ROWS = STAT_CARDS.filter((card) => card.key !== 'total' && card.key !== APPOINTMENT_STATUS.CANCELLED);

export default function UpcomingCard({ counts, isLoading }) {
  return (
    <section className="rounded-panel bg-primary p-5 text-white shadow-card">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-pill bg-white/15">
          <Clock size={18} aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold">Still ahead</p>
          <p className="text-xs text-white/70">Everything from today onwards</p>
        </div>
      </div>

      <div className="mt-5">
        {isLoading ? (
          <Skeleton className="h-10 w-20 bg-white/20" />
        ) : (
          <p className="text-4xl font-bold">{counts?.total ?? 0}</p>
        )}
        <p className="text-xs text-white/70">visits booked</p>
      </div>

      <ul className="mt-5 space-y-2">
        {UPCOMING_ROWS.map(({ key, label }) => (
          <li key={key} className="flex items-center gap-2 text-sm">
            <span className={`h-2 w-2 rounded-pill ${STATUS_STYLES[key].dot}`} aria-hidden="true" />
            <span className="flex-1 text-white/80">{label}</span>
            <span className="font-semibold">{isLoading ? '-' : (counts?.[key] ?? 0)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
