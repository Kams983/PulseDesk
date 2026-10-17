import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import ErrorMessage from '@/components/ui/ErrorMessage';
import MiniCalendar from '@/components/ui/MiniCalendar';
import Select from '@/components/ui/Select';
import Skeleton from '@/components/ui/Skeleton';
import Spinner from '@/components/ui/Spinner';
import StatCard from '@/components/ui/StatCard';
import DayList from '@/components/dashboard/DayList';
import DoctorsOnDuty from '@/components/dashboard/DoctorsOnDuty';
import NextPatientCard from '@/components/dashboard/NextPatientCard';
import TrendChart from '@/components/dashboard/TrendChart';
import UpcomingCard from '@/components/dashboard/UpcomingCard';
import WaitingRoomCard from '@/components/dashboard/WaitingRoomCard';
import { getCalendar, getDashboard, getTrend } from '@/api/dashboardApi';
import { listAppointments } from '@/api/appointmentApi';
import { listDoctors } from '@/api/doctorApi';
import { useAuth } from '@/context/AuthContext';
import { useRealtime } from '@/context/SocketContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useMinuteTick } from '@/hooks/useMinuteTick';
import { APPOINTMENT_STATUS, ROLES, STAT_CARDS } from '@/utils/constants';
import { formatDate, formatDateLong, greetingFor, greetingName, pluralize } from '@/utils/formatters';

const TREND_RANGES = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
];

// the same events the appointments page listens to
const REALTIME_EVENTS = ['appointment:created', 'appointment:updated', 'appointment:cancelled'];
// how many visits of the selected day the card lists
const DAY_ROWS = 10;

// The dashboard only reads data. What it shows depends on the role: a doctor gets their next patient and
// their own queue, the desk gets the waiting room, and a super admin also gets a row per doctor.
export default function DashboardPage() {
  useDocumentTitle('Dashboard');

  const { user } = useAuth();
  const { socket } = useRealtime();
  const queryClient = useQueryClient();
  const currentTime = useMinuteTick();
  const [trendDays, setTrendDays] = useState(7);
  // we wait for the server to tell us today, because the browser clock is not the reference
  const [selectedDate, setSelectedDate] = useState(null);

  const isDoctor = user.role === ROLES.DOCTOR;
  const isDesk = !isDoctor;

  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard });
  const today = dashboard.data?.today;
  const selectedDay = selectedDate || today;
  const month = (selectedDay || today)?.slice(0, 7);

  const trend = useQuery({
    queryKey: ['dashboard', 'trend', trendDays],
    queryFn: () => getTrend(trendDays),
    enabled: Boolean(today),
  });

  const calendar = useQuery({
    queryKey: ['dashboard', 'calendar', month],
    queryFn: () => getCalendar(month),
    enabled: Boolean(month),
  });

  const day = useQuery({
    queryKey: ['appointments', 'day', selectedDay],
    queryFn: () => listAppointments({ dateFrom: selectedDay, dateTo: selectedDay, limit: DAY_ROWS, sortBy: 'startTime' }),
    enabled: Boolean(selectedDay),
  });

  // the desk's list of arrived patients
  const waiting = useQuery({
    queryKey: ['dashboard', 'waiting', today],
    queryFn: () =>
      listAppointments({ dateFrom: today, dateTo: today, status: APPOINTMENT_STATUS.ARRIVED, limit: 50, sortBy: 'startTime' }),
    enabled: Boolean(today) && isDesk,
  });

  // a doctor already has their counts, so only the desk needs the list of doctors
  const doctors = useQuery({ queryKey: ['doctors'], queryFn: () => listDoctors(), enabled: isDesk });

  // any new appointment refreshes the board, so an arrival shows up without a reload
  useEffect(() => {
    if (!socket) {
      return undefined;
    }

    function onAppointmentEvent() {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    }

    REALTIME_EVENTS.forEach((event) => socket.on(event, onAppointmentEvent));

    return () => REALTIME_EVENTS.forEach((event) => socket.off(event, onAppointmentEvent));
  }, [socket, queryClient]);

  if (dashboard.isError) {
    return <ErrorMessage message={dashboard.error.message} onRetry={dashboard.refetch} />;
  }

  const counts = dashboard.data?.counts;
  // the day query waits for the clinic date, so the first paint shows a skeleton
  const isDayLoading = dashboard.isLoading || day.isLoading;
  const appointments = day.data?.appointments || [];
  const dayTotal = day.data?.meta?.total ?? appointments.length;

  const dayCounts = {};

  for (const entry of calendar.data?.days || []) {
    dayCounts[entry.date] = entry.total;
  }

  let dayTitle = 'Your patients today';

  if (isDoctor) {
    dayTitle = 'My queue';
  } else if (selectedDay !== today) {
    dayTitle = `Appointments on ${formatDate(selectedDay)}`;
  }

  let daySubtitle = 'Reading the day';

  if (!isDayLoading) {
    const when = selectedDay === today ? ' for today' : ` on ${formatDate(selectedDay)}`;
    const shown = appointments.length < dayTotal ? ` · showing the first ${appointments.length}` : '';

    daySubtitle = `${pluralize(dayTotal, 'visit')} booked${when}${shown}`;
  }

  return (
    <div className="space-y-5">
      <header className="px-1">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">
          {greetingFor()}, {greetingName(user.name)}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {dashboard.isLoading ? 'Reading today’s board' : `Here is the board for ${formatDateLong(today)}`}
        </p>
      </header>

      {/* the next patient comes first because it is the thing to act on now */}
      {isDoctor ? (
        <NextPatientCard next={dashboard.data?.next} today={today} isLoading={dashboard.isLoading} now={currentTime} />
      ) : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {STAT_CARDS.map(({ key, label, icon, tone }) => (
          <StatCard
            key={key}
            icon={icon}
            tone={tone}
            label={label}
            value={counts?.today?.[key] ?? 0}
            isLoading={dashboard.isLoading}
          />
        ))}
      </div>

      {isDesk ? (
        <WaitingRoomCard
          appointments={waiting.data?.appointments}
          isLoading={waiting.isLoading}
          error={waiting.isError ? waiting.error : null}
          onRetry={waiting.refetch}
          now={currentTime}
        />
      ) : null}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card
            title="Visits over time"
            subtitle={`Booked and completed visits over the last ${trendDays} days`}
            action={
              <Select
                label="Range"
                className="w-32"
                value={trendDays}
                onChange={(event) => setTrendDays(Number(event.target.value))}
                options={TREND_RANGES}
              />
            }
          >
            {trend.isError ? (
              <ErrorMessage message={trend.error.message} onRetry={trend.refetch} />
            ) : !trend.data ? (
              <div className="flex h-64 items-center justify-center">
                <Spinner label="Loading the chart" />
              </div>
            ) : (
              <TrendChart data={trend.data.trend} />
            )}
          </Card>

          <Card
            title={dayTitle}
            subtitle={daySubtitle}
            action={
              <div className="flex items-center gap-2">
                {today && selectedDay !== today ? (
                  <Button size="sm" variant="secondary" onClick={() => setSelectedDate(today)}>
                    Back to today
                  </Button>
                ) : null}
                {selectedDay ? (
                  <Link
                    to={`/appointments?dateFrom=${selectedDay}&dateTo=${selectedDay}`}
                    className="inline-flex items-center rounded-pill bg-primary-tint px-4 py-2 text-xs font-semibold text-primary transition hover:bg-primary-tint/70"
                  >
                    View all
                  </Link>
                ) : null}
              </div>
            }
          >
            <DayList
              appointments={appointments}
              isLoading={isDayLoading}
              error={day.isError ? day.error : null}
              onRetry={day.refetch}
              emptyTitle="Nothing booked"
              emptyText={
                selectedDay === today
                  ? 'No visits are booked for today yet. Pick another day on the calendar to look ahead.'
                  : 'This day has no visits booked. Choose another day on the calendar.'
              }
            />
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Appointment" subtitle="Jump to any day">
            {dashboard.isLoading || !today ? (
              <div className="space-y-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : (
              <MiniCalendar
                selectedDate={selectedDay}
                today={today}
                counts={dayCounts}
                onSelect={setSelectedDate}
              />
            )}
          </Card>

          {isDoctor ? (
            <UpcomingCard counts={counts?.upcoming} isLoading={dashboard.isLoading} />
          ) : (
            <DoctorsOnDuty
              doctors={doctors.data}
              today={today}
              byDoctor={dashboard.data?.byDoctor}
              isLoading={dashboard.isLoading || doctors.isLoading}
              canOpenRegister={user.role === ROLES.SUPER_ADMIN}
            />
          )}
        </div>
      </div>
    </div>
  );
}
