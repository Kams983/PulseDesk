import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Stethoscope, UserRound } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import { getPatient } from '@/api/patientApi';
import { APPOINTMENT_STATUS } from '@/utils/constants';
import { formatDateLong, formatStamp, formatStampTime, formatTime } from '@/utils/formatters';

// The patient block is fetched rather than read off the appointment, because the appointment carries a
// snapshot of what was true at booking time. Asking the api for the patient is also what enforces the
// rule that a doctor only opens a patient they have an appointment with.
export default function AppointmentDetailsModal({ appointment, departmentName, today, onClose }) {
  const patient = useQuery({
    queryKey: ['patient', appointment.patient.id],
    queryFn: () => getPatient(appointment.patient.id),
  });

  return (
    <Modal
      open
      title="Appointment details"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex items-center justify-between gap-3 rounded-card bg-page px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-ink">{formatDateLong(appointment.date)}</p>
          <p className="text-sm text-ink-muted">
            {formatTime(appointment.startTime)}-{formatTime(appointment.endTime)}
          </p>
        </div>
        <Badge status={appointment.status} />
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field icon={Stethoscope} label="Doctor" value={appointment.doctor.name} />
        <Field label="Department" value={departmentName} />
        <Field label="Purpose" value={appointment.purpose || '-'} />
        <Field label="Booked on" value={formatStamp(appointment.createdAt)} />
        <Field className="sm:col-span-2" label="Notes" value={appointment.notes || '-'} />
        {appointment.status === APPOINTMENT_STATUS.CANCELLED ? (
          <Field
            className="sm:col-span-2"
            label="Cancelled"
            value={`${appointment.cancelReason || 'No reason recorded'}${
              appointment.cancelledAt ? ` · ${formatStamp(appointment.cancelledAt)}` : ''
            }`}
          />
        ) : null}
        {isSeen(appointment.status) ? (
          <Field
            className="sm:col-span-2"
            label={appointment.status === APPOINTMENT_STATUS.COMPLETED ? 'Arrived and completed' : 'Arrived'}
            value={[appointment.arrivedAt, appointment.completedAt].filter(Boolean).map(formatStampTime).join(' → ')}
          />
        ) : null}
      </dl>

      <section className="mt-5 rounded-card border border-line p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <UserRound size={15} aria-hidden="true" />
          Patient
        </h3>

        <PatientBlock patient={patient} />
      </section>

      <p className="mt-4 flex items-center gap-2 text-xs text-ink-muted">
        <CalendarClock size={14} aria-hidden="true" />
        The clinic's date is {formatDateLong(today)}.
      </p>
    </Modal>
  );
}

// a visit that has been seen is either still with the doctor or finished
function isSeen(status) {
  return status === APPOINTMENT_STATUS.ARRIVED || status === APPOINTMENT_STATUS.COMPLETED;
}

function PatientBlock({ patient }) {
  if (patient.isError) {
    return <p className="mt-2 text-sm text-ink-muted">{patient.error.message}</p>;
  }

  if (patient.isLoading) {
    return (
      <div className="mt-3 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-28" />
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-3">
      <Avatar name={patient.data.name} size="lg" />
      <dl className="grid flex-1 gap-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-ink-muted">Name</dt>
          <dd className="font-medium text-ink">{patient.data.name}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">Patient code</dt>
          <dd className="font-medium text-ink">{patient.data.patientCode}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">Mobile</dt>
          <dd className="font-medium text-ink">{patient.data.mobile}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">Date of birth</dt>
          <dd className="font-medium text-ink">{patient.data.dateOfBirth ? formatDateLong(patient.data.dateOfBirth) : 'Not recorded'}</dd>
        </div>
      </dl>
    </div>
  );
}

function Field({ icon: Icon, label, value, className = '' }) {
  return (
    <div className={className}>
      <dt className="flex items-center gap-1.5 text-xs text-ink-muted">
        {Icon ? <Icon size={13} aria-hidden="true" /> : null}
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
    </div>
  );
}
