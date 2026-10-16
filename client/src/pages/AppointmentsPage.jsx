import { useCallback, useEffect, useMemo, useState } from 'react';
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

// The URL is the state. Every filter, the sort and the page live in the query string, which is what makes
// a refresh, a bookmark and a link to a colleague all land on the same list, and it means the page has
// exactly one place to read its own configuration from.
function readFilters(params) {
  const limit = Number(params.get('limit'));

  return {
    q: params.get('q') || '',
    mobile: params.get('mobile') || '',
    doctor: params.get('doctor') || '',
    doctorId: params.get('doctorId') || '',
    departmentId: params.get('departmentId') || '',
    status: params.get('status') || '',
    dateFrom: params.get('dateFrom') || '',
    dateTo: params.get('dateTo') || '',
    // a sort field the api does not accept would be a 400, so anything unknown falls back to the default
    sortBy: APPOINTMENT_SORT_FIELDS.includes(params.get('sortBy')) ? params.get('sortBy') : 'date',
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
  // the doctor select wants every doctor, which is the same query the scheduler's "all departments" view
  // already caches, so the two screens share one entry instead of asking twice
  const doctors = useQuery({ queryKey: ['doctors', ''], queryFn: () => listDoctors() });

  const list = useQuery({
    queryKey: ['appointments', { q, mobile, doctor, doctorId, departmentId, status, dateFrom, dateTo, sortBy, sortOrder, page, limit }],
    queryFn: () => listAppointments({ q, mobile, doctor, doctorId, departmentId, status, dateFrom, dateTo, sortBy, sortOrder, page, limit }),
    // the previous page stays on screen while the next one loads, so paging does not flash a skeleton
    placeholderData: keepPreviousData,
  });

  const appointments = list.data?.appointments || [];
  const meta = list.data?.meta;

  const departmentNames = useMemo(() => new Map((departments.data || []).map((d) => [d.id, d.name])), [departments.data]);

  const closeActive = useCallback(() => setActive(null), []);

  const selected = useMemo(
    () => (active ? appointments.find((appointment) => appointment.id === active.id) || null : null),
    [active, appointments]
  );

  // one entry point for both filters and the shortcuts; a changed filter always goes back to page one,
  // because page four of the old result set is not a place the new one has
  const applyFilters = useCallback(
    (patch) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);

          for (const [key, value] of Object.entries(patch)) {
            if (value === '' || value === undefined || value === null) {
              next.delete(key);
            } else {
              next.set(key, String(value));
            }
          }

          if (!('page' in patch)) {
            next.delete('page');
          }

          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  const clearFilters = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  const toggleSort = useCallback(
    (key) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          const isSame = (current.get('sortBy') || 'date') === key;

          next.set('sortBy', key);
          // clicking the column that is already sorted flips the direction, which is what an arrow implies
          next.set('sortOrder', isSame && (current.get('sortOrder') || 'asc') === 'asc' ? 'desc' : 'asc');
          next.delete('page');

          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  const goToPage = useCallback((nextPage) => applyFilters({ page: nextPage }), [applyFilters]);

  const changePageSize = useCallback((size) => applyFilters({ limit: size, page: 1 }), [applyFilters]);

  const arriveMutation = useMutation({
    mutationFn: (id) => arriveAppointment(id),
    onSuccess: (appointment) => {
      toast.success(`Marked ${appointment.patient.name} as arrived`);
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['slots'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const completeMutation = useMutation({
    mutationFn: (id) => completeAppointment(id),
    onSuccess: (appointment) => {
      toast.success(`Completed ${appointment.patient.name}'s visit`);
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['slots'] });
    },
    onError: (error) => toast.error(error.message),
  });

  // react-query documents mutate as stable, so destructuring it here is what makes the callback below
  // depend on something that never changes
  const { mutate: markArrived } = arriveMutation;
  const { mutate: completeVisit } = completeMutation;

  // Live: the server broadcasts to the staff room and to each doctor's own room, so every list is woken
  // by any change it is allowed to see, and refetching the current query is exactly what it needs.
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

  // The table and the card list both hand their clicks through here, so the two layouts cannot drift
  // apart in what an action means. Two of the five run immediately and three open a dialog, which is a
  // decision this one function owns. Mutation objects are stable in react-query, so this callback is too
  // and a memoised row can be skipped while a filter is being typed.
  const runAction = useCallback(
    (action, id) => {
      if (action === 'arrive') {
        markArrived(id);
        return;
      }

      if (action === 'complete') {
        completeVisit(id);
        return;
      }

      setActive({ action, id });
    },
    [markArrived, completeVisit]
  );

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
            {/* one layout is rendered, not both: the other one would be rows of dom that nobody sees */}
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
                onChange={goToPage}
                pageSize={meta.limit}
                onPageSizeChange={changePageSize}
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
          onClose={closeActive}
        />
      ) : null}

      {selected && active?.action === 'edit' ? (
        <EditAppointmentModal appointment={selected} onClose={closeActive} onSaved={closeActive} />
      ) : null}

      {selected && active?.action === 'cancel' ? (
        <CancelAppointmentModal appointment={selected} onClose={closeActive} onCancelled={closeActive} />
      ) : null}
    </div>
  );
}
