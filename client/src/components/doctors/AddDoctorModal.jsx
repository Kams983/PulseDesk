import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { TriangleAlert } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import { createDoctor } from '@/api/doctorApi';
import { useToast } from '@/context/ToastContext';
import { applyServerErrors } from '@/utils/formErrors';

const SLOT_DURATIONS = [10, 15, 20, 30, 45, 60];

const schema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(120),
  email: z.email({ message: 'Enter a valid email address' }),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  departmentId: z.string().min(1, 'Choose a department'),
  specialization: z.string().trim().max(120).optional(),
  slotDurationMinutes: z.coerce.number().int().min(5, 'At least 5 minutes').max(120, 'At most 120 minutes'),
});

// A doctor is a login and a profile at once, which is why this form asks for a password: the api creates
// the two together and rolls the login back if the profile fails.
export default function AddDoctorModal({ departments, onClose, onCreated }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '', departmentId: '', specialization: '', slotDurationMinutes: 15 },
  });

  const save = useMutation({ mutationFn: createDoctor });

  async function onSubmit(values) {
    try {
      const doctor = await save.mutateAsync({ ...values, specialization: values.specialization || undefined });
      toast.success(`${doctor.name} added`);
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      onCreated(doctor);
    } catch (error) {
      // a field level answer goes beside its field (a taken email, a department that vanished), anything
      // else stays as a banner because there is nowhere better for it to live
      const applied = applyServerErrors(error, setError);

      if (!applied) {
        toast.error(error.message);
      }
    }
  }

  return (
    <Modal
      open
      title="Add a doctor"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="add-doctor-form" loading={save.isPending}>
            Create doctor
          </Button>
        </>
      }
    >
      <form id="add-doctor-form" className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        {save.isError ? (
          <p className="flex items-start gap-2 rounded-card bg-danger-tint px-4 py-3 text-sm text-danger">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            {save.error.message}
          </p>
        ) : null}

        <Input label="Full name" placeholder="Dr. Ifeanyi Okafor" error={errors.name?.message} {...register('name')} />
        <Input label="Email" type="email" autoComplete="off" error={errors.email?.message} {...register('email')} />
        <Input
          label="Temporary password"
          type="password"
          autoComplete="new-password"
          helper="At least 8 characters. The doctor can sign in with this immediately."
          error={errors.password?.message}
          {...register('password')}
        />
        <Select
          label="Department"
          options={[{ value: '', label: 'Choose a department' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
          error={errors.departmentId?.message}
          {...register('departmentId')}
        />
        <Input
          label="Specialization"
          placeholder="Consultant Physician"
          helper="Optional."
          error={errors.specialization?.message}
          {...register('specialization')}
        />
        <Select
          label="Slot length"
          options={SLOT_DURATIONS.map((minutes) => ({ value: minutes, label: `${minutes} minutes` }))}
          helper="How long one appointment with this doctor is. The weekly schedule is edited afterwards."
          error={errors.slotDurationMinutes?.message}
          {...register('slotDurationMinutes')}
        />
      </form>
    </Modal>
  );
}
