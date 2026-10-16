import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import AppointmentRow from './AppointmentRow';
import Skeleton from '@/components/ui/Skeleton';
import { availableActions } from '@/utils/appointmentActions';

// The two sortable columns the api accepts, in the order they appear. The rest of the header is static:
// a sort the server refuses to honour would be a click that does nothing.
const COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'startTime', label: 'Time' },
  { key: null, label: 'Patient' },
  { key: null, label: 'Mobile' },
  { key: null, label: 'Doctor' },
  { key: null, label: 'Department' },
  { key: null, label: 'Purpose' },
  { key: 'status', label: 'Status' },
  { key: null, label: 'Actions', align: 'right' },
];

export default function AppointmentsTable({
  appointments,
  departmentNames,
  sortBy,
  sortOrder,
  role,
  today,
  isFetching,
  onSort,
  onRun,
}) {
  if (isFetching && appointments.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[64rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            {COLUMNS.map((column) => (
              <TableHead key={column.label} column={column} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
            ))}
          </tr>
        </thead>
        <tbody>
          {appointments.map((appointment) => (
            <AppointmentRow
              key={appointment.id}
              id={appointment.id}
              date={appointment.date}
              startTime={appointment.startTime}
              endTime={appointment.endTime}
              patientName={appointment.patient.name}
              patientCode={appointment.patient.patientCode}
              mobile={appointment.patient.mobile}
              doctorName={appointment.doctor.name}
              // an appointment carries a department id only, so the name comes from the one department
              // list the page already holds rather than a request per row
              departmentName={departmentNames.get(appointment.departmentId) || '-'}
              purpose={appointment.purpose}
              status={appointment.status}
              actions={availableActions(appointment, role, today)}
              onRun={onRun}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// a real button, so the header is reachable and announced by a keyboard and a reader
function TableHead({ column, sortBy, sortOrder, onSort }) {
  const { key, label, align } = column;
  const isActive = key && key === sortBy;

  return (
    <th
      scope="col"
      className={`px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted ${align === 'right' ? 'text-right' : ''}`}
    >
      {key ? (
        <button
          type="button"
          onClick={() => onSort(key)}
          aria-label={`Sort by ${label}`}
          className={`inline-flex items-center gap-1 uppercase transition hover:text-ink ${isActive ? 'text-ink' : ''}`}
        >
          {label}
          <SortIcon isActive={isActive} sortOrder={sortOrder} />
        </button>
      ) : (
        label
      )}
    </th>
  );
}

function SortIcon({ isActive, sortOrder }) {
  if (!isActive) {
    return <ChevronsUpDown size={13} className="opacity-50" aria-hidden="true" />;
  }

  if (sortOrder === 'asc') {
    return <ArrowUp size={13} aria-hidden="true" />;
  }

  return <ArrowDown size={13} aria-hidden="true" />;
}
