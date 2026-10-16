import { useEffect, useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { APPOINTMENT_STATUS, STATUS_STYLES } from '@/utils/constants';
import { useDebounce } from '@/hooks/useDebounce';

const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  ...Object.values(APPOINTMENT_STATUS).map((status) => ({ value: status, label: STATUS_STYLES[status].label })),
];

// The three text boxes are debounced here rather than in the page, so the term that reaches the URL is
// the term that was actually typed and paused on. Everything else (selects and dates) applies at once:
// a dropdown is a deliberate choice, and a keystroke is not.
export default function AppointmentsFilters({ filters, departments, doctors, today, onChange, onClear }) {
  const [terms, setTerms] = useState({ q: filters.q, mobile: filters.mobile, doctor: filters.doctor });
  const debounced = useDebounce(terms, 300);

  // Only a *settled* term is pushed, which is what stops a clear from undoing itself. The debounce holds
  // the last typed value for 300ms, so without this check the term the user just emptied would travel
  // back into the url a moment later and the list would come back filtered. Settled means the debounced
  // value has caught up with the boxes, which is the moment the pause happened.
  useEffect(() => {
    const isSettled = debounced.q === terms.q && debounced.mobile === terms.mobile && debounced.doctor === terms.doctor;

    if (isSettled && (debounced.q !== filters.q || debounced.mobile !== filters.mobile || debounced.doctor !== filters.doctor)) {
      onChange(debounced);
    }
  }, [debounced, terms, filters.q, filters.mobile, filters.doctor, onChange]);

  function setTerm(field, value) {
    setTerms((current) => ({ ...current, [field]: value }));
  }

  // the boxes are this component's own state, so clearing the url is only half of clearing the filters:
  // emptying them here is what makes the button mean what it says
  function clearAll() {
    setTerms({ q: '', mobile: '', doctor: '' });
    onClear();
  }

  const hasFilters = Boolean(
    filters.q || filters.mobile || filters.doctor || filters.departmentId || filters.status || filters.dateFrom || filters.dateTo
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Input
          label="Patient"
          placeholder="Name, starts with"
          autoComplete="off"
          value={terms.q}
          onChange={(event) => setTerm('q', event.target.value)}
        />
        <Input
          label="Mobile"
          placeholder="0803…"
          inputMode="tel"
          autoComplete="off"
          value={terms.mobile}
          onChange={(event) => setTerm('mobile', event.target.value)}
        />
        <Input
          label="Doctor"
          placeholder="Name, starts with"
          autoComplete="off"
          value={terms.doctor}
          onChange={(event) => setTerm('doctor', event.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          label="Department"
          value={filters.departmentId}
          onChange={(event) => onChange({ departmentId: event.target.value })}
          options={[{ value: '', label: 'All departments' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
        />
        <Select
          label="Doctor"
          value={filters.doctorId}
          onChange={(event) => onChange({ doctorId: event.target.value })}
          options={[{ value: '', label: 'All doctors' }, ...doctors.map((d) => ({ value: d.id, label: d.name }))]}
        />
        <Select
          label="Status"
          value={filters.status}
          onChange={(event) => onChange({ status: event.target.value })}
          options={STATUS_OPTIONS}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="date"
            label="From"
            value={filters.dateFrom}
            max={filters.dateTo || undefined}
            onChange={(event) => onChange({ dateFrom: event.target.value })}
          />
          <Input
            type="date"
            label="To"
            value={filters.dateTo}
            min={filters.dateFrom || undefined}
            onChange={(event) => onChange({ dateTo: event.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* both shortcuts are stamped with the clinic's date from the api, so "today" means the day the
            clinic is having and not the day this browser happens to think it is */}
        <Button variant="secondary" size="sm" onClick={() => onChange({ dateFrom: today, dateTo: today })} disabled={!today}>
          <CalendarDays size={15} aria-hidden="true" />
          Today
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onChange({ dateFrom: today, dateTo: '' })} disabled={!today}>
          <CalendarDays size={15} aria-hidden="true" />
          Upcoming
        </Button>
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <X size={15} aria-hidden="true" />
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}
