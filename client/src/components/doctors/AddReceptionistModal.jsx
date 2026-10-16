import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { TriangleAlert } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { createReceptionist } from '@/api/doctorApi';
import { useToast } from '@/context/ToastContext';
import { applyServerErrors } from '@/utils/formErrors';

const schema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(120),
  email: z.email({ message: 'Enter a valid email address' }),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// A receptionist is a login with no profile: the desk books for every doctor, so there is nothing else to
// attach to the account.
export default function AddReceptionistModal({ onClose, onCreated }) {
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', password: '' } });

  const save = useMutation({ mutationFn: createReceptionist });

  async function onSubmit(values) {
    try {
      const { user } = await save.mutateAsync(values);
      toast.success(`${user.name} can now sign in`);
      onCreated(user);
    } catch (error) {
      if (!applyServerErrors(error, setError)) {
        toast.error(error.message);
      }
    }
  }

  return (
    <Modal
      open
      title="Add a receptionist"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="add-receptionist-form" loading={save.isPending}>
            Create login
          </Button>
        </>
      }
    >
      <form id="add-receptionist-form" className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        {save.isError ? (
          <p className="flex items-start gap-2 rounded-card bg-danger-tint px-4 py-3 text-sm text-danger">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            {save.error.message}
          </p>
        ) : null}

        <Input label="Full name" placeholder="Front Desk" error={errors.name?.message} {...register('name')} />
        <Input label="Email" type="email" autoComplete="off" error={errors.email?.message} {...register('email')} />
        <Input
          label="Temporary password"
          type="password"
          autoComplete="new-password"
          helper="At least 8 characters. Share it with them directly."
          error={errors.password?.message}
          {...register('password')}
        />
      </form>
    </Modal>
  );
}
