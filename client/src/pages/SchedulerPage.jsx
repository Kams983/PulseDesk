import { useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarX2, RefreshCw, Stethoscope } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorMessage from '@/components/ui/ErrorMessage';
import Skeleton from '@/components/ui/Skeleton';
import SlotGrid from '@/components/scheduler/SlotGrid';
import SchedulerFilters from '@/components/scheduler/SchedulerFilters';
import { listAppointments } from '@/api/appointmentApi';
import { getDashboard } from '@/api/dashboardApi';
import { listDepartments, listDoctors } from '@/api/doctorApi';
import { listSlots } from '@/api/slotApi';
import { useAuth } from '@/context/AuthContext';
import { canBookAppointments } from '@/utils/constants';
import { weekdayIndex } from '@/utils/dateUtils';
import { formatDateLong, pluralize } from '@/utils/formatters';

// One doctor, one day, slot by slot: the board a receptionist books from and a doctor reads.
export default function SchedulerPage() {
  const { user } = useAuth();
  const canBook = canBookAppointments(user.role);

  const [departmentId, setDepartmentId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [pickedDate, setPickedDate] = useState(null);

  // The clinic's date, never the browser's: a page opened before midnight in another timezone would
  // otherwise default to a day the server still considers tomorrow.
  const board = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard });
  const today = board.data?.today;
  const date = pickedDate || today;

  // departments change about once a year, so they are cached for the whole session
  const departments = useQuery({ queryKey: ['departments'], queryFn: listDepartments, staleTime: 30 * 60_000 });
  const doctors = useQuery({
    queryKey: ['doctors', departmentId],
    queryFn: () => listDoctors({ departmentId }),
    enabled: Boolean(today),
  });

  const doctor = useMemo(() => (doctors.data || []).find((item) => item.id === doctorId) || null, [doctors.data, doctorId]);

  // A doctor account only ever gets its own record back, so it is preselected and the board opens on
  // itself. And a doctor the department filter just removed cannot stay selected, or the grid would keep
  // showing someone the filters say is no longer in view.
  useEffect(() => {
    const list = doctors.data || [];

    if (list.some((item) => item.id === doctorId)) {
      return;
    }

    setDoctorId(list.length === 1 ? list[0].id : '');
  }, [doctors.data, doctorId]);

  const slots = useQuery({
    queryKey: ['slots', doctorId, date],
    queryFn: () => listSlots(doctorId, date),
    enabled: Boolean(doctorId && date),
    // the previous day's grid stays on screen while the next one loads, so switching day or doctor does
    // not blink through an empty board
    placeholderData: keepPreviousData,
  });

  // The grid knows a slot is taken, only this knows by whom: the appointment carries the patient
  // snapshot, and a doctor's list is already scoped to their own visits by the server.
  const day = useQuery({
    queryKey: ['appointments', 'day', doctorId, date],
    queryFn: () => listAppointments({ doctorId, dateFrom: date, dateTo: date, limit: 50, sortBy: 'startTime' }),
    enabled: Boolean(doctorId && date),
    placeholderData: keepPreviousData,
  });

  const bookedByStart = useMemo(
    () => new Map((day.data?.appointments || []).map((appointment) => [appointment.startTime, appointment])),
    [day.data]
  );

  // Stable on purpose: SlotButton is memoised, and a handler that was rebuilt every render would make
  // every button in the grid re-render on every keystroke in the booking dialog.
  const handleSelectSlot = useCallback(() => {}, []);

  function refresh() {
    slots.refetch();
    day.refetch();
  }

  if (board.isError) {
    return <ErrorMessage message={board.error.message} onRetry={board.refetch} />;
  }

  const workingDay = doctor && date ? doctor.schedule.some((daySchedule) => daySchedule.dayOfWeek === weekdayIndex(date)) : true;
  const gridSlots = slots.data?.slots || [];
  // a fetch in flight over data already on screen: the grid stays, with a quiet line above it
  const isRefreshing = slots.isFetching && !slots.isPending;

  return (
    <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
      <Card title="Filters" subtitle="Who, and which day">
        {board.isLoading || departments.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <SchedulerFilters
            departments={departments.data || []}
            doctors={doctors.data || []}
            departmentId={departmentId}
            doctorId={doctorId}
            date={date}
            today={today}
            onDepartmentChange={setDepartmentId}
            onDoctorChange={setDoctorId}
            onDateChange={setPickedDate}
          />
        )}
      </Card>

      <Card
        title={doctor ? doctor.name : 'The day board'}
        subtitle={
          doctor
            ? `${doctor.department.name} · ${pluralize(doctor.slotDurationMinutes, 'minute')} slots${
                date ? ` · ${formatDateLong(date)}` : ''
              }`
            : 'Pick a doctor to see their slots'
        }
        action={
          <div className="flex items-center gap-2">
            {isRefreshing ? <span className="text-xs text-ink-muted">Updating…</span> : null}
            <Button size="sm" variant="ghost" onClick={refresh} aria-label="Refresh the board">
              <RefreshCw size={15} aria-hidden="true" />
            </Button>
          </div>
        }
      >
        {!doctorId ? (
          <EmptyState
            icon={Stethoscope}
            title="No doctor selected"
            text="Choose a doctor on the left to load their day. A doctor account opens on its own schedule."
          />
        ) : slots.isError ? (
          <ErrorMessage message={slots.error.message} onRetry={slots.refetch} />
        ) : slots.isPending ? (
          <div className="space-y-6">
            <Skeleton className="h-4 w-64" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 12 }).map((_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          </div>
        ) : !workingDay ? (
          <EmptyState
            icon={CalendarX2}
            title={`${doctor.name} does not work on this day`}
            text={`${formatDateLong(date)} is not in this doctor's weekly schedule. Pick another day in the filters.`}
          />
        ) : gridSlots.length === 0 ? (
          // a working day always generates a grid, so this is the honest answer for the odd schedule that
          // produces no whole slot rather than a claim about the doctor's week
          <EmptyState
            icon={CalendarX2}
            title="No slots on this day"
            text={`${doctor.name} has no slot that fits their ${pluralize(doctor.slotDurationMinutes, 'minute')} sessions on ${formatDateLong(date)}.`}
          />
        ) : (
          <SlotGrid
            slots={gridSlots}
            bookedByStart={bookedByStart}
            canBook={canBook}
            selectedStart={null}
            onSelect={handleSelectSlot}
          />
        )}
      </Card>
    </div>
  );
}
