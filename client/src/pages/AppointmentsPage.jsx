import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorMessage from '@/components/ui/ErrorMessage';
import Pagination from '@/components/ui/Pagination';
import AppointmentCards from '@/components/appointments/AppointmentCards';
import AppointmentDetailsModal from '@/components/appointments/AppointmentDetailsModal';
import AppointmentsFilters from '@/components/appointments/AppointmentsFilters';
import AppointmentsTable from '@/components/appointments/AppointmentsTable';
import CancelAppointmentModal from '@/components/appointments/CancelAppointmentModal';
import EditAppointmentModal from '@/components/appointments/EditAppointmentModal';
import LiveIndicator from '@/components/scheduler/LiveIndicator';
import { arriveAppointment, completeAppointment, listAppointments } from '@/api/appointmentApi';
import { getDashboard } from '@/api/dashboardApi';
import { listDepartments, listDoctors } from '@/api/doctorApi';
import { useAuth } from '@/context/AuthContext';
import { useRealtime } from '@/context/SocketContext';
import { useToast } from '@/context/ToastContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { APPOINTMENT_SORT_FIELDS } from '@/utils/constants';
import { pluralize } from '@/utils/formatters';

const REALTIME_EVENTS = ['appointment:created', 'appointment:updated', 'appointment:cancelled'];
const PAGE_SIZES = [10, 20, 50];

// The URL holds the filters, so a refresh or a shared link shows the same list.
function readFilters(params) {
  const limit = Number(params.get('limit'));
  const sortBy = params.get('sortBy');

  return {
    q: params.get('q') || '',
    mobile: params.get('mobile') || '',
    doctor: params.get('doctor') || '',
    doctorId: params.get('doctorId') || '',
    departmentId: params.get('departmentId') || '',
    status: params.get('status') || '',
    dateFrom: params.get('dateFrom') || '',
    dateTo: params.get('dateTo') || '',
    // the api rejects an unknown sort field, so only known ones are used
    sortBy: APPOINTMENT_SORT_FIELDS.includes(sortBy) ? sortBy : 'date',
    sortOrder: params.get('sortOrder') === 'desc' ? 'desc' : 'asc',
    page: Math.max(Number(params.get('page')) || 1, 1),
    limit: PAGE_SIZES.includes(limit) ? limit : 10,
  };
}

export default function AppointmentsPage() {
  useDocumentTitle('Appointments');

  const { user } = useAuth();
  const { socket, status: liveStatus } = useRealtime();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const isWide = useMediaQuery('(min-width: 1024px)');
  const [active, setActive] = useState(null);

  const filters = readFilters(params);
  const { q, mobile, doctor, doctorId, departmentId, status, dateFrom, dateTo, sortBy, sortOrder, page, limit } = filters;

  const board = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard });
  const today = board.data?.today;

  const departments = useQuery({ queryKey: ['departments'], queryFn: listDepartments, staleTime: 30 * 60_000 });
  // the scheduler uses the same query, so both screens share the cached list
  const doctors = useQuery({ queryKey: ['doctors', ''], queryFn: () => listDoctors() });

  const list = useQuery({
    queryKey: ['appointments', { q, mobile, doctor, doctorId, departmentId, status, dateFrom, dateTo, sortBy, sortOrder, page, limit }],
    queryFn: () => listAppointments({ q, mobile, doctor, doctorId, departmentId, status, dateFrom, dateTo, sortBy, sortOrder, page, limit }),
    // keep the old rows visible while the next page loads
    placeholderData: keepPreviousData,
  });

  const appointments = list.data?.appointments || [];
  const meta = list.data?.meta;
  const departmentNames = new Map((departments.data || []).map((entry) => [entry.id, entry.name]));
  const selected = active ? appointments.find((appointment) => appointment.id === active.id) || null : null;

  // Every filter change also goes back to page one, because the old page may not exist in the new list.
  function applyFilters(patch) {
    const next = new URLSearchParams(params);

    for (const key of Object.keys(patch)) {
      const value = patch[key];

      if (value === '' || value === undefined || value === null) {
        next.delete(key);
      } else {
        next.set(key, String(value));
      }
    }

    if (!('page' in patch)) {
      next.delete('page');
    }

    setParams(next, { replace: true });
  }

  function clearFilters() {
    setParams(new URLSearchParams(), { replace: true });
  }

  function toggleSort(key) {
    const next = new URLSearchParams(params);
    const sameColumn = (params.get('sortBy') || 'date') === key;
    const isAscending = (params.get('sortOrder') || 'asc') === 'asc';

    next.set('sortBy', key);
    // clicking the sorted column again flips the direction
    next.set('sortOrder', sameColumn && isAscending ? 'desc' : 'asc');
    next.delete('page');

    setParams(next, { replace: true });
  }

  function refreshLists() {
    queryClient.invalidateQueries({ queryKey: ['appointments'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['slots'] });
  }

  const arrive = useMutation({
    mutationFn: arriveAppointment,
    onSuccess: (appointment) => {
      toast.success(`Marked ${appointment.patient.name} as arrived`);
      refreshLists();
    },
    onError: (error) => toast.error(error.message),
  });

  const complete = useMutation({
    mutationFn: completeAppointment,
    onSuccess: (appointment) => {
      toast.success(`Completed ${appointment.patient.name}'s visit`);
      refreshLists();
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!socket) {
      return undefined;
    }

    function onAppointmentEvent() {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }

    REALTIME_EVENTS.forEach((event) => socket.on(event, onAppointmentEvent));

    return () => REALTIME_EVENTS.forEach((event) => socket.off(event, onAppointmentEvent));
  }, [socket, queryClient]);

  // The table and the cards both use this, so they always do the same thing.
  function runAction(action, id) {
    if (action === 'arrive') {
      arrive.mutate(id);
      return;
    }

    if (action === 'complete') {
      complete.mutate(id);
      return;
    }

    setActive({ action, id });
  }

  const isEmpty = !list.isPending && appointments.length === 0;
  const isFiltered = Boolean(q || mobile || doctor || doctorId || departmentId || status || dateFrom || dateTo);

  return (
    <div className="space-y-5">
      <Card
        title="Appointments"
        subtitle={meta ? `${pluralize(meta.total, 'visit')}${isFiltered ? ' matching these filters' : ''}` : 'Loading the list'}
        action={
          <div className="flex items-center gap-3">
            {list.isFetching && !list.isPending ? <span className="text-xs text-ink-muted">Updating…</span> : null}
            <LiveIndicator status={liveStatus} />
          </div>
        }
      >
        <AppointmentsFilters
          filters={filters}
          departments={departments.data || []}
          doctors={doctors.data || []}
          today={today}
          onChange={applyFilters}
          onClear={clearFilters}
        />
      </Card>

      <Card>
        {list.isError ? (
          <ErrorMessage message={list.error.message} onRetry={list.refetch} />
        ) : isEmpty ? (
          <EmptyState
            icon={ClipboardList}
            title={isFiltered ? 'No visits match' : 'Nothing booked yet'}
            text={
              isFiltered
                ? 'Widen the filters, or clear them to see the whole list.'
                : 'Booked visits appear here as soon as the scheduler places one.'
            }
            action={
              isFiltered ? (
                <Button size="sm" variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            {isWide ? (
              <AppointmentsTable
                appointments={appointments}
                departmentNames={departmentNames}
                sortBy={sortBy}
                sortOrder={sortOrder}
                role={user.role}
                today={today}
                isFetching={list.isPending || list.isFetching}
                onSort={toggleSort}
                onRun={runAction}
              />
            ) : (
              <AppointmentCards
                appointments={appointments}
                departmentNames={departmentNames}
                role={user.role}
                today={today}
                onRun={runAction}
              />
            )}

            {meta ? (
              <Pagination
                className="mt-4 border-t border-line pt-4"
                page={meta.page}
                totalPages={meta.totalPages}
                onChange={(nextPage) => applyFilters({ page: nextPage })}
                pageSize={meta.limit}
                onPageSizeChange={(size) => applyFilters({ limit: size, page: 1 })}
                pageSizeOptions={PAGE_SIZES}
              />
            ) : null}
          </>
        )}
      </Card>

      {selected && active?.action === 'view' ? (
        <AppointmentDetailsModal
          appointment={selected}
          departmentName={departmentNames.get(selected.departmentId)}
          today={today}
          onClose={() => setActive(null)}
        />
      ) : null}

      {selected && active?.action === 'edit' ? (
        <EditAppointmentModal appointment={selected} onClose={() => setActive(null)} onSaved={() => setActive(null)} />
      ) : null}

      {selected && active?.action === 'cancel' ? (
        <CancelAppointmentModal appointment={selected} onClose={() => setActive(null)} onCancelled={() => setActive(null)} />
      ) : null}
    </div>
  );
}
