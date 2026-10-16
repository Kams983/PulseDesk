import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Plus, Stethoscope, UserPlus } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorMessage from '@/components/ui/ErrorMessage';
import Skeleton from '@/components/ui/Skeleton';
import AddDoctorModal from '@/components/doctors/AddDoctorModal';
import AddReceptionistModal from '@/components/doctors/AddReceptionistModal';
import ScheduleEditorModal from '@/components/doctors/ScheduleEditorModal';
import { listDepartments, listDoctors } from '@/api/doctorApi';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { pluralize } from '@/utils/formatters';
import { scheduleSummary } from '@/utils/schedule';

// The register: who works here, in which department, and when. Only a super admin reaches this route,
// which the router already enforces, so the page itself does not re-check the role.
export default function DoctorsPage() {
  useDocumentTitle('Doctors');

  const [modal, setModal] = useState(null);

  const doctors = useQuery({ queryKey: ['doctors', ''], queryFn: () => listDoctors() });
  const departments = useQuery({ queryKey: ['departments'], queryFn: listDepartments, staleTime: 30 * 60_000 });

  const departmentNames = useMemo(() => new Map((departments.data || []).map((d) => [d.id, d.name])), [departments.data]);

  // stable, so the memoised rows below are not redrawn when the page re-renders for any other reason
  const openSchedule = useCallback((doctor) => setModal({ kind: 'schedule', doctor }), []);
  const close = useCallback(() => setModal(null), []);

  if (doctors.isError) {
    return <ErrorMessage message={doctors.error.message} onRetry={doctors.refetch} />;
  }

  return (
    <div className="space-y-5">
      <Card
        title="Doctors"
        subtitle="The register and the weekly schedules"
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setModal({ kind: 'receptionist' })}>
              <UserPlus size={15} aria-hidden="true" />
              Add receptionist
            </Button>
            <Button size="sm" onClick={() => setModal({ kind: 'doctor' })} disabled={departments.isLoading}>
              <Plus size={15} aria-hidden="true" />
              Add doctor
            </Button>
          </div>
        }
      >
        {doctors.isPending ? (
          <div className="space-y-3">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-16 w-full" />
            ))}
          </div>
        ) : doctors.data.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title="No doctors yet"
            text="Add the first doctor, then set the days and hours they work so the scheduler has slots to offer."
            action={
              <Button size="sm" onClick={() => setModal({ kind: 'doctor' })} disabled={departments.isLoading}>
                <Plus size={15} aria-hidden="true" />
                Add doctor
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {doctors.data.map((doctor) => (
              <li key={doctor.id} className="flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0">
                <Avatar name={doctor.name} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{doctor.name}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {departmentNames.get(doctor.department.id) || doctor.department.name}
                    {doctor.specialization ? ` · ${doctor.specialization}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* the slot length is a fact about the doctor, not an appointment status, so it is a
                      plain chip rather than a Badge: nothing here should look like a visit state */}
                  <span className="rounded-pill bg-page px-2.5 py-1 text-xs font-semibold text-ink-muted">
                    {pluralize(doctor.slotDurationMinutes, 'minute')} slots
                  </span>
                  <span className="text-xs text-ink-muted">{scheduleSummary(doctor)}</span>
                  <Button size="sm" variant="secondary" onClick={() => openSchedule(doctor)}>
                    <CalendarClock size={15} aria-hidden="true" />
                    Edit schedule
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {modal?.kind === 'doctor' ? (
        <AddDoctorModal departments={departments.data || []} onClose={close} onCreated={close} />
      ) : null}

      {modal?.kind === 'receptionist' ? <AddReceptionistModal onClose={close} onCreated={close} /> : null}

      {modal?.kind === 'schedule' ? (
        // the doctor is re-read from the list on every render of the modal, so a saved schedule is what
        // the editor opens with the next time it is opened rather than the copy it was launched from
        <ScheduleEditorModal
          doctor={(doctors.data || []).find((d) => d.id === modal.doctor.id) || modal.doctor}
          onClose={close}
          onSaved={close}
        />
      ) : null}
    </div>
  );
}
