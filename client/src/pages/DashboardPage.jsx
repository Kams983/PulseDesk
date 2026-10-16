import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
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
import TrendChart from '@/components/dashboard/TrendChart';
import UpcomingCard from '@/components/dashboard/UpcomingCard';
import { getDashboard, getTrend } from '@/api/dashboardApi';
import { listAppointments } from '@/api/appointmentApi';
import { listDoctors } from '@/api/doctorApi';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ROLES, STAT_CARDS } from '@/utils/constants';
import { formatDate, formatDateLong, greetingFor, greetingName, pluralize } from '@/utils/formatters';

const TREND_RANGES = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
];

// The board is read only and every number it needs comes from two endpoints plus the day under the
// calendar, so nothing here is computed that the server already knows.
export default function DashboardPage() {
  useDocumentTitle('Dashboard');

  const { user } = useAuth();
  const [trendDays, setTrendDays] = useState(7);
  // null rather than a date until the server reports today: the browser clock is never the reference
  const [selectedDate, setSelectedDate] = useState(null);

  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard });
  const today = dashboard.data?.today;
  const selectedDay = selectedDate || today;
  const isDesk = user.role !== ROLES.DOCTOR;

  const trend = useQuery({
    queryKey: ['dashboard', 'trend', trendDays],
    queryFn: () => getTrend(trendDays),
    enabled: Boolean(today),
  });

  const day = useQuery({
    queryKey: ['appointments', 'day', selectedDay],
    queryFn: () => listAppointments({ dateFrom: selectedDay, dateTo: selectedDay, limit: 10, sortBy: 'startTime' }),
    enabled: Boolean(selectedDay),
  });

  // a doctor already gets their own counts from the dashboard, so only the desk fetches the register
  const doctors = useQuery({ queryKey: ['doctors'], queryFn: () => listDoctors(), enabled: isDesk });

  if (dashboard.isError) {
    return <ErrorMessage message={dashboard.error.message} onRetry={dashboard.refetch} />;
  }

  const counts = dashboard.data?.counts;
  // the day query is disabled until the board reports the clinic date, and a disabled query is not
  // loading, so the first paint is still a skeleton rather than an empty day
  const isDayLoading = dashboard.isLoading || day.isLoading;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4 px-1">
        <div>
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">
            {greetingFor()}, {greetingName(user.name)}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {dashboard.isLoading ? 'Reading today’s board' : `Here is the board for ${formatDateLong(today)}`}
          </p>
        </div>

        <span className="inline-flex items-center gap-2 rounded-pill bg-card px-3 py-2 text-xs font-semibold text-ink-muted shadow-card">
          <CalendarDays size={14} aria-hidden="true" />
          {dashboard.isLoading ? 'Clinic date loading' : formatDate(today, { weekday: 'short', day: 'numeric', month: 'short' })}
        </span>
      </header>

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
            title={selectedDay === today ? 'Your patients today' : `Appointments on ${formatDate(selectedDay)}`}
            subtitle={
              isDayLoading
                ? 'Reading the day'
                : `${pluralize(day.data?.appointments.length ?? 0, 'visit')} booked${
                    selectedDay === today ? ' for today' : ''
                  }`
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
              appointments={day.data?.appointments}
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
                onSelect={setSelectedDate}
              />
            )}
          </Card>

          {isDesk ? (
            <DoctorsOnDuty
              doctors={doctors.data}
              count={dashboard.data?.doctors}
              isLoading={doctors.isLoading}
              canOpenRegister={user.role === ROLES.SUPER_ADMIN}
            />
          ) : (
            <UpcomingCard counts={counts?.upcoming} isLoading={dashboard.isLoading} />
          )}
        </div>
      </div>
    </div>
  );
}
