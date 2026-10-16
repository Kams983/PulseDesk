import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, TriangleAlert } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import { updateDoctorSchedule } from '@/api/doctorApi';
import { useToast } from '@/context/ToastContext';
import { WEEKDAYS, countSlots, hasErrors, scheduleFromDoctor, schedulePayload, toggleDay, validateDay } from '@/utils/schedule';

const SLOT_DURATIONS = [10, 15, 20, 30, 45, 60];

// One editor for the whole week. The state is a local copy of the doctor's schedule rather than a form
// library's, because the shape is days holding arrays of windows: adding and removing windows is what
// this screen does, and field arrays would only add a layer between the click and the list.
export default function ScheduleEditorModal({ doctor, onClose, onSaved }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [schedule, setSchedule] = useState(() => scheduleFromDoctor(doctor));
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(doctor.slotDurationMinutes);
  const [serverErrors, setServerErrors] = useState({});
  const [showValidation, setShowValidation] = useState(false);

  // client side copies of the server rules, so a bad window is explained while it is being typed
  const clientErrors = validationErrors(schedule);
  const errors = { ...clientErrors, ...serverErrors };
  const workedDays = schedule.filter((day) => day.sessions.length > 0);
  const weeklySlots = workedDays.reduce((total, day) => total + countSlots(day, Number(slotDurationMinutes)), 0);

  const save = useMutation({
    mutationFn: () =>
      updateDoctorSchedule(doctor.id, {
        slotDurationMinutes: Number(slotDurationMinutes),
        schedule: schedulePayload(schedule),
      }),
  });

  function updateDay(dayOfWeek, change) {
    setSchedule((current) => current.map((day) => (day.dayOfWeek === dayOfWeek ? change(day) : day)));
  }

  function addWindow(dayOfWeek, kind) {
    updateDay(dayOfWeek, (day) => ({
      ...day,
      [kind]: [
        ...day[kind],
        kind === 'sessions' ? { name: 'Session', start: '09:00', end: '12:00' } : { name: 'Break', start: '12:00', end: '13:00' },
      ],
    }));
  }

  function removeWindow(dayOfWeek, kind, index) {
    updateDay(dayOfWeek, (day) => ({ ...day, [kind]: day[kind].filter((_, position) => position !== index) }));
  }

  function changeWindow(dayOfWeek, kind, index, field, value) {
    updateDay(dayOfWeek, (day) => ({
      ...day,
      [kind]: day[kind].map((window, position) => (position === index ? { ...window, [field]: value } : window)),
    }));
  }

  // The api answers a bad schedule with the path of the exact window ('schedule.0.sessions.1.start'), and
  // the day it names is the nth worked day of the payload, which is not the same as a weekday number.
  function mapServerError(field) {
    const match = /^schedule\.(\d+)\.(.+)$/.exec(field);

    if (!match) {
      return null;
    }

    const day = schedulePayload(schedule)[Number(match[1])];

    return day ? `${day.dayOfWeek}.${match[2]}` : null;
  }

  async function onSubmit(event) {
    event.preventDefault();
    setShowValidation(true);
    setServerErrors({});

    if (hasErrors(clientErrors)) {
      toast.error('Fix the highlighted windows first');
      return;
    }

    try {
      const updated = await save.mutateAsync();
      toast.success('Schedule updated');
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      queryClient.invalidateQueries({ queryKey: ['slots'] });
      onSaved(updated);
    } catch (error) {
      const mapped = {};

      for (const detail of error.details || []) {
        const key = detail.field === 'slotDurationMinutes' ? 'slotDurationMinutes' : mapServerError(detail.field);

        if (key) {
          mapped[key] = detail.message;
        }
      }

      if (Object.keys(mapped).length === 0) {
        toast.error(error.message);
        return;
      }

      setServerErrors(mapped);
      toast.error('The api refused this schedule');
    }
  }

  return (
    <Modal
      open
      title={`${doctor.name}'s week`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="schedule-form" loading={save.isPending}>
            Save schedule
          </Button>
        </>
      }
    >
      <form id="schedule-form" onSubmit={onSubmit} noValidate>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Select
            label="Slot length"
            className="w-40"
            value={slotDurationMinutes}
            onChange={(event) => setSlotDurationMinutes(event.target.value)}
            options={SLOT_DURATIONS.map((minutes) => ({ value: minutes, label: `${minutes} minutes` }))}
            error={showValidation ? errors.slotDurationMinutes : undefined}
          />
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">{weeklySlots}</span> slots across {workedDays.length}{' '}
            {workedDays.length === 1 ? 'working day' : 'working days'}
          </p>
        </div>

        <div className="mt-4 space-y-3">
          {WEEKDAYS.map((weekday) => (
            <DaySection
              key={weekday.value}
              weekday={weekday}
              day={schedule.find((entry) => entry.dayOfWeek === weekday.value)}
              slotDurationMinutes={slotDurationMinutes}
              errors={visibleErrors({ errors, serverErrors, dayOfWeek: weekday.value, showValidation })}
              onToggle={(isOn) => setSchedule((current) => toggleDay(current, weekday.value, isOn))}
              onAddWindow={(kind) => addWindow(weekday.value, kind)}
              onRemoveWindow={(kind, index) => removeWindow(weekday.value, kind, index)}
              onWindowChange={(kind, index, field, value) => changeWindow(weekday.value, kind, index, field, value)}
            />
          ))}
        </div>

        {hasErrors(clientErrors) && showValidation ? (
          <p className="mt-4 flex items-start gap-2 rounded-card bg-danger-tint px-4 py-3 text-sm text-danger">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            A session has to end after it starts, sessions in one day cannot overlap, and a break has to fall inside the
            hours the doctor works.
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

// every rule the server enforces, restated as messages a form can show beside a field
function validationErrors(schedule) {
  const all = {};

  for (const day of schedule) {
    for (const [path, message] of Object.entries(validateDay(day))) {
      all[`${day.dayOfWeek}.${path}`] = message;
    }
  }

  return all;
}

// what a day should actually show: nothing until the form has been submitted, unless the server refused it
function visibleErrors({ errors, serverErrors, dayOfWeek, showValidation }) {
  const prefix = `${dayOfWeek}.`;
  const dayErrors = {};

  for (const [key, message] of Object.entries(errors)) {
    if (!key.startsWith(prefix)) {
      continue;
    }

    const path = key.slice(prefix.length);

    if (showValidation || serverErrors[key]) {
      dayErrors[path] = message;
    }
  }

  return dayErrors;
}

function DaySection({ weekday, day, slotDurationMinutes, errors, onToggle, onAddWindow, onRemoveWindow, onWindowChange }) {
  const isOn = day.sessions.length > 0;

  return (
    <section className={`rounded-card border p-3 ${isOn ? 'border-line' : 'border-dashed border-line/70 bg-page/40'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* a switch, not a checkbox: the day is on or off, and the sessions below follow it */}
          <button
            type="button"
            role="switch"
            aria-checked={isOn}
            aria-label={`${weekday.label} ${isOn ? 'working' : 'off'}`}
            onClick={() => onToggle(!isOn)}
            className={`relative h-6 w-11 shrink-0 rounded-pill transition ${isOn ? 'bg-primary' : 'bg-line'}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-pill bg-card shadow-card transition-all ${isOn ? 'left-[1.375rem]' : 'left-0.5'}`}
            />
          </button>
          <span className="text-sm font-semibold text-ink">{weekday.label}</span>
        </div>

        {isOn ? (
          <span className="text-xs text-ink-muted">
            {countSlots(day, Number(slotDurationMinutes))} slots · {day.sessions.length}{' '}
            {day.sessions.length === 1 ? 'session' : 'sessions'}
          </span>
        ) : (
          <span className="text-xs text-ink-muted">Not working</span>
        )}
      </div>

      {isOn ? (
        <div className="mt-3 space-y-3">
          {errors.sessions ? <p className="text-xs text-danger">{errors.sessions}</p> : null}

          <WindowList
            kind="sessions"
            label="Sessions"
            windows={day.sessions}
            errors={errors}
            onChange={(index, field, value) => onWindowChange('sessions', index, field, value)}
            onRemove={(index) => onRemoveWindow('sessions', index)}
            onAdd={() => onAddWindow('sessions')}
            canRemove={day.sessions.length > 1}
          />

          <WindowList
            kind="breaks"
            label="Breaks"
            windows={day.breaks}
            errors={errors}
            onChange={(index, field, value) => onWindowChange('breaks', index, field, value)}
            onRemove={(index) => onRemoveWindow('breaks', index)}
            onAdd={() => onAddWindow('breaks')}
            emptyText="No breaks"
          />
        </div>
      ) : null}
    </section>
  );
}

// one list of windows: sessions are required once a day is on, breaks are not, which is the only
// difference between the two lists
function WindowList({ kind, label, windows, errors, onChange, onRemove, onAdd, canRemove = true, emptyText }) {
  function errorFor(index, field) {
    return errors[`${kind}.${index}.${field}`];
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-pill px-2 py-1 text-xs font-semibold text-primary transition hover:bg-primary-tint"
        >
          <Plus size={13} aria-hidden="true" />
          Add
        </button>
      </div>

      {windows.length === 0 ? (
        <p className="mt-1.5 text-xs text-ink-muted">{emptyText}</p>
      ) : (
        <ul className="mt-1.5 space-y-2">
          {windows.map((window, index) => (
            <WindowRow
              key={index}
              label={label}
              index={index}
              window={window}
              errorFor={(field) => errorFor(index, field)}
              onChange={(field, value) => onChange(index, field, value)}
              onRemove={() => onRemove(index)}
              canRemove={canRemove}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function WindowRow({ label, index, window, errorFor, onChange, onRemove, canRemove }) {
  const message = errorFor('end') || errorFor('start');

  return (
    <li className="grid grid-cols-2 items-start gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
      <input
        aria-label={`${label} ${index + 1} name`}
        value={window.name || ''}
        onChange={(event) => onChange('name', event.target.value)}
        placeholder="Name"
        className="col-span-2 min-w-0 rounded-control border border-line bg-card px-3 py-2 text-sm text-ink focus:border-primary sm:col-span-1"
      />
      <input
        type="time"
        aria-label={`${label} ${index + 1} start`}
        value={window.start}
        onChange={(event) => onChange('start', event.target.value)}
        className={`rounded-control border bg-card px-2 py-2 text-sm text-ink focus:border-primary ${
          errorFor('start') ? 'border-danger' : 'border-line'
        }`}
      />
      <input
        type="time"
        aria-label={`${label} ${index + 1} end`}
        value={window.end}
        onChange={(event) => onChange('end', event.target.value)}
        className={`rounded-control border bg-card px-2 py-2 text-sm text-ink focus:border-primary ${
          errorFor('end') ? 'border-danger' : 'border-line'
        }`}
      />
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
        className="justify-self-end rounded-pill p-2 text-ink-muted transition hover:bg-danger-tint hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Trash2 size={15} aria-hidden="true" />
      </button>

      {message ? <p className="col-span-2 text-xs text-danger sm:col-span-4">{message}</p> : null}
    </li>
  );
}
