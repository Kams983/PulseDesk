import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Textarea from '@/components/ui/Textarea';
import { cancelAppointment } from '@/api/appointmentApi';
import { useToast } from '@/context/ToastContext';
import { formatDate, formatTime } from '@/utils/formatters';

// A cancel cannot be undone from this screen, so it asks first and asks why. The reason is optional
// because a desk that has to write something will write "x".
export default function CancelAppointmentModal({ appointment, onClose, onCancelled }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  const cancel = useMutation({
    mutationFn: () => cancelAppointment(appointment.id, reason.trim() || undefined),
  });

  async function confirm() {
    try {
      await cancel.mutateAsync();
      toast.success(`Cancelled ${formatTime(appointment.startTime)} for ${appointment.patient.name}`);
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['slots'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onCancelled();
    } catch (error) {
      toast.error(error.message);
    }
  }

  return (
    <Modal
      open
      title="Cancel this appointment?"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="danger" onClick={confirm} loading={cancel.isPending}>
            Cancel appointment
          </Button>
        </>
      }
    >
      <p className="rounded-card bg-page px-4 py-3 text-sm text-ink">
        {appointment.patient.name} · {formatDate(appointment.date, { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
        {formatTime(appointment.startTime)}-{formatTime(appointment.endTime)} with {appointment.doctor.name}.
      </p>

      <p className="mt-3 flex items-start gap-2 text-sm text-ink-muted">
        <TriangleAlert size={16} className="mt-0.5 shrink-0 text-arrived" aria-hidden="true" />
        The time is freed for someone else and the cancelled visit stays on the record, so this is not the same as
        deleting it.
      </p>

      {cancel.isError ? (
        <p className="mt-3 rounded-card bg-danger-tint px-4 py-3 text-sm text-danger">{cancel.error.message}</p>
      ) : null}

      <div className="mt-4">
        <Textarea
          label="Reason (optional)"
          rows={2}
          placeholder="Patient called to reschedule"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
    </Modal>
  );
}
