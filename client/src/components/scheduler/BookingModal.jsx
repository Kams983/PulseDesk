import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { BadgeCheck, TriangleAlert, UserPlus } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import PatientPicker from './PatientPicker';
import { createAppointment } from '@/api/appointmentApi';
import { useToast } from '@/context/ToastContext';
import { formatDate, formatTime, pluralize } from '@/utils/formatters';

const TABS = [
  { key: 'existing', label: 'Existing patient' },
  { key: 'new', label: 'New patient' },
];

// Permissive on purpose: the desk types what the caller reads out, spaces and dashes included. The
// number is normalised before it is sent, so the server still validates a bare digits-only value.
const MOBILE_PATTERN = /^\+?[\d\s-]{7,20}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const GENDERS = [
  { value: '', label: 'Not recorded' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
];

const EMPTY = { patientId: '', name: '', mobile: '', gender: '', dateOfBirth: '', purpose: '', notes: '' };

// Two shapes of the same booking: an identified patient, or one registered on the spot. Only the patient
// half differs, so purpose and notes are shared and a tab switch never loses them.
const existingSchema = z.object({
  patientId: z.string().min(1, 'Choose a patient'),
  purpose: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const newPatientSchema = z.object({
  name: z.string().trim().min(2, 'Enter the patient name').max(120),
  mobile: z.string().trim().regex(MOBILE_PATTERN, 'Enter a mobile number of 7 to 15 digits'),
  gender: z.enum(['', 'female', 'male', 'other']).optional(),
  dateOfBirth: z.union([z.string().regex(DATE_PATTERN), z.literal('')]).optional(),
  purpose: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export default function BookingModal({ doctor, date, slot, onClose, onBooked }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('existing');
  const [patient, setPatient] = useState(null);
  // the two conflicts the api answers with, kept apart because they need two different answers
  const [duplicate, setDuplicate] = useState(null);
  const [conflict, setConflict] = useState('');
  const [formError, setFormError] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    clearErrors,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(tab === 'existing' ? existingSchema : newPatientSchema),
    defaultValues: EMPTY,
  });

  const book = useMutation({ mutationFn: createAppointment });

  const isPending = book.isPending || isSubmitting;

  function switchTab(next) {
    if (next === tab) {
      return;
    }

    setTab(next);
    setDuplicate(null);
    setFormError('');
    clearErrors();
    // purpose and notes belong to the booking, not to the patient half, so they survive the switch
    reset({ ...getValues(), patientId: next === 'existing' && patient ? patient.id : '' });
  }

  function choosePatient(next) {
    setPatient(next);
    setValue('patientId', next.id);
    clearErrors('patientId');
    setDuplicate(null);
  }

  function clearPatient() {
    setPatient(null);
    setValue('patientId', '');
  }

  // The desk keeps the patient it just typed instead of retyping it on the other tab: the api hands the
  // existing record back inside the error, so "use this patient" is a switch of tab and nothing more.
  // The reset carries the patient id itself: resetting after selecting would clear the field the schema
  // is about to look at, leaving a dialog that shows a patient and then refuses to submit without one.
  function useExistingPatient(existing) {
    setTab('existing');
    setPatient(existing);
    setDuplicate(null);
    clearErrors();
    reset({ ...EMPTY, purpose: getValues('purpose'), notes: getValues('notes'), patientId: existing.id });
  }

  async function onSubmit(values) {
    setFormError('');
    setConflict('');
    setDuplicate(null);

    const payload = {
      doctorId: doctor.id,
      date,
      startTime: slot.startTime,
      ...(values.purpose ? { purpose: values.purpose } : {}),
      ...(values.notes ? { notes: values.notes } : {}),
      ...(tab === 'existing'
        ? { patientId: values.patientId }
        : {
            newPatient: {
              name: values.name,
              mobile: values.mobile.replace(/[\s-]/g, ''),
              ...(values.gender ? { gender: values.gender } : {}),
              ...(values.dateOfBirth ? { dateOfBirth: values.dateOfBirth } : {}),
            },
          }),
    };

    try {
      await book.mutateAsync(payload);
      toast.success(`Booked ${formatTime(slot.startTime)} for ${tab === 'existing' ? patient.name : values.name}`);
      onBooked();
    } catch (error) {
      handleFailure(error);
    }
  }

  function handleFailure(error) {
    const existing = error.details?.find((detail) => detail.existingPatient)?.existingPatient;

    if (existing) {
      // the mobile number is already on the register: offer the record instead of a dead end
      setDuplicate(existing);
      return;
    }

    if (error.status === 409) {
      // someone took the slot between the click and the submit. The grid behind the dialog is stale, so
      // it is refreshed now and the desk only has to acknowledge before the dialog closes itself.
      setConflict(error.message);
      queryClient.invalidateQueries({ queryKey: ['slots', doctor.id, date] });
      queryClient.invalidateQueries({ queryKey: ['appointments', 'day', doctor.id, date] });
      return;
    }

    setFormError(error.message);
  }

  return (
    <Modal
      open
      title="Book an appointment"
      onClose={onClose}
      footer={
        conflict ? (
          <Button onClick={onClose}>Got it</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            {/* the button lives in the footer but submits the form above it, which keeps one action in
                one place without putting the action inside the scrollable body */}
            <Button type="submit" form="booking-form" loading={isPending} disabled={book.isPending}>
              Confirm booking
            </Button>
          </>
        )
      }
    >
      <div className="rounded-card bg-page px-4 py-3">
        <p className="text-sm font-semibold text-ink">
          {doctor.name} · {doctor.department.name}
        </p>
        <p className="mt-0.5 text-sm text-ink-muted">
          {formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
          {formatTime(slot.startTime)}–{formatTime(slot.endTime)} · {pluralize(doctor.slotDurationMinutes, 'minute')} slots
        </p>
      </div>

      {!conflict ? (
        <div className="mt-4 flex gap-1 rounded-pill bg-page p-1" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => switchTab(item.key)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-pill px-3 py-2 text-sm font-semibold transition ${
                tab === item.key ? 'bg-card text-ink shadow-card' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {item.key === 'new' ? <UserPlus size={15} aria-hidden="true" /> : <BadgeCheck size={15} aria-hidden="true" />}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {conflict ? (
        <div className="mt-4 flex items-start gap-3 rounded-card bg-danger-tint px-4 py-3">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-danger">That slot has just been taken</p>
            <p className="mt-0.5 text-sm text-danger">{conflict} The grid behind this dialog has been refreshed.</p>
          </div>
        </div>
      ) : (
        <form id="booking-form" className="mt-4 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          {duplicate ? (
            <div className="flex flex-wrap items-center gap-3 rounded-card bg-arrived-tint px-4 py-3">
              <TriangleAlert size={18} className="shrink-0 text-arrived" aria-hidden="true" />
              <p className="flex-1 text-sm text-arrived">A patient with this number already exists: {duplicate.name}</p>
              <Button size="sm" variant="secondary" onClick={() => useExistingPatient(duplicate)}>
                Use {duplicate.patientCode}
              </Button>
            </div>
          ) : null}

          {formError ? (
            <p className="flex items-start gap-2 rounded-card bg-danger-tint px-4 py-3 text-sm text-danger">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              {formError}
            </p>
          ) : null}

          {tab === 'existing' ? (
            <>
              {/* the id travels with the form so the same schema guards both tabs */}
              <input type="hidden" {...register('patientId')} />
              <PatientPicker selected={patient} onSelect={choosePatient} onClear={clearPatient} />
              {errors.patientId ? <p className="text-xs text-danger">{errors.patientId.message}</p> : null}
            </>
          ) : (
            <>
              <Input label="Full name" error={errors.name?.message} autoComplete="off" {...register('name')} />
              <Input
                label="Mobile number"
                inputMode="tel"
                placeholder="08031234567"
                helper="Spaces and dashes are fine."
                error={errors.mobile?.message}
                {...register('mobile')}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Select label="Gender" options={GENDERS} error={errors.gender?.message} {...register('gender')} />
                <Input
                  type="date"
                  label="Date of birth"
                  helper="Optional."
                  error={errors.dateOfBirth?.message}
                  {...register('dateOfBirth')}
                />
              </div>
            </>
          )}

          <Input label="Purpose" placeholder="Follow up consultation" error={errors.purpose?.message} {...register('purpose')} />
          <Textarea label="Notes" rows={2} placeholder="Anything the doctor should know" error={errors.notes?.message} {...register('notes')} />
        </form>
      )}
    </Modal>
  );
}
