import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarX2, RefreshCw, Stethoscope } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorMessage from '@/components/ui/ErrorMessage';
import Skeleton from '@/components/ui/Skeleton';
import BookingModal from '@/components/scheduler/BookingModal';
import LiveIndicator from '@/components/scheduler/LiveIndicator';
import SlotGrid from '@/components/scheduler/SlotGrid';
import SchedulerFilters from '@/components/scheduler/SchedulerFilters';
import { listAppointments } from '@/api/appointmentApi';
import { getDashboard } from '@/api/dashboardApi';
import { listDepartments, listDoctors } from '@/api/doctorApi';
import { listSlots } from '@/api/slotApi';
import { useAuth } from '@/context/AuthContext';
import { useRealtime } from '@/context/SocketContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { canBookAppointments } from '@/utils/constants';
import { weekdayIndex } from '@/utils/dateUtils';
import { formatDateLong, pluralize } from '@/utils/formatters';

const REALTIME_EVENTS = ['appointment:created', 'appointment:updated', 'appointment:cancelled'];

// One doctor, one day, slot by slot: the board the desk books from and a doctor reads.
export default function SchedulerPage() {
  useDocumentTitle('Scheduler');

  const { user } = useAuth();
  const { socket, status: liveStatus } = useRealtime();
  const queryClient = useQueryClient();
  const canBook = canBookAppointments(user.role);

  const [departmentId, setDepartmentId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [pickedDate, setPickedDate] = useState(null);
  const [selectedStart, setSelectedStart] = useState(null);

  // the date comes from the clinic, not from the browser
  const board = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard });
  const today = board.data?.today;
  const date = pickedDate || today;

  // departments hardly ever change, so they are cached for a while
  const departments = useQuery({ queryKey: ['departments'], queryFn: listDepartments, staleTime: 30 * 60_000 });
  const doctors = useQuery({
    queryKey: ['doctors', departmentId],
    queryFn: () => listDoctors({ departmentId }),
    enabled: Boolean(today),
  });

  const doctor = (doctors.data || []).find((item) => item.id === doctorId) || null;

  // A doctor account only gets its own record back, so it is picked automatically. If the chosen
  // doctor is no longer in the list, the choice is cleared.
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
    // keep the old grid on screen while the new day loads
    placeholderData: keepPreviousData,
  });

  // the grid knows a slot is taken, this tells us who took it
  const day = useQuery({
    queryKey: ['appointments', 'day', doctorId, date],
    queryFn: () => listAppointments({ doctorId, dateFrom: date, dateTo: date, limit: 50, sortBy: 'startTime' }),
    enabled: Boolean(doctorId && date),
    placeholderData: keepPreviousData,
  });

  const bookedByStart = new Map(
    (day.data?.appointments || []).map((appointment) => [appointment.startTime, appointment])
  );

  // Watch this doctor on this day, and leave the room when either changes.
  useEffect(() => {
    if (!socket || !doctorId || !date) {
      return undefined;
    }

    function join() {
      socket.emit('scheduler:join', { doctorId, date });
    }

    join();
    socket.on('connect', join);

    return () => {
      socket.off('connect', join);
      socket.emit('scheduler:leave', { doctorId, date });
    };
  }, [socket, doctorId, date]);

  // a change only refreshes the boards that show this doctor and this day
  useEffect(() => {
    if (!socket) {
      return undefined;
    }

    function onAppointmentEvent(payload) {
      if (payload.doctorId !== doctorId || payload.date !== date) {
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['slots', doctorId, date] });
      queryClient.invalidateQueries({ queryKey: ['appointments', 'day', doctorId, date] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }

    REALTIME_EVENTS.forEach((event) => socket.on(event, onAppointmentEvent));

    return () => REALTIME_EVENTS.forEach((event) => socket.off(event, onAppointmentEvent));
  }, [socket, doctorId, date, queryClient]);

  function refresh() {
    slots.refetch();
    day.refetch();
  }

  function afterBooking() {
    setSelectedStart(null);
    queryClient.invalidateQueries({ queryKey: ['slots', doctorId, date] });
    queryClient.invalidateQueries({ queryKey: ['appointments', 'day', doctorId, date] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }

  if (board.isError) {
    return <ErrorMessage message={board.error.message} onRetry={board.refetch} />;
  }

  let worksToday = true;

  if (doctor && date) {
    worksToday = doctor.schedule.some((daySchedule) => daySchedule.dayOfWeek === weekdayIndex(date));
  }

  const gridSlots = slots.data?.slots || [];
  const selectedSlot = selectedStart ? gridSlots.find((slot) => slot.startTime === selectedStart) : null;
  const isRefreshing = slots.isFetching && !slots.isPending;

  return (
    <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
      <Card title="Filters" subtitle="Who, and which day">
        {board.isLoading || departments.isLoading ? (
          <FiltersSkeleton />
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
        subtitle={getBoardSubtitle(doctor, date)}
        action={
          <div className="flex items-center gap-2">
            {isRefreshing ? <span className="text-xs text-ink-muted">Updating…</span> : null}
            <LiveIndicator status={liveStatus} />
            <Button size="sm" variant="ghost" onClick={refresh} aria-label="Refresh the board">
              <RefreshCw size={15} aria-hidden="true" />
            </Button>
          </div>
        }
      >
        <BoardBody
          doctor={doctor}
          doctorId={doctorId}
          date={date}
          slots={slots}
          gridSlots={gridSlots}
          bookedByStart={bookedByStart}
          canBook={canBook}
          worksToday={worksToday}
          selectedStart={selectedStart}
          onSelect={setSelectedStart}
        />
      </Card>

      {selectedSlot && doctor ? (
        <BookingModal
          doctor={doctor}
          date={date}
          slot={selectedSlot}
          onClose={() => setSelectedStart(null)}
          onBooked={afterBooking}
        />
      ) : null}
    </div>
  );
}

function getBoardSubtitle(doctor, date) {
  if (!doctor) {
    return 'Pick a doctor to see their slots';
  }

  const parts = [doctor.department.name, `${pluralize(doctor.slotDurationMinutes, 'minute')} slots`];

  if (date) {
    parts.push(formatDateLong(date));
  }

  return parts.join(' · ');
}

// The board can show a few different things, so each case returns its own piece of screen.
function BoardBody({ doctor, doctorId, date, slots, gridSlots, bookedByStart, canBook, worksToday, selectedStart, onSelect }) {
  if (!doctorId) {
    return (
      <EmptyState
        icon={Stethoscope}
        title="No doctor selected"
        text="Choose a doctor on the left to load their day. A doctor account opens on its own schedule."
      />
    );
  }

  if (slots.isError) {
    return <ErrorMessage message={slots.error.message} onRetry={slots.refetch} />;
  }

  if (slots.isPending) {
    return <BoardSkeleton />;
  }

  if (!worksToday) {
    return (
      <EmptyState
        icon={CalendarX2}
        title={`${doctor.name} does not work on this day`}
        text={`${formatDateLong(date)} is not in this doctor's weekly schedule. Pick another day in the filters.`}
      />
    );
  }

  if (gridSlots.length === 0) {
    // the doctor works today, but their hours are too short for one whole slot
    return (
      <EmptyState
        icon={CalendarX2}
        title="No slots on this day"
        text={`${doctor.name} has no slot that fits their ${pluralize(doctor.slotDurationMinutes, 'minute')} sessions on ${formatDateLong(date)}.`}
      />
    );
  }

  return (
    <SlotGrid
      slots={gridSlots}
      bookedByStart={bookedByStart}
      canBook={canBook}
      selectedStart={selectedStart}
      onSelect={onSelect}
    />
  );
}

function FiltersSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-64" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
