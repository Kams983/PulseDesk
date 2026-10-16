import { CalendarDays } from 'lucide-react';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { dateStrip } from '@/utils/dateUtils';
import { formatDate } from '@/utils/formatters';

// How many days the strip offers before the date input takes over. A week covers the usual booking
// window and still fits a phone without a horizontal scroll.
const STRIP_DAYS = 7;

// The three filters that decide what the grid shows. Everything else on the page is a read of that one
// choice, so they live together in the column beside the board rather than above it.
export default function SchedulerFilters({
  departments,
  doctors,
  departmentId,
  doctorId,
  date,
  today,
  onDepartmentChange,
  onDoctorChange,
  onDateChange,
}) {
  const days = today ? dateStrip(today, STRIP_DAYS) : [];

  return (
    <div className="space-y-4">
      <Select
        label="Department"
        value={departmentId}
        onChange={(event) => onDepartmentChange(event.target.value)}
        options={[{ value: '', label: 'All departments' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
      />

      <Select
        label="Doctor"
        value={doctorId}
        onChange={(event) => onDoctorChange(event.target.value)}
        options={[{ value: '', label: 'Select a doctor' }, ...doctors.map((d) => ({ value: d.id, label: d.name }))]}
        helper={doctorId ? undefined : 'Pick a doctor to load their day'}
      />

      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">Date</p>

        {/* a strip of the coming week, which is what a desk actually books into, plus a date input for
            anything further out. Both are plain YYYY-MM-DD strings, so neither can drift a day. */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {days.map((iso) => {
            const isSelected = iso === date;

            return (
              <button
                key={iso}
                type="button"
                onClick={() => onDateChange(iso)}
                aria-pressed={isSelected}
                className={`flex w-12 shrink-0 flex-col items-center gap-0.5 rounded-control border py-2 text-center transition ${
                  isSelected
                    ? 'border-primary bg-primary text-white'
                    : 'border-line bg-card text-ink hover:border-primary hover:text-primary'
                }`}
              >
                <span className={`text-xs font-medium ${isSelected ? 'text-white/80' : 'text-ink-muted'}`}>
                  {formatDate(iso, { weekday: 'short' })}
                </span>
                <span className="text-sm font-semibold">{Number(iso.slice(-2))}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-3">
          <Input
            type="date"
            label="Another date"
            value={date || ''}
            min={today}
            onChange={(event) => onDateChange(event.target.value)}
            helper={today ? `Today is ${formatDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}` : undefined}
          />
        </div>
      </div>

      {today && date !== today ? (
        <button
          type="button"
          onClick={() => onDateChange(today)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition hover:text-primary-hover"
        >
          <CalendarDays size={16} aria-hidden="true" />
          Back to today
        </button>
      ) : null}
    </div>
  );
}
