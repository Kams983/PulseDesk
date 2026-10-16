import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { TriangleAlert } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Textarea from '@/components/ui/Textarea';
import { updateAppointment } from '@/api/appointmentApi';
import { useToast } from '@/context/ToastContext';
import { formatDate, formatTime } from '@/utils/formatters';

const schema = z.object({
  purpose: z.string().trim().max(200, 'Purpose cannot be longer than 200 characters').optional(),
  notes: z.string().trim().max(1000, 'Notes cannot be longer than 1000 characters').optional(),
});

// Only the two fields the api lets the desk rewrite. A completed or cancelled visit never gets here,
// because the action list that opens this dialog does not offer it for those statuses.
export default function EditAppointmentModal({ appointment, onClose, onSaved }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { purpose: appointment.purpose || '', notes: appointment.notes || '' },
  });

  const save = useMutation({
    mutationFn: (values) => updateAppointment(appointment.id, values),
  });

  async function onSubmit(values) {
    // the api rejects a body that changes nothing, and it is right to: an empty audit row is noise
    if (values.purpose === (appointment.purpose || '') && values.notes === (appointment.notes || '')) {
      toast.error('Nothing changed');
      return;
    }

    try {
      await save.mutateAsync({ purpose: values.purpose, notes: values.notes });
      toast.success('Appointment updated');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      onSaved();
    } catch (error) {
      toast.error(error.message);
    }
  }

  return (
    <Modal
      open
      title="Edit appointment"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-appointment-form" loading={save.isPending || isSubmitting}>
            Save changes
          </Button>
        </>
      }
    >
      <p className="rounded-card bg-page px-4 py-3 text-sm text-ink-muted">
        {appointment.patient.name} · {formatDate(appointment.date, { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
        {formatTime(appointment.startTime)}-{formatTime(appointment.endTime)}
      </p>

      <form id="edit-appointment-form" className="mt-4 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        {save.isError ? (
          <p className="flex items-start gap-2 rounded-card bg-danger-tint px-4 py-3 text-sm text-danger">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            {save.error.message}
          </p>
        ) : null}

        <Input label="Purpose" error={errors.purpose?.message} {...register('purpose')} />
        <Textarea label="Notes" rows={4} error={errors.notes?.message} {...register('notes')} />
      </form>
    </Modal>
  );
}
