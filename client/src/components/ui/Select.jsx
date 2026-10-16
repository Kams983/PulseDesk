import { forwardRef, useId } from 'react';
import { ChevronDown } from 'lucide-react';

// options is an array of { value, label }; a native select keeps keyboard and mobile behaviour free
const Select = forwardRef(function Select({ label, error, helper, id, options = [], className = '', ...props }, ref) {
  const generatedId = useId();
  const selectId = id || generatedId;
  const describedBy = error ? `${selectId}-error` : helper ? `${selectId}-helper` : undefined;

  return (
    <div>
      <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full appearance-none rounded-control border bg-card px-4 py-2.5 pr-10 text-sm text-ink focus:border-primary ${
            error ? 'border-danger' : 'border-line'
          } ${className}`}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted"
        />
      </div>
      {error ? (
        <p id={`${selectId}-error`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : helper ? (
        <p id={`${selectId}-helper`} className="mt-1.5 text-xs text-ink-muted">
          {helper}
        </p>
      ) : null}
    </div>
  );
});

export default Select;
