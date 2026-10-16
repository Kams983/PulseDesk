import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, UserRoundCheck, X } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import ErrorMessage from '@/components/ui/ErrorMessage';
import Input from '@/components/ui/Input';
import Skeleton from '@/components/ui/Skeleton';
import { searchPatients } from '@/api/patientApi';
import { useDebounce } from '@/hooks/useDebounce';

// One box for all three ways the desk has a patient in hand. The debounce is what keeps a typed name
// from becoming one request per letter, and the query key holds the debounced term so each term that
// was actually searched is cached rather than refetched when the desk types back and forth.
export default function PatientPicker({ selected, onSelect, onClear }) {
  const [term, setTerm] = useState('');
  const debounced = useDebounce(term, 300);
  const search = useQuery({
    queryKey: ['patients', 'search', debounced],
    queryFn: () => searchPatients(debounced),
    enabled: debounced.trim().length > 0,
  });

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-card bg-primary-tint px-4 py-3">
        <Avatar name={selected.name} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <UserRoundCheck size={14} aria-hidden="true" />
            {selected.name}
          </p>
          <p className="truncate text-xs text-ink-muted">
            {selected.patientCode} · {selected.mobile}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded-pill p-1.5 text-ink-muted transition hover:bg-card hover:text-ink"
          aria-label="Choose a different patient"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  const patients = search.data?.patients || [];

  return (
    <div>
      <Input
        label="Find the patient"
        placeholder="A name, a mobile number or a PT- code"
        autoComplete="off"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        helper="Type at least one character; the search matches a name, a mobile number or a patient code."
      />

      <div className="mt-3">
        {search.isError ? (
          <ErrorMessage message={search.error.message} onRetry={search.refetch} />
        ) : debounced.trim().length === 0 ? null : search.isFetching && patients.length === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : patients.length === 0 ? (
          <p className="flex items-center gap-2 rounded-control bg-page px-3 py-2 text-sm text-ink-muted">
            <Search size={14} aria-hidden="true" />
            No patient matches “{debounced}”. Register them on the New patient tab.
          </p>
        ) : (
          <ul className="max-h-60 space-y-1 overflow-y-auto">
            {patients.map((patient) => (
              <li key={patient.id}>
                <button
                  type="button"
                  onClick={() => onSelect(patient)}
                  className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left transition hover:bg-page"
                >
                  <Avatar name={patient.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{patient.name}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {patient.patientCode} · {patient.mobile}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
