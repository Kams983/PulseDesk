import { Link } from 'react-router-dom';
import { Stethoscope } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import Skeleton from '@/components/ui/Skeleton';

// The desk's counterpart to the doctor's own upcoming card: who is on duty, so a receptionist answering
// the phone knows which department to route a caller to without leaving the board.
export default function DoctorsOnDuty({ doctors = [], count, isLoading, canOpenRegister }) {
  const shown = doctors.slice(0, 5);

  return (
    <section className="rounded-panel bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">On duty</p>
          <p className="text-xs text-ink-muted">{isLoading ? 'Loading the register' : `${count ?? doctors.length} doctors on the register`}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-pill bg-primary-tint text-primary">
          <Stethoscope size={18} aria-hidden="true" />
        </span>
      </div>

      <ul className="mt-4 space-y-3">
        {isLoading
          ? [0, 1, 2].map((row) => (
              <li key={row} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-pill" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </li>
            ))
          : shown.map((doctor) => (
              <li key={doctor.id} className="flex items-center gap-3">
                <Avatar name={doctor.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{doctor.name}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {doctor.department.name} · {doctor.specialization}
                  </p>
                </div>
              </li>
            ))}
      </ul>

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
