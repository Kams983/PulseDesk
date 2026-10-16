import { Link } from 'react-router-dom';
import { CalendarCheck, Stethoscope } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import { weekdayIndex } from '@/utils/dateUtils';

// The desk's counterpart to the doctor's own upcoming card: who is on duty, so a receptionist answering
// the phone knows which department to route a caller to without leaving the board.
//
// On duty means the doctor's own weekly schedule has sessions today. The register is the wrong source for
// that question: a doctor with no clinic on a Sunday is not on duty, they are simply on the register.
function worksOn(doctor, iso) {
  if (!iso) {
    return false;
  }

  const day = (doctor.schedule || []).find((entry) => entry.dayOfWeek === weekdayIndex(iso));

  return Boolean(day && day.sessions.length > 0);
}

export default function DoctorsOnDuty({ doctors = [], today, byDoctor, isLoading, canOpenRegister }) {
  const onDuty = today ? doctors.filter((doctor) => worksOn(doctor, today)) : [];
  const visitsById = new Map((byDoctor || []).map((row) => [row.id, row.counts.total]));

  return (
    <section className="rounded-panel bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">On duty</p>
          <p className="text-xs text-ink-muted">
            {isLoading ? 'Reading the register' : `${onDuty.length} of ${doctors.length} doctors work today`}
          </p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-pill bg-primary-tint text-primary">
          <Stethoscope size={18} aria-hidden="true" />
        </span>
      </div>

      {isLoading ? (
        <ul className="mt-4 space-y-3">
          {[0, 1, 2].map((row) => (
            <li key={row} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-pill" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </li>
          ))}
        </ul>
      ) : onDuty.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          className="mt-4"
          title="Nobody is on duty"
          text="No doctor's weekly schedule covers today. The register still lists everyone."
        />
      ) : (
        <ul className="mt-4 space-y-3">
          {onDuty.map((doctor) => (
            <li key={doctor.id} className="flex items-center gap-3">
              <Avatar name={doctor.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{doctor.name}</p>
                <p className="truncate text-xs text-ink-muted">
                  {doctor.department.name} · {doctor.specialization}
                </p>
              </div>
              {/* the super admin is the only role that gets the per doctor breakdown, so the pill only
                  appears for a caller that actually has one */}
              {byDoctor ? (
                <span className="shrink-0 rounded-pill bg-page px-2 py-1 text-xs font-semibold text-ink">
                  {visitsById.get(doctor.id) ?? 0} today
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {/* the register is a super admin page, so the link is only offered to a role that can open it */}
      {canOpenRegister ? (
        <Link
          to="/doctors"
          className="mt-4 inline-flex text-sm font-semibold text-primary transition hover:text-primary-hover"
        >
          Open the register
        </Link>
      ) : null}
    </section>
  );
}
