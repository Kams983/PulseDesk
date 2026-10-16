import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

// the same three broadcasts the appointments page listens to, so the board is as live as the lists
const REALTIME_EVENTS = ['appointment:created', 'appointment:updated', 'appointment:cancelled'];

// The board is read only: the counts, the trend, the calendar month, the day under the calendar and the
// waiting room all come from the api, so nothing here is computed that the server already knows. What
// the board contains follows the role. A doctor gets their own next patient first and then their own
// queue, the desk gets the waiting room, and a super admin also gets today broken down per doctor.
export default function DashboardPage() {
  useDocumentTitle('Dashboard');

  const { user } = useAuth();
  const { socket } = useRealtime();
  const queryClient = useQueryClient();
  const now = useMinuteTick();
  const [trendDays, setTrendDays] = useState(7);
  // null rather than a date until the server reports today: the browser clock is never the reference
  const [selectedDate, setSelectedDate] = useState(null);

  const isDoctor = user.role === ROLES.DOCTOR;
  // both desk roles work the same waiting room, which is why the card follows the desk rather than one
  // role, and a doctor is the only one who does not get it
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

  // the dots under the calendar come from one grouped query for the whole month, never one per cell
  const calendar = useQuery({
    queryKey: ['dashboard', 'calendar', month],
    queryFn: () => getCalendar(month),
    enabled: Boolean(month),
  });

  const day = useQuery({
    queryKey: ['appointments', 'day', selectedDay],
    queryFn: () => listAppointments({ dateFrom: selectedDay, dateTo: selectedDay, limit: 10, sortBy: 'startTime' }),
    enabled: Boolean(selectedDay),
  });

  // the desk's live list: everyone marked arrived today who has not been completed
  const waiting = useQuery({
    queryKey: ['dashboard', 'waiting', today],
    queryFn: () => listAppointments({ dateFrom: today, dateTo: today, status: APPOINTMENT_STATUS.ARRIVED, limit: 50, sortBy: 'startTime' }),
    enabled: Boolean(today) && isDesk,
  });

  // a doctor already gets their own counts from the dashboard, so only the desk fetches the register
  const doctors = useQuery({ queryKey: ['doctors'], queryFn: () => listDoctors(), enabled: isDesk });

  // Live: any appointment the caller is allowed to see wakes the board, so an arrival shows up on the
  // waiting room without anyone reloading the page.
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
  // the day query is disabled until the board reports the clinic date, and a disabled query is not
  // loading, so the first paint is still a skeleton rather than an empty day
  const isDayLoading = dashboard.isLoading || day.isLoading;
  const appointments = day.data?.appointments || [];
  // a busy day holds more than one page, so the card counts the day rather than the rows it loaded
  const dayTotal = day.data?.meta?.total ?? appointments.length;
  const dayCounts = calendar.data?.days.reduce((all, entry) => ({ ...all, [entry.date]: entry.total }), {}) || {};

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

      {/* the one card that comes before the numbers, because it is the thing to act on right now */}
      {isDoctor ? (
        <NextPatientCard next={dashboard.data?.next} today={today} isLoading={dashboard.isLoading} now={now} />
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
          now={now}
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
            {/* the query stays disabled until the server reports today, and a disabled query is not
                loading: the chart therefore keys off its own data, not off a loading flag */}
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
            title={isDoctor ? 'My queue' : selectedDay === today ? 'Your patients today' : `Appointments on ${formatDate(selectedDay)}`}
            subtitle={
              isDayLoading
                ? 'Reading the day'
                : `${pluralize(dayTotal, 'visit')} booked${
                    selectedDay === today ? ' for today' : ` on ${formatDate(selectedDay)}`
                  }${appointments.length < dayTotal ? ` · showing the first ${appointments.length}` : ''}`
            }
            action={
              selectedDay !== today && today ? (
                <Button size="sm" variant="secondary" onClick={() => setSelectedDate(today)}>
                  Back to today
                </Button>
              ) : null
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
