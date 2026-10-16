import { memo } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import AppointmentRow from './AppointmentRow';
import Skeleton from '@/components/ui/Skeleton';
import { availableActions } from '@/utils/appointmentActions';

// the two columns the api can sort by, in the order they appear. The rest of the header is static: a
// sort the server refuses to honour would be a click that does nothing.
const SORTABLE = [
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

// Memoised with the rows it owns: the page re-renders while a filter is typed and on every page of
// results, and none of that changes the table when the data, the sort and the role are the same.
function AppointmentsTable({ appointments, departmentNames, sortBy, sortOrder, role, today, isFetching, onSort, onRun }) {
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
            {SORTABLE.map(({ key, label, align }) => {
              const isActive = key && key === sortBy;

              return (
                <th
                  key={label}
                  scope="col"
                  className={`px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted ${align === 'right' ? 'text-right' : ''}`}
                >
                  {key ? (
                    // a real button, so the header is reachable and announced by a keyboard and a reader
                    <button
                      type="button"
                      onClick={() => onSort(key)}
                      aria-label={`Sort by ${label}`}
                      className={`inline-flex items-center gap-1 uppercase transition hover:text-ink ${isActive ? 'text-ink' : ''}`}
                    >
                      {label}
                      {isActive ? (
                        sortOrder === 'asc' ? (
                          <ArrowUp size={13} aria-hidden="true" />
                        ) : (
                          <ArrowDown size={13} aria-hidden="true" />
                        )
                      ) : (
                        <ChevronsUpDown size={13} className="opacity-50" aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    label
                  )}
                </th>
              );
            })}
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
              // an appointment carries a department id and nothing else, so the name comes from the one
              // department list the page already holds rather than a second request per row
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

export default memo(AppointmentsTable);
